import { CONSULTATION_LABELS, consultationFeeFor, type ConsultationPrices, type ConsultationType } from "@shared/billing";
import type { LabTest } from "./catalog";
import type { InvoiceLineView, Patient } from "./clinic-types";

export const formatCurrency = (value: number) => `${Math.round(value).toLocaleString("ar-EG")} ج.س`;
export const initials = (name: string) => name.split(" ").slice(0, 2).map(part => part[0]).join("");

export const getInvoiceTests = (patient: Patient) => patient.invoiceTests ?? patient.tests;

export function getConsultationType(patient: Patient): ConsultationType {
  if (patient.consultationType) return patient.consultationType;
  if (patient.consultationIncluded === false) return "none";
  return "general";
}

export function getConsultationFee(patient: Patient, prices: ConsultationPrices): number {
  if (patient.consultationFee != null) return patient.consultationFee;
  return consultationFeeFor(getConsultationType(patient), prices);
}

export function getInvoiceTotal(patient: Patient, catalog: LabTest[], prices: ConsultationPrices): number {
  if (patient.invoiceTotal != null) return patient.invoiceTotal;
  const testsTotal = getInvoiceTests(patient).reduce((sum, code) => sum + (catalog.find(test => test.code === code)?.price ?? 0), 0);
  return testsTotal + getConsultationFee(patient, prices);
}

export function getInvoiceLines(patient: Patient, catalog: LabTest[], prices: ConsultationPrices): InvoiceLineView[] {
  if (patient.invoiceLines?.length) return patient.invoiceLines;
  const lines: InvoiceLineView[] = [];
  const type = getConsultationType(patient);
  if (type !== "none") lines.push({ description: CONSULTATION_LABELS[type], unitPrice: getConsultationFee(patient, prices) });
  for (const code of getInvoiceTests(patient)) {
    const test = catalog.find(item => item.code === code);
    lines.push({ description: `${code} · ${test?.name ?? "فحص مخبري"}`, unitPrice: test?.price ?? 0, code });
  }
  return lines;
}

export function formatSampleNumber(patient: Patient, test: LabTest): string {
  const sequence = patient.sequence ?? (Number(patient.id.replace(/\D/g, "").slice(-4)) || 0);
  return `S-${String(sequence).padStart(4, "0")}-${test.code}`;
}

export function consultationChip(patient: Patient): string | null {
  const type = getConsultationType(patient);
  if (type === "none") return null;
  return type === "specialist" ? "معاينة اختصاصي" : "معاينة عمومي";
}
