import { describe, expect, it } from "vitest";
import {
  sumInvoiceItems,
  toInvoiceNumber,
  toPatientNumber,
  uniqueTestCodes,
} from "./medical-workflow";

describe("server-side clinic numbering and invoice totals", () => {
  it("includes the clinic date, shift, and sequence in patient numbers", () => {
    expect(toPatientNumber("2026-11-21", "morning", 1)).toBe("P-20261121-M-0001");
    expect(toPatientNumber("2026-11-21", "evening", 28)).toBe("P-20261121-E-0028");
    expect(toPatientNumber("2026-11-22", "night", 10421)).toBe("P-20261122-N-10421");
  });

  it("derives distinct follow-up invoice numbers from one patient number", () => {
    const patientNumber = toPatientNumber("2026-11-21", "evening", 28);
    expect(toInvoiceNumber(patientNumber)).toBe("INV-20261121-E-0028-01");
    expect(toInvoiceNumber(patientNumber, 2)).toBe("INV-20261121-E-0028-02");
  });

  it("deduplicates test selections while preserving their order", () => {
    expect(uniqueTestCodes(["CBC", "BFFM", "CBC", "UA"])).toEqual(["CBC", "BFFM", "UA"]);
  });

  it("calculates total price from quantity and server-selected unit prices", () => {
    expect(sumInvoiceItems([
      { quantity: 1, unitPrice: 35000 },
      { quantity: 2, unitPrice: 12000 },
    ])).toBe(59000);
  });
});
