export const CLINIC_TIME_ZONE = "Africa/Khartoum";

export type ReportPeriod = "daily" | "monthly";

export type ReportWindow = {
  period: ReportPeriod;
  dateKey: string;
  start: Date;
  end: Date;
  label: string;
};

export type ReportInvoiceRow = {
  invoiceNumber: string;
  patientNumber: string;
  createdAt: Date;
  paidAt: Date | null;
  total: number;
  status: "pending" | "paid" | "cancelled";
  paymentMethod: string | null;
};

export type OperationalReport = ReportWindow & {
  issuedInvoices: ReportInvoiceRow[];
  collectedInvoices: ReportInvoiceRow[];
  issuedCount: number;
  issuedTotal: number;
  paidIssuedCount: number;
  pendingIssuedCount: number;
  collectedCount: number;
  collectedTotal: number;
};

export class InvalidReportRequestError extends Error {
  constructor(message = "فترة التقرير أو التاريخ غير صالح") {
    super(message);
    this.name = "InvalidReportRequestError";
  }
}

function parseDateKey(value: unknown): { year: number; month: number; day: number } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidReportRequestError();
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new InvalidReportRequestError();
  }
  return { year, month, day };
}

function localMidnightAsUtc(year: number, month: number, day: number): Date {
  const targetUtc = Date.UTC(year, month - 1, day);
  let candidate = new Date(targetUtc);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  // Resolve midnight in the clinic zone without an additional date/time dependency.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]));
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const difference = targetUtc - representedUtc;
    if (difference === 0) break;
    candidate = new Date(candidate.getTime() + difference);
  }
  return candidate;
}

export function getReportWindow(periodInput: unknown, dateInput: unknown): ReportWindow {
  if (periodInput !== "daily" && periodInput !== "monthly") throw new InvalidReportRequestError();
  const { year, month, day } = parseDateKey(dateInput);
  const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const start = localMidnightAsUtc(year, month, periodInput === "daily" ? day : 1);
  let nextYear = year;
  let nextMonth = month;
  let nextDay = day + 1;
  if (periodInput === "monthly") {
    nextMonth += 1;
    if (nextMonth === 13) {
      nextMonth = 1;
      nextYear += 1;
    }
    nextDay = 1;
  }
  const end = localMidnightAsUtc(nextYear, nextMonth, nextDay);
  return {
    period: periodInput,
    dateKey,
    start,
    end,
    label: periodInput === "daily" ? "يومي" : "شهري",
  };
}

export function buildOperationalReport(
  window: ReportWindow,
  issuedRows: ReportInvoiceRow[],
  collectedRows: ReportInvoiceRow[],
): OperationalReport {
  const issuedInvoices = issuedRows.filter(row => row.status !== "cancelled");
  const collectedInvoices = collectedRows.filter(row => row.status === "paid" && row.paidAt !== null);
  return {
    ...window,
    issuedInvoices,
    collectedInvoices,
    issuedCount: issuedInvoices.length,
    issuedTotal: issuedInvoices.reduce((sum, row) => sum + row.total, 0),
    paidIssuedCount: issuedInvoices.filter(row => row.status === "paid").length,
    pendingIssuedCount: issuedInvoices.filter(row => row.status === "pending").length,
    collectedCount: collectedInvoices.length,
    collectedTotal: collectedInvoices.reduce((sum, row) => sum + row.total, 0),
  };
}

export function formatClinicDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ar-SD", {
    timeZone: CLINIC_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatClinicTime(date: Date): string {
  return new Intl.DateTimeFormat("ar-SD", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatReportPeriod(window: ReportWindow): string {
  const formatter = new Intl.DateTimeFormat("ar-SD", {
    timeZone: CLINIC_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (window.period === "daily") return formatter.format(window.start);
  const lastDay = new Date(window.end.getTime() - 1);
  return `${formatter.format(window.start)} — ${formatter.format(lastDay)}`;
}
