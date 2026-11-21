import { Pencil, Plus, Printer, ReceiptText, WalletCards } from "lucide-react";
import { useState } from "react";
import type { ConsultationPrices } from "@shared/billing";
import type { LabTest } from "@/lib/catalog";
import { formatClinicDateFromKey, filterRecordsByReportRange, getClinicDateKey } from "@/lib/clinic-workflow";
import { consultationChip, formatCurrency, getInvoiceTests, getInvoiceTotal, initials } from "@/lib/clinic-utils";
import type { Patient, ReportRange } from "@/lib/clinic-types";
import { SectionTitle } from "./ui";

export function Billing({ patients, catalog, prices, banks, onAddPatient, onAddInvoice, onPrintInvoice, onEditInvoice, onMarkPaid, onCancel, onRefund, saving, canManage }: {
  patients: Patient[];
  catalog: LabTest[];
  prices: ConsultationPrices;
  onAddPatient: () => void;
  onAddInvoice: () => void;
  onPrintInvoice: (patient: Patient) => void;
  onEditInvoice: (patient: Patient) => void;
  banks: { id: number; name: string }[];
  onMarkPaid: (patient: Patient, payment: { paymentMethod: "cash" | "bank"; paymentBank?: string; transactionNumber?: string }) => void;
  onCancel: (patient: Patient) => void;
  onRefund: (patient: Patient) => void;
  saving?: boolean;
  canManage: boolean;
}) {
  const [range, setRange] = useState<ReportRange>("today");
  const [payingPatient, setPayingPatient] = useState<Patient | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("cash");
  const [paymentBank, setPaymentBank] = useState("");
  const [transactionNumber, setTransactionNumber] = useState("");
  const currentDate = getClinicDateKey();
  const visiblePatients = filterRecordsByReportRange(patients, range, currentDate);
  const total = visiblePatients.reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0);
  const paidTotal = visiblePatients.filter(patient => patient.paid).reduce((sum, patient) => sum + getInvoiceTotal(patient, catalog, prices), 0);
  const pendingTotal = total - paidTotal;
  const paidCount = visiblePatients.filter(patient => patient.paid).length;
  const pendingCount = visiblePatients.length - paidCount;
  const average = visiblePatients.length ? Math.round(total / visiblePatients.length) : 0;
  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="الاستقبال والتحصيل"
        title="الفواتير والتحصيل"
        description="الفاتورة مرتبطة دائمًا بسجل مريض. سجّل مريضًا جديدًا لفاتورة الزيارة الأولى، أو أصدر فاتورة إضافية لمريض موجود."
        action={<div className="heading-actions"><button className="button button-secondary" onClick={onAddInvoice}><ReceiptText size={16} />فاتورة لمريض موجود</button><button className="button button-primary" onClick={onAddPatient}><Plus size={16} />تسجيل مريض جديد</button></div>}
      />
      <div className="billing-summary">
        <div><span>إجمالي الفواتير</span><strong>{formatCurrency(total)}</strong><small>{visiblePatients.length} فاتورة</small></div>
        <div><span>تم التحصيل</span><strong className="teal-text">{formatCurrency(paidTotal)}</strong><small>{paidCount} فاتورة مكتملة</small></div>
        <div><span>بانتظار التحصيل</span><strong className="amber-text">{formatCurrency(pendingTotal)}</strong><small>{pendingCount} فاتورة تحتاج متابعة</small></div>
        <div><span>متوسط الفاتورة</span><strong>{formatCurrency(average)}</strong><small>للفواتير المعروضة</small></div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div><span className="eyebrow">آخر الفواتير · {range === "today" ? "اليوم" : range === "week" ? "هذا الأسبوع" : "هذا الشهر"}</span><h2>حركة الاستقبال</h2></div>
          <div className="table-actions">
            <button className={`filter-button ${range === "today" ? "active" : ""}`} onClick={() => setRange("today")}>اليوم</button>
            <button className={`filter-button ${range === "week" ? "active" : ""}`} onClick={() => setRange("week")}>الأسبوع</button>
            <button className={`filter-button ${range === "month" ? "active" : ""}`} onClick={() => setRange("month")}>هذا الشهر</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>رقم الفاتورة</th><th>المريض</th><th>الخدمات</th><th>الإجمالي</th><th>طريقة الدفع</th><th>الحالة</th><th>إجراء</th></tr></thead>
            <tbody>
              {visiblePatients.map(patient => {
                const invoiceTotal = getInvoiceTotal(patient, catalog, prices);
                const cancelled = patient.invoiceStatus === "cancelled";
                const refunded = patient.invoiceStatus === "refunded";
                const chip = consultationChip(patient);
                return (
                  <tr key={`${patient.databaseInvoiceId ?? patient.id}-${patient.invoice}`}>
                    <td><strong className="mono">{patient.invoice}</strong><span className="muted-line">{patient.registeredDate ? formatClinicDateFromKey(patient.registeredDate) : "—"} · {patient.registeredAt}</span></td>
                    <td><div className="person-cell"><div className="avatar small">{initials(patient.name)}</div><strong>{patient.name}</strong></div></td>
                    <td><div className="test-tags">{getInvoiceTests(patient).map(test => <span key={test}>{test}</span>)}{chip && <span>{chip}</span>}</div></td>
                    <td><strong>{formatCurrency(invoiceTotal)}</strong></td>
                    <td><span className="cash-label"><WalletCards size={14} />{patient.paid ? patient.paymentMethod === "bank" ? `بنكي · ${patient.paymentBank ?? ""} · ${patient.transactionNumber ?? ""}` : "نقدي" : "—"}</span></td>
                    <td>{cancelled ? <span className="payment-label unpaid">ملغاة</span> : refunded ? <span className="payment-label unpaid">مسترجعة</span> : patient.paid ? <span className="payment-label paid">مكتملة</span> : <button className="button button-soft" disabled={saving} onClick={() => { setPayingPatient(patient); setPaymentMethod("cash"); setPaymentBank(""); setTransactionNumber(""); }}>{saving ? "جارٍ الحفظ..." : "تأكيد الدفع"}</button>}</td>
                    <td>
                      <div className="table-actions">
                        {canManage && !cancelled && !refunded && <button className="row-menu" title="تعديل الفاتورة" aria-label={`تعديل الفاتورة ${patient.invoice}`} onClick={() => onEditInvoice(patient)}><Pencil size={15} /></button>}
                        <button className="row-menu" onClick={() => onPrintInvoice(patient)} aria-label={`طباعة الفاتورة ${patient.invoice}`}><Printer size={16} /></button>
                        {canManage && !cancelled && !refunded && <>
                          {patient.paid && <button className="button button-soft" onClick={() => onRefund(patient)}>استرجاع</button>}
                          <button className="button button-soft" onClick={() => onCancel(patient)}>إلغاء</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visiblePatients.length === 0 && <div className="empty-state"><ReceiptText size={22} /><strong>لا توجد فواتير ضمن النطاق</strong><span>جرّب نطاقًا زمنيًا آخر أو أنشئ فاتورة جديدة.</span></div>}
        </div>
      </section>
      {payingPatient && <div className="modal-backdrop" onMouseDown={() => setPayingPatient(null)}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="payment-title" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header"><div><span className="eyebrow">تحصيل الفاتورة {payingPatient.invoice}</span><h2 id="payment-title">تسجيل طريقة الدفع</h2></div></div>
        <div className="modal-body form-grid">
          <label className="form-field"><span>طريقة الدفع</span><select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as "cash" | "bank")}><option value="cash">نقدي</option><option value="bank">بنكي</option></select></label>
          {paymentMethod === "bank" && <>
            <label className="form-field"><span>البنك</span><select value={paymentBank} onChange={event => setPaymentBank(event.target.value)}><option value="">اختر البنك</option>{banks.map(bank => <option key={bank.id} value={bank.name}>{bank.name}</option>)}</select></label>
            <label className="form-field"><span>رقم العملية (4 أرقام)</span><input inputMode="numeric" autoComplete="off" maxLength={4} pattern="[0-9]{4}" value={transactionNumber} onChange={event => setTransactionNumber(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" /></label>
          </>}
        </div>
        <div className="modal-footer"><button className="button button-secondary" onClick={() => setPayingPatient(null)}>إلغاء</button><button className="button button-primary" disabled={saving || (paymentMethod === "bank" && (!paymentBank || !/^\d{4}$/.test(transactionNumber)))} onClick={() => onMarkPaid(payingPatient, paymentMethod === "bank" ? { paymentMethod, paymentBank, transactionNumber } : { paymentMethod })}>{saving ? "جارٍ الحفظ..." : "تأكيد التحصيل"}</button></div>
      </div></div>}
    </div>
  );
}
