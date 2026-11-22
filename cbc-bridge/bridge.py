#!/usr/bin/env python3
"""CBC analyzer HL7 bridge. Standard-library only; no patient payloads are written to logs."""
from __future__ import annotations

import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import signal
import socket
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MLLP_START = b"\x0b"
MLLP_END = b"\x1c"
MAX_MESSAGE_BYTES = int(os.environ.get("CBC_MAX_MESSAGE_BYTES", "1048576"))
DB_PATH = Path(os.environ.get("CBC_SQLITE_PATH", str(Path(__file__).with_name("cbc-bridge.sqlite3"))))
SERVER_URL = os.environ.get("CBC_SERVER_URL", "").strip().rstrip("/")
TOKEN = os.environ.get("CBC_BRIDGE_TOKEN", "").strip()
LOG_LEVEL = os.environ.get("CBC_LOG_LEVEL", "INFO").upper()
LOG_PATH = Path(os.environ.get("CBC_LOG_PATH", str(Path(__file__).with_name("cbc-bridge.log"))))
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s %(levelname)s %(message)s", handlers=[logging.StreamHandler(), RotatingFileHandler(LOG_PATH, maxBytes=2_000_000, backupCount=3, encoding="utf-8")])
LOG = logging.getLogger("cbc-bridge")
STOP = threading.Event()


def _decode_component(value: str, separators: str) -> str:
    """Return the first HL7 component/repetition without normalizing clinical values."""
    return value.split(separators[0], 1)[0].split(separators[1], 1)[0] if separators and separators[0] in value else (value.split(separators[1], 1)[0] if len(separators) > 1 and separators[1] in value else value)


def _unescape(value: str, escape: str, field_sep: str, comp_sep: str, rep_sep: str, sub_sep: str) -> str:
    if not escape:
        return value
    replacements = {
        "F": field_sep, "S": comp_sep, "R": rep_sep, "T": sub_sep, "E": escape,
        ".br": "\n",
    }
    for key, replacement in replacements.items():
        value = value.replace(f"{escape}{key}{escape}", replacement)
    return value


def _field(fields: list[str], number: int) -> str:
    return fields[number] if number < len(fields) else ""


def _first_id(value: str, repetition_sep: str, component_sep: str) -> str:
    first_rep = value.split(repetition_sep, 1)[0]
    return first_rep.split(component_sep, 1)[0].strip()


