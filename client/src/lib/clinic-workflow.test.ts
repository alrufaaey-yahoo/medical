import { describe, expect, it } from "vitest";
import {
  createFollowUpInvoice,
  filterRecordsByReportRange,
  formatClinicDateFromKey,
  getClinicDateKey,
  getClinicReportDateKey,
  getClinicShiftDateKey,
  getCurrentClinicShift,
  getNextPatientIdentity,
  isHttpsLogoUrl,
} from "./clinic-workflow";

describe("clinic shift and registration identifiers", () => {
  it("assigns the three configured shifts at their boundary hours", () => {
    expect(getCurrentClinicShift(new Date("2026-11-21T05:59:00.000Z"))).toBe("سهرة");
    expect(getCurrentClinicShift(new Date("2026-11-21T06:00:00.000Z"))).toBe("صباحية");
    expect(getCurrentClinicShift(new Date("2026-11-21T11:59:00.000Z"))).toBe("صباحية");
    expect(getCurrentClinicShift(new Date("2026-11-21T12:00:00.000Z"))).toBe("مسائية");
    expect(getCurrentClinicShift(new Date("2026-11-21T19:59:00.000Z"))).toBe("مسائية");
    expect(getCurrentClinicShift(new Date("2026-11-21T20:00:00.000Z"))).toBe("سهرة");
  });

  it("uses local calendar dates, including month and year boundaries", () => {
    expect(getClinicDateKey(new Date("2026-12-31T21:59:00.000Z"))).toBe("2026-12-31");
    expect(getClinicDateKey(new Date("2026-12-31T22:01:00.000Z"))).toBe("2027-01-01");
    expect(formatClinicDateFromKey("2026-11-21")).not.toBe("2026-11-21");
    expect(formatClinicDateFromKey("invalid-date")).toBe("invalid-date");
  });

  it("uses Africa/Khartoum when selecting the date for official reports", () => {
    expect(getClinicReportDateKey(new Date("2026-11-21T22:30:00.000Z"))).toBe("2026-11-22");
    expect(getClinicReportDateKey(new Date("2026-12-31T22:30:00.000Z"))).toBe("2027-01-01");
  });

  it("keeps the night shift on its starting date after midnight", () => {
    expect(getClinicShiftDateKey(new Date("2026-11-21T19:30:00.000Z"))).toBe("2026-11-21");
    expect(getClinicShiftDateKey(new Date("2026-11-21T22:30:00.000Z"))).toBe("2026-11-21");
    expect(getClinicShiftDateKey(new Date("2026-11-22T05:00:00.000Z"))).toBe("2026-11-21");
    expect(getClinicShiftDateKey(new Date("2026-11-22T06:00:00.000Z"))).toBe("2026-11-22");
  });

  it("accepts HTTPS clinic logo links and allows clearing the optional link", () => {
    expect(isHttpsLogoUrl(" https://clinic.example/logo.png ")).toBe(true);
    expect(isHttpsLogoUrl("")).toBe(true);
    expect(isHttpsLogoUrl("   ")).toBe(true);
    expect(isHttpsLogoUrl("http://clinic.example/logo.png")).toBe(false);
    expect(isHttpsLogoUrl("/manus-storage/logo.png")).toBe(false);
    expect(isHttpsLogoUrl("not a URL")).toBe(false);
  });

  it("filters report records by the local day and month while keeping undated demo records visible", () => {
    const records = [
      { id: "today", registeredDate: "2026-11-21" },
      { id: "month", registeredDate: "2026-11-03" },
      { id: "older", registeredDate: "2026-10-31" },
      { id: "demo" },
    ];

    expect(filterRecordsByReportRange(records, "today", "2026-11-21").map((record) => record.id)).toEqual(["today", "demo"]);
    expect(filterRecordsByReportRange(records, "month", "2026-11-21").map((record) => record.id)).toEqual(["today", "month", "demo"]);
  });

  it("creates sequential patient and invoice numbers from existing records", () => {
    expect(
    getNextPatientIdentity([
        { id: "P-1042", invoice: "INV-260021" },
        { id: "P-1038", invoice: "INV-260017" },
      ]),
    ).toEqual({ id: "P-1043", invoice: "INV-260022" });
  });

  it("starts both sequences cleanly for an empty clinic", () => {
    expect(getNextPatientIdentity([])).toEqual({ id: "P-0001", invoice: "INV-000001" });
  });

  it("ignores malformed identifiers when finding the next sequence", () => {
    expect(
      getNextPatientIdentity([
        { id: "P-temp", invoice: "INV-temp" },
        { id: "P-0012", invoice: "INV-000077" },
      ]),
    ).toEqual({ id: "P-0013", invoice: "INV-000078" });
  });

  it("adds follow-up tests to the same patient and leaves only those tests on a new unpaid invoice", () => {
    const patient = {
      id: "P-1042",
      tests: ["CBC"],
      invoice: "INV-260021",
      invoiceTests: ["CBC"],
      consultationIncluded: true,
      paid: true,
      status: "في المختبر" as const,
    };

    expect(createFollowUpInvoice(patient, ["BFFM", "BFFM", "CBC"], "INV-260022")).toEqual({
      ...patient,
      tests: ["CBC", "BFFM"],
      invoice: "INV-260022",
      invoiceTests: ["BFFM"],
      consultationIncluded: false,
      consultationType: "none",
      consultationFee: 0,
      paid: false,
      status: "في الانتظار",
    });
  });

  it("does not create a follow-up invoice when every requested test is already present", () => {
    const patient = {
      tests: ["CBC"],
      invoice: "INV-260021",
      paid: true,
      status: "في المختبر" as const,
    };
    expect(createFollowUpInvoice(patient, ["CBC", "CBC"], "INV-260022")).toBeNull();
  });
});
