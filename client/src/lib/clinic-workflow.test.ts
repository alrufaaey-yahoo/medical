import { describe, expect, it } from "vitest";
import {
  createFollowUpInvoice,
  filterRecordsByReportRange,
  formatClinicDateFromKey,
  getClinicDateKey,
  getCurrentClinicShift,
  getNextPatientIdentity,
} from "./clinic-workflow";

describe("clinic shift and registration identifiers", () => {
  it("assigns the three configured shifts at their boundary hours", () => {
    expect(getCurrentClinicShift(new Date(2026, 10, 21, 7, 59))).toBe("سهرة");
    expect(getCurrentClinicShift(new Date(2026, 10, 21, 8, 0))).toBe("صباحية");
    expect(getCurrentClinicShift(new Date(2026, 10, 21, 13, 59))).toBe("صباحية");
    expect(getCurrentClinicShift(new Date(2026, 10, 21, 14, 0))).toBe("مسائية");
    expect(getCurrentClinicShift(new Date(2026, 10, 21, 21, 59))).toBe("مسائية");
    expect(getCurrentClinicShift(new Date(2026, 10, 21, 22, 0))).toBe("سهرة");
  });

  it("uses local calendar dates, including month and year boundaries", () => {
    expect(getClinicDateKey(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
    expect(getClinicDateKey(new Date(2027, 0, 1, 0, 1))).toBe("2027-01-01");
    expect(formatClinicDateFromKey("2026-11-21")).not.toBe("2026-11-21");
    expect(formatClinicDateFromKey("invalid-date")).toBe("invalid-date");
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