def parse_oru_r01(message: str | bytes) -> list[dict[str, Any]]:
    """Parse one ORU^R01 into one sample per OBR, matching OBX by its code, not order."""
    if isinstance(message, bytes):
        message = message.decode("utf-8", errors="replace")
    text = message.lstrip("\ufeff\x0b").rstrip("\x1c\r\n")
    segments = [segment for segment in text.split("\r") if segment]
    if not segments or not segments[0].startswith("MSH"):
        raise ValueError("missing MSH segment")
    first = segments[0]
    field_sep = first[3] if len(first) > 3 else "|"
    msh = first.split(field_sep)
    encoding = _field(msh, 1) or "^~\\&"
    comp_sep = encoding[0] if len(encoding) > 0 else "^"
    rep_sep = encoding[1] if len(encoding) > 1 else "~"
    escape = encoding[2] if len(encoding) > 2 else "\\"
    sub_sep = encoding[3] if len(encoding) > 3 else "&"
    message_type = _field(msh, 8)
    type_code = message_type.split(comp_sep, 2)
    if not type_code or type_code[0] != "ORU" or len(type_code) < 2 or type_code[1] != "R01":
        raise ValueError("unsupported message type")
    control_id = _field(msh, 9).strip()
    patient_number = ""
    collection_time = ""
    samples: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    pending_obx: list[dict[str, str]] = []
    fallback_specimen = ""

    def flush() -> None:
        nonlocal current, pending_obx
        if current is None:
            return
        current["results"] = pending_obx
        if not current["sampleId"]:
            raise ValueError("missing specimen/sample identifier")
        if not current["patientNumber"]:
            raise ValueError("missing PID-3 patient identifier")
        if not current["results"]:
            raise ValueError("sample has no OBX results")
        samples.append(current)
        current = None
        pending_obx = []

    for segment in segments[1:]:
        fields = segment.split(field_sep)
        name = fields[0]
        if name == "PID":
            raw_id = _field(fields, 3)
            # Deliberately take only the first PID-3 repetition/component. Unknown authorities
            # fail closed at import unless this value exactly equals the clinic patient number.
            patient_number = _unescape(_first_id(raw_id, rep_sep, comp_sep), escape, field_sep, comp_sep, rep_sep, sub_sep)
        elif name == "SPM":
            specimen = _field(fields, 2)
            fallback_specimen = _unescape(_first_id(specimen, rep_sep, comp_sep), escape, field_sep, comp_sep, rep_sep, sub_sep)
        elif name == "OBR":
            flush()
            placer = _field(fields, 2)
            filler = _field(fields, 3)
            sample_id = _unescape(_first_id(filler, rep_sep, comp_sep) or _first_id(placer, rep_sep, comp_sep) or fallback_specimen,
                                  escape, field_sep, comp_sep, rep_sep, sub_sep)
            collection_time = _unescape(_field(fields, 7), escape, field_sep, comp_sep, rep_sep, sub_sep)
            current = {
                "sampleId": sample_id,
                "patientNumber": patient_number,
                "collectedAt": collection_time or None,
                "messageControlId": control_id,
                "results": [],
            }
        elif name == "OBX":
            if current is None:
                # Some analyzers omit OBR. Do not invent an order/sample id.
                raise ValueError("OBX arrived before OBR")
            raw_code = _field(fields, 3)
            code = _unescape(_first_id(raw_code, rep_sep, comp_sep), escape, field_sep, comp_sep, rep_sep, sub_sep).strip()
            value = _unescape(_field(fields, 5), escape, field_sep, comp_sep, rep_sep, sub_sep)
            unit = _unescape(_first_id(_field(fields, 6), rep_sep, comp_sep), escape, field_sep, comp_sep, rep_sep, sub_sep)
            reference = _unescape(_field(fields, 7), escape, field_sep, comp_sep, rep_sep, sub_sep)
            abnormal = _unescape(_field(fields, 8), escape, field_sep, comp_sep, rep_sep, sub_sep)
            observation_time = _unescape(_field(fields, 14), escape, field_sep, comp_sep, rep_sep, sub_sep)
            if not code:
                raise ValueError("OBX missing observation code")
            if value != "":
                pending_obx.append({
                    "code": code,
                    "value": value,
                    "unit": unit,
                    "referenceRange": reference,
                    "abnormalFlag": abnormal,
                    **({"observationTime": observation_time} if observation_time else {}),
                })
    flush()
    if not samples:
        raise ValueError("message contains no complete CBC sample")
    return samples


def extract_mllp_frames(buffer: bytes) -> tuple[list[bytes], bytes]:
    """Extract complete VT...FS CR frames, preserving a partial frame for the next read."""
    frames: list[bytes] = []
    data = buffer
    while True:
        start = data.find(MLLP_START)
        if start < 0:
            return frames, b""
        if start > 0:
            data = data[start:]
        end = data.find(MLLP_END, 1)
        if end < 0:
            if len(data) > MAX_MESSAGE_BYTES:
                raise ValueError("MLLP message exceeds size limit")
            return frames, data
        if end - 1 > MAX_MESSAGE_BYTES:
            raise ValueError("MLLP message exceeds size limit")
        frames.append(data[1:end])
        data = data[end + 1:]
        if data[:1] == b"\r":
            data = data[1:]


def frame_mllp(message: str) -> bytes:
    return MLLP_START + message.encode("utf-8") + MLLP_END + b"\r"


def stable_sample_hash(sample: dict[str, Any]) -> str:
    results = sorted(sample["results"], key=lambda item: (
        item.get("code", ""), item.get("value", ""), item.get("unit", ""),
        item.get("referenceRange", ""), item.get("abnormalFlag", ""),
    ))
    data = {"sampleId": sample["sampleId"], "patientNumber": sample["patientNumber"],
            "collectedAt": sample.get("collectedAt"), "results": results}
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def database() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("""CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_id TEXT NOT NULL,
        patient_number TEXT NOT NULL,
        collected_at TEXT,
        message_control_id TEXT NOT NULL,
        content_hash TEXT NOT NULL UNIQUE,
        results_json TEXT NOT NULL,
        received_at TEXT NOT NULL,
        sent_at TEXT
    )""")
    connection.commit()
    return connection


