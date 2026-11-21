import { SHIFT_LABELS, ShiftType, isConsultationType, type ConsultationType } from "../shared/billing";

export const CLINIC_TIME_ZONE = "Africa/Khartoum";

export type ReportPeriod = "daily" | "weekly" | "monthly" | "shift";

export type ReportWindow = {
  period: ReportPeriod;
  dateKey: string;
  start: Date;
  end: Date;
  label: string;
  shiftType?: ShiftType;
};

export type ReportInvoiceRow = {
  invoiceNumber: string;
  patientNumber: string;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt?: Date | null;
  total: number;
  status: "pending" | "paid" | "cancelled" | "refunded";
  paymentMethod: string | null;
  paymentBank?: string | null;
  transactionNumber?: string | null;
  consultationType?: ConsultationType | null;
  consultationFee?: number | null;
};

export type PaymentBreakdownRow = { method: string; count: number; total: number };

export type OperationalReport = ReportWindow & {
  issuedInvoices: ReportInvoiceRow[];
  collectedInvoices: ReportInvoiceRow[];
  issuedCount: number;
  issuedTotal: number;
  paidIssuedCount: number;
  pendingIssuedCount: number;
  collectedCount: number;
  collectedTotal: number;
  refundedTotal: number;
  netTotal: number;
  consultationCount: number;
  consultationGeneralCount: number;
  consultationSpecialistCount: number;
  consultationTotal: number;
  testsTotal: number;
  paymentBreakdown: PaymentBreakdownRow[];
};

export class InvalidReportRequestError extends Error {
  constructor(message = "فترة التقرير أو التاريخ غير صالح") {
    super(message);
    this.name = "InvalidReportRequestError";
  }
}

type DateParts = { year: number; month: number; day: number };

