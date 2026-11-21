import type { ConsultationType, ShiftType } from "@shared/billing";

export type Section = "overview" | "patients" | "billing" | "lab" | "tests" | "reports" | "users" | "settings";
export type Role = "supervisor" | "cashier" | "lab" | "admin";
export type Shift = "صباحية" | "مسائية" | "سهرة";
export type PrintMode = "invoice" | "result" | "report" | "patient-report" | null;
export type ReportRange = "today" | "week" | "month";
export type QueueStatus = "all" | "paid" | "pending";
export type PatientFilter = "all" | "pending" | "lab" | "completed";
export type OrderStatus = "queued" | "in_progress" | "completed" | "blocked";

export type InvoiceLineView = { description: string; unitPrice: number; code?: string };

export type FieldValue = Record<string, string>;

export type Patient = {
  id: string;
  databaseId?: number;
  databaseInvoiceId?: number;
  invoiceStatus?: "pending" | "paid" | "cancelled" | "refunded";
  invoiceTotal?: number;
  paymentMethod?: string | null;
  paymentBank?: string | null;
  transactionNumber?: string | null;
  invoiceLines?: InvoiceLineView[];
  consultationType?: ConsultationType;
  consultationFee?: number;
  orderIds?: Record<string, number>;
  orderStates?: Record<string, OrderStatus>;
  name: string;
  gender: "ذكر" | "أنثى";
  age?: number;
  phone: string;
  address: string;
  tests: string[];
  invoice: string;
  paid: boolean;
  status: "في الانتظار" | "في المختبر" | "مكتملة";
  registeredAt: string;
  registeredDate?: string;
  shift?: Shift;
  sequence?: number;
  invoiceTests?: string[];
  consultationIncluded?: boolean;
};

export type NewPatientInput = Pick<Patient, "name" | "gender" | "age" | "phone" | "address" | "tests"> & {
  consultationType: ConsultationType;
};

export const EMPTY_PATIENT: Patient = {
  id: "",
  name: "لا يوجد مرضى بعد",
  gender: "ذكر",
  phone: "—",
  address: "—",
  tests: [],
  invoice: "—",
  paid: false,
  status: "في الانتظار",
  registeredAt: "—",
};

export const serverShiftByLabel: Record<Shift, ShiftType> = {
  صباحية: "morning",
  مسائية: "evening",
  سهرة: "night",
};

export const shiftByServerType: Record<ShiftType, Shift> = {
  morning: "صباحية",
  evening: "مسائية",
  night: "سهرة",
};

export const roleLabels: Record<Role, string> = {
  supervisor: "مشرف التشغيل",
  cashier: "كاشير / استقبال",
  lab: "فني المختبر",
  admin: "مدير النظام",
};

export const roleDescriptions: Record<Role, string> = {
  supervisor: "التقارير اليومية والأسبوعية والشهرية، التسعير، وإضافة الكاشير وفني المختبر",
  cashier: "تسجيل المرضى، الفواتير، التحصيل، وتقرير ورديته",
  lab: "سحب العينات وإدخال النتائج وطباعة تقارير المختبر",
  admin: "الإدارة الكاملة: الفحوصات، المستخدمون، الإعدادات، والمختبر",
};

export const rolePermissions: Record<Role, string[]> = {
  supervisor: [
    "إصدار التقارير اليومية والأسبوعية والشهرية",
    "إضافة حسابات الكاشير وفني المختبر",
    "تعديل أسعار الفحوصات وسعر المعاينة",
    "لا يصل إلى المختبر أو ملفات المرضى",
  ],
  cashier: [
    "تسجيل مريض جديد مع اختيار نوع المعاينة",
    "تعديل الفاتورة أو إلغاؤها",
    "إصدار فاتورة لمريض موجود",
    "تقرير ورديته اليومي",
  ],
  lab: ["قائمة العينات وسحب العينة", "إدخال النتائج وتحديد القيم غير الطبيعية", "طباعة تقارير المختبر"],
  admin: ["إدارة كتالوج الفحوصات", "إدارة المستخدمين والصلاحيات", "إعدادات المستوصف", "الوصول الكامل للمختبر والمرضى"],
};

/** Mirrors ROLE_SECTIONS in server/_core/role-access.ts. */
export const roleSections: Record<Role, Section[]> = {
  supervisor: ["reports", "tests", "users"],
  cashier: ["overview", "patients", "billing", "reports"],
  lab: ["overview", "lab", "tests"],
  admin: ["overview", "patients", "billing", "lab", "tests", "reports", "users", "settings"],
};

export const sectionLabels: Record<Section, string> = {
  overview: "النظرة العامة",
  patients: "المرضى",
  billing: "الفواتير",
  lab: "المختبر",
  tests: "الفحوصات والتسعير",
  reports: "التقارير",
  users: "فريق التشغيل",
  settings: "الإعدادات",
};
