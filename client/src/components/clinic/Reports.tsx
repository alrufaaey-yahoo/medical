import { AlertCircle, CalendarDays, Download, FileBarChart, Printer, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ConsultationPrices } from "@shared/billing";
import { SHIFT_LABELS, type ShiftType } from "@shared/billing";
import { trpc } from "@/lib/trpc";
import type { LabTest } from "@/lib/catalog";
import { filterRecordsByReportRange, formatClinicDateFromKey, formatClinicTime, getClinicDateKey, getClinicReportDateKey, getClinicShiftDateKey, getCurrentClinicShift } from "@/lib/clinic-workflow";
import { formatCurrency, getConsultationType, getInvoiceTotal } from "@/lib/clinic-utils";
import type { Patient, Role } from "@/lib/clinic-types";
import { SectionTitle } from "./ui";

const SHIFT_BY_LABEL: Record<ReturnType<typeof getCurrentClinicShift>, ShiftType> = { "صباحية": "morning", "مسائية": "evening", "سهرة": "night" };
type ReportPeriod = "daily" | "weekly" | "monthly";
type ReportTab = "period" | "shift";

type ReportRow = {
  invoiceNumber: string;
  patientNumber: string;
  total: number;
  status: "pending" | "paid" | "cancelled" | "refunded";
  consultationType?: "none" | "general" | "specialist" | null;
  consultationFee?: number | null;
  paymentMethod?: string | null;
  paymentBank?: string | null;
  transactionNumber?: string | null;
  employeeName?: string | null;
  createdAt: Date | string;
  paidAt?: Date | string | null;
};

type ReportView = {
  shiftOwnerName?: string | null;
  shiftLabName?: string | null;
  reportGeneratedByName?: string | null;
  issuedCount: number;
  issuedTotal: number;
  collectedCount: number;
  collectedTotal: number;
  refundedTotal: number;
  netTotal: number;
  consultationCount: number;
  consultationGeneralCount: number;
  consultationSpecialistCount: number;
  consultationTotal: number;
  testsTotal: number;
  issuedInvoices: ReportRow[];
  collectedInvoices: ReportRow[];
  paymentBreakdown: Array<{ method: string; count: number; total: number }>;
  netCollectionBreakdown: Array<{ service: string; method: string; total: number }>;
};

const PERIOD_LABEL: Record<ReportPeriod, string> = { daily: "اليوم", weekly: "هذا الأسبوع", monthly: "هذا الشهر" };

function toTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? formatClinicTime(date) : "—";
}

function statusLabel(status: ReportRow["status"]) {
  if (status === "paid") return <span className="payment-label paid">مدفوعة</span>;
  if (status === "refunded") return <span className="payment-label unpaid">مسترجعة</span>;
  if (status === "cancelled") return <span className="payment-label unpaid">ملغاة</span>;
  return <span className="payment-label unpaid">بانتظار التحصيل</span>;
}

function buildDemoReport(patients: Patient[], range: ReportPeriod, catalog: LabTest[], prices: ConsultationPrices): ReportView {
  const visible = filterRecordsByReportRange(patients, range === "daily" ? "today" : range === "weekly" ? "week" : "month", getClinicDateKey());
  const issued = visible.filter(patient => patient.invoiceStatus !== "cancelled");
  const collected = visible.filter(patient => patient.paid);
  const refunded = visible.filter(patient => patient.invoiceStatus === "refunded");
  const toRow = (patient: Patient): ReportRow => ({
    invoiceNumber: patient.invoice,
    patientNumber: patient.id,
    total: getInvoiceTotal(patient, catalog, prices),
    status: patient.invoiceStatus ?? (patient.paid ? "paid" : "pending"),
    consultationType: getConsultationType(patient),
    consultationFee: patient.consultationFee ?? 0,
    createdAt: new Date().toISOString(),
    paidAt: patient.paid ? new Date().toISOString() : null,
    paymentMethod: patient.paymentMethod,
    paymentBank: patient.paymentBank,
    transactionNumber: patient.transactionNumber,
  });
  const consultationRows = issued.filter(patient => getConsultationType(patient) !== "none");
  const consultationTotal = consultationRows.reduce((sum, patient) => sum + (patient.consultationFee ?? 0), 0);
  const issuedTotal = issued.reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0);
  return {
    issuedCount: issued.length,
    issuedTotal,
    collectedCount: collected.length,
    collectedTotal: collected.reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0),
    refundedTotal: refunded.reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0),
    netTotal: collected.reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0) - refunded.reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0),
    consultationCount: consultationRows.length,
    consultationGeneralCount: consultationRows.filter(patient => getConsultationType(patient) === "general").length,
    consultationSpecialistCount: consultationRows.filter(patient => getConsultationType(patient) === "specialist").length,
    consultationTotal,
    testsTotal: Math.max(0, issuedTotal - consultationTotal),
    issuedInvoices: issued.map(toRow),
    collectedInvoices: collected.map(toRow),
    paymentBreakdown: [{ method: "نقدي", count: collected.length, total: collected.reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0) }],
    netCollectionBreakdown: [],
  };
}

