import { AlertCircle, ArrowLeft, Beaker, Bell, Clock3, CreditCard, Download, FileBarChart, FileCheck2, FlaskConical, MoreHorizontal, PackageCheck, Stethoscope, TestTube2, UserPlus, Users } from "lucide-react";
import type { ConsultationPrices } from "@shared/billing";
import type { LabTest } from "@/lib/catalog";
import { formatCurrency, getInvoiceTotal, initials } from "@/lib/clinic-utils";
import type { Patient, Role, Section, Shift } from "@/lib/clinic-types";
import { SectionTitle, StatusPill } from "./ui";

export function Overview({ patients, shift, shiftSequence, catalog, prices, role, onNavigate, onAddPatient, onPrintReport }: {
  patients: Patient[];
  shift: Shift;
  shiftSequence: number;
  catalog: LabTest[];
  prices: ConsultationPrices;
  role?: Role;
  onNavigate: (section: Section) => void;
  onAddPatient: () => void;
  onPrintReport: () => void;
}) {
  const pendingCount = patients.filter(patient => patient.status === "في المختبر").length;
  const unpaidCount = patients.filter(patient => !patient.paid).length;
  const totalTests = patients.reduce((sum, patient) => sum + patient.tests.length, 0);
  const completedCount = patients.filter(patient => patient.status === "مكتملة").length;
  const paidRevenue = patients.filter(patient => patient.paid).reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0);
  const labView = role === "lab";
  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow={`تشغيل اليوم · الوردية ${shift}`}
        title={`أهلاً بك في الوردية ${shift}`}
        description={labView ? "ملخص طلبات المختبر والعينات والنتائج المنجزة خلال الوردية." : "هنا ملخص حركة المستوصف، المدفوعات، وحالة المختبر في لمحة واحدة."}
        action={<div className="heading-actions">{!labView && <button className="button button-secondary" onClick={onPrintReport}><Download size={16} />تقرير اليوم</button>}{!labView && <button className="button button-primary" onClick={onAddPatient}><UserPlus size={16} />تسجيل مريض</button>}{labView && <button className="button button-primary" onClick={() => onNavigate("lab")}><FlaskConical size={16} />فتح محطة المختبر</button>}</div>}
      />

      <div className="metric-grid">
        <div className="metric-card accent-teal"><div className="metric-icon"><Users size={19} /></div><span>مراجعو اليوم</span><strong>{patients.length}</strong><small>من سجلات مساحة العمل</small></div>
        {labView ? <div className="metric-card accent-blue"><div className="metric-icon"><FileCheck2 size={19} /></div><span>نتائج مكتملة</span><strong>{completedCount}</strong><small>نتائج جاهزة للتسليم</small></div> : <div className="metric-card accent-blue"><div className="metric-icon"><CreditCard size={19} /></div><span>إيرادات اليوم</span><strong>{formatCurrency(paidRevenue)}</strong><small>الفواتير المحصلة المعروضة</small></div>}
        <div className="metric-card accent-amber"><div className="metric-icon"><FlaskConical size={19} /></div><span>طلبات المختبر</span><strong>{totalTests}</strong><small><span className="warning-text">{pendingCount} قيد التنفيذ</span> الآن</small></div>
        {labView ? <div className="metric-card accent-rose"><div className="metric-icon"><Clock3 size={19} /></div><span>عينات بانتظار السحب</span><strong>{pendingCount}</strong><small><span className="warning-text">قيد التنفيذ</span> الآن</small></div> : <div className="metric-card accent-rose"><div className="metric-icon"><Clock3 size={19} /></div><span>بانتظار التحصيل</span><strong>{unpaidCount}</strong><small><span className="danger-text">يحتاج متابعة</span> قبل نهاية الوردية</small></div>}
      </div>

      <div className="overview-grid">
        <section className="panel large-panel">
          <div className="panel-header"><div><span className="eyebrow">الحركة المباشرة</span><h2>مسار المرضى اليوم</h2></div><button className="link-button" onClick={() => onNavigate(labView ? "lab" : "patients")}>عرض الكل <ArrowLeft size={15} /></button></div>
          <div className="flow-strip">
            <div className="flow-node done"><div className="flow-icon"><UserPlus size={17} /></div><div><strong>التسجيل</strong><span>{patients.length} مريض</span></div></div>
            <div className="flow-line active" />
            {!labView && <><div className="flow-node current"><div className="flow-icon"><Stethoscope size={17} /></div><div><strong>الاستقبال</strong><span>{unpaidCount} بانتظار الدفع</span></div></div>
            <div className="flow-line active" /></>}
            <div className="flow-node current"><div className="flow-icon"><Beaker size={17} /></div><div><strong>المختبر</strong><span>{pendingCount} عينات</span></div></div>
            <div className="flow-line" />
            <div className="flow-node"><div className="flow-icon"><FileCheck2 size={17} /></div><div><strong>النتائج</strong><span>{completedCount} مكتملة</span></div></div>
          </div>
          <div className="table-wrap compact-table"><table><thead><tr><th>المريض</th><th>الطلب</th><th>الوردية</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>{patients.slice(0, 4).map(patient => <tr key={patient.id}><td><div className="person-cell"><div className="avatar">{initials(patient.name)}</div><div><strong>{patient.name}</strong><span>{patient.id} · {patient.gender}</span></div></div></td><td><strong>{patient.tests.join("، ") || "بدون فحوصات"}</strong><span className="muted-line">{patient.tests.length} فحوصات</span></td><td><span className="shift-label">{patient.shift ?? shift}</span></td><td><StatusPill status={patient.status} /></td><td className="muted-cell">{patient.registeredAt}</td></tr>)}</tbody></table></div>
        </section>

        <section className="panel shift-panel">
          <div className="panel-header"><div><span className="eyebrow">تتبع الوردية</span><h2>الوردية {shift}</h2></div><span className="live-dot">مباشر</span></div>
          <div className="shift-summary"><div><span>رقم البداية</span><strong>0001</strong></div><div><span>المريض الحالي</span><strong>{String(shiftSequence).padStart(4, "0")}</strong></div><div><span>سجلات ظاهرة</span><strong>{patients.length}</strong></div></div>
          <div className="timeline">
            <div className="timeline-row"><span className="timeline-dot completed" /><div><strong>تسجيل المرضى</strong><span>{patients.length} سجلًا في مساحة العمل</span></div><b>محدّث</b></div>
            {!labView && <div className="timeline-row"><span className="timeline-dot completed" /><div><strong>التحصيل</strong><span>{patients.filter(patient => patient.paid).length} فاتورة محصلة</span></div><b>محدّث</b></div>}
            <div className="timeline-row"><span className="timeline-dot active" /><div><strong>طلبات المختبر</strong><span>{pendingCount} مريضًا قيد العمل</span></div><b>الآن</b></div>
            <div className="timeline-row"><span className="timeline-dot" /><div><strong>إغلاق الوردية</strong><span>يُدار حسب إجراءات المستوصف</span></div><b>—</b></div>
          </div>
          {!labView && <button className="button button-soft full-width" onClick={() => onNavigate("reports")}><FileBarChart size={16} />عرض ملخص الوردية</button>}
        </section>
      </div>

      <div className="bottom-grid">
        <section className="panel alert-panel">
          <div className="panel-header"><div><span className="eyebrow">يحتاج انتباه</span><h2>تنبيهات التشغيل</h2></div><Bell size={19} className="muted-icon" /></div>
          {!labView && <div className="alert-item"><div className="alert-icon amber"><AlertCircle size={16} /></div><div><strong>{unpaidCount} فواتير غير مكتملة</strong><span>مرضى بانتظار التحصيل قبل تحويلهم للمختبر.</span></div><button className="icon-button" onClick={() => onNavigate("billing")}><ArrowLeft size={15} /></button></div>}
          <div className="alert-item"><div className="alert-icon blue"><TestTube2 size={16} /></div><div><strong>{pendingCount} طلبات مختبر جديدة</strong><span>تُحدّث القائمة من الطلبات المرتبطة بالمرضى.</span></div><button className="icon-button" onClick={() => onNavigate("lab")}><ArrowLeft size={15} /></button></div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-header"><div><span className="eyebrow">اختصارات</span><h2>إجراءات سريعة</h2></div><MoreHorizontal size={19} className="muted-icon" /></div>
          <div className="quick-actions">
            {!labView && <button onClick={onAddPatient}><span className="quick-icon teal"><UserPlus size={17} /></span><span><strong>مريض جديد</strong><small>فتح سجل وفاتورة</small></span><ArrowLeft size={15} /></button>}
            <button onClick={() => onNavigate("lab")}><span className="quick-icon blue"><FlaskConical size={17} /></span><span><strong>نتيجة مختبر</strong><small>إدخال وطباعة</small></span><ArrowLeft size={15} /></button>
            {!labView && <button onClick={() => onNavigate("tests")}><span className="quick-icon amber"><PackageCheck size={17} /></span><span><strong>الأسعار</strong><small>كتالوج الفحوصات</small></span><ArrowLeft size={15} /></button>}
          </div>
        </section>
      </div>
    </div>
  );
}
