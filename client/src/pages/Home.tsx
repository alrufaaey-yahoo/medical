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
import { useEffect, useMemo, useState } from "react";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

type Section = "overview" | "patients" | "billing" | "lab" | "tests" | "reports" | "settings";
type Role = "supervisor" | "cashier" | "lab" | "admin";
type Shift = "صباحية" | "مسائية" | "سهرة";
type PrintMode = "invoice" | "result" | "report" | null;

type Patient = {
  id: string;
  name: string;
  gender: "ذكر" | "أنثى";
  age: number;
  phone: string;
  address: string;
  tests: string[];
  invoice: string;
  paid: boolean;
  status: "في الانتظار" | "في المختبر" | "مكتملة";
  registeredAt: string;
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
const formatDate = () => "السبت، 21 نوفمبر 2026";
const initials = (name: string) => name.split(" ").slice(0, 2).map((part) => part[0]).join("");

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

function Overview({ patients, onNavigate, onAddPatient, onPrintReport }: { patients: Patient[]; onNavigate: (section: Section) => void; onAddPatient: () => void; onPrintReport: () => void }) {
  const pendingCount = patients.filter((patient) => patient.status === "في المختبر").length;
  const unpaidCount = patients.filter((patient) => !patient.paid).length;
  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="تشغيل اليوم · الوردية المسائية"
        title="صباحك منظم يا مشرف"
        description="هنا ملخص حركة المستوصف، المدفوعات، وحالة المختبر في لمحة واحدة."
        action={<div className="heading-actions"><button className="button button-secondary" onClick={onPrintReport}><Download size={16} />تقرير اليوم</button><button className="button button-primary" onClick={onAddPatient}><UserPlus size={16} />تسجيل مريض</button></div>}
      />

      <div className="metric-grid">
        <div className="metric-card accent-teal"><div className="metric-icon"><Users size={19} /></div><span>مراجعو اليوم</span><strong>28</strong><small><span className="positive">+12%</span> مقارنة بالأمس</small></div>
        <div className="metric-card accent-blue"><div className="metric-icon"><CreditCard size={19} /></div><span>إيرادات اليوم</span><strong>684,000 <small>ج.س</small></strong><small><span className="positive">+8.4%</span> عن المتوسط</small></div>
        <div className="metric-card accent-amber"><div className="metric-icon"><FlaskConical size={19} /></div><span>طلبات المختبر</span><strong>{pendingCount + 5}</strong><small><span className="warning-text">{pendingCount} قيد التنفيذ</span> الآن</small></div>
        <div className="metric-card accent-rose"><div className="metric-icon"><Clock3 size={19} /></div><span>بانتظار التحصيل</span><strong>{unpaidCount + 3}</strong><small><span className="danger-text">يحتاج متابعة</span> قبل نهاية الوردية</small></div>
      </div>

      <div className="overview-grid">
        <section className="panel large-panel">
          <div className="panel-header"><div><span className="eyebrow">الحركة المباشرة</span><h2>مسار المرضى اليوم</h2></div><button className="link-button" onClick={() => onNavigate("patients")}>عرض الكل <ArrowLeft size={15} /></button></div>
          <div className="flow-strip">
            <div className="flow-node done"><div className="flow-icon"><UserPlus size={17} /></div><div><strong>التسجيل</strong><span>28 مريض</span></div></div>
            <div className="flow-line active" />
            <div className="flow-node current"><div className="flow-icon"><Stethoscope size={17} /></div><div><strong>الاستقبال</strong><span>9 بانتظار الدفع</span></div></div>
            <div className="flow-line active" />
            <div className="flow-node current"><div className="flow-icon"><Beaker size={17} /></div><div><strong>المختبر</strong><span>{pendingCount} عينات</span></div></div>
            <div className="flow-line" />
            <div className="flow-node"><div className="flow-icon"><FileCheck2 size={17} /></div><div><strong>النتائج</strong><span>16 جاهزة</span></div></div>
          </div>
          <div className="table-wrap compact-table"><table><thead><tr><th>المريض</th><th>الطلب</th><th>الوردية</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>{patients.slice(0, 4).map((patient) => <tr key={patient.id}><td><div className="person-cell"><div className="avatar">{initials(patient.name)}</div><div><strong>{patient.name}</strong><span>{patient.id} · {patient.gender}</span></div></div></td><td><strong>{patient.tests.join("، ")}</strong><span className="muted-line">{patient.tests.length} فحوصات</span></td><td><span className="shift-label">مسائية</span></td><td><StatusPill status={patient.status} /></td><td className="muted-cell">{patient.registeredAt}</td></tr>)}</tbody></table></div>
        </section>

        <section className="panel shift-panel">
          <div className="panel-header"><div><span className="eyebrow">تتبع الوردية</span><h2>الوردية المسائية</h2></div><span className="live-dot">مباشر</span></div>
          <div className="shift-summary"><div><span>رقم البداية</span><strong>0001</strong></div><div><span>المريض الحالي</span><strong>0028</strong></div><div><span>المتبقي</span><strong>22</strong></div></div>
          <div className="timeline"><div className="timeline-row"><span className="timeline-dot completed" /><div><strong>بدأت الوردية</strong><span>02:00 م · بواسطة أ. سلمى</span></div><b>تم</b></div><div className="timeline-row"><span className="timeline-dot completed" /><div><strong>تسليم الصندوق</strong><span>02:12 م · 120,000 ج.س</span></div><b>تم</b></div><div className="timeline-row"><span className="timeline-dot active" /><div><strong>التشغيل الحالي</strong><span>آخر تحديث منذ دقيقتين</span></div><b>الآن</b></div><div className="timeline-row"><span className="timeline-dot" /><div><strong>إغلاق الوردية</strong><span>متوقع 10:00 م</span></div><b>—</b></div></div>
          <button className="button button-soft full-width" onClick={() => onNavigate("reports")}><FileBarChart size={16} />عرض ملخص الوردية</button>
        </section>
      </div>

      <div className="bottom-grid">
        <section className="panel alert-panel"><div className="panel-header"><div><span className="eyebrow">يحتاج انتباه</span><h2>تنبيهات التشغيل</h2></div><Bell size={19} className="muted-icon" /></div><div className="alert-item"><div className="alert-icon amber"><AlertCircle size={16} /></div><div><strong>3 فواتير غير مكتملة</strong><span>مرضى بانتظار التحصيل قبل تحويلهم للمختبر.</span></div><button className="icon-button" onClick={() => onNavigate("billing")}><ArrowLeft size={15} /></button></div><div className="alert-item"><div className="alert-icon blue"><TestTube2 size={16} /></div><div><strong>7 طلبات مختبر جديدة</strong><span>أكمل إدخال نتائج CBC وBFFM أولًا.</span></div><button className="icon-button" onClick={() => onNavigate("lab")}><ArrowLeft size={15} /></button></div></section>
        <section className="panel quick-panel"><div className="panel-header"><div><span className="eyebrow">اختصارات</span><h2>إجراءات سريعة</h2></div><MoreHorizontal size={19} className="muted-icon" /></div><div className="quick-actions"><button onClick={onAddPatient}><span className="quick-icon teal"><UserPlus size={17} /></span><span><strong>مريض جديد</strong><small>فتح سجل وفاتورة</small></span><ArrowLeft size={15} /></button><button onClick={() => onNavigate("lab")}><span className="quick-icon blue"><FlaskConical size={17} /></span><span><strong>نتيجة مختبر</strong><small>إدخال وطباعة</small></span><ArrowLeft size={15} /></button><button onClick={() => onNavigate("tests")}><span className="quick-icon amber"><PackageCheck size={17} /></span><span><strong>تعديل الأسعار</strong><small>كتالوج الفحوصات</small></span><ArrowLeft size={15} /></button></div></section>
      </div>
    </div>
  );
}

