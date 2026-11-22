import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bridge
from bridge import extract_mllp_frames, frame_mllp, parse_oru_r01, stable_sample_hash, save_sample


def message(control="MSG-1", value="4.20", patient="P-20261122-M-1", sample="S-100"):
    segments = [
        "MSH|^~\\&|CBC|LAB|APP|CLINIC|20261122120000||ORU^R01|" + control + "|P|2.5",
        "PID|1||" + patient + "^^^CLINIC^MR||Patient^Test",
        "OBR|1|ORDER-1|" + sample + "|CBC^Complete blood count",
        "OBX|1|NM|WBC^White cells||" + value + "|10^3/uL|4-10|H",
        "OBX|2|NM|HGB^Hemoglobin||13.1|g/dL|12-16|N",
    ]
    return "\r".join(segments) + "\r"


class BridgeParserTests(unittest.TestCase):
    def test_parse_obx_by_code_not_position_and_preserve_flags(self):
        parsed = parse_oru_r01(message())
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["patientNumber"], "P-20261122-M-1")
        self.assertEqual(parsed[0]["sampleId"], "S-100")
        self.assertEqual(parsed[0]["messageControlId"], "MSG-1")
        self.assertEqual(parsed[0]["results"][0]["code"], "WBC")
        self.assertEqual(parsed[0]["results"][0]["value"], "4.20")
        self.assertEqual(parsed[0]["results"][0]["abnormalFlag"], "H")
        self.assertEqual(parsed[0]["results"][0]["referenceRange"], "4-10")

    def test_multiple_mllp_frames(self):
        data = frame_mllp(message("A")) + frame_mllp(message("B", "4.21"))
        frames, remain = extract_mllp_frames(data)
        self.assertEqual(len(frames), 2)
        self.assertEqual(remain, b"")
        self.assertEqual(parse_oru_r01(frames[1])[0]["messageControlId"], "B")

    def test_partial_mllp_frame_is_retained(self):
        frame = frame_mllp(message("partial"))
        frames, remain = extract_mllp_frames(frame[:-2])
        self.assertEqual(frames, [])
        self.assertTrue(remain.startswith(b"\x0b"))
        next_frames, final = extract_mllp_frames(remain + frame[-2:])
        self.assertEqual(len(next_frames), 1)
        self.assertEqual(final, b"")

    def test_missing_obx_fields_and_unknown_codes_are_retained(self):
        raw = "\r".join([
            "MSH|^~\\&|CBC|LAB|APP|CLINIC|20261122120000||ORU^R01|M-3|P|2.5",
            "PID|1||P-3^^^CLINIC^MR",
            "OBR|1|O-3|S-3|CBC",
            "OBX|1|NM|PDW^Platelet distribution width||11.2|fL||L",
        ]) + "\r"
        result = parse_oru_r01(raw)[0]["results"][0]
        self.assertEqual(result["code"], "PDW")
        self.assertEqual(result["unit"], "fL")
        self.assertEqual(result["abnormalFlag"], "L")
        self.assertEqual(result["referenceRange"], "")

    def test_non_oru_is_rejected(self):
        raw = "MSH|^~\\&|CBC|LAB|APP|CLINIC|20261122120000||ADT^A01|M-4|P|2.5\r"
        with self.assertRaises(ValueError):
            parse_oru_r01(raw)

    def test_hash_is_stable_across_obx_order(self):
        first = parse_oru_r01(message())[0]
        parts = message().strip("\r").split("\r")
        reversed_raw = "\r".join(parts[:3] + list(reversed(parts[3:]))) + "\r"
        second = parse_oru_r01(reversed_raw)[0]
        self.assertEqual(stable_sample_hash(first), stable_sample_hash(second))

    def test_duplicate_suppression_persists_after_restart(self):
        sample = parse_oru_r01(message())[0]
        with tempfile.TemporaryDirectory() as directory:
            old_path = bridge.DB_PATH
            try:
                bridge.DB_PATH = Path(directory) / "test.sqlite3"
                self.assertTrue(save_sample(sample))
                self.assertFalse(save_sample(sample))
                connection = bridge.database()
                try:
                    self.assertEqual(connection.execute("SELECT COUNT(*) FROM samples").fetchone()[0], 1)
                finally:
                    connection.close()
                connection = bridge.database()
                try:
                    self.assertEqual(connection.execute("SELECT sample_id FROM samples").fetchone()[0], "S-100")
                finally:
                    connection.close()
            finally:
                bridge.DB_PATH = old_path


if __name__ == "__main__":
    unittest.main()
