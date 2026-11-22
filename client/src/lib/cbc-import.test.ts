import { describe, expect, it } from "vitest";
import { CBC_ANALYZER_EXTRA_FIELDS, applyCbcAnalyzerSample, readCbcImportMetadata, type CbcAnalyzerSample } from "./cbc-import";
import { DEFAULT_CATALOG } from "./catalog";

const sample: CbcAnalyzerSample = {
  id: 1,
  sampleId: "S-001",
  patientNumber: "P-20261122-M-1",
  collectedAt: "20261122120000",
  messageControlId: "MSG-1",
  receivedAt: "2026-11-22T12:00:00.000Z",
  results: [
    { code: "WBC", value: "7.50", unit: "10^3/uL", referenceRange: "4.0-10.0", abnormalFlag: "N" },
    { code: "HGB", value: "13.1", unit: "g/dL", referenceRange: "12-16", abnormalFlag: "L" },
    { code: "PDW", value: "11.2", unit: "fL", referenceRange: "9-17", abnormalFlag: "H" },
    { code: "VENDOR-UNKNOWN", value: "3", unit: "x", referenceRange: "", abnormalFlag: "" },
  ],
};

const fields = [...DEFAULT_CATALOG.find(test => test.code === "CBC")!.fields, ...CBC_ANALYZER_EXTRA_FIELDS];

describe("CBC analyzer import", () => {
  it("fills empty values only and preserves manually entered values", () => {
    const result = applyCbcAnalyzerSample(sample.patientNumber, sample, { wbc: "manual", hb: "" }, fields);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.wbc).toBe("manual");
    expect(result.values.hb).toBe("13.1");
    expect(result.filled).toEqual(["hb", "pdw"]);
  });

  it("fails closed when patient identity does not match", () => {
    const result = applyCbcAnalyzerSample("P-WRONG", sample, { wbc: "keep" }, fields);
    expect(result).toEqual({ ok: false, reason: "patient-mismatch" });
  });

  it("does not overwrite non-empty whitespace-trimmed user values and keeps device metadata", () => {
    const result = applyCbcAnalyzerSample(sample.patientNumber, sample, { wbc: " 6.9 " }, fields);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.wbc).toBe(" 6.9 ");
    const metadata = readCbcImportMetadata(result.values.__cbc_import_metadata);
    expect(metadata?.observations[1]).toMatchObject({ code: "HGB", unit: "g/dL", referenceRange: "12-16", abnormalFlag: "L" });
    expect(result.unmapped).toContain("VENDOR-UNKNOWN");
  });

  it("maps codes independent of observation order and records duplicate code ambiguity", () => {
    const shuffled = { ...sample, results: [...sample.results].reverse() };
    const result = applyCbcAnalyzerSample(sample.patientNumber, shuffled, {}, fields);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.pdw).toBe("11.2");
    const duplicate = { ...sample, results: [...sample.results, sample.results[0]] };
    const ambiguous = applyCbcAnalyzerSample(sample.patientNumber, duplicate, {}, fields);
    expect(ambiguous.ok && ambiguous.ambiguous).toContain("wbc");
  });
});
