import type { TestField } from "./catalog";

export type CbcAnalyzerResult = {
  code: string;
  value: string;
  unit: string;
  referenceRange: string;
  abnormalFlag: string;
  observationTime?: string;
};

export type CbcAnalyzerSample = {
  id: number;
  sampleId: string;
  patientNumber: string;
  collectedAt: string | null;
  messageControlId: string;
  receivedAt: string;
  results: CbcAnalyzerResult[];
};

export const CBC_ANALYZER_EXTRA_FIELDS: TestField[] = [
  { key: "neut_abs", label: "NEUT#", male: "—", female: "—", type: "text" },
  { key: "lym_abs", label: "LYMPH#", male: "—", female: "—", type: "text" },
  { key: "mono_abs", label: "MONO#", male: "—", female: "—", type: "text" },
  { key: "eos_abs", label: "EOS#", male: "—", female: "—", type: "text" },
  { key: "baso_abs", label: "BASO#", male: "—", female: "—", type: "text" },
  { key: "rdw_sd", label: "RDW-SD", male: "—", female: "—", type: "text" },
  { key: "pdw", label: "PDW", male: "—", female: "—", type: "text" },
  { key: "pct", label: "PCT", male: "—", female: "—", type: "text" },
];

/** Explicit common display-code aliases only. Analyzer-specific codes need a real sample before adding aliases. */
const CODE_TO_FIELD: Record<string, string> = {
  WBC: "wbc",
  RBC: "rbc",
  HGB: "hb",
  HB: "hb",
  HEMOGLOBIN: "hb",
  HCT: "hct",
  PCV: "hct",
  MCV: "mcv",
  MCH: "mch",
  MCHC: "mchc",
  PLT: "plt",
  PLATELET: "plt",
  "NEUT%": "neut",
  "NEUTROPHILS%": "neut",
  "LYMPH%": "lym",
  "LYM%": "lym",
  "LYMPHOCYTES%": "lym",
  "MONO%": "mono",
  "MONOCYTES%": "mono",
  "EOS%": "eos",
  "EOSINOPHILS%": "eos",
  "BASO%": "baso",
  "BASOPHILS%": "baso",
  "RDW-CV": "rdw",
  RDW_CV: "rdw",
  RDWCV: "rdw",
  MPV: "mpv",
  "NEUT#": "neut_abs",
  NEUTABS: "neut_abs",
  "LYMPH#": "lym_abs",
  "LYM#": "lym_abs",
  LYMPHABS: "lym_abs",
  "MONO#": "mono_abs",
  MONOABS: "mono_abs",
  "EOS#": "eos_abs",
  EOSABS: "eos_abs",
  "BASO#": "baso_abs",
  BASOABS: "baso_abs",
  "RDW-SD": "rdw_sd",
  RDW_SD: "rdw_sd",
  RDWSD: "rdw_sd",
  PDW: "pdw",
  PCT: "pct",
};

export function cbcFieldForAnalyzerCode(code: string): string | undefined {
  return CODE_TO_FIELD[code.trim().toUpperCase().replace(/\s+/g, "")];
}

export function applyCbcAnalyzerSample(
  currentPatientNumber: string,
  sample: CbcAnalyzerSample,
  currentValues: Record<string, string>,
  fields: readonly TestField[],
): { ok: true; values: Record<string, string>; filled: string[]; unmapped: string[]; ambiguous: string[] } | { ok: false; reason: "patient-mismatch" } {
  if (!currentPatientNumber || sample.patientNumber !== currentPatientNumber) return { ok: false, reason: "patient-mismatch" };
  const availableFields = new Set(fields.map(field => field.key));
  const grouped = new Map<string, CbcAnalyzerResult[]>();
  const unmapped = new Set<string>();
  for (const result of sample.results) {
    const key = cbcFieldForAnalyzerCode(result.code);
    if (!key || !availableFields.has(key)) {
      unmapped.add(result.code);
      continue;
    }
    const matches = grouped.get(key) ?? [];
    matches.push(result);
    grouped.set(key, matches);
  }
  const next = { ...currentValues };
  const filled: string[] = [];
  const ambiguous: string[] = [];
  for (const [key, results] of grouped) {
    if (results.length !== 1) {
      ambiguous.push(key);
      continue;
    }
    const result = results[0];
    if (typeof next[key] === "string" && next[key].trim() !== "") continue;
    if (result.value === "") continue;
    next[key] = result.value;
    filled.push(key);
  }
  const importMetadata = {
    version: 1,
    sampleId: sample.sampleId,
    patientNumber: sample.patientNumber,
    collectedAt: sample.collectedAt,
    receivedAt: sample.receivedAt,
    messageControlId: sample.messageControlId,
    importedAt: new Date().toISOString(),
    observations: sample.results,
  };
  // This is kept with the manual result payload for provenance; it is not itself a lab result.
  next.__cbc_import_metadata = JSON.stringify(importMetadata);
  return { ok: true, values: next, filled, unmapped: [...unmapped], ambiguous };
}

export function readCbcImportMetadata(value: string | undefined): { sampleId: string; patientNumber: string; collectedAt: string | null; receivedAt: string; observations: CbcAnalyzerResult[] } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<{ sampleId: string; patientNumber: string; collectedAt: string | null; receivedAt: string; observations: CbcAnalyzerResult[] }>;
    return typeof parsed.sampleId === "string" && typeof parsed.patientNumber === "string" && Array.isArray(parsed.observations)
      ? { sampleId: parsed.sampleId, patientNumber: parsed.patientNumber, collectedAt: parsed.collectedAt ?? null, receivedAt: parsed.receivedAt ?? "", observations: parsed.observations }
      : null;
  } catch {
    return null;
  }
}
