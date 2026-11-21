export type ClinicShift = "صباحية" | "مسائية" | "سهرة";

export type NumberedPatient = {
  id: string;
  invoice: string;
};

export type PatientIdentity = {
  id: string;
  invoice: string;
};

export type FollowUpPatient = {
  tests: string[];
  invoice: string;
  invoiceTests?: string[];
  consultationIncluded?: boolean;
  paid: boolean;
  status: "في الانتظار" | "في المختبر" | "مكتملة";
};

export type ReportRange = "today" | "month";

export type DatedClinicRecord = {
  registeredDate?: string;
};

export const CLINIC_TIME_ZONE = "Africa/Khartoum";

export function isHttpsLogoUrl(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return true;

  try {
    return new URL(normalized).protocol === "https:";
  } catch {
    return false;
  }
}

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

export function getClinicReportDateKey(date = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatClinicTime(date = new Date()): string {
  return arabicTimeFormatter.format(date);
}

export function filterRecordsByReportRange<T extends DatedClinicRecord>(records: T[], range: ReportRange, currentDate = getClinicDateKey()): T[] {
  const currentMonth = currentDate.slice(0, 7);
  return records.filter((record) => {
    if (!record.registeredDate) return true;
    return range === "today" ? record.registeredDate === currentDate : record.registeredDate.startsWith(currentMonth);
  });
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

export function createFollowUpInvoice<T extends FollowUpPatient>(
  patient: T,
  requestedTests: string[],
  invoice: string,
): T | null {
  const newTests = [...new Set(requestedTests)].filter((code) => !patient.tests.includes(code));
  if (newTests.length === 0) return null;

  return {
    ...patient,
    tests: [...patient.tests, ...newTests],
    invoice,
    invoiceTests: newTests,
    consultationIncluded: false,
    paid: false,
    status: "في الانتظار",
  };
}
