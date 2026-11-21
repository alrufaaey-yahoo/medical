export type ClinicShift = "صباحية" | "مسائية" | "سهرة";

export type NumberedPatient = {
  id: string;
  invoice: string;
};

export type PatientIdentity = {
  id: string;
  invoice: string;
};

const arabicDateFormatter = new Intl.DateTimeFormat("ar-SD", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const arabicTimeFormatter = new Intl.DateTimeFormat("ar-SD", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function getCurrentClinicShift(date = new Date()): ClinicShift {
  const hour = date.getHours();
  if (hour >= 8 && hour < 14) return "صباحية";
  if (hour >= 14 && hour < 22) return "مسائية";
  return "سهرة";
}

export function formatClinicDate(date = new Date()): string {
  return arabicDateFormatter.format(date);
}

export function formatClinicDateFromKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return formatClinicDate(new Date(year, month - 1, day, 12));
}

export function getClinicDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatClinicTime(date = new Date()): string {
  return arabicTimeFormatter.format(date);
}

function largestTrailingNumber(values: string[], prefix: RegExp): number {
  return values.reduce((largest, value) => {
    const match = value.match(prefix);
    const number = match?.[1] ? Number(match[1]) : 0;
    return Number.isSafeInteger(number) ? Math.max(largest, number) : largest;
  }, 0);
}

export function getNextPatientIdentity(patients: NumberedPatient[]): PatientIdentity {
  const patientNumber = largestTrailingNumber(
    patients.map((patient) => patient.id),
    /^P-(\d+)$/i,
  ) + 1;
  const invoiceNumber = largestTrailingNumber(
    patients.map((patient) => patient.invoice),
    /^INV-(\d+)$/i,
  ) + 1;

  return {
    id: `P-${String(patientNumber).padStart(4, "0")}`,
    invoice: `INV-${String(invoiceNumber).padStart(6, "0")}`,
  };
}
