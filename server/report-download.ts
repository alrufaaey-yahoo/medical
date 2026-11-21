import { InvalidReportRequestError, OperationalReport, ReportWindow, getReportWindow } from "./operational-reports";

export type ReportDownloadInput = {
  period: unknown;
  date: unknown;
  shiftType?: unknown;
  role: string | null | undefined;
};

export type LoadedReport = {
  report: OperationalReport;
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  clinicWebsite?: string | null;
  clinicFooterText?: string | null;
};

export type ReportDownloadResponse = {
  status: number;
  headers?: Record<string, string>;
  body: Buffer | { error: string };
};

export class ReportDatabaseUnavailableError extends Error {
  constructor() {
    super("Report database is unavailable");
    this.name = "ReportDatabaseUnavailableError";
  }
}

export function isReportRoleAllowed(role: string | null | undefined): boolean {
  return role === "admin" || role === "supervisor" || role === "cashier";
}

export async function createReportDownloadResponse(
  input: ReportDownloadInput,
  dependencies: {
    loadReport: (window: ReportWindow) => Promise<LoadedReport | null>;
    renderPdf: (report: OperationalReport, clinicName: string, branding?: Omit<LoadedReport, "report" | "clinicName">) => Promise<Buffer>;
  },
): Promise<ReportDownloadResponse> {
  if (input.role == null) return { status: 401, body: { error: "يلزم تسجيل الدخول لتنزيل التقرير" } };
  if (!isReportRoleAllowed(input.role)) return { status: 403, body: { error: "لا يملك هذا الدور صلاحية تنزيل التقرير" } };

  let window: ReportWindow;
  try {
    window = getReportWindow(input.period, input.date, input.shiftType);
  } catch (error) {
    if (error instanceof InvalidReportRequestError) return { status: 400, body: { error: error.message } };
    throw error;
  }

  try {
    const loaded = await dependencies.loadReport(window);
    if (!loaded) return { status: 503, body: { error: "قاعدة البيانات غير متاحة؛ لم يتم إنشاء التقرير" } };
    const pdf = await dependencies.renderPdf(loaded.report, loaded.clinicName, {
      clinicAddress: loaded.clinicAddress,
      clinicPhone: loaded.clinicPhone,
      clinicWebsite: loaded.clinicWebsite,
      clinicFooterText: loaded.clinicFooterText,
    });
    const suffix = window.period === "shift" && window.shiftType ? `-${window.shiftType}` : "";
    const filename = `clinic-report-${window.period}${suffix}-${window.dateKey}.pdf`;
    return {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
      body: pdf,
    };
  } catch (error) {
    if (error instanceof ReportDatabaseUnavailableError) {
      return { status: 503, body: { error: "قاعدة البيانات غير متاحة؛ لم يتم إنشاء التقرير" } };
    }
    return { status: 500, body: { error: "تعذر إنشاء التقرير حاليًا" } };
  }
}
