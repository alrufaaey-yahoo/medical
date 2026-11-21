/**
 * Billing domain rules shared by the server and the client.
 *
 * The invoice is always the sum of its lines: consultation (optional) plus one
 * line per requested lab test. Keeping the arithmetic and the consultation
 * vocabulary here prevents the UI and the API from drifting apart.
 */

export type ConsultationType = "none" | "general" | "specialist";

export type ShiftType = "morning" | "evening" | "night";

export const CONSULTATION_TYPES: readonly ConsultationType[] = ["none", "general", "specialist"];

export const SHIFT_LABELS: Record<ShiftType, string> = {
  morning: "صباحية",
  evening: "مسائية",
  night: "سهرة",
};

export const CONSULTATION_LABELS: Record<ConsultationType, string> = {
  none: "بدون معاينة",
  general: "معاينة طبيب عمومي",
  specialist: "معاينة طبيب اختصاصي",
};

export const CONSULTATION_SHORT_LABELS: Record<ConsultationType, string> = {
  none: "بدون",
  general: "عمومي",
  specialist: "اختصاصي",
};

/** Description used by invoices created before consultation types existed. */
export const LEGACY_CONSULTATION_DESCRIPTION = "المعاينة الطبية";

export function isConsultationType(value: unknown): value is ConsultationType {
  return value === "none" || value === "general" || value === "specialist";
}

export function normalizeConsultationType(value: unknown, fallback: ConsultationType = "none"): ConsultationType {
  return isConsultationType(value) ? value : fallback;
}

/** True for every description an invoice may use for a doctor consultation line. */
export function isConsultationDescription(description: string | null | undefined): boolean {
  const normalized = (description ?? "").trim();
  return normalized === LEGACY_CONSULTATION_DESCRIPTION
    || normalized === CONSULTATION_LABELS.general
    || normalized === CONSULTATION_LABELS.specialist;
}

export function consultationTypeFromDescription(description: string | null | undefined): ConsultationType {
  const normalized = (description ?? "").trim();
  if (normalized === CONSULTATION_LABELS.general) return "general";
  if (normalized === CONSULTATION_LABELS.specialist) return "specialist";
  // Legacy invoices carried a single flat "medical consultation" line.
  if (normalized === LEGACY_CONSULTATION_DESCRIPTION) return "general";
  return "none";
}

export type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export function invoiceLineTotal(line: Pick<InvoiceLine, "quantity" | "unitPrice">): number {
  return Math.max(0, Math.trunc(line.quantity)) * Math.max(0, Math.trunc(line.unitPrice));
}

export function invoiceTotal(lines: Array<Pick<InvoiceLine, "quantity" | "unitPrice">>): number {
  return lines.reduce((total, line) => total + invoiceLineTotal(line), 0);
}

export function buildConsultationLine(type: ConsultationType, fee: number): InvoiceLine | null {
  if (type === "none") return null;
  return { description: CONSULTATION_LABELS[type], quantity: 1, unitPrice: Math.max(0, Math.trunc(fee)) };
}

export function describeLabTest(code: string, nameAr: string): string {
  return `${code} · ${nameAr}`;
}

export type InvoiceEditPlan = {
  kept: string[];
  added: string[];
  removed: string[];
  consultationChanged: boolean;
};

/**
 * Compares the tests currently stored on an invoice with the requested set.
 * Only differences are applied, so editing an invoice never drops the lines
 * that were already paid for (the regression this module guards against).
 */
export function planInvoiceEdit(
  currentCodes: readonly string[],
  requestedCodes: readonly string[],
  currentConsultation: ConsultationType,
  requestedConsultation: ConsultationType,
): InvoiceEditPlan {
  const current = new Set(currentCodes);
  const requested = new Set(requestedCodes);
  return {
    kept: [...requested].filter(code => current.has(code)),
    added: [...requested].filter(code => !current.has(code)),
    removed: [...current].filter(code => !requested.has(code)),
    consultationChanged: currentConsultation !== requestedConsultation,
  };
}

export type ConsultationPrices = { general: number; specialist: number };

export const DEFAULT_CONSULTATION_PRICES: ConsultationPrices = {
  general: 35000,
  specialist: 50000,
};

export function consultationFeeFor(type: ConsultationType, prices: ConsultationPrices): number {
  if (type === "general") return prices.general;
  if (type === "specialist") return prices.specialist;
  return 0;
}

export function resolveConsultationPrices(settings?: {
  consultationGeneralPrice?: number | null;
  consultationSpecialistPrice?: number | null;
} | null): ConsultationPrices {
  const general = Number(settings?.consultationGeneralPrice);
  const specialist = Number(settings?.consultationSpecialistPrice);
  return {
    general: Number.isFinite(general) && general >= 0 ? Math.trunc(general) : DEFAULT_CONSULTATION_PRICES.general,
    specialist: Number.isFinite(specialist) && specialist >= 0 ? Math.trunc(specialist) : DEFAULT_CONSULTATION_PRICES.specialist,
  };
}

/** Formats a price for reports and invoices without relying on locale data. */
export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? Math.trunc(value) : 0;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(safe);
}
