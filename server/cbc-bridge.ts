import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { cbcBridgeConfig, cbcBridgeSamples } from "../drizzle/schema";
import { getDb } from "./db";

export const cbcResultSchema = z.object({
  code: z.string().trim().min(1).max(100),
  value: z.string().max(500),
  unit: z.string().max(100).default(""),
  referenceRange: z.string().max(180).default(""),
  abnormalFlag: z.string().max(40).default(""),
  observationTime: z.string().max(40).optional(),
});

export const cbcSampleInputSchema = z.object({
  sampleId: z.string().trim().min(1).max(128),
  patientNumber: z.string().trim().min(1).max(64),
  collectedAt: z.string().max(40).nullable().optional(),
  messageControlId: z.string().max(128).default(""),
  results: z.array(cbcResultSchema).min(1).max(100),
});

export type CbcBridgeSettings = {
  enabled: boolean;
  mode: "local" | "hosted";
  deviceIp: string;
  computerIp: string;
  listenPort: number;
  protocol: "mllp" | "raw-idle";
  transSelect: string;
  autoTrans: boolean;
  subnet: string;
  tokenConfigured: boolean;
  lastHeartbeat: Date | null;
  lastMessageAt: Date | null;
};

export type CbcSample = {
  id: number;
  sampleId: string;
  patientNumber: string;
  collectedAt: string | null;
  messageControlId: string;
  receivedAt: Date;
  results: z.infer<typeof cbcResultSchema>[];
};

const DEFAULTS = {
  enabled: false,
  mode: "local" as const,
  deviceIp: "192.168.1.100",
  computerIp: "192.168.1.111",
  listenPort: 5006,
  protocol: "mllp" as const,
  transSelect: "Net",
  autoTrans: true,
  subnet: "255.255.255.0",
};

function requireDb() {
  return getDb().then(db => {
    if (!db) throw new Error("قاعدة البيانات غير متصلة");
    return db;
  });
}

async function readConfig() {
  const db = await requireDb();
  const [row] = await db.select().from(cbcBridgeConfig).where(eq(cbcBridgeConfig.id, 1)).limit(1);
  return row ?? null;
}

export async function getCbcBridgeSettings(): Promise<CbcBridgeSettings> {
  const row = await readConfig();
  return {
    ...DEFAULTS,
    ...(row ? {
      enabled: row.enabled === 1,
      mode: row.mode,
      deviceIp: row.deviceIp,
      computerIp: row.computerIp,
      listenPort: row.listenPort,
      protocol: row.protocol,
      transSelect: row.transSelect,
      autoTrans: row.autoTrans === 1,
      subnet: row.subnet,
    } : {}),
    tokenConfigured: Boolean(row?.tokenHash),
    lastHeartbeat: row?.lastHeartbeat ?? null,
    lastMessageAt: row?.lastMessageAt ?? null,
  };
}

export async function updateCbcBridgeSettings(input: {
  enabled: boolean;
  mode: "local" | "hosted";
  deviceIp: string;
  computerIp: string;
  listenPort: number;
  protocol: "mllp" | "raw-idle";
  transSelect: string;
  autoTrans: boolean;
  subnet: string;
}) {
  const db = await requireDb();
  const values = {
    enabled: input.enabled ? 1 : 0,
    mode: input.mode,
    deviceIp: input.deviceIp,
    computerIp: input.computerIp,
    listenPort: input.listenPort,
    protocol: input.protocol,
    transSelect: input.transSelect,
    autoTrans: input.autoTrans ? 1 : 0,
    subnet: input.subnet,
  };
  const [existing] = await db.select({ id: cbcBridgeConfig.id }).from(cbcBridgeConfig).where(eq(cbcBridgeConfig.id, 1)).limit(1);
  if (existing) await db.update(cbcBridgeConfig).set(values).where(eq(cbcBridgeConfig.id, 1));
  else await db.insert(cbcBridgeConfig).values({ id: 1, ...values });
  return getCbcBridgeSettings();
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest();
}

export async function rotateCbcBridgeToken() {
  const db = await requireDb();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token).toString("hex");
  const [existing] = await db.select({ id: cbcBridgeConfig.id }).from(cbcBridgeConfig).where(eq(cbcBridgeConfig.id, 1)).limit(1);
  if (existing) await db.update(cbcBridgeConfig).set({ tokenHash }).where(eq(cbcBridgeConfig.id, 1));
  else await db.insert(cbcBridgeConfig).values({ id: 1, ...DEFAULTS, enabled: 0, autoTrans: 1, tokenHash });
  return { token };
}

async function configForToken(token: string) {
  if (!token || token.length > 256) return null;
  const row = await readConfig();
  if (!row?.tokenHash || row.enabled !== 1) return null;
  let expected: Buffer;
  try { expected = Buffer.from(row.tokenHash, "hex"); } catch { return null; }
  const actual = hashToken(token);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return row;
}

