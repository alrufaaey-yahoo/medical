import { AlertCircle, BadgeCheck, Beaker, FlaskConical, Printer, Search, ShieldCheck, TestTube2, X } from "lucide-react";
import { useState } from "react";
import type { ConsultationPrices } from "@shared/billing";
import { flagResult, type LabTest } from "@/lib/catalog";
import { formatSampleNumber, getConsultationType, initials } from "@/lib/clinic-utils";
import type { FieldValue } from "@/lib/clinic-types";
import type { OrderStatus, Patient, QueueStatus } from "@/lib/clinic-types";
import { SectionTitle } from "./ui";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  blocked: "بانتظار الدفع",
  queued: "بانتظار السحب",
  in_progress: "العينة مسحوبة",
  completed: "صدرت النتيجة",
};

function ResultField({ field, gender, value, onChange }: { field: LabTest["fields"][number]; gender: Patient["gender"]; value: string; onChange: (value: string) => void }) {
  const reference = gender === "ذكر" ? field.male : field.female;
  const flag = field.type === "number" ? flagResult(value, reference) : "unknown";
  const selectOptions = field.male.includes("Negative") ? ["Negative", "Positive"] : ["سالب", "موجب"];
  return (
    <label className="form-field">
      <span>{field.label}{field.unit && <em>{field.unit}</em>}</span>
      <div className="result-input-wrap">
        {field.type === "select"
          ? <select value={value} onChange={event => onChange(event.target.value)}><option value="">اختر النتيجة</option>{selectOptions.map(option => <option key={option} value={option}>{option}</option>)}</select>
          : <input type={field.type === "number" ? "number" : "text"} value={value} onChange={event => onChange(event.target.value)} placeholder="—" />}
        <span className={`range-chip ${flag}`}>{reference}</span>
        {flag === "high" && <span className="flag-chip high">H</span>}
        {flag === "low" && <span className="flag-chip low">L</span>}
      </div>
    </label>
  );
}

