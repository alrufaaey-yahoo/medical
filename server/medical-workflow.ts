export type MedicalShiftType = "morning" | "evening" | "night";

const shiftCode: Record<MedicalShiftType, string> = {
  morning: "M",
  evening: "E",
  night: "N",
};

export function toPatientNumber(date: string, shift: MedicalShiftType, sequence: number): string {
  const compactDate = date.replaceAll("-", "");
  return `P-${compactDate}-${shiftCode[shift]}-${String(sequence).padStart(4, "0")}`;
}

export function toInvoiceNumber(patientNumber: string, sequence = 1): string {
  return `INV-${patientNumber.replace(/^P-/, "")}-${String(sequence).padStart(2, "0")}`;
}

export function uniqueTestCodes(codes: string[]): string[] {
  return [...new Set(codes)];
}

export function sumInvoiceItems(items: Array<{ quantity: number; unitPrice: number }>): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}