function parseDateKey(value: unknown): DateParts {
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

function addDays(parts: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function toDateKey(parts: DateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function localTimeAsUtc(year: number, month: number, day: number, hour = 0): Date {
  const targetUtc = Date.UTC(year, month - 1, day, hour);
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

  // Resolve a wall-clock time in the clinic zone without an additional date/time dependency.
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

function parseShiftType(value: unknown): ShiftType {
  if (value === "morning" || value === "evening" || value === "night") return value;
  throw new InvalidReportRequestError("نوع الوردية غير صالح");
}

/**
 * Shift boundaries follow the clinic operating hours used across the app:
 * morning 08:00–14:00, evening 14:00–22:00, night 22:00–08:00 (next day).
 */
export function getShiftWindow(dateInput: unknown, shiftTypeInput: unknown): ReportWindow {
  const { year, month, day } = parseDateKey(dateInput);
  const shiftType = parseShiftType(shiftTypeInput);
  const startHour = shiftType === "morning" ? 8 : shiftType === "evening" ? 14 : 22;
  const endHour = shiftType === "morning" ? 14 : shiftType === "evening" ? 22 : 30;
  const endParts = endHour >= 24 ? addDays({ year, month, day }, 1) : { year, month, day };
  const start = localTimeAsUtc(year, month, day, startHour);
  const end = localTimeAsUtc(endParts.year, endParts.month, endParts.day, endHour % 24);
  return {
    period: "shift",
    dateKey: toDateKey({ year, month, day }),
    start,
    end,
    label: `وردية ${SHIFT_LABELS[shiftType]}`,
    shiftType,
  };
}

export function getReportWindow(periodInput: unknown, dateInput: unknown, shiftTypeInput?: unknown): ReportWindow {
  if (periodInput === "shift") return getShiftWindow(dateInput, shiftTypeInput);
  if (periodInput !== "daily" && periodInput !== "weekly" && periodInput !== "monthly") {
    throw new InvalidReportRequestError();
  }
  const { year, month, day } = parseDateKey(dateInput);
  const dateKey = toDateKey({ year, month, day });

  let startParts: DateParts = { year, month, day };
  let endParts: DateParts;
  let label: string;
  if (periodInput === "monthly") {
    startParts = { year, month, day: 1 };
    endParts = month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
    label = "شهري";
  } else if (periodInput === "weekly") {
    // The Sudanese working week starts on Sunday.
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    startParts = addDays({ year, month, day }, -dayOfWeek);
    endParts = addDays(startParts, 7);
    label = "أسبوعي";
  } else {
    endParts = addDays({ year, month, day }, 1);
    label = "يومي";
  }

  return {
    period: periodInput,
    dateKey,
    start: localTimeAsUtc(startParts.year, startParts.month, startParts.day),
    end: localTimeAsUtc(endParts.year, endParts.month, endParts.day),
    label,
  };
}

function consultationTypeOf(row: ReportInvoiceRow): ConsultationType {
  if (isConsultationType(row.consultationType)) return row.consultationType;
  const fee = Number(row.consultationFee ?? 0);
  return fee > 0 ? "general" : "none";
}

function consultationFeeOf(row: ReportInvoiceRow): number {
  const fee = Number(row.consultationFee ?? 0);
  return Number.isFinite(fee) && fee > 0 ? Math.trunc(fee) : 0;
}

export function buildOperationalReport(
  window: ReportWindow,
  issuedRows: ReportInvoiceRow[],
  collectedRows: ReportInvoiceRow[],
): OperationalReport {
  const issuedInvoices = issuedRows.filter(row => row.status !== "cancelled" && row.status !== "refunded");
  const collectedInvoices = collectedRows.filter(row => row.status === "paid" && row.paidAt !== null);
  const refundedTotal = collectedRows.filter(row => row.status === "refunded" && row.refundedAt !== null).reduce((sum, row) => sum + row.total, 0);
  const consultationInvoices = issuedInvoices.filter(row => consultationTypeOf(row) !== "none");
  const consultationTotal = consultationInvoices.reduce((sum, row) => sum + consultationFeeOf(row), 0);
  const issuedTotal = issuedInvoices.reduce((sum, row) => sum + row.total, 0);

  const paymentMap = new Map<string, PaymentBreakdownRow>();
  for (const row of collectedInvoices) {
    const method = row.paymentMethod === "bank" ? `بنكي${row.paymentBank ? ` · ${row.paymentBank}` : ""}` : row.paymentMethod === "cash" ? "نقدي" : row.paymentMethod?.trim() || "غير محدد";
    const current = paymentMap.get(method) ?? { method, count: 0, total: 0 };
    current.count += 1;
    current.total += row.total;
    paymentMap.set(method, current);
  }

  return {
    ...window,
    issuedInvoices,
    collectedInvoices,
    issuedCount: issuedInvoices.length,
    issuedTotal,
    paidIssuedCount: issuedInvoices.filter(row => row.status === "paid").length,
    pendingIssuedCount: issuedInvoices.filter(row => row.status === "pending").length,
    collectedCount: collectedInvoices.length,
    collectedTotal: collectedInvoices.reduce((sum, row) => sum + row.total, 0),
    refundedTotal,
    netTotal: collectedInvoices.reduce((sum, row) => sum + row.total, 0) - refundedTotal,
    consultationCount: consultationInvoices.length,
    consultationGeneralCount: consultationInvoices.filter(row => consultationTypeOf(row) === "general").length,
    consultationSpecialistCount: consultationInvoices.filter(row => consultationTypeOf(row) === "specialist").length,
    consultationTotal,
    testsTotal: Math.max(0, issuedTotal - consultationTotal),
    paymentBreakdown: [...paymentMap.values()].sort((a, b) => b.total - a.total),
  };
}

export function reportPeriodTitle(window: ReportWindow): string {
  if (window.period === "shift") return `تقرير ${window.label}`;
  if (window.period === "weekly") return "تقرير حركة المستوصف الأسبوعي";
  if (window.period === "monthly") return "تقرير حركة المستوصف الشهري";
  return "تقرير حركة المستوصف اليومي";
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
  if (window.period === "shift") return `${formatter.format(window.start)} · ${window.label}`;
  const lastDay = new Date(window.end.getTime() - 1);
  return `${formatter.format(window.start)} — ${formatter.format(lastDay)}`;
}