function Patients({ patients, search, setSearch, onAddPatient, onSelectPatient, onPrintInvoice }: { patients: Patient[]; search: string; setSearch: (value: string) => void; onAddPatient: () => void; onSelectPatient: (patient: Patient) => void; onPrintInvoice: (patient: Patient) => void }) {
  const filtered = patients.filter((patient) => `${patient.name} ${patient.id} ${patient.phone}`.includes(search));
  return <div className="page-stack"><SectionTitle eyebrow="السجلات · 28 اليوم" title="المرضى والمراجعين" description="ابحث في سجلات الوردية، راجع مسار المريض، وأنشئ فاتورة جديدة من نفس المكان." action={<button className="button button-primary" onClick={onAddPatient}><UserPlus size={16} />تسجيل مريض جديد</button>} /><div className="toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو رقم الملف أو الهاتف" /></div><div className="toolbar-filters"><button className="filter-button active">كل المرضى <span>28</span></button><button className="filter-button">في المختبر <span>7</span></button><button className="filter-button">مكتملة <span>16</span></button></div></div><section className="panel"><div className="table-wrap"><table><thead><tr><th>المريض</th><th>النوع / العمر</th><th>الفحوصات</th><th>الدفع</th><th>الحالة</th><th>التسجيل</th><th /></tr></thead><tbody>{filtered.map((patient) => <tr key={patient.id} className="clickable-row" onClick={() => onSelectPatient(patient)}><td><div className="person-cell"><div className={`avatar ${patient.gender === "أنثى" ? "female" : ""}`}>{initials(patient.name)}</div><div><strong>{patient.name}</strong><span>{patient.id} · {patient.phone}</span></div></div></td><td><strong>{patient.gender}</strong><span className="muted-line">{patient.age} سنة</span></td><td><div className="test-tags">{patient.tests.map((test) => <span key={test}>{test}</span>)}</div><span className="muted-line">{patient.tests.length} فحوصات</span></td><td><span className={`payment-label ${patient.paid ? "paid" : "unpaid"}`}>{patient.paid ? "مدفوعة" : "غير مكتملة"}</span></td><td><StatusPill status={patient.status} /></td><td className="muted-cell">{patient.registeredAt}</td><td><button className="row-menu" onClick={(event) => { event.stopPropagation(); onPrintInvoice(patient); }}><Printer size={16} /></button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state"><Search size={22} /><strong>لا توجد نتائج مطابقة</strong><span>جرّب اسمًا أو رقم ملف مختلفًا.</span></div>}</div></section></div>;
}

function Billing({ patients, onPrintInvoice }: { patients: Patient[]; onPrintInvoice: (patient: Patient) => void }) {
  const total = patients.length * 18000 + 180000;
  return <div className="page-stack"><SectionTitle eyebrow="الاستقبال والتحصيل" title="الفواتير والتحصيل" description="تذكرة الاستقبال، مقابلة الطبيب، والفحوصات اللاحقة في سجل مالي واحد." action={<button className="button button-primary"><Plus size={16} />فاتورة جديدة</button>} /><div className="billing-summary"><div><span>إجمالي اليوم</span><strong>{formatCurrency(total)}</strong><small>28 فاتورة</small></div><div><span>تم التحصيل</span><strong className="teal-text">{formatCurrency(total - 54000)}</strong><small>25 فاتورة مكتملة</small></div><div><span>بانتظار التحصيل</span><strong className="amber-text">{formatCurrency(54000)}</strong><small>3 فواتير تحتاج متابعة</small></div><div><span>متوسط الفاتورة</span><strong>{formatCurrency(24428)}</strong><small>هذا الشهر</small></div></div><section className="panel"><div className="panel-header"><div><span className="eyebrow">آخر الفواتير</span><h2>حركة الاستقبال</h2></div><div className="table-actions"><button className="filter-button active">اليوم</button><button className="filter-button">هذا الشهر</button></div></div><div className="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>المريض</th><th>الخدمات</th><th>الإجمالي</th><th>طريقة الدفع</th><th>الحالة</th><th /></tr></thead><tbody>{patients.map((patient, index) => { const invoiceTotal = patient.tests.reduce((sum, test) => sum + (labTests.find((item) => item.code === test)?.price ?? 0), 0) + (index % 2 === 0 ? 35000 : 0); return <tr key={patient.invoice}><td><strong className="mono">{patient.invoice}</strong><span className="muted-line">21 نوفمبر · {patient.registeredAt}</span></td><td><div className="person-cell"><div className="avatar small">{initials(patient.name)}</div><strong>{patient.name}</strong></div></td><td><div className="test-tags">{patient.tests.map((test) => <span key={test}>{test}</span>)}</div></td><td><strong>{formatCurrency(invoiceTotal)}</strong></td><td><span className="cash-label"><WalletCards size={14} />نقدي</span></td><td><span className={`payment-label ${patient.paid ? "paid" : "unpaid"}`}>{patient.paid ? "مكتملة" : "بانتظار الدفع"}</span></td><td><button className="row-menu" onClick={() => onPrintInvoice(patient)}><Printer size={16} /></button></td></tr>; })}</tbody></table></div></section></div>;
}

function Lab({ patients, selectedPatientId, setSelectedPatientId, selectedTestCode, setSelectedTestCode, results, resultDraft, setResultDraft, onSaveResult, onPrintResult }: { patients: Patient[]; selectedPatientId: string; setSelectedPatientId: (id: string) => void; selectedTestCode: string; setSelectedTestCode: (code: string) => void; results: Record<string, FieldValue>; resultDraft: FieldValue; setResultDraft: (draft: FieldValue) => void; onSaveResult: () => void; onPrintResult: () => void }) {
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) ?? patients[0];
  const selectedTest = labTests.find((test) => test.code === selectedTestCode) ?? labTests[0];
  const testList = selectedPatient ? selectedPatient.tests.map((code) => labTests.find((test) => test.code === code)).filter(Boolean) as LabTest[] : [];
  const savedKey = `${selectedPatient?.id}-${selectedTest?.code}`;
  const hasSavedResult = Boolean(results[savedKey]);
  return <div className="page-stack"><SectionTitle eyebrow="مختبر بكّا · قائمة العمل" title="محطة المختبر" description="لا يمكن إصدار النتيجة قبل اكتمال الدفع. راجع المدى المرجعي حسب جنس المريض قبل الحفظ والطباعة." action={<div className="lab-status"><span className="live-dot">مفتوح</span><span>فني الوردية: أ. سامر</span></div>} /><div className="lab-layout"><section className="panel lab-queue"><div className="panel-header"><div><span className="eyebrow">7 طلبات اليوم</span><h2>قائمة العينات</h2></div><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="lab-search"><Search size={16} /><input placeholder="ابحث عن مريض..." /></div><div className="queue-list">{patients.map((patient) => <button key={patient.id} className={`queue-item ${patient.id === selectedPatient.id ? "active" : ""}`} onClick={() => { setSelectedPatientId(patient.id); setSelectedTestCode(patient.tests[0]); }}><div className="queue-avatar">{initials(patient.name)}</div><div className="queue-main"><strong>{patient.name}</strong><span>{patient.id} · {patient.tests.join("، ")}</span></div><div className="queue-side"><span className={`queue-status ${patient.paid ? "paid" : "blocked"}`}>{patient.paid ? "مدفوع" : "معلّق"}</span><small>{patient.registeredAt}</small></div></button>)}</div></section><section className="panel result-panel"><div className="result-header"><div className="patient-banner"><div className="avatar large">{initials(selectedPatient.name)}</div><div><span className="eyebrow">ملف المريض · {selectedPatient.id}</span><h2>{selectedPatient.name}</h2><p>{selectedPatient.age} سنة · {selectedPatient.gender} · {selectedPatient.address}</p></div></div><div className="result-actions"><button className="button button-secondary" disabled={!selectedPatient.paid} onClick={onPrintResult}><Printer size={16} />طباعة A4</button><button className="button button-primary" disabled={!selectedPatient.paid} onClick={onSaveResult}><BadgeCheck size={16} />حفظ النتيجة</button></div></div><div className="result-meta"><div><span>رقم العينة</span><strong>S-260028</strong></div><div><span>تاريخ السحب</span><strong>21 نوفمبر 2026</strong></div><div><span>الطبيب المحوّل</span><strong>مقابلة عامة</strong></div><div><span>حالة الدفع</span><strong className={selectedPatient.paid ? "teal-text" : "amber-text"}>{selectedPatient.paid ? "مكتملة" : "معلّقة"}</strong></div></div>{!selectedPatient.paid && <div className="locked-banner"><ShieldCheck size={18} /><div><strong>النتيجة محمية حتى اكتمال الدفع</strong><span>أكمل التحصيل من قسم الفواتير أولًا، ثم سيصبح الحفظ والطباعة متاحين لفني المختبر.</span></div></div>}<div className="test-tabs">{testList.map((test) => <button key={test.code} className={test.code === selectedTest.code ? "active" : ""} onClick={() => { setSelectedTestCode(test.code); setResultDraft(results[`${selectedPatient.id}-${test.code}`] ?? {}); }}><span>{test.code}</span>{results[`${selectedPatient.id}-${test.code}`] ? <BadgeCheck size={14} /> : <span className="tab-dot" />}</button>)}</div><div className="test-form-head"><div><span className="eyebrow">{selectedTest.category} · {selectedTest.sample}</span><h3>{selectedTest.name} <span>{selectedTest.english}</span></h3></div><span className="reference-note">المدى المرجعي يتبع {selectedPatient.gender}</span></div>{selectedTest.code === "CBC" ? <div className="cbc-sections"><div className="cbc-group"><h4>مؤشرات كريات الدم البيضاء</h4><div className="field-grid">{selectedTest.fields.slice(0, 6).map((field) => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={(value) => setResultDraft({ ...resultDraft, [field.key]: value })} />)}</div></div><div className="cbc-group"><h4>مؤشرات كريات الدم الحمراء</h4><div className="field-grid">{selectedTest.fields.slice(6, 13).map((field) => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={(value) => setResultDraft({ ...resultDraft, [field.key]: value })} />)}</div></div><div className="cbc-group"><h4>الصفائح الدموية</h4><div className="field-grid two-cols">{selectedTest.fields.slice(13).map((field) => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={(value) => setResultDraft({ ...resultDraft, [field.key]: value })} />)}</div></div><label className="form-field full-field"><span>ملاحظات المختبر</span><textarea rows={3} value={resultDraft.remarks ?? ""} onChange={(event) => setResultDraft({ ...resultDraft, remarks: event.target.value })} placeholder="أضف ملاحظات فني المختبر هنا..." /></label></div> : <div className="generic-result-grid">{selectedTest.fields.map((field) => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={(value) => setResultDraft({ ...resultDraft, [field.key]: value })} />)}<label className="form-field full-field"><span>ملاحظات / Remarks</span><textarea rows={4} value={resultDraft.remarks ?? ""} onChange={(event) => setResultDraft({ ...resultDraft, remarks: event.target.value })} placeholder="أضف ملاحظات الفحص..." /></label></div>}<div className="lab-footer-note"><AlertCircle size={15} /><span>هذه المديات مثال قابل للتهيئة. يعتمد الإصدار النهائي على جهاز المختبر والطريقة والعمر والجنس والحالة السريرية.</span><span className="saved-indicator">{hasSavedResult ? "آخر حفظ: منذ 3 دقائق" : "مسودة غير محفوظة"}</span></div></section></div></div>;
}

function ResultField({ field, gender, value, onChange }: { field: TestField; gender: Patient["gender"]; value: string; onChange: (value: string) => void }) {
  return <label className="form-field"><span>{field.label}{field.unit && <em>{field.unit}</em>}</span><div className="result-input-wrap"><input type={field.type === "number" ? "number" : "text"} value={value} onChange={(event) => onChange(event.target.value)} placeholder="—" /><span className="range-chip">{gender === "ذكر" ? field.male : field.female}</span></div></label>;
}

function TestsCatalog({ onToast }: { onToast: (message: string) => void }) {
  const [category, setCategory] = useState("الكل");
  const categories = ["الكل", ...Array.from(new Set(labTests.map((test) => test.category)))];
  const visibleTests = category === "الكل" ? labTests : labTests.filter((test) => test.category === category);
  return <div className="page-stack"><SectionTitle eyebrow="الإدارة · التسعير" title="كتالوج الفحوصات" description="أضف أي فحص جديد أو عدّل السعر والحقول والمديات المرجعية الخاصة بالذكر والأنثى." action={<button className="button button-primary" onClick={() => onToast("تم فتح نموذج إضافة فحص جديد") }><Plus size={16} />إضافة فحص</button>} /><div className="catalog-toolbar"><div className="category-tabs">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="catalog-count"><TestTube2 size={16} />{visibleTests.length} فحوصات معروضة</div></div><div className="catalog-grid">{visibleTests.map((test) => <article className="test-card" key={test.code}><div className="test-card-top"><span className="test-code">{test.code}</span><button className="row-menu"><MoreHorizontal size={16} /></button></div><h3>{test.name}</h3><p>{test.english}</p><div className="test-card-meta"><span><Beaker size={14} />{test.sample}</span><span><Clock3 size={14} />{test.turnaround}</span></div><div className="test-card-bottom"><strong>{formatCurrency(test.price)}</strong><span>{test.fields.length} حقول نتيجة</span></div></article>)}</div></div>;
}

function Reports({ onPrintReport }: { onPrintReport: () => void }) {
  return <div className="page-stack"><SectionTitle eyebrow="تحليل التشغيل" title="التقارير والمتابعة" description="ملخصات يومية وشهرية تساعد المشرف على فهم الحركة والتسعير ومعدل إنجاز المختبر." action={<button className="button button-secondary" onClick={onPrintReport}><Printer size={16} />طباعة التقرير</button>} /><div className="report-layout"><section className="panel report-chart"><div className="panel-header"><div><span className="eyebrow">آخر 7 أيام</span><h2>الإيرادات اليومية</h2></div><button className="filter-button active">هذا الأسبوع <ChevronDown size={14} /></button></div><div className="chart-area"><div className="chart-y"><span>200k</span><span>150k</span><span>100k</span><span>50k</span><span>0</span></div><div className="bars">{[["15", 52], ["16", 67], ["17", 48], ["18", 74], ["19", 58], ["20", 82], ["21", 68]].map(([day, height]) => <div className="bar-column" key={day}><div className="bar-value">{height === 82 ? "184k" : ""}</div><div className={`chart-bar ${height === 82 ? "highlight" : ""}`} style={{ height: `${height}%` }} /><span>{day} نوفمبر</span></div>)}</div></div></section><section className="panel report-breakdown"><div className="panel-header"><div><span className="eyebrow">توزيع الفحوصات</span><h2>الأكثر طلبًا</h2></div><Activity size={19} className="muted-icon" /></div><div className="breakdown-list"><div><div className="breakdown-label"><span className="legend teal" />CBC <strong>38%</strong></div><div className="progress"><i style={{ width: "38%" }} /></div></div><div><div className="breakdown-label"><span className="legend blue" />BFFM <strong>24%</strong></div><div className="progress"><i className="blue" style={{ width: "24%" }} /></div></div><div><div className="breakdown-label"><span className="legend amber" />السكر التراكمي <strong>18%</strong></div><div className="progress"><i className="amber" style={{ width: "18%" }} /></div></div><div><div className="breakdown-label"><span className="legend rose" />أخرى <strong>20%</strong></div><div className="progress"><i className="rose" style={{ width: "20%" }} /></div></div></div><div className="report-total"><span>إجمالي الفحوصات</span><strong>186 <small>فحص</small></strong></div></section></div><section className="panel"><div className="panel-header"><div><span className="eyebrow">سجل التقارير</span><h2>التقارير الجاهزة</h2></div><button className="link-button">إدارة القوالب <ArrowLeft size={15} /></button></div><div className="report-rows"><div><div className="report-file"><div className="file-icon teal"><FileText size={17} /></div><span><strong>تقرير الوردية المسائية</strong><small>21 نوفمبر 2026 · 28 مريضًا</small></span></div><span className="ready-label">جاهز للطباعة</span><button className="row-menu" onClick={onPrintReport}><Printer size={16} /></button></div><div><div className="report-file"><div className="file-icon blue"><FileText size={17} /></div><span><strong>تقرير المختبر اليومي</strong><small>21 نوفمبر 2026 · 42 نتيجة</small></span></div><span className="ready-label">جاهز للطباعة</span><button className="row-menu" onClick={onPrintReport}><Printer size={16} /></button></div><div><div className="report-file"><div className="file-icon amber"><FileText size={17} /></div><span><strong>ملخص شهر نوفمبر</strong><small>01 – 21 نوفمبر 2026</small></span></div><span className="draft-label">قيد المراجعة</span><button className="row-menu"><ArrowLeft size={16} /></button></div></div></section></div>;
}

function Settings({ role, setRole, shift, setShift }: { role: Role; setRole: (role: Role) => void; shift: Shift; setShift: (shift: Shift) => void }) {
  return <div className="page-stack"><SectionTitle eyebrow="الإدارة والهوية" title="إعدادات المستوصف" description="تحكم في بيانات المنشأة، المستخدمين، الورديات، والتسعير من لوحة واحدة." action={<button className="button button-primary"><ShieldCheck size={16} />حفظ التغييرات</button>} /><div className="settings-grid"><section className="panel settings-main"><div className="settings-section"><div className="panel-header"><div><span className="eyebrow">هوية المنشأة</span><h2>بيانات المستوصف</h2></div><span className="saved-badge">مفعّلة</span></div><div className="settings-form"><label className="form-field"><span>اسم المستوصف</span><input defaultValue="مستوصف بكّا الطبي الحديث" /></label><label className="form-field"><span>العنوان</span><input defaultValue="الخرطوم بحري · السودان" /></label><label className="form-field"><span>هاتف التواصل</span><input defaultValue="011 234 5678 · 0912 440 218" /></label><label className="form-field"><span>البريد الإلكتروني</span><input defaultValue="info@bakka-clinic.sd" /></label><label className="form-field full-field"><span>رسالة أسفل التقرير</span><textarea rows={3} defaultValue="نتمنى لكم دوام الصحة والعافية. هذه النتيجة تعتمد على العينة والطريقة المعتمدة بالمختبر." /></label></div></div><div className="settings-section border-top"><div className="panel-header"><div><span className="eyebrow">الوردية الحالية</span><h2>توزيع التشغيل</h2></div><CalendarDays size={19} className="muted-icon" /></div><div className="shift-picker">{(["صباحية", "مسائية", "سهرة"] as Shift[]).map((item) => <button key={item} className={shift === item ? "active" : ""} onClick={() => setShift(item)}><span>{item}</span><small>{item === "صباحية" ? "08:00 – 14:00" : item === "مسائية" ? "14:00 – 22:00" : "22:00 – 08:00"}</small></button>)}</div></div></section><aside className="settings-side"><section className="panel role-card"><div className="panel-header"><div><span className="eyebrow">الصلاحيات</span><h2>دور المستخدم</h2></div><ShieldCheck size={19} className="muted-icon" /></div><div className="role-select"><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={15} /></div><p>{roleDescriptions[role]}</p><div className="role-permissions"><span><BadgeCheck size={14} />مشاهدة لوحة التشغيل</span><span><BadgeCheck size={14} />طباعة المستندات</span><span><BadgeCheck size={14} />سجل نشاط واضح</span></div></section><section className="panel info-card"><div className="info-icon"><ShieldCheck size={19} /></div><strong>البيانات الصحية محمية</strong><p>لا تظهر نتائج المرضى إلا للمستخدمين المصرح لهم، ولا يمكن للمختبر إصدار نتيجة قبل اكتمال الدفع.</p></section></aside></div></div>;
}

function PatientDialog({ onClose, onSave }: { onClose: () => void; onSave: (patient: Patient) => void }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Patient["gender"]>("ذكر");
  const [age, setAge] = useState("30");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [tests, setTests] = useState<string[]>(["CBC"]);
  const toggleTest = (code: string) => setTests((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">استقبال جديد</span><h2>تسجيل مريض وإصدار فاتورة</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="modal-body"><div className="form-grid"><label className="form-field full-field"><span>اسم المريض <b>*</b></span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="مثال: محمد أحمد" /></label><label className="form-field"><span>الجنس <b>*</b></span><select value={gender} onChange={(event) => setGender(event.target.value as Patient["gender"])}><option>ذكر</option><option>أنثى</option></select></label><label className="form-field"><span>العمر</span><input type="number" value={age} onChange={(event) => setAge(event.target.value)} /></label><label className="form-field"><span>رقم الهاتف</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09xx xxx xxx" /></label><label className="form-field"><span>العنوان</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="الحي / المدينة" /></label></div><div className="modal-subsection"><div><span className="eyebrow">الخدمة الأولى</span><h3>حدد الفحوصات المطلوبة</h3></div><div className="test-picker">{labTests.slice(0, 8).map((test) => <button key={test.code} className={tests.includes(test.code) ? "selected" : ""} onClick={() => toggleTest(test.code)}><span>{test.code}</span><small>{formatCurrency(test.price)}</small></button>)}</div></div><div className="invoice-preview"><div><span>إجمالي الفحوصات</span><strong>{tests.length} فحص</strong></div><strong>{formatCurrency(tests.reduce((sum, code) => sum + (labTests.find((test) => test.code === code)?.price ?? 0), 0) + 35000)}</strong></div></div><div className="modal-footer"><button className="button button-secondary" onClick={onClose}>إلغاء</button><button className="button button-primary" disabled={!name.trim()} onClick={() => onSave({ id: "P-1043", name: name.trim(), gender, age: Number(age) || 0, phone: phone || "—", address: address || "—", tests, invoice: "INV-260022", paid: false, status: "في الانتظار", registeredAt: "الآن" })}><ReceiptText size={16} />حفظ وطباعة التذكرة</button></div></div></div>;
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

function PatientDrawer({ patient, onClose, onPrintInvoice, onNavigate }: { patient: Patient; onClose: () => void; onPrintInvoice: () => void; onNavigate: (section: Section) => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="patient-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">سجل المريض</span><h2>{patient.name}</h2><span>{patient.id} · {patient.gender} · {patient.age} سنة</span></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="drawer-body"><div className="drawer-profile"><div className="avatar large">{initials(patient.name)}</div><div><strong>{patient.phone}</strong><span>{patient.address}</span><StatusPill status={patient.status} /></div></div><div className="drawer-section"><span className="eyebrow">رحلة المريض</span><div className="patient-journey"><div className="journey-step done"><span><BadgeCheck size={14} /></span><div><strong>تم التسجيل</strong><small>21 نوفمبر · {patient.registeredAt}</small></div></div><div className="journey-step done"><span><CreditCard size={14} /></span><div><strong>{patient.paid ? "تم التحصيل" : "بانتظار التحصيل"}</strong><small>{patient.invoice}</small></div></div><div className={`journey-step ${patient.status === "في المختبر" ? "active" : ""}`}><span><FlaskConical size={14} /></span><div><strong>المختبر</strong><small>{patient.tests.length} فحوصات مرتبطة</small></div></div><div className="journey-step"><span><FileCheck2 size={14} /></span><div><strong>إصدار النتيجة</strong><small>بعد اكتمال الفحص</small></div></div></div></div><div className="drawer-section"><div className="drawer-section-head"><span className="eyebrow">الفحوصات المطلوبة</span><button className="link-button">إضافة <Plus size={14} /></button></div><div className="drawer-tests">{patient.tests.map((code) => { const test = labTests.find((item) => item.code === code); return <div key={code}><div className="test-code">{code}</div><div><strong>{test?.name}</strong><span>{test?.sample}</span></div><BadgeCheck size={16} className="teal-text" /></div>; })}</div></div></div><div className="drawer-footer"><button className="button button-secondary" onClick={onPrintInvoice}><Printer size={16} />طباعة الفاتورة</button><button className="button button-primary" onClick={() => { onNavigate("lab"); onClose(); }}><FlaskConical size={16} />فتح في المختبر</button></div></aside></div>;
}

function PrintDocument({ mode, patient, selectedTest, result, onClose }: { mode: Exclude<PrintMode, null>; patient: Patient; selectedTest: LabTest; result: FieldValue; onClose: () => void }) {
  if (mode === "invoice") return <div className="print-doc thermal-doc"><div className="print-brand"><img src="/logo.svg" alt="" /><div><strong>مستوصف بكّا الطبي الحديث</strong><span>الخرطوم بحري · 011 234 5678</span></div></div><div className="print-rule" /><div className="print-center"><strong>تذكرة استقبال</strong><span>{patient.invoice}</span></div><div className="print-info"><div><span>المريض</span><strong>{patient.name}</strong></div><div><span>الملف</span><strong>{patient.id}</strong></div><div><span>الجنس</span><strong>{patient.gender}</strong></div><div><span>التاريخ</span><strong>21/11/2026 · مسائية</strong></div></div><div className="print-table"><div className="print-row print-head"><span>الخدمة</span><span>السعر</span></div>{patient.tests.map((code) => { const test = labTests.find((item) => item.code === code); return <div className="print-row" key={code}><span>{code} · {test?.name}</span><span>{formatCurrency(test?.price ?? 0)}</span></div>; })}<div className="print-row"><span>مقابلة عامة</span><span>{formatCurrency(35000)}</span></div></div><div className="print-total"><span>الإجمالي</span><strong>{formatCurrency(patient.tests.reduce((sum, code) => sum + (labTests.find((test) => test.code === code)?.price ?? 0), 0) + 35000)}</strong></div><div className="print-footer">نتمنى لكم دوام الصحة والعافية<br />www.bakka-clinic.sd</div><button className="screen-close-print" onClick={onClose}>العودة للنظام</button></div>;
  if (mode === "result") return <div className="print-doc a4-doc"><div className="a4-header"><div className="print-brand"><img src="/logo.svg" alt="" /><div><strong>مستوصف بكّا الطبي الحديث</strong><span>قسم المختبر · نتيجة فحص مخبري</span></div></div><div className="report-meta"><strong>{selectedTest.code}</strong><span>رقم العينة: S-260028</span></div></div><div className="print-rule" /><div className="patient-print-grid"><div><span>اسم المريض</span><strong>{patient.name}</strong></div><div><span>رقم الملف</span><strong>{patient.id}</strong></div><div><span>العمر / الجنس</span><strong>{patient.age} سنة · {patient.gender}</strong></div><div><span>التاريخ</span><strong>21 / 11 / 2026 · 02:42 م</strong></div><div><span>نوع العينة</span><strong>{selectedTest.sample}</strong></div><div><span>الطبيب المحوّل</span><strong>مقابلة عامة</strong></div></div><div className="result-print-title"><span>{selectedTest.category}</span><h1>{selectedTest.name}</h1><p>{selectedTest.english}</p></div><table className="result-print-table"><thead><tr><th>الفحص</th><th>النتيجة</th><th>الوحدة</th><th>المدى المرجعي ({patient.gender})</th></tr></thead><tbody>{selectedTest.fields.map((field) => <tr key={field.key}><td>{field.label}</td><td><strong>{result[field.key] || "—"}</strong></td><td>{field.unit || "—"}</td><td>{patient.gender === "ذكر" ? field.male : field.female}</td></tr>)}</tbody></table><div className="remarks-print"><strong>ملاحظات / Remarks</strong><p>{result.remarks || "لا توجد ملاحظات إضافية."}</p></div><div className="signature-row"><div><span>اسم فني المختبر</span><strong>أ. سامر عبد القادر</strong></div><div><span>التوقيع والختم</span><strong>________________</strong></div></div><div className="a4-footer"><span>هذه النتيجة للاستخدام الطبي المعتمد فقط، وتُفسّر مع الحالة السريرية.</span><span>صفحة 1 من 1 · مستوصف بكّا الطبي الحديث</span></div><button className="screen-close-print" onClick={onClose}>العودة للنظام</button></div>;
  return <div className="print-doc a4-doc report-print"><div className="a4-header"><div className="print-brand"><img src="/logo.svg" alt="" /><div><strong>مستوصف بكّا الطبي الحديث</strong><span>تقرير تشغيل الوردية المسائية</span></div></div><div className="report-meta"><strong>21 نوفمبر 2026</strong><span>الفترة: 02:00 م – الآن</span></div></div><div className="print-rule" /><div className="result-print-title"><span>ملخص المشرف</span><h1>تقرير حركة المستوصف اليومي</h1><p>نظرة تشغيلية على المرضى والفواتير ونتائج المختبر</p></div><div className="report-print-cards"><div><span>المراجعون</span><strong>28</strong></div><div><span>الفواتير المكتملة</span><strong>25</strong></div><div><span>طلبات المختبر</span><strong>42</strong></div><div><span>الإيرادات</span><strong>684,000 ج.س</strong></div></div><h3 className="print-subtitle">تفاصيل آخر حركة</h3><table className="result-print-table"><thead><tr><th>الملف</th><th>المريض</th><th>الخدمات</th><th>الدفع</th><th>الحالة</th></tr></thead><tbody>{initialPatients.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.name}</td><td>{item.tests.join("، ")}</td><td>{item.paid ? "مكتمل" : "معلّق"}</td><td>{item.status}</td></tr>)}</tbody></table><div className="a4-footer"><span>تم الاستخراج بواسطة مشرف التشغيل</span><span>صفحة 1 من 1 · مستوصف بكّا الطبي الحديث</span></div><button className="screen-close-print" onClick={onClose}>العودة للنظام</button></div>;
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [activeRole, setActiveRole] = useState<Role>("supervisor");
  const [shift, setShift] = useState<Shift>("مسائية");
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [selectedPatientId, setSelectedPatientId] = useState("P-1042");
  const [selectedTestCode, setSelectedTestCode] = useState("CBC");
  const [results, setResults] = useState<Record<string, FieldValue>>(initialResults);
  const [resultDraft, setResultDraft] = useState<FieldValue>(initialResults["P-1042-CBC"]);
  const [search, setSearch] = useState("");
  const [showPatientDialog, setShowPatientDialog] = useState(false);
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [drawerPatient, setDrawerPatient] = useState<Patient | null>(null);
  const [toast, setToast] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>(null);

  const catalogQuery = trpc.catalog.list.useQuery(undefined, { staleTime: 5 * 60 * 1000, retry: false });
  const clinicQuery = trpc.clinic.getSettings.useQuery(undefined, { staleTime: 5 * 60 * 1000, retry: false });

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) ?? patients[0];
  const selectedTest = labTests.find((test) => test.code === selectedTestCode) ?? labTests[0];
  const isPrintView = Boolean(printMode);
  const pageTitle = navItems.find((item) => item.id === activeSection)?.label ?? "نظرة عامة";

  useEffect(() => {
    if (catalogQuery.data?.length) setToast(`تمت مزامنة ${catalogQuery.data.length} فحصًا من كتالوج المستوصف`);
  }, [catalogQuery.data]);

  useEffect(() => {
    const afterPrint = () => setPrintMode(null);
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

  const triggerPrint = (mode: Exclude<PrintMode, null>) => {
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 120);
  };

  const handleSaveResult = () => {
    if (!selectedPatient.paid) {
      setToast("لا يمكن حفظ النتيجة قبل اكتمال الدفع");
      return;
    }
    setResults((current) => ({ ...current, [`${selectedPatient.id}-${selectedTest.code}`]: resultDraft }));
    setPatients((current) => current.map((patient) => patient.id === selectedPatient.id ? { ...patient, status: "مكتملة" } : patient));
    setToast(`تم حفظ نتيجة ${selectedTest.code} للمريض ${selectedPatient.name}`);
  };

  const handleNewPatient = (patient: Patient) => {
    setPatients((current) => [patient, ...current]);
    setSelectedPatientId(patient.id);
    setShowPatientDialog(false);
    setToast(`تم تسجيل ${patient.name} وإنشاء الفاتورة ${patient.invoice}`);
    setActiveSection("billing");
  };

  const renderSection = () => {
    if (activeSection === "overview") return <Overview patients={patients} onNavigate={setActiveSection} onAddPatient={() => setShowPatientDialog(true)} onPrintReport={() => triggerPrint("report")} />;
    if (activeSection === "patients") return <Patients patients={patients} search={search} setSearch={setSearch} onAddPatient={() => setShowPatientDialog(true)} onSelectPatient={setDrawerPatient} onPrintInvoice={(patient) => { setSelectedPatientId(patient.id); triggerPrint("invoice"); }} />;
    if (activeSection === "billing") return <Billing patients={patients} onPrintInvoice={(patient) => { setSelectedPatientId(patient.id); triggerPrint("invoice"); }} />;
    if (activeSection === "lab") return <Lab patients={patients} selectedPatientId={selectedPatientId} setSelectedPatientId={(id) => { setSelectedPatientId(id); setSelectedTestCode(patients.find((patient) => patient.id === id)?.tests[0] ?? "CBC"); setResultDraft(results[`${id}-${patients.find((patient) => patient.id === id)?.tests[0] ?? "CBC"}`] ?? {}); }} selectedTestCode={selectedTestCode} setSelectedTestCode={changeTest} results={results} resultDraft={resultDraft} setResultDraft={setResultDraft} onSaveResult={handleSaveResult} onPrintResult={() => triggerPrint("result")} />;
    if (activeSection === "tests") return <TestsCatalog onToast={setToast} />;
    if (activeSection === "reports") return <Reports onPrintReport={() => triggerPrint("report")} />;
    return <Settings role={activeRole} setRole={setActiveRole} shift={shift} setShift={setShift} />;
  };

  if (isPrintView) return <PrintDocument mode={printMode as Exclude<PrintMode, null>} patient={selectedPatient} selectedTest={selectedTest} result={results[`${selectedPatient.id}-${selectedTest.code}`] ?? resultDraft} onClose={() => setPrintMode(null)} />;

  return <div className="app-shell"><aside className={`sidebar ${mobileMenu ? "open" : ""}`}><div className="sidebar-top"><AppLogo /><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)}><X size={18} /></button></div><div className="clinic-status"><span className="live-dot" /><div><strong>{clinicQuery.data?.name ?? "مستوصف بكّا الطبي الحديث"}</strong><span>{clinicQuery.isError ? "وضع تجريبي · الخادم يعمل" : "متصل · الخادم يعمل"}</span></div></div><nav className="main-nav">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={activeSection === item.id ? "active" : ""} onClick={() => { setActiveSection(item.id); setMobileMenu(false); }}><Icon size={18} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}</button>; })}</nav><div className="sidebar-bottom"><div className="sidebar-help"><div className="help-icon"><ShieldCheck size={17} /></div><div><strong>بياناتك محمية</strong><span>آخر نسخ احتياطي اليوم</span></div></div><button className="user-mini" onClick={() => setShowLoginPanel(true)}><div className="avatar">سم</div><div><strong>أ. سلمى محمد</strong><span>{roleLabels[activeRole]} · تغيير الدخول</span></div><MoreHorizontal size={17} /></button></div></aside><main className="main-content"><header className="topbar"><div className="topbar-start"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)}><Menu size={19} /></button><div className="breadcrumb"><span>نظام المستوصف</span><ArrowLeft size={13} /><strong>{pageTitle}</strong></div></div><div className="topbar-actions"><div className="shift-switcher"><span className="shift-dot" /><select value={shift} onChange={(event) => setShift(event.target.value as Shift)}><option>صباحية</option><option>مسائية</option><option>سهرة</option></select><span className="shift-number">#0028</span></div><div className="date-chip"><CalendarDays size={15} />{formatDate()}</div><button className="icon-button notification-button"><Bell size={18} /><i /></button></div></header><div className="content-wrap"><div className="mobile-title-row"><AppLogo compact /><span className="mobile-page-title">{pageTitle}</span></div>{renderSection()}</div></main>{showPatientDialog && <PatientDialog onClose={() => setShowPatientDialog(false)} onSave={handleNewPatient} />}{showLoginPanel && <LoginDialog activeRole={activeRole} onRoleChange={setActiveRole} onClose={() => setShowLoginPanel(false)} onToast={setToast} />}{drawerPatient && <PatientDrawer patient={drawerPatient} onClose={() => setDrawerPatient(null)} onPrintInvoice={() => { setSelectedPatientId(drawerPatient.id); setDrawerPatient(null); triggerPrint("invoice"); }} onNavigate={setActiveSection} />}{toast && <div className="toast"><BadgeCheck size={17} /><span>{toast}</span><button onClick={() => setToast("")}><X size={14} /></button></div>}</div>;
}