def save_sample(sample: dict[str, Any]) -> bool:
    digest = stable_sample_hash(sample)
    connection = database()
    try:
        cursor = connection.execute(
            "INSERT OR IGNORE INTO samples (sample_id,patient_number,collected_at,message_control_id,content_hash,results_json,received_at) VALUES (?,?,?,?,?,?,?)",
            (sample["sampleId"], sample["patientNumber"], sample.get("collectedAt"), sample.get("messageControlId", ""),
             digest, json.dumps(sample["results"], ensure_ascii=False), datetime.now(timezone.utc).isoformat()),
        )
        connection.commit()
        return cursor.rowcount == 1
    finally:
        connection.close()


def _request_json(url: str, method: str = "GET", body: dict[str, Any] | None = None, timeout: float = 8.0) -> dict[str, Any]:
    if not TOKEN:
        raise RuntimeError("CBC_BRIDGE_TOKEN is missing")
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/json",
        **({"Content-Type": "application/json"} if data is not None else {}),
    })
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content = response.read(2_000_000)
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"server returned HTTP {response.status}")
        return json.loads(content or b"{}")


def fetch_bridge_config() -> dict[str, Any]:
    if not SERVER_URL.startswith(("https://", "http://")):
        raise RuntimeError("CBC_SERVER_URL must be set to the clinic API base URL")
    config = _request_json(SERVER_URL + "/api/cbc/bridge/config")
    if not config.get("enabled"):
        raise RuntimeError("CBC integration is disabled in clinic settings")
    if config.get("mode") == "hosted" and not SERVER_URL.startswith("https://"):
        raise RuntimeError("Hosted Mode requires an HTTPS CBC_SERVER_URL")
    return config


def send_pending() -> int:
    if not SERVER_URL or not TOKEN:
        return 0
    with database() as connection:
        rows = connection.execute("SELECT * FROM samples WHERE sent_at IS NULL ORDER BY id LIMIT 25").fetchall()
    sent = 0
    for row in rows:
        payload = {
            "sampleId": row["sample_id"], "patientNumber": row["patient_number"],
            "collectedAt": row["collected_at"], "messageControlId": row["message_control_id"],
            "results": json.loads(row["results_json"]),
        }
        try:
            _request_json(SERVER_URL + "/api/cbc/bridge/ingest", "POST", payload)
            with database() as connection:
                connection.execute("UPDATE samples SET sent_at=? WHERE id=?", (datetime.now(timezone.utc).isoformat(), row["id"]))
            sent += 1
        except Exception as error:  # log type/message only; never include payload or patient identifiers
            LOG.warning("upload pending; %s", type(error).__name__)
            break
    return sent


def heartbeat_loop() -> None:
    while not STOP.is_set():
        try:
            _request_json(SERVER_URL + "/api/cbc/bridge/heartbeat", "POST", {})
            send_pending()
        except Exception as error:
            LOG.warning("clinic endpoint unavailable; %s", type(error).__name__)
        STOP.wait(25)


def build_ack(message: str | bytes, code: str, text: str = "") -> bytes:
    if isinstance(message, bytes):
        message = message.decode("utf-8", errors="replace")
    msh = next((line for line in message.lstrip("\x0b").split("\r") if line.startswith("MSH")), "MSH|^~\\&")
    field_sep = msh[3] if len(msh) > 3 else "|"
    parts = msh.split(field_sep)
    enc = parts[1] if len(parts) > 1 else "^~\\&"
    sender = parts[2] if len(parts) > 2 else "CBC-BRIDGE"
    sender_facility = parts[3] if len(parts) > 3 else "LAB"
    receiver = parts[4] if len(parts) > 4 else "ANALYZER"
    receiver_facility = parts[5] if len(parts) > 5 else "DEVICE"
    control = parts[9] if len(parts) > 9 else "UNKNOWN"
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    ack_id = f"BRIDGE-{int(time.time() * 1000)}"
    ack = field_sep.join(["MSH", enc, receiver, receiver_facility, sender, sender_facility, timestamp, "", "ACK^R01^ACK", ack_id, "P", "2.5"])
    ack += "\r" + field_sep.join(["MSA", code, control, text.replace(field_sep, " ")[:80]]) + "\r"
    return frame_mllp(ack)