function SummaryCards({ report }: { report: ReportView }) {
  return (
    <div className="report-cards">
      <div><span>الفواتير المنشأة</span><strong>{report.issuedCount}</strong><small>{formatCurrency(report.issuedTotal)}</small></div>
      <div><span>إجمالي التحصيل</span><strong className="teal-text">{formatCurrency(report.collectedTotal)}</strong><small>{report.collectedCount} تحصيلًا</small></div>
      <div><span>الاسترجاعات</span><strong className="danger-text">{formatCurrency(report.refundedTotal)}</strong><small>الصافي {formatCurrency(report.netTotal)}</small></div>
      <div><span>المعاينات</span><strong>{formatCurrency(report.consultationTotal)}</strong><small>{report.consultationGeneralCount} عمومي · {report.consultationSpecialistCount} اختصاصي</small></div>
      <div><span>إجمالي الفحوصات</span><strong>{formatCurrency(report.testsTotal)}</strong><small>بعد استبعاد المعاينات</small></div>
    </div>
  );
}

function ReportTable({ rows, emptyText }: { rows: ReportRow[]; emptyText: string }) {
  if (!rows.length) return <div className="empty-state"><FileBarChart size={22} /><strong>{emptyText}</strong><span>غيّر الفترة أو التاريخ لعرض بيانات أخرى.</span></div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>رقم الفاتورة</th><th>رقم الملف</th><th>الخدمة</th><th>الإجمالي</th><th>الدفع / البنك</th><th>رقم العملية</th><th>الموظف</th><th>الحالة</th><th>الوقت</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={`${row.invoiceNumber}-${row.status}`}>
              <td><strong className="mono">{row.invoiceNumber}</strong></td>
              <td>{row.patientNumber}</td>
              <td>{row.consultationType === "specialist" ? "معاينة اختصاصي" : row.consultationType === "general" ? "معاينة عمومي" : "فحوصات"}</td>
              <td><strong>{formatCurrency(row.total)}</strong></td>
              <td>{row.paymentMethod === "bank" ? `بنكي · ${row.paymentBank ?? "—"}` : row.paymentMethod === "cash" ? "نقدي" : "—"}</td>
              <td className="mono">{row.transactionNumber ?? "—"}</td>
              <td>{row.employeeName ?? "—"}</td>
              <td>{statusLabel(row.status)}</td>
              <td className="muted-cell">{toTime(row.paidAt ?? row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Reports({ patients, catalog, prices, hasSession, canDownloadPdf, role, onToast, onPrintReport }: {
  patients: Patient[];
  catalog: LabTest[];
  prices: ConsultationPrices;
  hasSession: boolean;
  canDownloadPdf: boolean;
  role?: Role;
  onToast: (message: string) => void;
  onPrintReport: () => void;
}) {
  // A cashier only sees the report of a shift they actually worked in.
  const shiftOnly = role === "cashier";
  const [tab, setTab] = useState<ReportTab>(shiftOnly ? "shift" : "period");
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [date, setDate] = useState(shiftOnly ? getClinicShiftDateKey() : getClinicReportDateKey());
  const [shiftType, setShiftType] = useState<ShiftType>(SHIFT_BY_LABEL[getCurrentClinicShift()]);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    if (shiftOnly) setTab("shift");
  }, [shiftOnly]);
  const summaryQuery = trpc.reports.summary.useQuery({ period, date }, { enabled: hasSession && !shiftOnly && tab === "period", retry: false });
  const shiftQuery = trpc.reports.shift.useQuery({ shiftDate: date, shiftType }, { enabled: hasSession && tab === "shift", retry: false });
  const demoReport = useMemo(() => buildDemoReport(patients, period, catalog, prices), [patients, period, catalog, prices]);
  const report = (hasSession ? summaryQuery.data : demoReport) as ReportView | undefined;
  const shiftReport = shiftQuery.data?.report as ReportView | undefined;

  const download = async (kind: ReportTab) => {
    if (!canDownloadPdf) {
      onToast("يتطلب تنزيل التقرير جلسة تشغيل بصلاحية مدير أو مشرف أو كاشير.");
      return;
    }
    setDownloading(true);
    try {
      const params = new URLSearchParams(kind === "shift" ? { period: "shift", date, shiftType } : { period, date });
      const response = await fetch(`/api/reports/pdf?${params.toString()}`, { credentials: "same-origin" });
      if (!response.ok) {
        let message = "تعذر إنشاء التقرير";
        try {
          const payload = await response.json() as { error?: unknown };
          if (typeof payload.error === "string") message = payload.error;
        } catch {
          // Keep the safe generic message when the server does not return JSON.
        }
        throw new Error(message);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `clinic-report-${kind === "shift" ? `shift-${shiftType}` : period}-${date}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      onToast("تم تنزيل تقرير PDF الكامل للفترة المحددة.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "تعذر تنزيل التقرير حاليًا");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="تحليل التشغيل"
        title="التقارير والمتابعة"
        description={shiftOnly ? "تقرير الوردية التي عملت بها فقط: الفواتير والتحصيلات وتوزيع طرق الدفع، مع إمكانية تنزيله PDF." : "تقارير يومية وأسبوعية وشهرية من قاعدة البيانات، وتقرير مستقل لكل وردية كاشير. ملف PDF يضم كامل الفواتير والتحصيلات بتوقيت الخرطوم."}
        action={<div className="heading-actions">
          <div className="table-actions">
            {!shiftOnly && <button className={`filter-button ${tab === "period" ? "active" : ""}`} onClick={() => setTab("period")}>تقارير الفترة</button>}
            <button className={`filter-button ${tab === "shift" ? "active" : ""}`} onClick={() => setTab("shift")}>تقرير ورديتي</button>
          </div>
          <button className="button button-primary" disabled={!canDownloadPdf || downloading} onClick={() => void download(tab)}><Download size={16} />{downloading ? "جارٍ تجهيز PDF..." : "تنزيل PDF"}</button>
          <button className="button button-secondary" onClick={onPrintReport}><Printer size={16} />طباعة</button>
        </div>}
      />

      <section className="panel report-toolbar">
        <div className="report-filters">
          {tab === "period" ? (
            <>
              <div className="table-actions">
                {(["daily", "weekly", "monthly"] as ReportPeriod[]).map(item => <button key={item} className={`filter-button ${period === item ? "active" : ""}`} onClick={() => setPeriod(item)}>{PERIOD_LABEL[item]}</button>)}
              </div>
              <label className="form-field inline-field"><span>تاريخ التقرير</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            </>
          ) : (
            <>
              <div className="table-actions">
                {(Object.keys(SHIFT_LABELS) as ShiftType[]).map(item => <button key={item} className={`filter-button ${shiftType === item ? "active" : ""}`} onClick={() => setShiftType(item)}>وردية {SHIFT_LABELS[item]}</button>)}
              </div>
              <label className="form-field inline-field"><span>تاريخ الوردية</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            </>
          )}
        </div>
        <span className="muted-line">{tab === "period" ? `التقرير ${PERIOD_LABEL[period]} · ${formatClinicDateFromKey(date)}` : `وردية ${SHIFT_LABELS[shiftType]} · ${formatClinicDateFromKey(date)}`}</span>
      </section>
      {(() => {
        const activeReport = tab === "shift" ? shiftReport : report;
        if (!activeReport) return null;
        const identity = [
          activeReport.shiftOwnerName ? `صاحب الوردية: ${activeReport.shiftOwnerName}` : null,
          activeReport.shiftLabName ? `المختبر: ${activeReport.shiftLabName}` : null,
          activeReport.reportGeneratedByName ? `أصدر التقرير: ${activeReport.reportGeneratedByName}` : null,
        ].filter((item): item is string => Boolean(item));
        return identity.length ? <div className="report-meta-strip">{identity.map(item => <span key={item}>{item}</span>)}</div> : null;
      })()}

      {hasSession && (tab === "period" ? summaryQuery.isError : shiftQuery.isError && shiftQuery.error?.data?.code !== "FORBIDDEN") && (
        <div className="panel empty-state"><AlertCircle size={22} /><strong>تعذر تحميل التقرير</strong><span>{tab === "period" ? summaryQuery.error?.message : shiftQuery.error?.message}</span></div>
      )}

      {tab === "period" ? (
        report ? (
          <>
            <SummaryCards report={report} />
            {report.paymentBreakdown.length > 0 && (
              <section className="panel payment-breakdown">
                <div className="panel-header"><div><span className="eyebrow">طرق الدفع</span><h2>توزيع التحصيل</h2></div><WalletCards size={18} className="muted-icon" /></div>
                <div className="payment-methods">{report.paymentBreakdown.map(row => <div key={row.method}><span>{row.method}</span><strong>{formatCurrency(row.total)}</strong><small>{row.count} عملية</small></div>)}</div>
              </section>
            )}
            {report.netCollectionBreakdown.length > 0 && <section className="panel payment-breakdown">
              <div className="panel-header"><div><span className="eyebrow">صافي التحصيل</span><h2>حسب العيادة/المعاينة والمختبر ثم وسيلة الدفع</h2></div></div>
              <div className="payment-methods">{report.netCollectionBreakdown.map((row, index) => <div key={`${row.service}-${row.method}-${index}`}><span>{row.service} · {row.method}</span><strong>{formatCurrency(row.total)}</strong></div>)}</div>
            </section>}
            <section className="panel">
              <div className="panel-header"><div><span className="eyebrow">الفواتير المنشأة · {report.issuedCount}</span><h2>حركة الفواتير</h2></div><span className="catalog-count"><CalendarDays size={15} />{PERIOD_LABEL[period]}</span></div>
              <ReportTable rows={report.issuedInvoices} emptyText="لا توجد فواتير في هذه الفترة" />
            </section>
          </>
        ) : <div className="panel empty-state"><strong>جارٍ تحميل التقرير...</strong></div>
      ) : shiftQuery.isError && shiftQuery.error?.data?.code === "FORBIDDEN" ? (
        <div className="panel empty-state"><CalendarDays size={22} /><strong>لم تُسند إليك وردية بعد</strong><span>سيُفتح تقرير ورديتك تلقائيًا عند تسجيل أول مريض، أو اطلب من مشرف التشغيل إسنادك إلى الوردية.</span></div>
      ) : shiftReport ? (
        <>
          {!shiftQuery.data?.shift && <div className="panel empty-state"><CalendarDays size={22} /><strong>لا توجد وردية مسجلة بهذا التاريخ</strong><span>سيظهر التقرير بعد أول تسجيل مريض في الوردية.</span></div>}
          <SummaryCards report={shiftReport} />
          <section className="panel">
            <div className="panel-header"><div><span className="eyebrow">فواتير الوردية · {shiftReport.issuedCount}</span><h2>حركة الوردية</h2></div><span className="catalog-count">وردية {SHIFT_LABELS[shiftType]}</span></div>
            <ReportTable rows={shiftReport.issuedInvoices} emptyText="لا توجد فواتير في هذه الوردية" />
          </section>
        </>
      ) : <div className="panel empty-state"><strong>جارٍ تحميل تقرير الوردية...</strong></div>}
    </div>
  );
}
