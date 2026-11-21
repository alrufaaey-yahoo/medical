import { describe, expect, it, vi } from "vitest";
import { createReportDownloadResponse, isReportRoleAllowed } from "./report-download";
import { renderOperationalReportPdf } from "./report-pdf";
import { buildOperationalReport, getReportWindow, ReportInvoiceRow } from "./operational-reports";

const invoice = (overrides: Partial<ReportInvoiceRow> = {}): ReportInvoiceRow => ({
  invoiceNumber: "INV-000001",
  patientNumber: "P-0001",
  createdAt: new Date("2026-11-21T09:00:00.000Z"),
  paidAt: null,
  total: 35000,
  status: "pending",
  paymentMethod: null,
  ...overrides,
});

describe("operational report periods in Africa/Khartoum", () => {
  it("uses inclusive local-midnight start and exclusive next-day end for daily reports", () => {
    const window = getReportWindow("daily", "2026-11-21");
    expect(window.start.toISOString()).toBe("2026-11-20T22:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-21T22:00:00.000Z");
    expect(window.period).toBe("daily");
  });

  it("spans the full local month, including year boundaries", () => {
    const window = getReportWindow("monthly", "2026-12-17");
    expect(window.start.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-12-31T22:00:00.000Z");
    expect(window.dateKey).toBe("2026-12-17");
  });

  it("spans the Sudanese week and rejects malformed periods and impossible dates", () => {
    const week = getReportWindow("weekly", "2026-11-21");
    expect(week.period).toBe("weekly");
    expect(week.start.toISOString()).toBe("2026-11-14T22:00:00.000Z");
    expect(week.end.toISOString()).toBe("2026-11-21T22:00:00.000Z");
    expect(() => getReportWindow("yearly", "2026-11-21")).toThrow("غير صالح");
    expect(() => getReportWindow("daily", "2026-02-30")).toThrow("غير صالح");
    expect(() => getReportWindow("daily", ["2026-11-21"])).toThrow("غير صالح");
  });

  it("separates invoice creation from collection and excludes cancelled or non-paid collection rows", () => {
    const report = buildOperationalReport(
      getReportWindow("daily", "2026-11-21"),
      [
        invoice({ invoiceNumber: "INV-1", total: 35000, status: "paid", paidAt: new Date("2026-11-20T23:00:00.000Z") }),
        invoice({ invoiceNumber: "INV-2", total: 12000, status: "pending" }),
        invoice({ invoiceNumber: "INV-3", total: 9000, status: "cancelled" }),
      ],
      [
        invoice({ invoiceNumber: "INV-0", total: 8000, status: "paid", paidAt: new Date("2026-11-21T02:00:00.000Z") }),
        invoice({ invoiceNumber: "INV-1", total: 35000, status: "paid", paidAt: new Date("2026-11-20T23:00:00.000Z") }),
        invoice({ invoiceNumber: "INV-CANCELLED", total: 7000, status: "cancelled", paidAt: new Date("2026-11-21T02:00:00.000Z") }),
        invoice({ invoiceNumber: "INV-NOT-PAID", total: 4000, status: "pending", paidAt: null }),
      ],
    );

    expect(report.issuedCount).toBe(2);
    expect(report.issuedTotal).toBe(47000);
    expect(report.paidIssuedCount).toBe(1);
    expect(report.pendingIssuedCount).toBe(1);
    expect(report.collectedCount).toBe(2);
    expect(report.collectedTotal).toBe(43000);
    expect(report.collectedInvoices.map(row => row.invoiceNumber)).toEqual(["INV-0", "INV-1"]);
  });

  it("reports bank collection by bank name and preserves the invoice reference", () => {
    const bankInvoice = invoice({ status: "paid", paidAt: new Date("2026-11-21T02:00:00.000Z"), paymentMethod: "bank", paymentBank: "بنكك", transactionNumber: "0427" });
    const report = buildOperationalReport(getReportWindow("daily", "2026-11-21"), [bankInvoice], [bankInvoice]);
    expect(report.paymentBreakdown).toEqual([{ method: "بنكي · بنكك", count: 1, total: 35000 }]);
    expect(report.collectedInvoices[0]).toMatchObject({ paymentBank: "بنكك", transactionNumber: "0427" });
  });
});

describe("report PDF download authorization and response", () => {
  it("allows only the intended operational roles", () => {
    expect(isReportRoleAllowed("admin")).toBe(true);
    expect(isReportRoleAllowed("supervisor")).toBe(true);
    expect(isReportRoleAllowed("cashier")).toBe(true);
    expect(isReportRoleAllowed("lab")).toBe(false);
    expect(isReportRoleAllowed("user")).toBe(false);
    expect(isReportRoleAllowed(undefined)).toBe(false);
  });

  it("rejects anonymous, lab, and demo users before loading report data", async () => {
    const loadReport = vi.fn();
    const dependencies = { loadReport, renderPdf: vi.fn(async () => Buffer.from("%PDF-test")) };
    await expect(createReportDownloadResponse({ period: "daily", date: "2026-11-21", role: null }, dependencies)).resolves.toMatchObject({ status: 401 });
    await expect(createReportDownloadResponse({ period: "daily", date: "2026-11-21", role: "lab" }, dependencies)).resolves.toMatchObject({ status: 403 });
    await expect(createReportDownloadResponse({ period: "daily", date: "2026-11-21", role: "user" }, dependencies)).resolves.toMatchObject({ status: 403 });
    expect(loadReport).not.toHaveBeenCalled();
  });

  it("returns PDF attachment headers and a valid Arabic PDF for allowed roles", async () => {
    const window = getReportWindow("daily", "2026-11-21");
    const report = buildOperationalReport(window, [invoice({ status: "paid", paidAt: new Date("2026-11-21T08:00:00.000Z") })], [invoice({ status: "paid", paidAt: new Date("2026-11-21T08:00:00.000Z") })]);
    const result = await createReportDownloadResponse(
      { period: "daily", date: "2026-11-21", role: "cashier" },
      {
        loadReport: async () => ({ report, clinicName: "مستوصف الاختبار" }),
        renderPdf: renderOperationalReportPdf,
      },
    );

    expect(result.status).toBe(200);
    expect(result.headers).toMatchObject({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="clinic-report-daily-2026-11-21.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    expect(Buffer.isBuffer(result.body)).toBe(true);
    const pdf = result.body as Buffer;
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    expect(pdf.subarray(-20).toString("latin1")).toContain("%%EOF");
  });

  it("returns safe client errors for invalid dates and unavailable databases", async () => {
    const dependencies = {
      loadReport: async () => null,
      renderPdf: async () => Buffer.from("%PDF-test"),
    };
    await expect(createReportDownloadResponse({ period: "daily", date: "2026-02-30", role: "admin" }, dependencies)).resolves.toMatchObject({ status: 400 });
    await expect(createReportDownloadResponse({ period: "monthly", date: "2026-11-21", role: "supervisor" }, dependencies)).resolves.toMatchObject({ status: 503 });
  });
});
