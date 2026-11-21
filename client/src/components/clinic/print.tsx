import { CONSULTATION_LABELS, type ConsultationPrices } from "@shared/billing";
import type { LabTest } from "@/lib/catalog";
import { filterRecordsByReportRange, formatClinicDateFromKey, getClinicDateKey, getCurrentClinicShift } from "@/lib/clinic-workflow";
import { consultationChip, formatCurrency, formatSampleNumber, getConsultationFee, getConsultationType, getInvoiceLines, getInvoiceTests, getInvoiceTotal } from "@/lib/clinic-utils";
import type { FieldValue, Patient, PrintMode, ReportRange } from "@/lib/clinic-types";

export type PrintClinicInfo = {
  name: string;
  address: string;
  phone: string;
  website: string;
  footerText: string;
  logoUrl: string;
};

const PERIOD_LABEL: Record<ReportRange, string> = { today: "اليوم", week: "هذا الأسبوع", month: "هذا الشهر" };

export function PrintDocument({ mode, patient, selectedTest, result, reportPatients, reportRange, clinic, catalog, prices, onClose }: {
  mode: Exclude<PrintMode, null>;
  patient: Patient;
  selectedTest: LabTest;
  result: FieldValue;
  reportPatients: Patient[];
  reportRange: ReportRange;
  clinic: PrintClinicInfo;
  catalog: LabTest[];
  prices: ConsultationPrices;
  onClose: () => void;
}) {
  const closeButton = <button className="screen-close-print" onClick={onClose}>العودة للنظام</button>;

  if (mode === "invoice") {
    const lines = getInvoiceLines(patient, catalog, prices);
    return (
      <div className="print-doc thermal-doc">
        <div className="print-brand"><img src={clinic.logoUrl} alt="" /><div><strong>{clinic.name}</strong><span>{clinic.address} · {clinic.phone}</span></div></div>
        <div className="print-rule" />
        <div className="print-center"><strong>تذكرة استقبال</strong><span>{patient.invoice}</span></div>
        <div className="print-info">
          <div><span>المريض</span><strong>{patient.name}</strong></div>
          <div><span>الملف</span><strong>{patient.id}</strong></div>
          <div><span>تسلسل الوردية</span><strong>#{String(patient.sequence ?? 0).padStart(4, "0")}</strong></div>
          <div><span>الجنس</span><strong>{patient.gender}</strong></div>
          <div><span>التاريخ</span><strong>{formatClinicDateFromKey(patient.registeredDate ?? getClinicDateKey())} · {patient.shift ?? getCurrentClinicShift()}</strong></div>
        </div>
        <div className="print-table">
          <div className="print-row print-head"><span>الخدمة</span><span>السعر</span></div>
          {lines.map((line, index) => <div className="print-row" key={`${line.code ?? line.description}-${index}`}><span>{line.description}</span><span>{formatCurrency(line.unitPrice)}</span></div>)}
        </div>
        <div className="print-total"><span>الإجمالي</span><strong>{formatCurrency(getInvoiceTotal(patient, catalog, prices))}</strong></div>
        <div className="print-center print-payment">{patient.paid ? "مدفوعة" : "غير مكتملة الدفع"}</div>
        <div className="print-footer">{clinic.footerText}<br />{clinic.website}</div>
        {closeButton}
      </div>
    );
  }

  if (mode === "patient-report") {
    const consultation = getConsultationType(patient);
    return (
      <div className="print-doc a4-doc patient-report-print">
        <div className="a4-header">
          <div className="print-brand"><img src={clinic.logoUrl} alt="" /><div><strong>{clinic.name}</strong><span>تقرير طبي مختصر · سجل زيارة</span></div></div>
          <div className="report-meta"><strong>{patient.id}</strong><span>{patient.invoice}</span></div>
        </div>
        <div className="print-rule" />
        <div className="result-print-title"><span>ملخص الزيارة</span><h1>تقرير طبي للمريض</h1><p>بيانات تشغيلية وفحوصات مرتبطة بالزيارة الحالية</p></div>
        <div className="patient-print-grid">
          <div><span>اسم المريض</span><strong>{patient.name}</strong></div>
          <div><span>رقم الملف</span><strong>{patient.id}</strong></div>
          <div><span>العمر / الجنس</span><strong>{patient.age == null ? "غير محدد" : `${patient.age} سنة`} · {patient.gender}</strong></div>
          <div><span>تاريخ الزيارة</span><strong>{formatClinicDateFromKey(patient.registeredDate ?? getClinicDateKey())}</strong></div>
          <div><span>الهاتف</span><strong>{patient.phone}</strong></div>
          <div><span>نوع المعاينة</span><strong>{CONSULTATION_LABELS[consultation]}{consultation !== "none" ? ` · ${formatCurrency(getConsultationFee(patient, prices))}` : ""}</strong></div>
        </div>
        <h3 className="print-subtitle">الفحوصات والخدمات المرتبطة</h3>
        <table className="result-print-table">
          <thead><tr><th>الرمز</th><th>الخدمة</th><th>العينة</th><th>الحالة</th></tr></thead>
          <tbody>
            {getInvoiceTests(patient).length ? getInvoiceTests(patient).map(code => {
              const test = catalog.find(item => item.code === code);
              return <tr key={code}><td><strong>{code}</strong></td><td>{test?.name ?? "فحص مخبري"}</td><td>{test?.sample ?? "—"}</td><td>{patient.status === "مكتملة" ? "مكتمل" : patient.paid ? "قيد المتابعة" : "بانتظار الدفع"}</td></tr>;
            }) : <tr><td colSpan={4}>لا توجد فحوصات مخبرية مرتبطة بهذه الزيارة.</td></tr>}
          </tbody>
        </table>
        <div className="report-summary-box">
          <div><span>حالة الفاتورة</span><strong>{patient.paid ? "مدفوعة" : "غير مكتملة"}</strong></div>
          <div><span>إجمالي الزيارة</span><strong>{formatCurrency(getInvoiceTotal(patient, catalog, prices))}</strong></div>
          <div><span>الوردية</span><strong>{patient.shift ?? getCurrentClinicShift()}</strong></div>
        </div>
        <div className="remarks-print"><strong>ملاحظات الطبيب / المختبر</strong><p>يُستكمل هذا القسم من الطبيب أو فني المختبر وفق نتائج الفحص المعتمدة. هذا المستند ملخص تشغيلي ولا يُعد تشخيصًا طبيًا مستقلًا.</p></div>
        <div className="signature-row"><div><span>اسم الطبيب / المسؤول</span><strong>________________</strong></div><div><span>التوقيع والختم</span><strong>________________</strong></div></div>
        <div className="a4-footer"><span>{clinic.footerText}</span><span>صفحة التقرير · {clinic.name}</span></div>
        {closeButton}
      </div>
    );
  }

  if (mode === "result") {
    return (
      <div className="print-doc a4-doc">
        <div className="a4-header">
          <div className="print-brand"><img src={clinic.logoUrl} alt="" /><div><strong>{clinic.name}</strong><span>قسم المختبر · نتيجة فحص مخبري</span></div></div>
          <div className="report-meta"><strong>{selectedTest.code}</strong><span>رقم العينة: {formatSampleNumber(patient, selectedTest)}</span></div>
        </div>
        <div className="print-rule" />
        <div className="patient-print-grid">
          <div><span>اسم المريض</span><strong>{patient.name}</strong></div>
          <div><span>رقم الملف</span><strong>{patient.id}</strong></div>
          <div><span>العمر / الجنس</span><strong>{patient.age == null ? "غير محدد" : `${patient.age} سنة`} · {patient.gender}</strong></div>
          <div><span>التاريخ</span><strong>{formatClinicDateFromKey(patient.registeredDate ?? getClinicDateKey())}</strong></div>
          <div><span>نوع العينة</span><strong>{selectedTest.sample}</strong></div>
          <div><span>الطبيب المحوّل</span><strong>{consultationChip(patient) ?? "بدون معاينة"}</strong></div>
        </div>
        <div className="result-print-title"><span>{selectedTest.category}</span><h1>{selectedTest.name}</h1><p>{selectedTest.english}</p></div>
        <table className="result-print-table">
          <thead><tr><th>الفحص</th><th>النتيجة</th><th>الوحدة</th><th>المدى المرجعي ({patient.gender})</th></tr></thead>
          <tbody>{selectedTest.fields.map(field => <tr key={field.key}><td>{field.label}</td><td><strong>{result[field.key] || "—"}</strong></td><td>{field.unit || "—"}</td><td>{patient.gender === "ذكر" ? field.male : field.female}</td></tr>)}</tbody>
        </table>
        <div className="remarks-print"><strong>ملاحظات / Remarks</strong><p>{result.remarks || "لا توجد ملاحظات إضافية."}</p></div>
        <div className="signature-row"><div><span>اسم فني المختبر</span><strong>{result.technician || "________________"}</strong></div><div><span>التوقيع والختم</span><strong>________________</strong></div></div>
        <div className="a4-footer"><span>هذه النتيجة للاستخدام الطبي المعتمد فقط، وتُفسّر مع الحالة السريرية.</span><span>صفحة التقرير · {clinic.name}</span></div>
        {closeButton}
      </div>
    );
  }

  const printable = filterRecordsByReportRange(reportPatients, reportRange, getClinicDateKey()).filter(patient => patient.invoiceStatus !== "cancelled");
  const paid = printable.filter(patient => patient.paid);
  const revenue = paid.reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0);
  const consultationTotal = printable.reduce((sum, patient) => sum + (getConsultationType(patient) === "none" ? 0 : getConsultationFee(patient, prices)), 0);
  return (
    <div className="print-doc a4-doc report-print">
      <div className="a4-header">
        <div className="print-brand"><img src={clinic.logoUrl} alt="" /><div><strong>{clinic.name}</strong><span>تقرير التشغيل {PERIOD_LABEL[reportRange]}</span></div></div>
        <div className="report-meta"><strong>{formatClinicDateFromKey(getClinicDateKey())}</strong><span>الفترة: {PERIOD_LABEL[reportRange]}</span></div>
      </div>
      <div className="print-rule" />
      <div className="result-print-title"><span>ملخص المشرف</span><h1>تقرير حركة المستوصف</h1><p>نظرة تشغيلية على المرضى والفواتير والمعاينات ونتائج المختبر</p></div>
      <div className="report-print-cards">
        <div><span>المراجعون</span><strong>{printable.length}</strong></div>
        <div><span>الفواتير المكتملة</span><strong>{paid.length}</strong></div>
        <div><span>المعاينات</span><strong>{formatCurrency(consultationTotal)}</strong></div>
        <div><span>الإيرادات</span><strong>{formatCurrency(revenue)}</strong></div>
      </div>
      <h3 className="print-subtitle">تفاصيل الحركة</h3>
      <table className="result-print-table">
        <thead><tr><th>الملف</th><th>المريض</th><th>الخدمة</th><th>الإجمالي</th><th>الدفع</th></tr></thead>
        <tbody>
          {printable.map(item => <tr key={`${item.id}-${item.invoice}`}><td>{item.id}</td><td>{item.name}</td><td>{consultationChip(item) ?? "فحوصات"}</td><td>{formatCurrency(getInvoiceTotal(item, catalog, prices))}</td><td>{item.paid ? "مكتمل" : "معلّق"}</td></tr>)}
          {printable.length === 0 && <tr><td colSpan={5}>لا توجد سجلات في هذه الفترة.</td></tr>}
        </tbody>
      </table>
      <div className="a4-footer"><span>تم الاستخراج بواسطة مشرف التشغيل</span><span>صفحة التقرير · {clinic.name}</span></div>
      {closeButton}
    </div>
  );
}