def process_message(message: bytes, peer: str) -> bytes:
    try:
        samples = parse_oru_r01(message)
        inserted = sum(1 for sample in samples if save_sample(sample))
        if inserted:
            LOG.info("accepted HL7 message; samples_added=%d", inserted)
        else:
            LOG.info("duplicate HL7 result ignored")
        return build_ack(message, "AA")
    except Exception as error:
        LOG.warning("rejected HL7 message from %s; reason=%s", peer, type(error).__name__)
        return build_ack(message, "AE", "HL7 parse or storage error")


def _wire_ack(ack: bytes, protocol: str) -> bytes:
    return ack if protocol == "mllp" else ack.removeprefix(MLLP_START).removesuffix(MLLP_END + b"\r") + b"\r"


def _client_thread(client: socket.socket, peer: tuple[str, int], config: dict[str, Any]) -> None:
    peer_ip = peer[0]
    if config.get("deviceIp") and peer_ip != config["deviceIp"]:
        LOG.warning("rejected TCP peer not in device allowlist")
        client.close()
        return
    client.settimeout(0.4)
    protocol = config.get("protocol", "mllp")
    buffer = b""
    try:
        while not STOP.is_set():
            try:
                chunk = client.recv(65536)
                if not chunk:
                    if protocol == "raw-idle" and buffer.strip(b"\r\n"):
                        client.sendall(_wire_ack(process_message(buffer, peer_ip), protocol))
                    break
                buffer += chunk
                if len(buffer) > MAX_MESSAGE_BYTES + 256:
                    raise ValueError("input buffer exceeds message limit")
                if protocol == "mllp":
                    frames, buffer = extract_mllp_frames(buffer)
                    for frame in frames:
                        client.sendall(process_message(frame, peer_ip))
                elif protocol == "raw-idle" and b"\r\r" in buffer:
                    frame, buffer = buffer.split(b"\r\r", 1)
                    client.sendall(_wire_ack(process_message(frame.rstrip(b"\r"), peer_ip), protocol))
            except socket.timeout:
                if protocol == "raw-idle" and buffer.strip(b"\r\n"):
                    client.sendall(_wire_ack(process_message(buffer.rstrip(b"\r"), peer_ip), protocol))
                    buffer = b""
            except (ConnectionResetError, BrokenPipeError):
                break
    except Exception as error:
        LOG.warning("connection closed; reason=%s", type(error).__name__)
    finally:
        client.close()


def start_tcp_server(config: dict[str, Any]) -> None:
    host = config.get("computerIp") or "0.0.0.0"
    port = int(config.get("listenPort", 5006))
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((host, port))
        server.listen(8)
        server.settimeout(1)
        LOG.info("HL7 listener ready on configured LAN interface; port=%d protocol=%s", port, config.get("protocol"))
        while not STOP.is_set():
            try:
                client, peer = server.accept()
                threading.Thread(target=_client_thread, args=(client, peer, config), daemon=True).start()
            except socket.timeout:
                continue


def _shutdown(_signum: int, _frame: Any) -> None:
    STOP.set()


def main() -> int:
    if not SERVER_URL or not TOKEN:
        LOG.error("CBC_SERVER_URL and CBC_BRIDGE_TOKEN must be configured in the local environment")
        return 2
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)
    try:
        config = fetch_bridge_config()
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        database().close()
        threading.Thread(target=heartbeat_loop, name="cbc-uplink", daemon=True).start()
        start_tcp_server(config)
        return 0
    except Exception as error:
        LOG.error("bridge startup failed; reason=%s", type(error).__name__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
