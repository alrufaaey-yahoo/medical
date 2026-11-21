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
  consultationType?: "none" | "general" | "specialist";
  consultationFee?: number;
  paid: boolean;
  status: "في الانتظار" | "في المختبر" | "مكتملة";
};

export type ReportRange = "today" | "week" | "month";

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
  timeZone: CLINIC_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const arabicTimeFormatter = new Intl.DateTimeFormat("ar-SD", {
  timeZone: CLINIC_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function clinicHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));
}
export function getCurrentClinicShift(date = new Date()): ClinicShift {
  const hour = clinicHour(date);
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
  // The clinic runs on Khartoum time, so the working day must not depend on the
  // server or browser timezone (a 00:30 Khartoum invoice belongs to the new day).
  return getClinicReportDateKey(date);
}
export function getClinicShiftDateKey(date = new Date()): string {
  // A night shift that starts at 22:00 keeps the date of its start even after
  // midnight, so 00:30 belongs to yesterday's night shift.
  const key = getClinicReportDateKey(date);
  if (clinicHour(date) >= 8) return key;
  const [year, month, day] = key.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day));
  previous.setUTCDate(previous.getUTCDate() - 1);
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-${String(previous.getUTCDate()).padStart(2, "0")}`;
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
  const [year, month, day] = currentDate.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekStart = new Date(Date.UTC(year, month - 1, day - dayOfWeek)).toISOString().slice(0, 10);
  return records.filter((record) => {
    if (!record.registeredDate) return true;
    if (range === "today") return record.registeredDate === currentDate;
    if (range === "week") return record.registeredDate >= weekStart && record.registeredDate <= currentDate;
    return record.registeredDate.startsWith(currentMonth);
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
    consultationType: "none",
    consultationFee: 0,
    paid: false,
    status: "في الانتظار",
  };
}