export function Lab({ patients, catalog, prices, selectedPatientId, setSelectedPatientId, selectedTestCode, setSelectedTestCode, results, resultDraft, setResultDraft, onSaveResult, onPrintResult, onCollectSample, savingResult, collectingSample }: {
  patients: Patient[];
  catalog: LabTest[];
  prices: ConsultationPrices;
  selectedPatientId: string;
  setSelectedPatientId: (id: string) => void;
  selectedTestCode: string;
  setSelectedTestCode: (code: string) => void;
  results: Record<string, FieldValue>;
  resultDraft: FieldValue;
  setResultDraft: (draft: FieldValue) => void;
  onSaveResult: () => void;
  onPrintResult: () => void;
  onCollectSample: (patient: Patient, code: string) => void;
  savingResult?: boolean;
  collectingSample?: boolean;
}) {
  const labPatients = patients.filter(patient => patient.tests.length > 0);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatus, setQueueStatus] = useState<QueueStatus>("all");
  const filteredLabPatients = labPatients.filter(patient => {
    const matchesSearch = `${patient.name} ${patient.id} ${patient.tests.join(" ")}`.toLowerCase().includes(queueSearch.trim().toLowerCase());
    const matchesStatus = queueStatus === "all" || (queueStatus === "paid" ? patient.paid : !patient.paid);
    return matchesSearch && matchesStatus;
  });
  const filteredTestCount = filteredLabPatients.reduce((sum, patient) => sum + patient.tests.length, 0);
  const paidTestCount = labPatients.filter(patient => patient.paid).reduce((sum, patient) => sum + patient.tests.length, 0);
  const pendingTestCount = labPatients.filter(patient => !patient.paid).reduce((sum, patient) => sum + patient.tests.length, 0);
  const selectedPatient = labPatients.find(patient => patient.id === selectedPatientId) ?? labPatients[0];

  if (!selectedPatient) {
    return <div className="page-stack"><SectionTitle eyebrow="مختبر بكّا · قائمة العمل" title="محطة المختبر" description="لا يمكن إصدار النتيجة قبل اكتمال الدفع." /><div className="panel empty-state"><FlaskConical size={22} /><strong>لا توجد طلبات مخبرية في السجلات الحالية</strong><span>سجّل مريضًا وأضف فحوصاته لتظهر الطلبات هنا.</span></div></div>;
  }

  const testList = selectedPatient.tests.map(code => catalog.find(test => test.code === code)).filter((test): test is LabTest => Boolean(test));
  // Always prefer a test that belongs to this patient's order so a code left
  // over from another patient never opens an unrelated result form.
  const selectedTest = testList.find(test => test.code === selectedTestCode)
    ?? testList[0]
    ?? catalog.find(test => test.code === selectedTestCode)
    ?? catalog[0];
  const savedKey = `${selectedPatient.id}-${selectedTest.code}`;
  const hasSavedResult = Boolean(results[savedKey]);
  const selectedTestIsOrdered = Boolean(selectedPatient.tests.includes(selectedTest.code));
  const orderStatus: OrderStatus | undefined = selectedPatient.orderStates?.[selectedTest.code];
  const canCollect = selectedPatient.paid && orderStatus === "queued";
  const canEnterResult = selectedPatient.paid && selectedTestIsOrdered;
  const consultation = getConsultationType(selectedPatient);
  const groupedCbc = selectedTest.code === "CBC" && selectedTest.fields.length >= 15;

  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="مختبر بكّا · قائمة العمل"
        title="محطة المختبر"
        description="لا يمكن إصدار النتيجة قبل اكتمال الدفع. سجّل سحب العينة ثم أدخل النتيجة؛ تُعلَّم القيم خارج المدى المرجعي تلقائيًا."
        action={<div className="lab-status"><span className="live-dot">مفتوح</span><span>{filteredTestCount} طلبًا ظاهرًا</span></div>}
      />
      <div className="lab-layout">
        <section className="panel lab-queue">
          <div className="panel-header">
            <div><span className="eyebrow">{filteredTestCount} طلبات ظاهرة</span><h2>قائمة العينات</h2></div>
            <div className="table-actions">
              <button className={`filter-button ${queueStatus === "all" ? "active" : ""}`} onClick={() => setQueueStatus("all")}>الكل <span>{labPatients.reduce((sum, patient) => sum + patient.tests.length, 0)}</span></button>
              <button className={`filter-button ${queueStatus === "paid" ? "active" : ""}`} onClick={() => setQueueStatus("paid")}>مدفوع <span>{paidTestCount}</span></button>
              <button className={`filter-button ${queueStatus === "pending" ? "active" : ""}`} onClick={() => setQueueStatus("pending")}>معلّق <span>{pendingTestCount}</span></button>
            </div>
          </div>
          <div className="lab-search">
            <Search size={16} />
            <input value={queueSearch} onChange={event => setQueueSearch(event.target.value)} placeholder="ابحث عن مريض أو فحص..." aria-label="البحث في قائمة عينات المختبر" />
            {queueSearch && <button type="button" className="search-clear" onClick={() => setQueueSearch("")} aria-label="مسح بحث المختبر"><X size={14} /></button>}
          </div>
          <div className="queue-list">
            {filteredLabPatients.map(patient => {
              const states = patient.tests.map(code => patient.orderStates?.[code]).filter(Boolean) as OrderStatus[];
              const completed = states.length > 0 && states.every(state => state === "completed");
              return (
                <button key={patient.id} className={`queue-item ${patient.id === selectedPatient.id ? "active" : ""}`} onClick={() => { setSelectedPatientId(patient.id); setSelectedTestCode(patient.tests[0]); }}>
                  <div className="queue-avatar">{initials(patient.name)}</div>
                  <div className="queue-main"><strong>{patient.name}</strong><span>{patient.id} · {patient.tests.join("، ")}</span></div>
                  <div className="queue-side"><span className={`queue-status ${completed ? "paid" : patient.paid ? "progress" : "blocked"}`}>{completed ? "مكتمل" : patient.paid ? "قيد العمل" : "معلّق"}</span><small>{patient.registeredAt}</small></div>
                </button>
              );
            })}
            {filteredLabPatients.length === 0 && <div className="empty-state"><Search size={20} /><strong>لا توجد عينات مطابقة</strong><span>جرّب اسم المريض أو رقم الملف أو رمز الفحص.</span></div>}
          </div>
        </section>

        <section className="panel result-panel">
          <div className="result-header">
            <div className="patient-banner">
              <div className="avatar large">{initials(selectedPatient.name)}</div>
              <div><span className="eyebrow">ملف المريض · {selectedPatient.id}</span><h2>{selectedPatient.name}</h2><p>{selectedPatient.age == null ? "العمر غير محدد" : `${selectedPatient.age} سنة`} · {selectedPatient.gender} · {selectedPatient.address}</p></div>
            </div>
            <div className="result-actions">
              {canCollect && <button className="button button-soft" disabled={collectingSample} onClick={() => onCollectSample(selectedPatient, selectedTest.code)}><TestTube2 size={16} />{collectingSample ? "جارٍ التسجيل..." : "سحب العينة"}</button>}
              <button className="button button-secondary" disabled={!canEnterResult} onClick={onPrintResult}><Printer size={16} />طباعة A4</button>
              <button className="button button-primary" disabled={savingResult || !canEnterResult} onClick={onSaveResult}><BadgeCheck size={16} />حفظ النتيجة</button>
            </div>
          </div>
          <div className="result-meta">
            <div><span>رقم العينة</span><strong>{formatSampleNumber(selectedPatient, selectedTest)}</strong></div>
            <div><span>تاريخ السحب</span><strong>{selectedPatient.registeredAt}</strong></div>
            <div><span>نوع المعاينة</span><strong>{consultation === "specialist" ? "طبيب اختصاصي" : consultation === "general" ? "طبيب عمومي" : "بدون معاينة"}</strong></div>
            <div><span>حالة الطلب</span><strong className={selectedPatient.paid ? "teal-text" : "amber-text"}>{orderStatus ? ORDER_STATUS_LABEL[orderStatus] : selectedPatient.paid ? "قيد الانتظار" : "معلّقة"}</strong></div>
          </div>
          {!selectedPatient.paid && <div className="locked-banner"><ShieldCheck size={18} /><div><strong>النتيجة محمية حتى اكتمال الدفع</strong><span>أكمل التحصيل من قسم الفواتير أولًا، ثم سيصبح سحب العينة والحفظ والطباعة متاحين لفني المختبر.</span></div></div>}
          {selectedPatient.paid && !selectedTestIsOrdered && <div className="locked-banner"><FlaskConical size={18} /><div><strong>لا يوجد فحص مخبري مطلوب بهذا الاسم</strong><span>اختر فحصًا من قائمة طلبات المريض أو أضفه من الفاتورة.</span></div></div>}
          <div className="test-tabs">
            {testList.map(test => {
              const state = selectedPatient.orderStates?.[test.code];
              return (
                <button key={test.code} className={test.code === selectedTest.code ? "active" : ""} onClick={() => setSelectedTestCode(test.code)}>
                  <span>{test.code}</span>
                  {state === "completed" ? <BadgeCheck size={14} /> : <span className={`tab-dot ${state ?? ""}`} />}
                </button>
              );
            })}
          </div>
          <div className="test-form-head">
            <div><span className="eyebrow">{selectedTest.category} · {selectedTest.sample}</span><h3>{selectedTest.name} <span>{selectedTest.english}</span></h3></div>
            <span className="reference-note">المدى المرجعي يتبع {selectedPatient.gender}</span>
          </div>
          {groupedCbc ? (
            <div className="cbc-sections">
              <div className="cbc-group"><h4>مؤشرات كريات الدم البيضاء</h4><div className="field-grid">{selectedTest.fields.slice(0, 6).map(field => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={value => setResultDraft({ ...resultDraft, [field.key]: value })} />)}</div></div>
              <div className="cbc-group"><h4>مؤشرات كريات الدم الحمراء</h4><div className="field-grid">{selectedTest.fields.slice(6, 13).map(field => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={value => setResultDraft({ ...resultDraft, [field.key]: value })} />)}</div></div>
              <div className="cbc-group"><h4>الصفائح الدموية</h4><div className="field-grid two-cols">{selectedTest.fields.slice(13).map(field => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={value => setResultDraft({ ...resultDraft, [field.key]: value })} />)}</div></div>
              <label className="form-field full-field"><span>ملاحظات المختبر</span><textarea rows={3} value={resultDraft.remarks ?? ""} onChange={event => setResultDraft({ ...resultDraft, remarks: event.target.value })} placeholder="أضف ملاحظات فني المختبر هنا..." /></label>
            </div>
          ) : (
            <div className="generic-result-grid">
              {selectedTest.fields.map(field => <ResultField key={field.key} field={field} gender={selectedPatient.gender} value={resultDraft[field.key] ?? ""} onChange={value => setResultDraft({ ...resultDraft, [field.key]: value })} />)}
              <label className="form-field full-field"><span>ملاحظات / Remarks</span><textarea rows={4} value={resultDraft.remarks ?? ""} onChange={event => setResultDraft({ ...resultDraft, remarks: event.target.value })} placeholder="أضف ملاحظات الفحص..." /></label>
            </div>
          )}
          <div className="lab-footer-note">
            <AlertCircle size={15} />
            <span>المدى المرجعي قابل للتهيئة من كتالوج الفحوصات، ويعتمد التفسير النهائي على جهاز المختبر والعمر والحالة السريرية.</span>
            <span className="saved-indicator">{hasSavedResult ? "تم الحفظ" : "مسودة غير محفوظة"}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
