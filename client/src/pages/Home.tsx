import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Beaker,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock3,
  CreditCard,
  Download,
  FileBarChart,
  FileCheck2,
  FileText,
  FlaskConical,
  Grid2X2,
  HeartPulse,
  LayoutDashboard,
  LogIn,
  Menu,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  createFollowUpInvoice,
  formatClinicDate,
  formatClinicDateFromKey,
  formatClinicTime,
  getClinicDateKey,
  getCurrentClinicShift,
  getNextPatientIdentity,
} from "@/lib/clinic-workflow";

type Section = "overview" | "patients" | "billing" | "lab" | "tests" | "reports" | "settings";
type Role = "supervisor" | "cashier" | "lab" | "admin";
type Shift = "صباحية" | "مسائية" | "سهرة";
type PrintMode = "invoice" | "result" | "report" | "patient-report" | null;
type ReportRange = "today" | "month";
type QueueStatus = "all" | "paid" | "pending";
type PatientFilter = "all" | "pending" | "lab" | "completed";

type Patient = {
  id: string;
  databaseId?: number;
  databaseInvoiceId?: number;
  invoiceTotal?: number;
  invoiceLines?: Array<{ description: string; unitPrice: number; code?: string }>;
  orderIds?: Record<string, number>;
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

type NewPatientInput = Pick<Patient, "name" | "gender" | "age" | "phone" | "address" | "tests">;

const EMPTY_PATIENT: Patient = {
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

const serverShiftByLabel: Record<Shift, "morning" | "evening" | "night"> = {
  صباحية: "morning",
  مسائية: "evening",
  سهرة: "night",
};

type TestField = {
  key: string;
  label: string;
  unit?: string;
  male: string;
  female: string;
  type?: "number" | "text" | "select";
};

type LabTest = {
  code: string;
  name: string;
  english: string;
  category: string;
  sample: string;
  price: number;
  turnaround: string;
  fields: TestField[];
};

type FieldValue = Record<string, string>;

type NavItem = {
  id: Section;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

const navItems: NavItem[] = [
  { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
  { id: "patients", label: "المرضى", icon: Users, badge: "28" },
  { id: "billing", label: "الفواتير", icon: ReceiptText },
  { id: "lab", label: "المختبر", icon: FlaskConical, badge: "7" },
  { id: "tests", label: "كتالوج الفحوصات", icon: TestTube2 },
  { id: "reports", label: "التقارير", icon: FileBarChart },
  { id: "settings", label: "الإعدادات", icon: Settings2 },
];

const roleLabels: Record<Role, string> = {
  supervisor: "مشرف التشغيل",
  cashier: "كاشير / استقبال",
  lab: "فني المختبر",
  admin: "مدير النظام",
};

const roleDescriptions: Record<Role, string> = {
  supervisor: "متابعة اليوم والتقارير والتسعير",
  cashier: "تسجيل المرضى والفواتير والتحصيل",
  lab: "إدخال النتائج وطباعة التقارير",
  admin: "المستخدمون والإعدادات والصلاحيات",
};
const rolePermissions: Record<Role, string[]> = {
  supervisor: ["مشاهدة لوحة التشغيل", "عرض التقارير اليومية والشهرية", "مراجعة التسعير"],
  cashier: ["تسجيل المرضى", "إصدار الفواتير والتحصيل", "طباعة التذاكر"],
  lab: ["مشاهدة طلبات المختبر", "إدخال النتائج", "طباعة تقارير المختبر"],
  admin: ["إدارة المستخدمين", "إدارة إعدادات المستوصف", "إدارة الصلاحيات والتسعير"],
};
const roleSections: Record<Role, Section[]> = {
  supervisor: ["overview", "patients", "billing", "lab", "reports"],
  cashier: ["overview", "patients", "billing"],
  lab: ["overview", "lab", "tests"],
  admin: ["overview", "patients", "billing", "lab", "tests", "reports", "settings"],
};
const sectionLabels: Record<Section, string> = {
  overview: "النظرة العامة",
  patients: "المرضى",
  billing: "الفواتير",
  lab: "المختبر",
  tests: "كتالوج الفحوصات",
  reports: "التقارير",
  settings: "الإعدادات",
};

const initialPatients: Patient[] = [
  {
    id: "P-1042",
    name: "محمد أحمد",
    gender: "ذكر",
    age: 34,
    phone: "0912 440 218",
    address: "الخرطوم بحري - الحلفايا",
    tests: ["CBC", "BFFM"],
    invoice: "INV-260021",
    paid: true,
    status: "في المختبر",
    registeredAt: "09:42 ص",
  },
  {
    id: "P-1041",
    name: "سارة عبد الله",
    gender: "أنثى",
    age: 28,
    phone: "0901 332 760",
    address: "أم درمان - الثورة",
    tests: ["LFT", "RFT"],
    invoice: "INV-260020",
    paid: true,
    status: "مكتملة",
    registeredAt: "09:17 ص",
  },
  {
    id: "P-1040",
    name: "خالد حسن",
    gender: "ذكر",
    age: 51,
    phone: "0112 667 901",
    address: "الخرطوم - الرياض",
    tests: ["GLU", "HbA1c", "LIPID"],
    invoice: "INV-260019",
    paid: false,
    status: "في الانتظار",
    registeredAt: "08:56 ص",
  },
  {
    id: "P-1039",
    name: "مريم الطيب",
    gender: "أنثى",
    age: 42,
    phone: "0122 885 440",
    address: "بحري - شمبات",
    tests: ["UA", "CRP"],
    invoice: "INV-260018",
    paid: true,
    status: "في المختبر",
    registeredAt: "08:31 ص",
  },
  {
    id: "P-1038",
    name: "عبد الرحمن علي",
    gender: "ذكر",
    age: 19,
    phone: "0998 201 663",
    address: "أم درمان - الموردة",
    tests: ["BFFM"],
    invoice: "INV-260017",
    paid: true,
    status: "مكتملة",
    registeredAt: "08:04 ص",
  },
];

const cbcFields: TestField[] = [
  { key: "wbc", label: "WBC", unit: "×10³/µL", male: "4.0 – 10.0", female: "4.0 – 10.0", type: "number" },
  { key: "neut", label: "Neutrophils (NEUT %)", unit: "%", male: "40 – 75", female: "40 – 75", type: "number" },
  { key: "lym", label: "Lymphocytes (LYM %)", unit: "%", male: "20 – 45", female: "20 – 45", type: "number" },
  { key: "mono", label: "Monocytes (MONO %)", unit: "%", male: "2 – 10", female: "2 – 10", type: "number" },
  { key: "eos", label: "Eosinophils (EOS %)", unit: "%", male: "1 – 6", female: "1 – 6", type: "number" },
  { key: "baso", label: "Basophils (BASO %)", unit: "%", male: "0 – 2", female: "0 – 2", type: "number" },
  { key: "rbc", label: "RBC", unit: "×10⁶/µL", male: "4.5 – 5.9", female: "4.1 – 5.1", type: "number" },
  { key: "hb", label: "Hemoglobin (Hb)", unit: "g/dL", male: "13.5 – 17.5", female: "12.0 – 15.5", type: "number" },
  { key: "hct", label: "Hematocrit (HCT)", unit: "%", male: "41 – 53", female: "36 – 46", type: "number" },
  { key: "mcv", label: "MCV", unit: "fL", male: "80 – 100", female: "80 – 100", type: "number" },
  { key: "mch", label: "MCH", unit: "pg", male: "27 – 33", female: "27 – 33", type: "number" },
  { key: "mchc", label: "MCHC", unit: "g/dL", male: "32 – 36", female: "32 – 36", type: "number" },
  { key: "rdw", label: "RDW", unit: "%", male: "11.5 – 14.5", female: "11.5 – 14.5", type: "number" },
  { key: "plt", label: "Platelets (PLT)", unit: "×10³/µL", male: "150 – 450", female: "150 – 450", type: "number" },
  { key: "mpv", label: "MPV", unit: "fL", male: "7.5 – 11.5", female: "7.5 – 11.5", type: "number" },
];

const labTests: LabTest[] = [
  {
    code: "CBC",
    name: "صورة الدم الكاملة",
    english: "Complete Blood Count",
    category: "أمراض الدم",
    sample: "دم كامل EDTA",
    price: 18000,
    turnaround: "30 دقيقة",
    fields: cbcFields,
  },
  {
    code: "BFFM",
    name: "صورة الدم للملاريا",
    english: "Blood Film For Malaria",
    category: "أمراض الدم",
    sample: "دم",
    price: 12000,
    turnaround: "20 دقيقة",
    fields: [
      { key: "result", label: "النتيجة", male: "سالب / موجب", female: "سالب / موجب", type: "select" },
      { key: "parasite", label: "نوع الطفيل", male: "—", female: "—", type: "text" },
      { key: "density", label: "كثافة الطفيليات", male: "—", female: "—", type: "text" },
      { key: "remarks", label: "ملاحظات", male: "—", female: "—", type: "text" },
      { key: "technician", label: "فني المختبر", male: "—", female: "—", type: "text" },
    ],
  },
  {
    code: "UA",
    name: "تحليل البول الكامل",
    english: "Complete Urinalysis",
    category: "التحاليل العامة",
    sample: "بول عشوائي",
    price: 10000,
    turnaround: "20 دقيقة",
    fields: [
      { key: "color", label: "اللون والمظهر", male: "أصفر فاتح", female: "أصفر فاتح", type: "text" },
      { key: "ph", label: "pH", male: "4.5 – 8.0", female: "4.5 – 8.0", type: "text" },
      { key: "protein", label: "Protein", male: "Negative", female: "Negative", type: "text" },
      { key: "glucose", label: "Glucose", male: "Negative", female: "Negative", type: "text" },
      { key: "rbc", label: "RBC / HPF", male: "0 – 2", female: "0 – 2", type: "text" },
    ],
  },
  {
    code: "GLU",
    name: "سكر الدم العشوائي",
    english: "Random Blood Glucose",
    category: "الكيمياء السريرية",
    sample: "مصل / بلازما",
    price: 8000,
    turnaround: "15 دقيقة",
    fields: [{ key: "glucose", label: "Glucose", unit: "mg/dL", male: "70 – 140", female: "70 – 140", type: "number" }],
  },
  {
    code: "HbA1c",
    name: "السكر التراكمي",
    english: "Glycated Hemoglobin",
    category: "الكيمياء السريرية",
    sample: "دم كامل EDTA",
    price: 24000,
    turnaround: "45 دقيقة",
    fields: [{ key: "hba1c", label: "HbA1c", unit: "%", male: "4.0 – 5.6", female: "4.0 – 5.6", type: "number" }],
  },
  {
    code: "LFT",
    name: "وظائف الكبد",
    english: "Liver Function Tests",
    category: "الكيمياء السريرية",
    sample: "مصل",
    price: 30000,
    turnaround: "60 دقيقة",
    fields: [
      { key: "alt", label: "ALT", unit: "U/L", male: "7 – 56", female: "7 – 45", type: "number" },
      { key: "ast", label: "AST", unit: "U/L", male: "10 – 40", female: "9 – 32", type: "number" },
      { key: "bilirubin", label: "Total Bilirubin", unit: "mg/dL", male: "0.2 – 1.2", female: "0.2 – 1.2", type: "number" },
    ],
  },
  {
    code: "RFT",
    name: "وظائف الكلى",
    english: "Renal Function Tests",
    category: "الكيمياء السريرية",
    sample: "مصل",
    price: 28000,
    turnaround: "60 دقيقة",
    fields: [
      { key: "urea", label: "Urea", unit: "mg/dL", male: "15 – 45", female: "15 – 45", type: "number" },
      { key: "creatinine", label: "Creatinine", unit: "mg/dL", male: "0.7 – 1.3", female: "0.6 – 1.1", type: "number" },
    ],
  },
  {
    code: "LIPID",
    name: "الدهون الثلاثية والكوليسترول",
    english: "Lipid Profile",
    category: "الكيمياء السريرية",
    sample: "مصل صائم",
    price: 32000,
    turnaround: "60 دقيقة",
    fields: [
      { key: "cholesterol", label: "Total Cholesterol", unit: "mg/dL", male: "< 200", female: "< 200", type: "number" },
      { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", male: "< 150", female: "< 150", type: "number" },
      { key: "hdl", label: "HDL", unit: "mg/dL", male: "> 40", female: "> 50", type: "number" },
      { key: "ldl", label: "LDL", unit: "mg/dL", male: "< 100", female: "< 100", type: "number" },
    ],
  },
  {
    code: "TSH",
    name: "الهرمون المحفز للغدة الدرقية",
    english: "Thyroid Stimulating Hormone",
    category: "الهرمونات",
    sample: "مصل",
    price: 26000,
    turnaround: "90 دقيقة",
    fields: [{ key: "tsh", label: "TSH", unit: "mIU/L", male: "0.4 – 4.0", female: "0.4 – 4.0", type: "number" }],
  },
  {
    code: "CRP",
    name: "البروتين المتفاعل C",
    english: "C-Reactive Protein",
    category: "المناعة والالتهاب",
    sample: "مصل",
    price: 16000,
    turnaround: "30 دقيقة",
    fields: [{ key: "crp", label: "CRP", unit: "mg/L", male: "< 5", female: "< 5", type: "number" }],
  },
  {
    code: "HBsAg",
    name: "مستضد التهاب الكبد B",
    english: "Hepatitis B Surface Antigen",
    category: "المناعة والفيروسات",
    sample: "مصل",
    price: 12000,
    turnaround: "30 دقيقة",
    fields: [{ key: "result", label: "النتيجة", male: "Negative / Positive", female: "Negative / Positive", type: "select" }],
  },
];

const initialResults: Record<string, FieldValue> = {
  "P-1042-CBC": {
    wbc: "6.8",
    neut: "58",
    lym: "31",
    mono: "6",
    eos: "3",
    baso: "1",
    rbc: "5.0",
    hb: "14.8",
    hct: "44",
    mcv: "88",
    mch: "29.6",
    mchc: "33.6",
    rdw: "12.8",
    plt: "276",
    mpv: "9.1",
  },
  "P-1042-BFFM": { result: "سالب", parasite: "—", density: "—", remarks: "لا توجد طفيليات ملاريا مرئية في العينة." },
};

const formatCurrency = (value: number) => `${value.toLocaleString("ar-EG")} ج.س`;
const initials = (name: string) => name.split(" ").slice(0, 2).map((part) => part[0]).join("");
const formatSampleNumber = (patient: Patient, test: LabTest) => {
  const sequence = patient.sequence ?? (Number(patient.id.replace(/\D/g, "").slice(-4)) || 0);
  return `S-${String(sequence).padStart(4, "0")}-${test.code}`;
};
const getInvoiceTests = (patient: Patient) => patient.invoiceTests ?? patient.tests;
const getInvoiceTotal = (patient: Patient) =>
  patient.invoiceTotal ?? (getInvoiceTests(patient).reduce((sum, code) => sum + (labTests.find((test) => test.code === code)?.price ?? 0), 0)
  + ((patient.consultationIncluded ?? true) ? 35000 : 0));

function StatusPill({ status }: { status: Patient["status"] }) {
  const classes = status === "مكتملة" ? "success" : status === "في المختبر" ? "info" : "warning";
  return <span className={`status-pill ${classes}`}><span className="status-dot" />{status}</span>;
}

function SectionTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`app-logo ${compact ? "compact" : ""}`}>
      <div className="logo-mark"><HeartPulse size={20} strokeWidth={2.4} /></div>
      {!compact && <div><strong>بكّا الطبي</strong><span>نظام التشغيل الطبي</span></div>}
    </div>
  );
}

function Overview({ patients, shift, shiftSequence, onNavigate, onAddPatient, onPrintReport }: { patients: Patient[]; shift: Shift; shiftSequence: number; onNavigate: (section: Section) => void; onAddPatient: () => void; onPrintReport: () => void }) {
  const pendingCount = patients.filter((patient) => patient.status === "في المختبر").length;
  const unpaidCount = patients.filter((patient) => !patient.paid).length;
  const totalTests = patients.reduce((sum, patient) => sum + patient.tests.length, 0);
  const completedCount = patients.filter((patient) => patient.status === "مكتملة").length;
  const paidRevenue = patients.filter((patient) => patient.paid).reduce((sum, patient) => sum + getInvoiceTotal(patient), 0);
  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow={`تشغيل اليوم · الوردية ${shift}`}
        title={`أهلاً بك في الوردية ${shift}`}
        description="هنا ملخص حركة المستوصف، المدفوعات، وحالة المختبر في لمحة واحدة."
        action={<div className="heading-actions"><button className="button button-secondary" onClick={onPrintReport}><Download size={16} />تقرير اليوم</button><button className="button button-primary" onClick={onAddPatient}><UserPlus size={16} />تسجيل مريض</button></div>}
      />

      <div className="metric-grid">
        <div className="metric-card accent-teal"><div className="metric-icon"><Users size={19} /></div><span>مراجعو اليوم</span><strong>{patients.length}</strong><small>من سجلات مساحة العمل</small></div>
        <div className="metric-card accent-blue"><div className="metric-icon"><CreditCard size={19} /></div><span>إيرادات اليوم</span><strong>{formatCurrency(paidRevenue)}</strong><small>الفواتير المحصلة المعروضة</small></div>
        <div className="metric-card accent-amber"><div className="metric-icon"><FlaskConical size={19} /></div><span>طلبات المختبر</span><strong>{totalTests}</strong><small><span className="warning-text">{pendingCount} قيد التنفيذ</span> الآن</small></div>
        <div className="metric-card accent-rose"><div className="metric-icon"><Clock3 size={19} /></div><span>بانتظار التحصيل</span><strong>{unpaidCount}</strong><small><span className="danger-text">يحتاج متابعة</span> قبل نهاية الوردية</small></div>
      </div>

      <div className="overview-grid">
        <section className="panel large-panel">
          <div className="panel-header"><div><span className="eyebrow">الحركة المباشرة</span><h2>مسار المرضى اليوم</h2></div><button className="link-button" onClick={() => onNavigate("patients")}>عرض الكل <ArrowLeft size={15} /></button></div>
          <div className="flow-strip">
            <div className="flow-node done"><div className="flow-icon"><UserPlus size={17} /></div><div><strong>التسجيل</strong><span>{patients.length} مريض</span></div></div>
            <div className="flow-line active" />
            <div className="flow-node current"><div className="flow-icon"><Stethoscope size={17} /></div><div><strong>الاستقبال</strong><span>{unpaidCount} بانتظار الدفع</span></div></div>
            <div className="flow-line active" />
            <div className="flow-node current"><div className="flow-icon"><Beaker size={17} /></div><div><strong>المختبر</strong><span>{pendingCount} عينات</span></div></div>
            <div className="flow-line" />
            <div className="flow-node"><div className="flow-icon"><FileCheck2 size={17} /></div><div><strong>النتائج</strong><span>{completedCount} مكتملة</span></div></div>
          </div>
          <div className="table-wrap compact-table"><table><thead><tr><th>المريض</th><th>الطلب</th><th>الوردية</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>{patients.slice(0, 4).map((patient) => <tr key={patient.id}><td><div className="person-cell"><div className="avatar">{initials(patient.name)}</div><div><strong>{patient.name}</strong><span>{patient.id} · {patient.gender}</span></div></div></td><td><strong>{patient.tests.join("، ")}</strong><span className="muted-line">{patient.tests.length} فحوصات</span></td><td><span className="shift-label">{patient.shift ?? shift}</span></td><td><StatusPill status={patient.status} /></td><td className="muted-cell">{patient.registeredAt}</td></tr>)}</tbody></table></div>
        </section>

        <section className="panel shift-panel">
          <div className="panel-header"><div><span className="eyebrow">تتبع الوردية</span><h2>الوردية {shift}</h2></div><span className="live-dot">مباشر</span></div>
          <div className="shift-summary"><div><span>رقم البداية</span><strong>0001</strong></div><div><span>المريض الحالي</span><strong>{String(shiftSequence).padStart(4, "0")}</strong></div><div><span>سجلات ظاهرة</span><strong>{patients.length}</strong></div></div>
          <div className="timeline"><div className="timeline-row"><span className="timeline-dot completed" /><div><strong>تسجيل المرضى</strong><span>{patients.length} سجلًا في مساحة العمل</span></div><b>محدّث</b></div><div className="timeline-row"><span className="timeline-dot completed" /><div><strong>التحصيل</strong><span>{patients.filter((patient) => patient.paid).length} فاتورة محصلة</span></div><b>محدّث</b></div><div className="timeline-row"><span className="timeline-dot active" /><div><strong>طلبات المختبر</strong><span>{pendingCount} مريضًا قيد العمل</span></div><b>الآن</b></div><div className="timeline-row"><span className="timeline-dot" /><div><strong>إغلاق الوردية</strong><span>يُدار حسب إجراءات المستوصف</span></div><b>—</b></div></div>
          <button className="button button-soft full-width" onClick={() => onNavigate("reports")}><FileBarChart size={16} />عرض ملخص الوردية</button>
        </section>
      </div>

      <div className="bottom-grid">
        <section className="panel alert-panel"><div className="panel-header"><div><span className="eyebrow">يحتاج انتباه</span><h2>تنبيهات التشغيل</h2></div><Bell size={19} className="muted-icon" /></div><div className="alert-item"><div className="alert-icon amber"><AlertCircle size={16} /></div><div><strong>{unpaidCount} فواتير غير مكتملة</strong><span>مرضى بانتظار التحصيل قبل تحويلهم للمختبر.</span></div><button className="icon-button" onClick={() => onNavigate("billing")}><ArrowLeft size={15} /></button></div><div className="alert-item"><div className="alert-icon blue"><TestTube2 size={16} /></div><div><strong>{pendingCount} طلبات مختبر جديدة</strong><span>تُحدّث القائمة من الطلبات المرتبطة بالمرضى.</span></div><button className="icon-button" onClick={() => onNavigate("lab")}><ArrowLeft size={15} /></button></div></section>
        <section className="panel quick-panel"><div className="panel-header"><div><span className="eyebrow">اختصارات</span><h2>إجراءات سريعة</h2></div><MoreHorizontal size={19} className="muted-icon" /></div><div className="quick-actions"><button onClick={onAddPatient}><span className="quick-icon teal"><UserPlus size={17} /></span><span><strong>مريض جديد</strong><small>فتح سجل وفاتورة</small></span><ArrowLeft size={15} /></button><button onClick={() => onNavigate("lab")}><span className="quick-icon blue"><FlaskConical size={17} /></span><span><strong>نتيجة مختبر</strong><small>إدخال وطباعة</small></span><ArrowLeft size={15} /></button><button onClick={() => onNavigate("tests")}><span className="quick-icon amber"><PackageCheck size={17} /></span><span><strong>تعديل الأسعار</strong><small>كتالوج الفحوصات</small></span><ArrowLeft size={15} /></button></div></section>
      </div>
    </div>
  );
}

function Patients({ patients, search, setSearch, onAddPatient, onSelectPatient, onPrintInvoice }: { patients: Patient[]; search: string; setSearch: (value: string) => void; onAddPatient: () => void; onSelectPatient: (patient: Patient) => void; onPrintInvoice: (patient: Patient) => void }) {
  const [filter, setFilter] = useState<PatientFilter>("all");
  const filtered = patients.filter((patient) => {
    const matchesSearch = `${patient.name} ${patient.id} ${patient.phone}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "pending" ? patient.status === "في الانتظار" : filter === "lab" ? patient.status === "في المختبر" : patient.status === "مكتملة");
    return matchesSearch && matchesFilter;
  });
  const inLabCount = patients.filter((patient) => patient.status === "في المختبر").length;
  const pendingCount = patients.filter((patient) => patient.status === "في الانتظار").length;
  const completedCount = patients.filter((patient) => patient.status === "مكتملة").length;
  return <div className="page-stack"><SectionTitle eyebrow={`السجلات · ${filtered.length} من ${patients.length} سجل`} title="المرضى والمراجعين" description="ابحث في سجلات المرضى، وراجع مسارهم والفواتير المرتبطة بهم." action={<button className="button button-primary" onClick={onAddPatient}><UserPlus size={16} />تسجيل مريض جديد</button>} /><div className="toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو رقم الملف أو الهاتف" />{search && <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="مسح بحث المرضى"><X size={14} /></button>}</div><div className="toolbar-filters"><button className={`filter-button ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>كل المرضى <span>{patients.length}</span></button><button className={`filter-button ${filter === "pending" ? "active" : ""}`} onClick={() => setFilter("pending")}>بانتظار الإجراء <span>{pendingCount}</span></button><button className={`filter-button ${filter === "lab" ? "active" : ""}`} onClick={() => setFilter("lab")}>في المختبر <span>{inLabCount}</span></button><button className={`filter-button ${filter === "completed" ? "active" : ""}`} onClick={() => setFilter("completed")}>مكتملة <span>{completedCount}</span></button></div></div><section className="panel"><div className="table-wrap"><table><thead><tr><th>المريض</th><th>النوع / العمر</th><th>الفحوصات</th><th>الدفع</th><th>الحالة</th><th>التسجيل</th><th /></tr></thead><tbody>{filtered.map((patient) => <tr key={patient.id} className="clickable-row" onClick={() => onSelectPatient(patient)}><td><div className="person-cell"><div className={`avatar ${patient.gender === "أنثى" ? "female" : ""}`}>{initials(patient.name)}</div><div><strong>{patient.name}</strong><span>{patient.id}{patient.sequence != null ? ` · #${String(patient.sequence).padStart(4, "0")}` : ""} · {patient.phone}</span></div></div></td><td><strong>{patient.gender}</strong><span className="muted-line">{patient.age == null ? "العمر غير محدد" : `${patient.age} سنة`}</span></td><td><div className="test-tags">{patient.tests.map((test) => <span key={test}>{test}</span>)}</div><span className="muted-line">{patient.tests.length} فحوصات</span></td><td><span className={`payment-label ${patient.paid ? "paid" : "unpaid"}`}>{patient.paid ? "مدفوعة" : "غير مكتملة"}</span></td><td><StatusPill status={patient.status} /></td><td className="muted-cell">{patient.registeredAt}</td><td><button className="row-menu" onClick={(event) => { event.stopPropagation(); onPrintInvoice(patient); }}><Printer size={16} /></button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state"><Search size={22} /><strong>{patients.length ? "لا توجد نتائج مطابقة" : "لا توجد سجلات محفوظة"}</strong><span>{patients.length ? "جرّب اسمًا أو رقم ملف مختلفًا أو غيّر الفلتر." : "أنشئ سجل مريض لبدء العمل."}</span></div>}</div></section></div>;
}

function Billing({ patients, onAddPatient, onPrintInvoice, onMarkPaid, saving }: { patients: Patient[]; onAddPatient: () => void; onPrintInvoice: (patient: Patient) => void; onMarkPaid: (patient: Patient) => void; saving?: boolean }) {
  const [range, setRange] = useState<ReportRange>("today");
  const currentDate = getClinicDateKey();
  const visiblePatients = patients.filter((patient) => {
    if (!patient.registeredDate) return true;
    return range === "today" ? patient.registeredDate === currentDate : patient.registeredDate.startsWith(currentDate.slice(0, 7));
  });
  const total = visiblePatients.reduce((sum, patient) => sum + getInvoiceTotal(patient), 0);
  const paidTotal = visiblePatients.filter((patient) => patient.paid).reduce((sum, patient) => sum + getInvoiceTotal(patient), 0);
  const pendingTotal = total - paidTotal;
  const paidCount = visiblePatients.filter((patient) => patient.paid).length;
  const pendingCount = visiblePatients.length - paidCount;
  const average = visiblePatients.length ? Math.round(total / visiblePatients.length) : 0;
  return <div className="page-stack"><SectionTitle eyebrow="الاستقبال والتحصيل" title="الفواتير والتحصيل" description="كل زيارة لها فاتورتها؛ وتبقى فواتير الفحوصات اللاحقة مستقلة عن فاتورة المعاينة." action={<button className="button button-primary" onClick={onAddPatient}><Plus size={16} />فاتورة جديدة</button>} /><div className="billing-summary"><div><span>إجمالي الفواتير</span><strong>{formatCurrency(total)}</strong><small>{visiblePatients.length} فاتورة</small></div><div><span>تم التحصيل</span><strong className="teal-text">{formatCurrency(paidTotal)}</strong><small>{paidCount} فاتورة مكتملة</small></div><div><span>بانتظار التحصيل</span><strong className="amber-text">{formatCurrency(pendingTotal)}</strong><small>{pendingCount} فاتورة تحتاج متابعة</small></div><div><span>متوسط الفاتورة</span><strong>{formatCurrency(average)}</strong><small>للفواتير المعروضة</small></div></div><section className="panel"><div className="panel-header"><div><span className="eyebrow">آخر الفواتير · {range === "today" ? "اليوم" : "هذا الشهر"}</span><h2>حركة الاستقبال</h2></div><div className="table-actions"><button className={`filter-button ${range === "today" ? "active" : ""}`} onClick={() => setRange("today")}>اليوم</button><button className={`filter-button ${range === "month" ? "active" : ""}`} onClick={() => setRange("month")}>هذا الشهر</button></div></div><div className="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>المريض</th><th>الخدمات</th><th>الإجمالي</th><th>طريقة الدفع</th><th>الحالة</th><th /></tr></thead><tbody>{visiblePatients.map((patient) => { const invoiceTotal = getInvoiceTotal(patient); return <tr key={patient.invoice}><td><strong className="mono">{patient.invoice}</strong><span className="muted-line">{patient.registeredDate ? formatClinicDateFromKey(patient.registeredDate) : "—"} · {patient.registeredAt}</span></td><td><div className="person-cell"><div className="avatar small">{initials(patient.name)}</div><strong>{patient.name}</strong></div></td><td><div className="test-tags">{getInvoiceTests(patient).map((test) => <span key={test}>{test}</span>)}{patient.consultationIncluded && <span>معاينة</span>}</div></td><td><strong>{formatCurrency(invoiceTotal)}</strong></td><td><span className="cash-label"><WalletCards size={14} />{patient.paid ? "نقدي" : "—"}</span></td><td>{patient.paid ? <span className="payment-label paid">مكتملة</span> : <button className="button button-soft" disabled={saving} onClick={() => onMarkPaid(patient)}>{saving ? "جارٍ الحفظ..." : "تأكيد الدفع"}</button>}</td><td><button className="row-menu" onClick={() => onPrintInvoice(patient)} aria-label={`طباعة الفاتورة ${patient.invoice}`}><Printer size={16} /></button></td></tr>; })}</tbody></table>{visiblePatients.length === 0 && <div className="empty-state"><ReceiptText size={22} /><strong>لا توجد فواتير ضمن النطاق</strong><span>جرّب نطاقًا زمنيًا آخر أو أنشئ فاتورة جديدة.</span></div>}</div></section></div>;
}
function Lab({ patients, selectedPatientId, setSelectedPatientId, selectedTestCode, setSelectedTestCode, results, resultDraft, setResultDraft, onSaveResult, onPrintResult, savingResult }: { patients: Patient[]; selectedPatientId: string; setSelectedPatientId: (id: string) => void; selectedTestCode: string; setSelectedTestCode: (code: string) => void; results: Record<string, FieldValue>; resultDraft: FieldValue; setResultDraft: (draft: FieldValue) => void; onSaveResult: () => void; onPrintResult: () => void; savingResult?: boolean }) {
  const labPatients = patients.filter((patient) => patient.tests.length > 0);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatus, setQueueStatus] = useState<QueueStatus>("all");
  const filteredLabPatients = labPatients.filter((patient) => {
    const matchesSearch = `${patient.name} ${patient.id} ${patient.tests.join(" ")}`.toLowerCase().includes(queueSearch.trim().toLowerCase());
    const matchesStatus = queueStatus === "all" || (queueStatus === "paid" ? patient.paid : !patient.paid);
    return matchesSearch && matchesStatus;
  });
  const filteredTestCount = filteredLabPatients.reduce((sum, patient) => sum + patient.tests.length, 0);
  const paidTestCount = labPatients.filter((patient) => patient.paid).reduce((sum, patient) => sum + patient.tests.length, 0);
  const pendingTestCount = labPatients.filter((patient) => !patient.paid).reduce((sum, patient) => sum + patient.tests.length, 0);
  const selectedPatient = labPatients.find((patient) => patient.id === selectedPatientId) ?? labPatients[0];
  if (!selectedPatient) return <div className="page-stack"><SectionTitle eyebrow="مختبر بكّا · قائمة العمل" title="محطة المختبر" description="لا يمكن إصدار النتيجة قبل اكتمال الدفع." /><div className="panel empty-state"><FlaskConical size={22} /><strong>لا توجد طلبات مخبرية في السجلات الحالية</strong><span>سجّل مريضًا وأضف فحوصاته لتظهر الطلبات هنا.</span></div></div>;
  const selectedTest = labTests.find((test) => test.code === selectedTestCode) ?? labTests[0];
  const testList = selectedPatient ? selectedPatient.tests.map((code) => labTests.find((test) => test.code === code)).filter(Boolean) as LabTest[] : [];
  const savedKey = `${selectedPatient?.id}-${selectedTest?.code}`;
  const hasSavedResult = Boolean(results[savedKey]);
  const selectedTestIsOrdered = Boolean(selectedPatient?.tests.includes(selectedTest.code));
  return <div className="page-stack"><SectionTitle eyebrow="مختبر بكّا · قائمة العمل" title="محطة المختبر" description="لا يمكن إصدار النتيجة قبل اكتمال الدفع. راجع المدى المرجعي حسب جنس المريض قبل الحفظ والطباعة." action={<div className="lab-status"><span className="live-dot">مفتوح</span><span>فني الوردية: أ. سامر</span></div>} /><div className="lab-layout"><section className="panel lab-queue"><div className="panel-header"><div><span className="eyebrow">{filteredTestCount} طلبات ظاهرة</span><h2>قائمة العينات</h2></div><div className="table-actions"><button className={`filter-button ${queueStatus === "all" ? "active" : ""}`} onClick={() => setQueueStatus("all")}>الكل <span>{labPatients.reduce((sum, patient) => sum + patient.tests.length, 0)}</span></button><button className={`filter-button ${queueStatus === "paid" ? "active" : ""}`} onClick={() => setQueueStatus("paid")}>مدفوع <span>{paidTestCount}</span></button><button className={`filter-button ${queueStatus === "pending" ? "active" : ""}`} onClick={() => setQueueStatus("pending")}>معلّق <span>{pendingTestCount}</span></button></div></div><div className="lab-search"><Search size={16} /><input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="ابحث عن مريض أو فحص..." aria-label="البحث في قائمة عينات المختبر" />{queueSearch && <button type="button" className="search-clear" onClick={() => setQueueSearch("")} aria-label="مسح بحث المختبر"><X size={14} /></button>}</div><div className="queue-list">{filteredLabPatients.map((patient) => <button key={patient.id} className={`queue-item ${patient.id === selectedPatient.id ? "active" : ""}`} onClick={() => { setSelectedPatientId(patient.id); setSelectedTestCode(patient.tests[0]); }}><div className="queue-avatar">{initials(patient.name)}</div><div className="queue-main"><strong>{patient.name}</strong><span>{patient.id} · {patient.tests.join("، ")}</span></div><div className="queue-side"><span className={`queue-status ${patient.paid ? "paid" : "blocked"}`}>{patient.paid ? "مدفوع" : "معلّق"}</span><small>{patient.registeredAt}</small></div></button>)}{filteredLabPatients.length === 0 && <div className="empty-state"><Search size={20} /><strong>لا توجد عينات مطابقة</strong><span>جرّب اسم المريض أو رقم الملف أو رمز الفحص.</span></div>}</div></section><section className="panel result-panel"><div className="result-header"><div className="patient-banner"><div className="avatar large">{initials(selectedPatient.name)}</div><div><span className="eyebrow">ملف المريض · {selectedPatient.id}</span><h2>{selectedPatient.name}</h2><p>{selectedPatient.age == null ? "العمر غير محدد" : `${selectedPatient.age} سنة`} · {selectedPatient.gender} · {selectedPatient.address}</p></div></div><div className="result-actions"><button className="button button-secondary" disabled={!selectedPatient.paid || !selectedTestIsOrdered} onClick={onPrintResult}><Printer size={16} />طباعة A4</button><button className="button button-primary" disabled={savingResult || !selectedPatient.paid || !selectedTestIsOrdered} onClick={onSaveResult}><BadgeCheck size={16} />حفظ النتيجة</button></div></div><div className="result-meta"><div><span>رقم العينة</span><strong>{formatSampleNumber(selectedPatient, selectedTest)}</strong></div><div><span>تاريخ السحب</span><strong>{selectedPatient.registeredAt}</strong></div><div><span>الطبيب المحوّل</span><strong>مقابلة عامة</strong></div><div><span>حالة الدفع</span><strong className={selectedPatient.paid ? "teal-text" : "amber-text"}>{selectedPatient.paid ? "مكتملة" : "معلّقة"}</strong></div></div>{!selectedPatient.paid ? <div className="locked-banner"><ShieldCheck size={18} /><div><strong>النتيجة محمية حتى اكتمال الدفع</strong><span>أكمل التحصيل من قسم الفواتير أولًا، ثم سيصبح الحفظ والطباعة متاحين لفني المختبر.</span></div></div> : !selectedTestIsOrdered && <div className="locked-banner"><FlaskConical size={18} /><div><strong>لا يوجد فحص مخبري مطلوب لهذا المريض</strong><span>أضف الفحص من سجل المريض بعد المعاينة، ثم أكمل تحصيل فاتورته.</span></div></div>}<div className="test-tabs">{testList.map((test) => <button key={test.code} className={test.code === selectedTest.code ? "active" : ""} onClick={() => { setSelectedTestCode(test.code); setResultDraft(results[`${selectedPatient.id}-${test.code}`] ?? {}); }}><span>{test.code}</span>{results[`${selectedPatient.id}-${test.code}`] ? <BadgeCheck size={14} /> : <span className="tab-dot" />}</button>)}</div><div className="test-form-head"><div><span className="eyebrow">{selectedTest.category} · {selectedTest.sample}</span><h3>{selectedTest.name} <span>{selectedTest.english}</span></h3></div><span className="reference-note">المدى المرجعي يتبع {selectedPatient.gender}</span></div>{selectedTest.code === "CBC" ? <div className="cbc-sections"><div className="cbc-group"><h4>مؤشرات كريات الدم البيضاء</h4><div className="field-grid">{selectedTest.fields.slice(0, 6).map((field) => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={(value) => setResultDraft({ ...resultDraft, [field.key]: value })} />)}</div></div><div className="cbc-group"><h4>مؤشرات كريات الدم الحمراء</h4><div className="field-grid">{selectedTest.fields.slice(6, 13).map((field) => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={(value) => setResultDraft({ ...resultDraft, [field.key]: value })} />)}</div></div><div className="cbc-group"><h4>الصفائح الدموية</h4><div className="field-grid two-cols">{selectedTest.fields.slice(13).map((field) => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={(value) => setResultDraft({ ...resultDraft, [field.key]: value })} />)}</div></div><label className="form-field full-field"><span>ملاحظات المختبر</span><textarea rows={3} value={resultDraft.remarks ?? ""} onChange={(event) => setResultDraft({ ...resultDraft, remarks: event.target.value })} placeholder="أضف ملاحظات فني المختبر هنا..." /></label></div> : <div className="generic-result-grid">{selectedTest.fields.map((field) => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={(value) => setResultDraft({ ...resultDraft, [field.key]: value })} />)}<label className="form-field full-field"><span>ملاحظات / Remarks</span><textarea rows={4} value={resultDraft.remarks ?? ""} onChange={(event) => setResultDraft({ ...resultDraft, remarks: event.target.value })} placeholder="أضف ملاحظات الفحص..." /></label></div>}<div className="lab-footer-note"><AlertCircle size={15} /><span>هذه المديات مثال قابل للتهيئة. يعتمد الإصدار النهائي على جهاز المختبر والطريقة والعمر والجنس والحالة السريرية.</span><span className="saved-indicator">{hasSavedResult ? "تم الحفظ" : "مسودة غير محفوظة"}</span></div></section></div></div>;
}

function ResultField({ field, gender, value, onChange }: { field: TestField; gender: Patient["gender"]; value: string; onChange: (value: string) => void }) {
  const selectOptions = field.male.includes("Negative") ? ["Negative", "Positive"] : ["سالب", "موجب"];
  return <label className="form-field"><span>{field.label}{field.unit && <em>{field.unit}</em>}</span><div className="result-input-wrap">{field.type === "select" ? <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">اختر النتيجة</option>{selectOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input type={field.type === "number" ? "number" : "text"} value={value} onChange={(event) => onChange(event.target.value)} placeholder="—" />}<span className="range-chip">{gender === "ذكر" ? field.male : field.female}</span></div></label>;
}

function TestsCatalog({ onToast, prices }: { onToast: (message: string) => void; prices: Record<string, number> }) {
  const [category, setCategory] = useState("الكل");
  const categories = ["الكل", ...Array.from(new Set(labTests.map((test) => test.category)))];
  const visibleTests = category === "الكل" ? labTests : labTests.filter((test) => test.category === category);
  return <div className="page-stack"><SectionTitle eyebrow="الإدارة · التسعير" title="كتالوج الفحوصات" description="أضف أي فحص جديد أو عدّل السعر والحقول والمديات المرجعية الخاصة بالذكر والأنثى." action={<button className="button button-primary" onClick={() => onToast("تم فتح نموذج إضافة فحص جديد") }><Plus size={16} />إضافة فحص</button>} /><div className="catalog-toolbar"><div className="category-tabs">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="catalog-count"><TestTube2 size={16} />{visibleTests.length} فحوصات معروضة</div></div><div className="catalog-grid">{visibleTests.map((test) => <article className="test-card" key={test.code}><div className="test-card-top"><span className="test-code">{test.code}</span><button className="row-menu"><MoreHorizontal size={16} /></button></div><h3>{test.name}</h3><p>{test.english}</p><div className="test-card-meta"><span><Beaker size={14} />{test.sample}</span><span><Clock3 size={14} />{test.turnaround}</span></div><div className="test-card-bottom"><strong>{formatCurrency(prices[test.code] ?? test.price)}</strong><span>{test.fields.length} حقول نتيجة</span></div></article>)}</div></div>;
}

function Reports({ patients, onPrintReport }: { patients: Patient[]; onPrintReport: (range: ReportRange) => void }) {
  const [range, setRange] = useState<ReportRange>("today");
  const currentDate = getClinicDateKey();
  const currentMonth = currentDate.slice(0, 7);
  const reportPatients = patients.filter((patient) => {
    if (!patient.registeredDate) return true;
    return range === "today" ? patient.registeredDate === currentDate : patient.registeredDate.startsWith(currentMonth);
  });
  const paidPatients = reportPatients.filter((patient) => patient.paid);
  const testCounts = reportPatients.flatMap((patient) => patient.tests).reduce<Record<string, number>>((counts, code) => ({ ...counts, [code]: (counts[code] ?? 0) + 1 }), {});
  const totalTests = Object.values(testCounts).reduce((sum, count) => sum + count, 0);
  const breakdown = Object.entries(testCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([code, count]) => ({ code, count, percentage: totalTests ? Math.round((count / totalTests) * 100) : 0 }));
  const chartPatients = reportPatients.slice(0, 7).reverse();
  const maxRevenue = Math.max(...chartPatients.map((patient) => getInvoiceTotal(patient)), 1);
  const reportRows = reportPatients.slice(0, 8);
  const paidTotal = paidPatients.reduce((sum, patient) => sum + getInvoiceTotal(patient), 0);
  const statusClass = (index: number) => ["teal", "blue", "amber", "rose"][index] ?? "teal";

  return <div className="page-stack"><SectionTitle eyebrow="تحليل التشغيل" title="التقارير والمتابعة" description="ملخصات مبنية على سجلات المرضى والفواتير الظاهرة في مساحة العمل الحالية." action={<div className="heading-actions"><div className="table-actions"><button className={`filter-button ${range === "today" ? "active" : ""}`} onClick={() => setRange("today")}>اليوم</button><button className={`filter-button ${range === "month" ? "active" : ""}`} onClick={() => setRange("month")}>هذا الشهر</button></div><button className="button button-secondary" onClick={() => onPrintReport(range)}><Printer size={16} />طباعة التقرير</button></div>} /><div className="report-layout"><section className="panel report-chart"><div className="panel-header"><div><span className="eyebrow">آخر السجلات</span><h2>إيرادات الفواتير المعروضة</h2></div><span className="catalog-count">{reportPatients.length} سجلات</span></div><div className="chart-area">{chartPatients.length ? <div className="bars report-bars">{chartPatients.map((patient) => { const revenue = getInvoiceTotal(patient); return <div className="bar-column" key={patient.id}><div className="bar-value">{Math.round(revenue / 1000)}k</div><div className="chart-bar" style={{ height: `${Math.max(8, (revenue / maxRevenue) * 100)}%` }} /><span>{patient.registeredAt}</span></div>; })}</div> : <div className="empty-state"><FileBarChart size={22} /><strong>لا توجد سجلات كافية</strong><span>ستظهر الإيرادات بعد تسجيل المرضى.</span></div>}</div></section><section className="panel report-breakdown"><div className="panel-header"><div><span className="eyebrow">توزيع الفحوصات</span><h2>الأكثر طلبًا</h2></div><Activity size={19} className="muted-icon" /></div><div className="breakdown-list">{breakdown.length ? breakdown.map(({ code, percentage }, index) => <div key={code}><div className="breakdown-label"><span className={`legend ${statusClass(index)}`} />{code} <strong>{percentage}%</strong></div><div className="progress"><i className={statusClass(index)} style={{ width: `${percentage}%` }} /></div></div>) : <div className="empty-state"><strong>لا توجد فحوصات</strong><span>ستظهر هنا نسب الفحوصات المطلوبة.</span></div>}</div><div className="report-total"><span>إجمالي الفحوصات</span><strong>{totalTests} <small>فحص</small></strong></div></section></div><section className="panel"><div className="panel-header"><div><span className="eyebrow">سجل التقرير الحالي</span><h2>حركة الفواتير</h2></div><div className="report-total-inline"><span>المحصّل</span><strong>{formatCurrency(paidTotal)}</strong></div></div><div className="report-rows">{reportRows.length ? reportRows.map((patient) => <div key={`${patient.id}-${patient.invoice}`}><div className="report-file"><div className="file-icon teal"><FileText size={17} /></div><span><strong>{patient.invoice}</strong><small>{patient.name} · {patient.tests.length} فحوصات · {patient.registeredAt}</small></span></div><span className={patient.paid ? "ready-label" : "draft-label"}>{patient.paid ? "مكتملة" : "بانتظار التحصيل"}</span><button className="row-menu" onClick={() => onPrintReport(range)} aria-label={`طباعة تقرير ${patient.invoice}`}><Printer size={16} /></button></div>) : <div className="empty-state"><FileText size={22} /><strong>لا توجد فواتير في التقرير</strong><span>سجّل مريضًا لبدء حركة التقرير.</span></div>}</div></section></div>;
}
function AccessDenied({ role, section }: { role: Role; section: Section }) {
  return <div className="page-stack"><SectionTitle eyebrow="الوصول المقيّد" title="هذا القسم غير متاح لهذا الدور" description={`لا يملك دور ${roleLabels[role]} صلاحية فتح قسم ${sectionLabels[section]} حاليًا.`} /><div className="panel empty-state"><ShieldCheck size={24} /><strong>الصلاحية غير متوفرة</strong><span>اختر قسمًا من القائمة الجانبية المسموحة لدورك، أو بدّل الدور من شاشة الدخول.</span></div></div>;
}
function Settings({ role, setRole, shift, setShift, clinicName, clinicAddress, clinicPhone, clinicEmail, clinicWebsite, clinicFooterText }: { role: Role; setRole: (role: Role) => void; shift: Shift; setShift: (shift: Shift) => void; clinicName: string; clinicAddress: string; clinicPhone: string; clinicEmail: string; clinicWebsite: string; clinicFooterText: string }) {
  return <div className="page-stack"><SectionTitle eyebrow="الإدارة والهوية" title="إعدادات المستوصف" description="تحكم في بيانات المنشأة، المستخدمين، الورديات، والتسعير من لوحة واحدة." action={<button className="button button-secondary" disabled title="حفظ إعدادات المستوصف غير متاح في وضع العرض الحالي"><ShieldCheck size={16} />الحفظ غير متاح في وضع العرض</button>} /><div className="settings-grid"><section className="panel settings-main"><div className="settings-section"><div className="panel-header"><div><span className="eyebrow">هوية المنشأة</span><h2>بيانات المستوصف</h2></div><span className="saved-badge">من إعدادات الخادم</span></div><div className="settings-form"><div className="settings-readonly-note"><AlertCircle size={15} /><span>هذه البيانات معروضة من إعدادات الخادم للقراءة فقط. سيظهر الحفظ بعد تفعيل واجهة تحديث إعدادات المستوصف.</span></div><label className="form-field"><span>اسم المستوصف</span><input readOnly defaultValue={clinicName} /></label><label className="form-field"><span>العنوان</span><input readOnly defaultValue={clinicAddress} /></label><label className="form-field"><span>هاتف التواصل</span><input readOnly defaultValue={clinicPhone} /></label><label className="form-field"><span>البريد الإلكتروني</span><input readOnly defaultValue={clinicEmail} /></label><label className="form-field"><span>الموقع الإلكتروني</span><input readOnly defaultValue={clinicWebsite} /></label><label className="form-field full-field"><span>رسالة أسفل التقرير</span><textarea readOnly rows={3} defaultValue={clinicFooterText} /></label></div></div><div className="settings-section border-top"><div className="panel-header"><div><span className="eyebrow">الوردية الحالية</span><h2>توزيع التشغيل</h2></div><CalendarDays size={19} className="muted-icon" /></div><div className="shift-picker">{(["صباحية", "مسائية", "سهرة"] as Shift[]).map((item) => <button key={item} className={shift === item ? "active" : ""} onClick={() => setShift(item)}><span>{item}</span><small>{item === "صباحية" ? "08:00 – 14:00" : item === "مسائية" ? "14:00 – 22:00" : "22:00 – 08:00"}</small></button>)}</div></div></section><aside className="settings-side"><section className="panel role-card"><div className="panel-header"><div><span className="eyebrow">الصلاحيات</span><h2>دور المستخدم</h2></div><ShieldCheck size={19} className="muted-icon" /></div><div className="role-select"><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={15} /></div><p>{roleDescriptions[role]}</p><div className="role-permissions">{rolePermissions[role].map((permission) => <span key={permission}><BadgeCheck size={14} />{permission}</span>)}</div></section><section className="panel info-card"><div className="info-icon"><ShieldCheck size={19} /></div><strong>البيانات الصحية محمية</strong><p>لا تظهر نتائج المرضى إلا للمستخدمين المصرح لهم، ولا يمكن للمختبر إصدار نتيجة قبل اكتمال الدفع.</p></section></aside></div></div>;
}

function PatientDialog({ onClose, onSave, saving = false, prices }: { onClose: () => void; onSave: (patient: NewPatientInput) => void; saving?: boolean; prices: Record<string, number> }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Patient["gender"]>("ذكر");
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [tests, setTests] = useState<string[]>([]);
  const toggleTest = (code: string) => setTests((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">استقبال جديد</span><h2>تسجيل مريض وإصدار فاتورة</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="modal-body"><div className="form-grid"><label className="form-field full-field"><span>اسم المريض <b>*</b></span><input autoFocus required maxLength={180} value={name} onChange={(event) => setName(event.target.value)} placeholder="مثال: محمد أحمد" /></label><label className="form-field"><span>الجنس <b>*</b></span><select required value={gender} onChange={(event) => setGender(event.target.value as Patient["gender"])}><option>ذكر</option><option>أنثى</option></select></label><label className="form-field"><span>العمر</span><input type="number" min="0" max="130" step="1" value={age} onChange={(event) => setAge(event.target.value)} placeholder="اختياري" /></label><label className="form-field"><span>رقم الهاتف</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09xx xxx xxx" /></label><label className="form-field"><span>العنوان</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="الحي / المدينة" /></label></div><div className="modal-subsection"><div><span className="eyebrow">الخدمة الأولى</span><h3>المعاينة الطبية، والتحاليل إن طُلبت الآن</h3></div><div className="test-picker">{labTests.slice(0, 8).map((test) => <button key={test.code} className={tests.includes(test.code) ? "selected" : ""} onClick={() => toggleTest(test.code)}><span>{test.code}</span><small>{formatCurrency(prices[test.code] ?? test.price)}</small></button>)}</div></div><div className="invoice-preview"><div><span>المعاينة والفحوصات</span><strong>المعاينة 35,000 ج.س · {tests.length} فحص</strong></div><strong>{formatCurrency(tests.reduce((sum, code) => sum + (prices[code] ?? labTests.find((test) => test.code === code)?.price ?? 0), 0) + 35000)}</strong></div></div><div className="modal-footer"><button className="button button-secondary" onClick={onClose}>إلغاء</button><button className="button button-primary" disabled={saving || name.trim().length < 2 || (age !== "" && (!Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 130))} onClick={() => onSave({ name: name.trim(), gender, age: age === "" ? undefined : Number(age), phone: phone.trim() || "—", address: address.trim() || "—", tests })}><ReceiptText size={16} />حفظ وطباعة التذكرة</button></div></div></div>;
}

function AdditionalTestsDialog({ patient, onClose, onSave, saving = false, prices }: { patient: Patient; onClose: () => void; onSave: (codes: string[]) => void; saving?: boolean; prices: Record<string, number> }) {
  const [tests, setTests] = useState<string[]>([]);
  const availableTests = labTests.filter((test) => !patient.tests.includes(test.code));
  const toggleTest = (code: string) => setTests((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  const total = tests.reduce((sum, code) => sum + (prices[code] ?? labTests.find((test) => test.code === code)?.price ?? 0), 0);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">ملف المريض · {patient.id}</span><h2>إضافة فحوصات لاحقة</h2></div><button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button></div><div className="modal-body"><p>ستُضاف الفحوصات إلى سجل {patient.name} وتُنشأ فاتورة مستقلة، دون تكرار رسوم المعاينة.</p><div className="test-picker">{availableTests.map((test) => <button type="button" key={test.code} className={tests.includes(test.code) ? "selected" : ""} onClick={() => toggleTest(test.code)}><span>{test.code}</span><small>{formatCurrency(prices[test.code] ?? test.price)}</small></button>)}</div>{availableTests.length === 0 && <div className="empty-state"><strong>كل فحوصات الكتالوج مرتبطة بهذا السجل</strong></div>}<div className="invoice-preview"><div><span>الفحوصات الجديدة</span><strong>{tests.length} فحص</strong></div><strong>{formatCurrency(total)}</strong></div></div><div className="modal-footer"><button className="button button-secondary" onClick={onClose}>إلغاء</button><button className="button button-primary" disabled={saving || tests.length === 0} onClick={() => onSave(tests)}><ReceiptText size={16} />إنشاء فاتورة الفحوصات</button></div></div></div>;
}

function LoginDialog({ activeRole, onRoleChange, onClose, onToast }: { activeRole: Role; onRoleChange: (role: Role) => void; onClose: () => void; onToast: (message: string) => void }) {
  const [loginError, setLoginError] = useState("");
  const handleOfficialLogin = () => {
    try {
      startLogin();
    } catch {
      setLoginError("لم يتم إعداد بوابة الدخول الموحد في هذه البيئة، يمكنك استخدام وضع العرض التجريبي.");
    }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card login-card" onMouseDown={(event) => event.stopPropagation()}><div className="login-hero"><AppLogo /><button className="icon-button" onClick={onClose}><X size={18} /></button><div className="login-symbol"><ShieldCheck size={29} /></div><span className="eyebrow">دخول آمن للمستوصف</span><h2>اختر طريقة الدخول</h2><p>استخدم حساب Manus للدخول الرسمي، أو افتح وضع العرض التجريبي لمراجعة سير العمل.</p></div><div className="modal-body login-body"><button className="button button-primary full-width login-main-action" onClick={handleOfficialLogin}><LogIn size={17} />الدخول الموحد عبر Manus</button>{loginError && <div className="login-error"><AlertCircle size={15} />{loginError}</div>}<div className="login-divider"><span>أو جرّب دورًا</span></div><div className="demo-role-grid">{(Object.keys(roleLabels) as Role[]).map((role) => <button key={role} className={activeRole === role ? "active" : ""} onClick={() => { onRoleChange(role); onToast(`تم فتح وضع العرض التجريبي بدور ${roleLabels[role]}`); onClose(); }}><span className="demo-role-icon"><ShieldCheck size={16} /></span><span><strong>{roleLabels[role]}</strong><small>{roleDescriptions[role]}</small></span>{activeRole === role && <BadgeCheck size={15} />}</button>)}</div><p className="login-note">وضع العرض التجريبي لا يحفظ بيانات المرضى في قاعدة البيانات، ويستخدم فقط لمراجعة الواجهة والتدفق.</p></div></div></div>;
}

function PatientDrawer({ patient, onClose, onPrintInvoice, onPrintMedicalReport, onAddTests, onNavigate }: { patient: Patient; onClose: () => void; onPrintInvoice: () => void; onPrintMedicalReport: () => void; onAddTests: () => void; onNavigate: (section: Section) => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="patient-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">سجل المريض</span><h2>{patient.name}</h2><span>{patient.id} · {patient.gender} · {patient.age == null ? "العمر غير محدد" : `${patient.age} سنة`}</span></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="drawer-body"><div className="drawer-profile"><div className="avatar large">{initials(patient.name)}</div><div><strong>{patient.phone}</strong><span>{patient.address}</span><StatusPill status={patient.status} /></div></div><div className="drawer-summary"><div><span>الفاتورة الحالية</span><strong>{patient.invoice}</strong></div><div><span>الإجمالي</span><strong>{formatCurrency(getInvoiceTotal(patient))}</strong></div><div><span>الفحوصات</span><strong>{patient.tests.length}</strong></div></div><div className="drawer-section"><span className="eyebrow">رحلة المريض</span><div className="patient-journey"><div className="journey-step done"><span><BadgeCheck size={14} /></span><div><strong>تم التسجيل</strong><small>{formatClinicDateFromKey(patient.registeredDate ?? getClinicDateKey())} · {patient.registeredAt}</small></div></div><div className="journey-step done"><span><CreditCard size={14} /></span><div><strong>{patient.paid ? "تم التحصيل" : "بانتظار التحصيل"}</strong><small>{patient.invoice}</small></div></div><div className={`journey-step ${patient.status === "في المختبر" ? "active" : ""}`}><span><FlaskConical size={14} /></span><div><strong>المختبر</strong><small>{patient.tests.length} فحوصات مرتبطة</small></div></div><div className="journey-step"><span><FileCheck2 size={14} /></span><div><strong>إصدار النتيجة</strong><small>بعد اكتمال الفحص</small></div></div></div></div><div className="drawer-section"><div className="drawer-section-head"><span className="eyebrow">الفحوصات المطلوبة</span><button className="link-button" onClick={onAddTests}>إضافة فحوصات <Plus size={14} /></button></div><div className="drawer-tests">{patient.tests.length ? patient.tests.map((code) => { const test = labTests.find((item) => item.code === code); return <div key={code}><div className="test-code">{code}</div><div><strong>{test?.name}</strong><span>{test?.sample}</span></div><BadgeCheck size={16} className="teal-text" /></div>; }) : <p className="muted-cell">لم تُضف فحوصات مخبرية بعد. يمكن إضافتها بعد المعاينة.</p>}</div></div></div><div className="drawer-footer"><button className="button button-secondary" onClick={onPrintInvoice}><Printer size={16} />الفاتورة</button><button className="button button-secondary" onClick={onPrintMedicalReport}><FileText size={16} />التقرير الطبي</button><button className="button button-primary" onClick={() => { onNavigate("lab"); onClose(); }}><FlaskConical size={16} />فتح في المختبر</button></div></aside></div>;
}

function PrintDocument({ mode, patient, selectedTest, result, reportPatients, reportRange, clinicName, clinicAddress, clinicPhone, clinicWebsite, clinicFooterText, clinicLogoUrl, onClose }: { mode: Exclude<PrintMode, null>; patient: Patient; selectedTest: LabTest; result: FieldValue; reportPatients: Patient[]; reportRange: ReportRange; clinicName: string; clinicAddress: string; clinicPhone: string; clinicWebsite: string; clinicFooterText: string; clinicLogoUrl: string; onClose: () => void }) {
  const invoiceTests = getInvoiceTests(patient);
  const reportPaidCount = reportPatients.filter((item) => item.paid).length;
  const reportTestCount = reportPatients.reduce((sum, item) => sum + item.tests.length, 0);
  const reportRevenue = reportPatients.filter((item) => item.paid).reduce((sum, item) => sum + getInvoiceTotal(item), 0);
  const printableReportPatients = reportPatients.filter((item) => {
    if (!item.registeredDate) return true;
    const currentDate = getClinicDateKey();
    return reportRange === "today" ? item.registeredDate === currentDate : item.registeredDate.startsWith(currentDate.slice(0, 7));
  });
  const printablePaidCount = printableReportPatients.filter((item) => item.paid).length;
  const printableTestCount = printableReportPatients.reduce((sum, item) => sum + item.tests.length, 0);
  const printableRevenue = printableReportPatients.filter((item) => item.paid).reduce((sum, item) => sum + getInvoiceTotal(item), 0);
  const consultationIncluded = patient.consultationIncluded ?? true;
  const invoiceLines = patient.invoiceLines ?? [
    ...invoiceTests.map((code) => {
      const test = labTests.find((item) => item.code === code);
      return { description: `${code} · ${test?.name ?? "فحص مخبري"}`, unitPrice: test?.price ?? 0, code };
    }),
    ...(consultationIncluded ? [{ description: "المعاينة الطبية", unitPrice: 35000, code: undefined }] : []),
  ];
  if (mode === "invoice") return <div className="print-doc thermal-doc"><div className="print-brand"><img src={clinicLogoUrl} alt="" /><div><strong>{clinicName}</strong><span>{clinicAddress} · {clinicPhone}</span></div></div><div className="print-rule" /><div className="print-center"><strong>تذكرة استقبال</strong><span>{patient.invoice}</span></div><div className="print-info"><div><span>المريض</span><strong>{patient.name}</strong></div><div><span>الملف</span><strong>{patient.id}</strong></div><div><span>تسلسل الوردية</span><strong>#{String(patient.sequence ?? 0).padStart(4, "0")}</strong></div><div><span>الجنس</span><strong>{patient.gender}</strong></div><div><span>التاريخ</span><strong>{formatClinicDateFromKey(patient.registeredDate ?? getClinicDateKey())} · {patient.shift ?? getCurrentClinicShift()}</strong></div></div><div className="print-table"><div className="print-row print-head"><span>الخدمة</span><span>السعر</span></div>{invoiceLines.map((line, index) => <div className="print-row" key={`${line.code ?? line.description}-${index}`}><span>{line.description}</span><span>{formatCurrency(line.unitPrice)}</span></div>)}</div><div className="print-total"><span>الإجمالي</span><strong>{formatCurrency(getInvoiceTotal(patient))}</strong></div><div className="print-footer">{clinicFooterText}<br />{clinicWebsite}</div><button className="screen-close-print" onClick={onClose}>العودة للنظام</button></div>;
  if (mode === "patient-report") return <div className="print-doc a4-doc patient-report-print"><div className="a4-header"><div className="print-brand"><img src={clinicLogoUrl} alt="" /><div><strong>{clinicName}</strong><span>تقرير طبي مختصر · سجل زيارة</span></div></div><div className="report-meta"><strong>{patient.id}</strong><span>{patient.invoice}</span></div></div><div className="print-rule" /><div className="result-print-title"><span>ملخص الزيارة</span><h1>تقرير طبي للمريض</h1><p>بيانات تشغيلية وفحوصات مرتبطة بالزيارة الحالية</p></div><div className="patient-print-grid"><div><span>اسم المريض</span><strong>{patient.name}</strong></div><div><span>رقم الملف</span><strong>{patient.id}</strong></div><div><span>العمر / الجنس</span><strong>{patient.age == null ? "غير محدد" : `${patient.age} سنة`} · {patient.gender}</strong></div><div><span>تاريخ الزيارة</span><strong>{formatClinicDateFromKey(patient.registeredDate ?? getClinicDateKey())}</strong></div><div><span>الهاتف</span><strong>{patient.phone}</strong></div><div><span>الحالة التشغيلية</span><strong>{patient.status}</strong></div></div><h3 className="print-subtitle">الفحوصات والخدمات المرتبطة</h3><table className="result-print-table"><thead><tr><th>الرمز</th><th>الخدمة</th><th>العينة</th><th>الحالة</th></tr></thead><tbody>{invoiceTests.length ? invoiceTests.map((code) => { const test = labTests.find((item) => item.code === code); return <tr key={code}><td><strong>{code}</strong></td><td>{test?.name ?? "فحص مخبري"}</td><td>{test?.sample ?? "—"}</td><td>{patient.status === "مكتملة" ? "مكتمل" : patient.paid ? "قيد المتابعة" : "بانتظار الدفع"}</td></tr>; }) : <tr><td colSpan={4}>لا توجد فحوصات مخبرية مرتبطة بهذه الزيارة.</td></tr>}</tbody></table><div className="report-summary-box"><div><span>حالة الفاتورة</span><strong>{patient.paid ? "مدفوعة" : "غير مكتملة"}</strong></div><div><span>إجمالي الزيارة</span><strong>{formatCurrency(getInvoiceTotal(patient))}</strong></div><div><span>الوردية</span><strong>{patient.shift ?? getCurrentClinicShift()}</strong></div></div><div className="remarks-print"><strong>ملاحظات الطبيب / المختبر</strong><p>يُستكمل هذا القسم من الطبيب أو فني المختبر وفق نتائج الفحص المعتمدة. هذا المستند ملخص تشغيلي ولا يُعد تشخيصًا طبيًا مستقلًا.</p></div><div className="signature-row"><div><span>اسم الطبيب / المسؤول</span><strong>________________</strong></div><div><span>التوقيع والختم</span><strong>________________</strong></div></div><div className="a4-footer"><span>{clinicFooterText}</span><span>صفحة التقرير · {clinicName}</span></div><button className="screen-close-print" onClick={onClose}>العودة للنظام</button></div>;
  if (mode === "result") return <div className="print-doc a4-doc"><div className="a4-header"><div className="print-brand"><img src={clinicLogoUrl} alt="" /><div><strong>{clinicName}</strong><span>قسم المختبر · نتيجة فحص مخبري</span></div></div><div className="report-meta"><strong>{selectedTest.code}</strong><span>رقم العينة: {formatSampleNumber(patient, selectedTest)}</span></div></div><div className="print-rule" /><div className="patient-print-grid"><div><span>اسم المريض</span><strong>{patient.name}</strong></div><div><span>رقم الملف</span><strong>{patient.id}</strong></div><div><span>العمر / الجنس</span><strong>{patient.age == null ? "غير محدد" : `${patient.age} سنة`} · {patient.gender}</strong></div><div><span>التاريخ</span><strong>{formatClinicDateFromKey(patient.registeredDate ?? getClinicDateKey())}</strong></div><div><span>نوع العينة</span><strong>{selectedTest.sample}</strong></div><div><span>الطبيب المحوّل</span><strong>مقابلة عامة</strong></div></div><div className="result-print-title"><span>{selectedTest.category}</span><h1>{selectedTest.name}</h1><p>{selectedTest.english}</p></div><table className="result-print-table"><thead><tr><th>الفحص</th><th>النتيجة</th><th>الوحدة</th><th>المدى المرجعي ({patient.gender})</th></tr></thead><tbody>{selectedTest.fields.map((field) => <tr key={field.key}><td>{field.label}</td><td><strong>{result[field.key] || "—"}</strong></td><td>{field.unit || "—"}</td><td>{patient.gender === "ذكر" ? field.male : field.female}</td></tr>)}</tbody></table><div className="remarks-print"><strong>ملاحظات / Remarks</strong><p>{result.remarks || "لا توجد ملاحظات إضافية."}</p></div><div className="signature-row"><div><span>اسم فني المختبر</span><strong>{result.technician || "________________"}</strong></div><div><span>التوقيع والختم</span><strong>________________</strong></div></div><div className="a4-footer"><span>هذه النتيجة للاستخدام الطبي المعتمد فقط، وتُفسّر مع الحالة السريرية.</span><span>صفحة التقرير · {clinicName}</span></div><button className="screen-close-print" onClick={onClose}>العودة للنظام</button></div>;
  return <div className="print-doc a4-doc report-print"><div className="a4-header"><div className="print-brand"><img src={clinicLogoUrl} alt="" /><div><strong>{clinicName}</strong><span>{reportRange === "today" ? "تقرير التشغيل اليومي" : "ملخص التشغيل الشهري"}</span></div></div><div className="report-meta"><strong>{formatClinicDateFromKey(getClinicDateKey())}</strong><span>{reportRange === "today" ? "الفترة: اليوم" : "الفترة: هذا الشهر"}</span></div></div><div className="print-rule" /><div className="result-print-title"><span>ملخص المشرف</span><h1>{reportRange === "today" ? "تقرير حركة المستوصف اليومي" : "ملخص حركة المستوصف الشهري"}</h1><p>نظرة تشغيلية على المرضى والفواتير ونتائج المختبر</p></div><div className="report-print-cards"><div><span>المراجعون</span><strong>{printableReportPatients.length}</strong></div><div><span>الفواتير المكتملة</span><strong>{printablePaidCount}</strong></div><div><span>طلبات المختبر</span><strong>{printableTestCount}</strong></div><div><span>الإيرادات</span><strong>{formatCurrency(printableRevenue)}</strong></div></div><h3 className="print-subtitle">تفاصيل آخر حركة</h3><table className="result-print-table"><thead><tr><th>الملف</th><th>المريض</th><th>الخدمات</th><th>الدفع</th><th>الحالة</th></tr></thead><tbody>{printableReportPatients.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.name}</td><td>{item.tests.join("، ")}</td><td>{item.paid ? "مكتمل" : "معلّق"}</td><td>{item.status}</td></tr>)}</tbody></table><div className="a4-footer"><span>تم الاستخراج بواسطة مشرف التشغيل</span><span>صفحة التقرير · {clinicName}</span></div><button className="screen-close-print" onClick={onClose}>العودة للنظام</button></div>;
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [activeRole, setActiveRole] = useState<Role>("supervisor");
  const [shift, setShift] = useState<Shift>(() => getCurrentClinicShift());
  const accessibleSections = roleSections[activeRole];
  useEffect(() => {
    if (!accessibleSections.includes(activeSection)) setActiveSection(accessibleSections[0]);
  }, [accessibleSections, activeSection]);
  const [shiftSequences, setShiftSequences] = useState<Record<Shift, number>>({ "صباحية": 0, "مسائية": 28, "سهرة": 0 });
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [selectedPatientId, setSelectedPatientId] = useState("P-1042");
  const [selectedTestCode, setSelectedTestCode] = useState("CBC");
  const [results, setResults] = useState<Record<string, FieldValue>>(initialResults);
  const [resultDraft, setResultDraft] = useState<FieldValue>(initialResults["P-1042-CBC"]);
  const [search, setSearch] = useState("");
  const [showPatientDialog, setShowPatientDialog] = useState(false);
  const [showAdditionalTestsFor, setShowAdditionalTestsFor] = useState<Patient | null>(null);
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [drawerPatient, setDrawerPatient] = useState<Patient | null>(null);
  const [toast, setToast] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>(null);
  const [printReportRange, setPrintReportRange] = useState<ReportRange>("today");
  const [printPatientSnapshot, setPrintPatientSnapshot] = useState<Patient | null>(null);

  const authQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const sessionRole = authQuery.data?.role;
  const hasOperationalRole = sessionRole != null && ["admin", "cashier", "lab", "supervisor"].includes(sessionRole);
  const canUseReception = !authQuery.data || sessionRole === "admin" || sessionRole === "cashier" || sessionRole === "supervisor";
  const canUseLaboratory = !authQuery.data || sessionRole === "admin" || sessionRole === "lab" || sessionRole === "supervisor";
  const canOpenShift = sessionRole === "admin" || sessionRole === "cashier" || sessionRole === "supervisor";
  const workspaceQuery = trpc.patients.workspace.useQuery(undefined, { enabled: hasOperationalRole, retry: false });
  const currentShiftInput = useMemo(() => ({ shiftDate: getClinicDateKey(), shiftType: serverShiftByLabel[shift] }), [shift]);
  const currentShiftQuery = trpc.shifts.current.useQuery(currentShiftInput, { enabled: hasOperationalRole, retry: false });
  const trpcUtils = trpc.useUtils();
  const registerMutation = trpc.patients.register.useMutation();
  const followUpMutation = trpc.patients.addTests.useMutation();
  const paymentMutation = trpc.billing.markPaid.useMutation();
  const resultMutation = trpc.laboratory.saveResult.useMutation();
  const openShiftMutation = trpc.shifts.open.useMutation();
  const openedShiftKey = useRef("");
  const catalogQuery = trpc.catalog.list.useQuery(undefined, { staleTime: 5 * 60 * 1000, retry: false });
  const clinicQuery = trpc.clinic.getSettings.useQuery(undefined, { staleTime: 5 * 60 * 1000, retry: false });
  const catalogPrices = useMemo(() => Object.fromEntries(labTests.map((test) => {
    const stored = catalogQuery.data?.find((item) => item.code === test.code);
    return [test.code, stored?.price ?? test.price];
  })), [catalogQuery.data]);

  const persistedPatients = useMemo(() => {
    const data = workspaceQuery.data;
    if (!data) return [];
    const codeByTestId = new Map(data.labTests.map((test) => [test.id, test.code]));
    return data.patients.map((row) => {
      const personInvoices = data.invoices.filter((invoice) => invoice.patientId === row.id);
      const latestInvoice = personInvoices[0];
      const patientOrders = data.labOrders.filter((order) => order.patientId === row.id);
      const testCodes = [...new Set(patientOrders.map((order) => codeByTestId.get(order.labTestId)).filter((code): code is string => Boolean(code)))];
      const invoiceItems = latestInvoice ? data.invoiceItems.filter((item) => item.invoiceId === latestInvoice.id) : [];
      const invoiceTests = invoiceItems.map((item) => item.labTestId == null ? undefined : codeByTestId.get(item.labTestId)).filter((code): code is string => Boolean(code));
      const invoiceLines = invoiceItems.map((item) => ({ description: item.description, unitPrice: item.unitPrice, code: item.labTestId == null ? undefined : codeByTestId.get(item.labTestId) }));
      const invoiceOrders = latestInvoice ? patientOrders.filter((order) => order.invoiceId === latestInvoice.id) : [];
      const orderIds: Record<string, number> = {};
      for (const order of patientOrders) {
        const code = codeByTestId.get(order.labTestId);
        if (code && orderIds[code] == null) orderIds[code] = order.id;
      }
      const allCompleted = invoiceOrders.length > 0 && invoiceOrders.every((order) => order.status === "completed");
      const paid = latestInvoice?.status === "paid";
      const status: Patient["status"] = allCompleted ? "مكتملة" : paid && testCodes.length > 0 ? "في المختبر" : paid ? "مكتملة" : "في الانتظار";
      const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
      const identityParts = row.patientNumber.match(/^P-(\d{4})(\d{2})(\d{2})-([MEN])-(\d+)$/);
      const sequence = Number(identityParts?.[5] ?? row.patientNumber.match(/-(\d+)$/)?.[1] ?? 0) || undefined;
      const patientShift: Shift | undefined = identityParts?.[4] === "M" ? "صباحية" : identityParts?.[4] === "E" ? "مسائية" : identityParts?.[4] === "N" ? "سهرة" : undefined;
      return {
        id: row.patientNumber,
        databaseId: row.id,
        databaseInvoiceId: latestInvoice?.id,
        invoiceTotal: latestInvoice?.total ?? 0,
        orderIds,
        name: row.name,
        gender: row.gender === "female" ? "أنثى" as const : "ذكر" as const,
        age: row.age ?? undefined,
        phone: row.phone ?? "—",
        address: row.address ?? "—",
        tests: testCodes,
        invoice: latestInvoice?.invoiceNumber ?? "—",
        paid,
        status,
        registeredAt: Number.isFinite(createdAt.getTime()) ? formatClinicTime(createdAt) : "—",
        registeredDate: identityParts ? `${identityParts[1]}-${identityParts[2]}-${identityParts[3]}` : Number.isFinite(createdAt.getTime()) ? getClinicDateKey(createdAt) : undefined,
        shift: patientShift,
        sequence,
        invoiceTests,
        invoiceLines,
        consultationIncluded: invoiceItems.some((item) => item.description === "المعاينة الطبية"),
      } satisfies Patient;
    });
  }, [workspaceQuery.data]);
  const persistedInvoicePatients = useMemo(() => {
    const data = workspaceQuery.data;
    if (!data) return [];
    const patientById = new Map(persistedPatients.map((patient) => [patient.databaseId, patient]));
    const codeByTestId = new Map(data.labTests.map((test) => [test.id, test.code]));
    return data.invoices.flatMap((invoice) => {
      const patient = patientById.get(invoice.patientId);
      if (!patient) return [];
      const items = data.invoiceItems.filter((item) => item.invoiceId === invoice.id);
      const tests = items.map((item) => item.labTestId == null ? undefined : codeByTestId.get(item.labTestId)).filter((code): code is string => Boolean(code));
      const invoiceLines = items.map((item) => ({ description: item.description, unitPrice: item.unitPrice, code: item.labTestId == null ? undefined : codeByTestId.get(item.labTestId) }));
      const orders = data.labOrders.filter((order) => order.invoiceId === invoice.id);
      const complete = orders.length > 0 && orders.every((order) => order.status === "completed");
      const paid = invoice.status === "paid";
      const createdAt = invoice.createdAt instanceof Date ? invoice.createdAt : new Date(invoice.createdAt);
      const orderIds = Object.fromEntries(orders.flatMap((order) => {
        const code = codeByTestId.get(order.labTestId);
        return code ? [[code, order.id] as const] : [];
      }));
      return [{
        ...patient,
        databaseInvoiceId: invoice.id,
        invoiceTotal: invoice.total,
        invoice: invoice.invoiceNumber,
        paid,
        tests,
        invoiceTests: tests,
        invoiceLines,
        consultationIncluded: items.some((item) => item.description === "المعاينة الطبية"),
        orderIds,
        status: complete ? "مكتملة" as const : paid && tests.length ? "في المختبر" as const : paid ? "مكتملة" as const : "في الانتظار" as const,
        registeredAt: Number.isFinite(createdAt.getTime()) ? formatClinicTime(createdAt) : patient.registeredAt,
      } satisfies Patient];
    });
  }, [persistedPatients, workspaceQuery.data]);
  const billingPatients = authQuery.data ? persistedInvoicePatients : patients;
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) ?? patients[0] ?? EMPTY_PATIENT;
  const selectedTest = labTests.find((test) => test.code === selectedTestCode) ?? labTests[0];
  const isPrintView = Boolean(printMode);
  const pageTitle = navItems.find((item) => item.id === activeSection)?.label ?? "نظرة عامة";
  const visibleShiftSequence = hasOperationalRole && currentShiftQuery.isSuccess
    ? currentShiftQuery.data?.sequenceCurrent ?? 0
    : shiftSequences[shift];
  const persistenceLabel = !authQuery.isSuccess
    ? "جارٍ التحقق من الجلسة"
    : !authQuery.data
      ? "وضع تجريبي · لا تُحفظ البيانات"
      : !hasOperationalRole
        ? "لا يوجد دور تشغيل مخوّل"
        : workspaceQuery.isSuccess
          ? "قاعدة البيانات متصلة · الحفظ دائم"
          : workspaceQuery.isError
            ? "تعذر الاتصال · لا تُجرِ تغييرات"
            : "جارٍ تحميل السجلات";

  useEffect(() => {
    if (!authQuery.isSuccess || !authQuery.data) return;
    if (!hasOperationalRole || workspaceQuery.isError) {
      setPatients([]);
      return;
    }
    if (workspaceQuery.isSuccess) {
      setPatients(persistedPatients);
      setSelectedPatientId((current) => persistedPatients.some((patient) => patient.id === current) ? current : persistedPatients[0]?.id ?? "");
      setActiveRole(sessionRole as Role);
    }
  }, [authQuery.data, authQuery.isSuccess, hasOperationalRole, persistedPatients, sessionRole, workspaceQuery.isError, workspaceQuery.isSuccess]);

  useEffect(() => {
    if (!hasOperationalRole || !currentShiftQuery.isSuccess) return;
    setShiftSequences((current) => ({ ...current, [shift]: currentShiftQuery.data?.sequenceCurrent ?? 0 }));
  }, [currentShiftQuery.data, currentShiftQuery.isSuccess, hasOperationalRole, shift]);

  useEffect(() => {
    if (!canOpenShift || !workspaceQuery.isSuccess || currentShiftQuery.data?.status === "closed") return;
    const key = `${currentShiftInput.shiftDate}:${currentShiftInput.shiftType}`;
    if (openedShiftKey.current === key || currentShiftQuery.data) return;
    openedShiftKey.current = key;
    openShiftMutation.mutate(currentShiftInput, {
      onSuccess: () => trpcUtils.shifts.current.invalidate(currentShiftInput),
      onError: () => { openedShiftKey.current = ""; },
    });
  }, [canOpenShift, currentShiftInput, currentShiftQuery.data, openShiftMutation.mutate, trpcUtils.shifts.current, workspaceQuery.isSuccess]);

  useEffect(() => {
    if (catalogQuery.data?.length) setToast(`تمت مزامنة أسعار ${catalogQuery.data.length} فحصًا من قاعدة البيانات`);
  }, [catalogQuery.data]);

  useEffect(() => {
    const afterPrint = () => { setPrintMode(null); setPrintPatientSnapshot(null); };
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const changeTest = (code: string) => {
    setSelectedTestCode(code);
    setResultDraft(results[`${selectedPatientId}-${code}`] ?? {});
  };

  const triggerPrint = (mode: Exclude<PrintMode, null>, patient?: Patient, reportRange?: ReportRange) => {
    setPrintPatientSnapshot(patient ?? null);
    if (reportRange) setPrintReportRange(reportRange);
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 120);
  };

  const handleSaveResult = () => {
    if (!canUseLaboratory) {
      setToast("حسابك لا يملك صلاحية المختبر");
      return;
    }
    if (!selectedPatient.tests.includes(selectedTest.code)) {
      setToast("لا يمكن إصدار نتيجة لفحص غير موجود في طلب المريض");
      return;
    }
    if (!selectedPatient.paid) {
      setToast("لا يمكن حفظ النتيجة قبل اكتمال الدفع");
      return;
    }
    if (authQuery.data) {
      if (!hasOperationalRole || !workspaceQuery.isSuccess) {
        setToast("لم تُحفظ النتيجة؛ تعذر تأكيد اتصال قاعدة البيانات أو صلاحية الحساب");
        return;
      }
      const labOrderId = selectedPatient.orderIds?.[selectedTest.code];
      if (!labOrderId) {
        setToast("لم تُحفظ النتيجة؛ لا يوجد طلب مخبري دائم لهذا الفحص");
        return;
      }
      resultMutation.mutate({ labOrderId, values: resultDraft, remarks: resultDraft.remarks }, {
        onSuccess: () => {
          void trpcUtils.patients.workspace.invalidate();
          setToast(`حُفظت نتيجة ${selectedTest.code} في سجل المختبر`);
        },
        onError: (error) => setToast(`لم تُحفظ النتيجة: ${error.message}`),
      });
      return;
    }
    setResults((current) => ({ ...current, [`${selectedPatient.id}-${selectedTest.code}`]: resultDraft }));
    setPatients((current) => current.map((patient) => patient.id === selectedPatient.id ? { ...patient, status: "مكتملة" } : patient));
    setToast(`وضع تجريبي فقط؛ لم تُحفظ نتيجة ${selectedTest.code} في قاعدة البيانات`);
  };

  const handleAddTests = (patientId: string, codes: string[]) => {
    if (!canUseReception) {
      setToast("حسابك لا يملك صلاحية الاستقبال وإضافة الفحوصات");
      return;
    }
    const currentPatient = patients.find((patient) => patient.id === patientId);
    if (!currentPatient) return;
    if (authQuery.data) {
      if (!hasOperationalRole || !workspaceQuery.isSuccess) {
        setToast("لم تُنشأ الفاتورة؛ تعذر تأكيد اتصال قاعدة البيانات أو صلاحية الحساب");
        return;
      }
      followUpMutation.mutate({
        patientNumber: currentPatient.id,
        shiftDate: currentShiftInput.shiftDate,
        shiftType: currentShiftInput.shiftType,
        testCodes: codes,
      }, {
        onSuccess: (invoice) => {
          setShowAdditionalTestsFor(null);
          setDrawerPatient(null);
          void trpcUtils.patients.workspace.invalidate();
          setToast(`حُفظت فاتورة المتابعة ${invoice.invoiceNumber} بقيمة ${formatCurrency(invoice.total)}`);
        },
        onError: (error) => setToast(`لم تُحفظ الفحوصات: ${error.message}`),
      });
      return;
    }
    const nextInvoice = getNextPatientIdentity(patients).invoice;
    const updatedPatient = createFollowUpInvoice(currentPatient, codes, nextInvoice);
    if (!updatedPatient) {
      setShowAdditionalTestsFor(null);
      return;
    }
    setPatients((current) => current.map((patient) => patient.id === patientId ? updatedPatient : patient));
    setDrawerPatient(updatedPatient);
    setShowAdditionalTestsFor(null);
    setToast(`وضع تجريبي فقط؛ لم تُحفظ فاتورة الفحوصات ${nextInvoice} في قاعدة البيانات`);
  };
  const handleMarkPaid = (patient: Patient) => {
    if (!canUseReception) {
      setToast("حسابك لا يملك صلاحية تحصيل الفواتير");
      return;
    }
    if (authQuery.data) {
      if (!hasOperationalRole || !workspaceQuery.isSuccess || !patient.databaseInvoiceId) {
        setToast("لم يُسجل الدفع؛ تعذر تأكيد اتصال قاعدة البيانات أو رقم الفاتورة");
        return;
      }
      paymentMutation.mutate({ invoiceId: patient.databaseInvoiceId, paymentMethod: "cash" }, {
        onSuccess: () => {
          void trpcUtils.patients.workspace.invalidate();
          setToast(`تم تحصيل الفاتورة ${patient.invoice} وتفعيل طلباتها المخبرية`);
        },
        onError: (error) => setToast(`لم يُسجل التحصيل: ${error.message}`),
      });
      return;
    }
    setPatients((current) => current.map((item) => item.id === patient.id
      ? { ...item, paid: true, status: item.tests.length > 0 ? "في المختبر" : "مكتملة" }
      : item));
    setDrawerPatient((current) => current?.id === patient.id
      ? { ...current, paid: true, status: current.tests.length > 0 ? "في المختبر" : "مكتملة" }
      : current);
    setToast(`وضع تجريبي فقط؛ لم يُحفظ تحصيل الفاتورة ${patient.invoice} في قاعدة البيانات`);
  };
  const handleNewPatient = (input: NewPatientInput) => {
    if (!canUseReception) {
      setToast("حسابك لا يملك صلاحية تسجيل المرضى");
      return;
    }
    if (authQuery.data) {
      if (!hasOperationalRole || !workspaceQuery.isSuccess) {
        setToast("لم يُحفظ التسجيل؛ تعذر تأكيد اتصال قاعدة البيانات أو صلاحية الحساب");
        return;
      }
      registerMutation.mutate({
        name: input.name,
        gender: input.gender === "أنثى" ? "female" : "male",
        age: input.age,
        phone: input.phone === "—" ? undefined : input.phone,
        address: input.address === "—" ? undefined : input.address,
        testCodes: input.tests,
        shiftDate: currentShiftInput.shiftDate,
        shiftType: currentShiftInput.shiftType,
      }, {
        onSuccess: (registration) => {
          setSelectedPatientId(registration.patientNumber);
          setShowPatientDialog(false);
          setActiveSection("billing");
          void trpcUtils.patients.workspace.invalidate();
          void trpcUtils.shifts.current.invalidate(currentShiftInput);
          setToast(`حُفظ تسجيل ${input.name} والوردية رقم ${String(registration.sequence).padStart(4, "0")} والفاتورة ${registration.invoiceNumber}`);
        },
        onError: (error) => setToast(`لم يُحفظ التسجيل: ${error.message}`),
      });
      return;
    }
    const now = new Date();
    const identity = getNextPatientIdentity(patients);
    const sequence = shiftSequences[shift] + 1;
    const patient: Patient = {
      ...input,
      ...identity,
      sequence,
      shift,
      registeredDate: getClinicDateKey(now),
      registeredAt: formatClinicTime(now),
      invoiceTests: [...input.tests],
      consultationIncluded: true,
      paid: false,
      status: "في الانتظار",
    };
    setPatients((current) => [patient, ...current]);
    setShiftSequences((current) => ({ ...current, [shift]: sequence }));
    setSelectedPatientId(patient.id);
    setShowPatientDialog(false);
    setToast(`وضع تجريبي فقط؛ لم يُحفظ تسجيل ${patient.name} في قاعدة البيانات`);
    setActiveSection("billing");
  };

  const renderSection = () => {
    if (!accessibleSections.includes(activeSection)) return <AccessDenied role={activeRole} section={activeSection} />;
    if (activeSection === "overview") return <Overview patients={patients} shift={shift} shiftSequence={shiftSequences[shift]} onNavigate={setActiveSection} onAddPatient={() => setShowPatientDialog(true)} onPrintReport={() => triggerPrint("report")} />;
    if (activeSection === "patients") return <Patients patients={patients} search={search} setSearch={setSearch} onAddPatient={() => setShowPatientDialog(true)} onSelectPatient={setDrawerPatient} onPrintInvoice={(patient) => { setSelectedPatientId(patient.id); triggerPrint("invoice", patient); }} />;
    if (activeSection === "billing") return <Billing patients={billingPatients} onAddPatient={() => setShowPatientDialog(true)} saving={paymentMutation.isPending} onMarkPaid={handleMarkPaid} onPrintInvoice={(patient) => { setSelectedPatientId(patient.id); triggerPrint("invoice", patient); }} />;
    if (activeSection === "lab") return <Lab patients={patients} selectedPatientId={selectedPatientId} setSelectedPatientId={(id) => { setSelectedPatientId(id); setSelectedTestCode(patients.find((patient) => patient.id === id)?.tests[0] ?? "CBC"); setResultDraft(results[`${id}-${patients.find((patient) => patient.id === id)?.tests[0] ?? "CBC"}`] ?? {}); }} selectedTestCode={selectedTestCode} setSelectedTestCode={changeTest} results={results} resultDraft={resultDraft} setResultDraft={setResultDraft} onSaveResult={handleSaveResult} savingResult={resultMutation.isPending} onPrintResult={() => triggerPrint("result")} />;
    if (activeSection === "tests") return <TestsCatalog onToast={setToast} prices={catalogPrices} />;
    if (activeSection === "reports") return <Reports patients={billingPatients} onPrintReport={(range) => triggerPrint("report", undefined, range)} />;
    return <Settings role={activeRole} setRole={setActiveRole} shift={shift} setShift={setShift} clinicName={clinicQuery.data?.name ?? "مستوصف بكّا الطبي الحديث"} clinicAddress={clinicQuery.data?.address ?? "الخرطوم بحري · السودان"} clinicPhone={clinicQuery.data?.phone ?? "011 234 5678 · 0912 440 218"} clinicEmail={clinicQuery.data?.email ?? "info@bakka-clinic.sd"} clinicWebsite={clinicQuery.data?.website ?? "www.bakka-clinic.sd"} clinicFooterText={clinicQuery.data?.footerText ?? "نتمنى لكم دوام الصحة والعافية. هذه النتيجة تعتمد على العينة والطريقة المعتمدة بالمختبر."} />;
  };

  if (isPrintView) return <PrintDocument mode={printMode as Exclude<PrintMode, null>} patient={printPatientSnapshot ?? selectedPatient} selectedTest={selectedTest} result={results[`${selectedPatient.id}-${selectedTest.code}`] ?? resultDraft} reportPatients={billingPatients} reportRange={printReportRange} clinicName={clinicQuery.data?.name ?? "مستوصف بكّا الطبي الحديث"} clinicAddress={clinicQuery.data?.address ?? "الخرطوم بحري"} clinicPhone={clinicQuery.data?.phone ?? "011 234 5678"} clinicWebsite={clinicQuery.data?.website ?? "www.bakka-clinic.sd"} clinicFooterText={clinicQuery.data?.footerText ?? "نتمنى لكم دوام الصحة والعافية"} clinicLogoUrl={clinicQuery.data?.logoUrl ?? "/logo.svg"} onClose={() => { setPrintMode(null); setPrintPatientSnapshot(null); }} />;

  return <div className="app-shell"><aside className={`sidebar ${mobileMenu ? "open" : ""}`}><div className="sidebar-top"><AppLogo /><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)}><X size={18} /></button></div><div className="clinic-status"><span className="live-dot" /><div><strong>{clinicQuery.data?.name ?? "مستوصف بكّا الطبي الحديث"}</strong><span>{persistenceLabel}</span></div></div><nav className="main-nav">{navItems.filter((item) => accessibleSections.includes(item.id)).map((item) => { const Icon = item.icon; return <button key={item.id} className={activeSection === item.id ? "active" : ""} onClick={() => { setActiveSection(item.id); setMobileMenu(false); }}><Icon size={18} /><span>{item.label}</span>{item.badge && <em>{item.id === "patients" ? patients.length : item.id === "lab" ? patients.reduce((sum, patient) => sum + patient.tests.length, 0) : item.badge}</em>}</button>; })}</nav><div className="sidebar-bottom"><div className="sidebar-help"><div className="help-icon"><ShieldCheck size={17} /></div><div><strong>بياناتك محمية</strong><span>{hasOperationalRole ? "جلسة تشغيل موثقة" : "بيانات العرض لا تُحفظ"}</span></div></div><button className="user-mini" onClick={() => setShowLoginPanel(true)}><div className="avatar">سم</div><div><strong>{authQuery.data?.name ?? "مستخدم العرض التجريبي"}</strong><span>{roleLabels[activeRole]} · تغيير الدخول</span></div><MoreHorizontal size={17} /></button></div></aside><main className="main-content"><header className="topbar"><div className="topbar-start"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)}><Menu size={19} /></button><div className="breadcrumb"><span>نظام المستوصف</span><ArrowLeft size={13} /><strong>{pageTitle}</strong></div></div><div className="topbar-actions"><div className="shift-switcher"><span className="shift-dot" /><select value={shift} onChange={(event) => setShift(event.target.value as Shift)}><option>صباحية</option><option>مسائية</option><option>سهرة</option></select><span className="shift-number">#{String(visibleShiftSequence).padStart(4, "0")}</span></div><div className="date-chip"><CalendarDays size={15} />{formatClinicDate()}</div><button className="icon-button notification-button"><Bell size={18} /><i /></button></div></header><div className="content-wrap"><div className="mobile-title-row"><AppLogo compact /><span className="mobile-page-title">{pageTitle}</span></div>{renderSection()}</div></main>{showPatientDialog && <PatientDialog onClose={() => setShowPatientDialog(false)} saving={registerMutation.isPending} prices={catalogPrices} onSave={handleNewPatient} />}{showLoginPanel && <LoginDialog activeRole={activeRole} onRoleChange={setActiveRole} onClose={() => setShowLoginPanel(false)} onToast={setToast} />}{drawerPatient && <PatientDrawer patient={drawerPatient} onClose={() => setDrawerPatient(null)} onPrintInvoice={() => { setSelectedPatientId(drawerPatient.id); setDrawerPatient(null); triggerPrint("invoice", drawerPatient); }} onPrintMedicalReport={() => { setSelectedPatientId(drawerPatient.id); setDrawerPatient(null); triggerPrint("patient-report", drawerPatient); }} onAddTests={() => setShowAdditionalTestsFor(drawerPatient)} onNavigate={setActiveSection} />}{showAdditionalTestsFor && <AdditionalTestsDialog patient={showAdditionalTestsFor} onClose={() => setShowAdditionalTestsFor(null)} saving={followUpMutation.isPending} prices={catalogPrices} onSave={(codes) => handleAddTests(showAdditionalTestsFor.id, codes)} />}{toast && <div className="toast"><BadgeCheck size={17} /><span>{toast}</span><button onClick={() => setToast("")}><X size={14} /></button></div>}</div>;
}