export async function getBridgeConfig(token: string) {
  const row = await configForToken(token);
  if (!row) return null;
  return {
    enabled: row.enabled === 1,
    mode: row.mode,
    deviceIp: row.deviceIp,
    computerIp: row.computerIp,
    listenPort: row.listenPort,
    protocol: row.protocol,
    transSelect: row.transSelect,
    autoTrans: row.autoTrans === 1,
    subnet: row.subnet,
  };
}

export async function acceptBridgeHeartbeat(token: string) {
  const row = await configForToken(token);
  if (!row) return false;
  const db = await requireDb();
  await db.update(cbcBridgeConfig).set({ lastHeartbeat: new Date() }).where(eq(cbcBridgeConfig.id, row.id));
  return true;
}

function stableHash(input: z.infer<typeof cbcSampleInputSchema>) {
  const canonicalResults = [...input.results].sort((a, b) =>
    [a.code, a.value, a.unit, a.referenceRange, a.abnormalFlag].join("\u0000").localeCompare([b.code, b.value, b.unit, b.referenceRange, b.abnormalFlag].join("\u0000")));
  const canonical = JSON.stringify({ sampleId: input.sampleId, patientNumber: input.patientNumber, collectedAt: input.collectedAt ?? null, results: canonicalResults });
  return createHash("sha256").update(canonical).digest("hex");
}

export async function storeBridgeSample(token: string, rawInput: unknown) {
  const row = await configForToken(token);
  if (!row) return { authorized: false as const };
  const input = cbcSampleInputSchema.parse(rawInput);
  const db = await requireDb();
  const contentHash = stableHash(input);
  let duplicate = false;
  try {
    await db.insert(cbcBridgeSamples).values({
      sampleId: input.sampleId,
      patientNumber: input.patientNumber,
      collectedAt: input.collectedAt ?? null,
      messageControlId: input.messageControlId,
      contentHash,
      resultsJson: JSON.stringify(input.results),
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "ER_DUP_ENTRY" && (error as { errno?: number }).errno !== 1062) throw error;
    duplicate = true;
  }
  if (!duplicate) await db.update(cbcBridgeConfig).set({ lastMessageAt: new Date() }).where(eq(cbcBridgeConfig.id, row.id));
  return { authorized: true as const, duplicate };
}

function toSample(row: typeof cbcBridgeSamples.$inferSelect): CbcSample {
  let results: CbcSample["results"] = [];
  try {
    const parsed: unknown = JSON.parse(row.resultsJson);
    const checked = z.array(cbcResultSchema).safeParse(parsed);
    if (checked.success) results = checked.data;
  } catch { /* malformed legacy rows are returned without result payload */ }
  return {
    id: row.id,
    sampleId: row.sampleId,
    patientNumber: row.patientNumber,
    collectedAt: row.collectedAt,
    messageControlId: row.messageControlId,
    receivedAt: row.receivedAt,
    results,
  };
}

export async function getLatestCbcSample() {
  const db = await requireDb();
  const [row] = await db.select().from(cbcBridgeSamples).orderBy(desc(cbcBridgeSamples.receivedAt), desc(cbcBridgeSamples.id)).limit(1);
  return row ? toSample(row) : null;
}

export async function listCbcSamples(limit = 50) {
  const db = await requireDb();
  const rows = await db.select().from(cbcBridgeSamples).orderBy(desc(cbcBridgeSamples.receivedAt), desc(cbcBridgeSamples.id)).limit(Math.max(1, Math.min(100, limit)));
  return rows.map(toSample);
}

export async function getCbcSampleById(sampleRowId: number) {
  const db = await requireDb();
  const [row] = await db.select().from(cbcBridgeSamples).where(eq(cbcBridgeSamples.id, sampleRowId)).limit(1);
  return row ? toSample(row) : null;
}

export async function getCbcSampleBySampleId(sampleId: string) {
  const db = await requireDb();
  const [row] = await db.select().from(cbcBridgeSamples).where(eq(cbcBridgeSamples.sampleId, sampleId)).orderBy(desc(cbcBridgeSamples.receivedAt), desc(cbcBridgeSamples.id)).limit(1);
  return row ? toSample(row) : null;
}

export async function getCbcBridgeStatus() {
  const settings = await getCbcBridgeSettings();
  const now = Date.now();
  const heartbeatAgeMs = settings.lastHeartbeat ? now - settings.lastHeartbeat.getTime() : Number.POSITIVE_INFINITY;
  const messageAgeMs = settings.lastMessageAt ? now - settings.lastMessageAt.getTime() : Number.POSITIVE_INFINITY;
  const connected = settings.enabled && heartbeatAgeMs < 90_000;
  return {
    ...settings,
    connection: !settings.enabled ? "disabled" as const : connected ? (messageAgeMs < 15_000 ? "receiving" as const : "connected" as const) : "disconnected" as const,
  };
}
