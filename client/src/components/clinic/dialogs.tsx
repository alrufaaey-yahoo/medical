import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  CreditCard,
  FileCheck2,
  FileText,
  FlaskConical,
  LogIn,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  UserPlus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CONSULTATION_LABELS, consultationFeeFor, type ConsultationPrices, type ConsultationType } from "@shared/billing";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import type { LabTest } from "@/lib/catalog";
import { formatClinicDateFromKey, getClinicDateKey } from "@/lib/clinic-workflow";
import { consultationChip, formatCurrency, getConsultationFee, getConsultationType, getInvoiceLines, getInvoiceTests, getInvoiceTotal, initials } from "@/lib/clinic-utils";
import type { NewPatientInput, Patient, Role } from "@/lib/clinic-types";
import { roleDescriptions, roleLabels } from "@/lib/clinic-types";
import { AppLogo, StatusPill } from "./ui";

const consultationOptions: ConsultationType[] = ["none", "general", "specialist"];

function TestPicker({ catalog, selected, onToggle, disabledCodes = [], emptyHint }: {
  catalog: LabTest[];
  selected: string[];
  onToggle: (code: string) => void;
  disabledCodes?: string[];
  emptyHint?: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const categories = useMemo(() => ["الكل", ...Array.from(new Set(catalog.map(test => test.category)))], [catalog]);
  const visible = catalog.filter(test => (category === "الكل" || test.category === category)
    && `${test.code} ${test.name} ${test.english}`.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="test-picker-wrap">
      <div className="test-picker-tools">
        <div className="search-box compact-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالرمز أو الاسم" /></div>
        <div className="category-tabs small-tabs">{categories.map(item => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
      </div>
      <div className="test-picker">
        {visible.map(test => {
          const disabled = disabledCodes.includes(test.code);
          const isSelected = selected.includes(test.code);
          return (
            <button type="button" key={test.code} disabled={disabled} className={`${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`} onClick={() => onToggle(test.code)}>
              <span>{test.code}</span>
              <small>{test.name}</small>
              <em>{formatCurrency(test.price)}</em>
            </button>
          );
        })}
        {visible.length === 0 && <div className="empty-state compact-empty"><strong>{emptyHint ?? "لا توجد فحوصات مطابقة"}</strong></div>}
      </div>
    </div>
  );
}

function ConsultationChoice({ value, onChange, prices, allowNone = true }: {
  value: ConsultationType;
  onChange: (value: ConsultationType) => void;
  prices: ConsultationPrices;
  allowNone?: boolean;
}) {
  return (
    <div className="consultation-choice">
      {consultationOptions.filter(option => allowNone || option !== "none").map(option => (
        <button type="button" key={option} className={value === option ? "active" : ""} onClick={() => onChange(option)}>
          <span className="choice-icon">{option === "none" ? <X size={16} /> : <Stethoscope size={16} />}</span>
          <span><strong>{CONSULTATION_LABELS[option]}</strong><small>{option === "none" ? "بدون احتساب رسوم معاينة" : formatCurrency(consultationFeeFor(option, prices))}</small></span>
          {value === option && <BadgeCheck size={16} />}
        </button>
      ))}
    </div>
  );
}

export function PatientDialog({ catalog, prices, onClose, onSave, saving }: {
  catalog: LabTest[];
  prices: ConsultationPrices;
  onClose: () => void;
  onSave: (input: NewPatientInput) => void;
  saving?: boolean;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Patient["gender"]>("ذكر");
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [tests, setTests] = useState<string[]>([]);
  const [consultationType, setConsultationType] = useState<ConsultationType>("general");
  const toggleTest = (code: string) => setTests(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]);
  const testsTotal = tests.reduce((sum, code) => sum + (catalog.find(test => test.code === code)?.price ?? 0), 0);
  const total = testsTotal + consultationFeeFor(consultationType, prices);
  const ageNumber = age === "" ? undefined : Number(age);
  const ageInvalid = ageNumber != null && (!Number.isInteger(ageNumber) || ageNumber < 0 || ageNumber > 130);
  const canSave = name.trim().length >= 2 && !ageInvalid && (tests.length > 0 || consultationType !== "none");

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card wide-modal" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header"><div><span className="eyebrow">استقبال جديد</span><h2>تسجيل مريض وإصدار فاتورة</h2></div><button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button></div>
        <div className="modal-body">
          <div className="form-grid">
            <label className="form-field full-field"><span>اسم المريض <b>*</b></span><input autoFocus required maxLength={180} value={name} onChange={event => setName(event.target.value)} placeholder="مثال: محمد أحمد" /></label>
            <label className="form-field"><span>الجنس <b>*</b></span><select required value={gender} onChange={event => setGender(event.target.value as Patient["gender"])}><option>ذكر</option><option>أنثى</option></select></label>
            <label className="form-field"><span>العمر</span><input type="number" min="0" max="130" step="1" value={age} onChange={event => setAge(event.target.value)} placeholder="اختياري" aria-invalid={ageInvalid} /></label>
            <label className="form-field"><span>رقم الهاتف</span><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="09xx xxx xxx" /></label>
            <label className="form-field"><span>العنوان</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder="الحي / المدينة" /></label>
          </div>

          <div className="modal-subsection">
            <div><span className="eyebrow">مقابلة / معاينة الطبيب</span><h3>اختر نوع المعاينة أو استبعدها من الفاتورة</h3></div>
            <ConsultationChoice value={consultationType} onChange={setConsultationType} prices={prices} />
          </div>

          <div className="modal-subsection">
            <div><span className="eyebrow">الفحوصات المطلوبة</span><h3>يمكن تركها فارغة إذا كانت الزيارة معاينة فقط</h3></div>
            <TestPicker catalog={catalog} selected={tests} onToggle={toggleTest} />
          </div>

          <div className="invoice-preview">
            <div>
              <span>ملخص الفاتورة</span>
              <strong>{consultationType === "none" ? "بدون معاينة" : CONSULTATION_LABELS[consultationType]} · {tests.length} فحص</strong>
              <small>المعاينة {formatCurrency(consultationFeeFor(consultationType, prices))} + الفحوصات {formatCurrency(testsTotal)}</small>
            </div>
            <strong>{formatCurrency(total)}</strong>
          </div>
        </div>
        <div className="modal-footer">
          <button className="button button-secondary" onClick={onClose}>إلغاء</button>
          <button className="button button-primary" disabled={saving || !canSave} onClick={() => onSave({ name: name.trim(), gender, age: ageNumber, phone: phone.trim() || "—", address: address.trim() || "—", tests, consultationType })}><ReceiptText size={16} />{saving ? "جارٍ الحفظ..." : "حفظ وطباعة التذكرة"}</button>
        </div>
      </div>
    </div>
  );
}

export function ExistingInvoiceDialog({ patients, catalog, prices, initialPatientNumber, onClose, onSave, saving }: {
  patients: Patient[];
  catalog: LabTest[];
  prices: ConsultationPrices;
  initialPatientNumber?: string;
  onClose: () => void;
  onSave: (patientNumber: string, codes: string[], consultationType: ConsultationType) => void;
  saving?: boolean;
}) {
  const availablePatients = patients.filter(patient => patient.databaseId != null && patient.invoiceStatus !== "cancelled" && patient.invoiceStatus !== "refunded");
  const [patientNumber, setPatientNumber] = useState(initialPatientNumber ?? availablePatients[0]?.id ?? "");
  const [tests, setTests] = useState<string[]>([]);
  const [consultationType, setConsultationType] = useState<ConsultationType>("none");
  const patient = availablePatients.find(item => item.id === patientNumber);
  const orderedCodes = patient?.tests ?? [];
  const toggleTest = (code: string) => setTests(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]);
  const testsTotal = tests.reduce((sum, code) => sum + (catalog.find(test => test.code === code)?.price ?? 0), 0);
  const total = testsTotal + consultationFeeFor(consultationType, prices);
  const canSave = Boolean(patient) && (tests.length > 0 || consultationType !== "none");

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card wide-modal" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header"><div><span className="eyebrow">فاتورة مرتبطة بسجل المريض</span><h2>إصدار فاتورة لمريض موجود</h2></div><button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button></div>
        <div className="modal-body">
          {availablePatients.length === 0 ? <div className="empty-state"><UserPlus size={22} /><strong>لا يوجد مرضى مسجلون بعد</strong><span>سجّل مريضًا جديدًا أولًا، ثم يمكنك إصدار فواتير متابعة له.</span></div> : (
            <>
              <label className="form-field"><span>المريض</span><select value={patientNumber} onChange={event => { setPatientNumber(event.target.value); setTests([]); }}>{availablePatients.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id} · {item.phone}</option>)}</select></label>
              <p className="modal-paragraph">هذه فاتورة خدمات إضافية لنفس سجل المريض، ولا تنشئ مريضًا أو رقم ملف جديدًا. الفحوصات التي سبق طلبها لا تظهر لتفادي التكرار.</p>
              <div className="modal-subsection">
                <div><span className="eyebrow">معاينة إضافية (اختياري)</span><h3>أضف معاينة طبيب لهذه الفاتورة إن لزم</h3></div>
                <ConsultationChoice value={consultationType} onChange={setConsultationType} prices={prices} />
              </div>
              <div className="modal-subsection">
                <div><span className="eyebrow">الفحوصات الإضافية</span><h3>اختر فحصًا واحدًا على الأقل أو معاينة</h3></div>
                <TestPicker catalog={catalog} selected={tests} onToggle={toggleTest} disabledCodes={orderedCodes} emptyHint="كل فحوصات الكتالوج مرتبطة بهذا السجل" />
              </div>
              <div className="invoice-preview"><div><span>الخدمات الإضافية</span><strong>{tests.length} فحص{tests.length ? "" : " · بدون فحوصات"}{consultationType !== "none" ? " · معاينة" : ""}</strong></div><strong>{formatCurrency(total)}</strong></div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="button button-secondary" onClick={onClose}>إلغاء</button>
          <button className="button button-primary" disabled={saving || !canSave} onClick={() => patient && onSave(patient.id, tests, consultationType)}><ReceiptText size={16} />{saving ? "جارٍ الحفظ..." : "إنشاء الفاتورة المرتبطة"}</button>
        </div>
      </div>
    </div>
  );
}

export function InvoiceEditor({ invoiceId, catalog, prices, onClose, onSaved, onToast }: {
  invoiceId: number;
  catalog: LabTest[];
  prices: ConsultationPrices;
  onClose: () => void;
  onSaved: () => void;
  onToast: (message: string) => void;
}) {
  const detailQuery = trpc.billing.detail.useQuery({ invoiceId }, { retry: false });
  const updateMutation = trpc.billing.updateInvoice.useMutation();
  const [selection, setSelection] = useState<string[] | null>(null);
  const [consultationType, setConsultationType] = useState<ConsultationType | null>(null);
  const [reason, setReason] = useState("");
  const detail = detailQuery.data;
  const codeByTestId = new Map((detail?.tests ?? []).map(test => [test.id, test.code]));
  const currentCodes = (detail?.items ?? []).flatMap(item => {
    const code = item.labTestId == null ? undefined : codeByTestId.get(item.labTestId);
    return code ? [code] : [];
  });
  const currentConsultation: ConsultationType = detail?.invoice.consultationType ?? "none";
  const selected = selection ?? currentCodes;
  const activeConsultation = consultationType ?? currentConsultation;
  const priceByCode = new Map((detail?.items ?? []).flatMap(item => {
    const code = item.labTestId == null ? undefined : codeByTestId.get(item.labTestId);
    return code ? [[code, item.unitPrice] as const] : [];
  }));
  const consultationFee = activeConsultation === "none" ? 0 : activeConsultation === currentConsultation ? detail?.invoice.consultationFee ?? consultationFeeFor(activeConsultation, prices) : consultationFeeFor(activeConsultation, prices);
  const total = selected.reduce((sum, code) => sum + (priceByCode.get(code) ?? catalog.find(test => test.code === code)?.price ?? 0), 0) + consultationFee;
  const completedCodes = new Set((detail?.orders ?? []).filter(order => order.status === "completed").flatMap(order => {
    const code = order.labTestId == null ? undefined : codeByTestId.get(order.labTestId);
    return code ? [code] : [];
  }));
  const removedCompleted = new Set(currentCodes.filter(code => !selected.includes(code) && completedCodes.has(code)));
  const toggleTest = (code: string) => setSelection(current => {
    const base = current ?? currentCodes;
    return base.includes(code) ? base.filter(item => item !== code) : [...base, code];
  });
  const canSave = Boolean(detail) && reason.trim().length >= 3 && !updateMutation.isPending && (selected.length > 0 || activeConsultation !== "none");

  const save = () => {
    if (!detail) return;
    updateMutation.mutate({ invoiceId, testCodes: selected, consultationType: activeConsultation, reason: reason.trim() }, {
      onSuccess: result => {
        const delta = result.delta === 0 ? "دون تغيير في الإجمالي" : `${result.delta > 0 ? "زيادة" : "خصم"} ${formatCurrency(Math.abs(result.delta))}`;
        onToast(`تم تحديث الفاتورة ${detail.invoice.invoiceNumber} · ${delta}${result.requiresRecollection ? " · أُعيدت الفاتورة إلى انتظار التحصيل" : ""}`);
        onSaved();
        onClose();
      },
      onError: error => onToast(error.message || "تعذر تعديل الفاتورة"),
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card wide-modal invoice-editor" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow">تعديل فاتورة · كاشير</span><h2>{detail ? `${detail.invoice.invoiceNumber} · ${detail.patient?.name ?? "مريض"}` : "جارٍ تحميل الفاتورة..."}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button>
        </div>
        <div className="modal-body">
          {detailQuery.isError ? <div className="empty-state"><AlertCircle size={22} /><strong>تعذر تحميل الفاتورة</strong><span>{detailQuery.error.message}</span></div> : !detail ? <div className="empty-state"><strong>جارٍ التحميل...</strong></div> : (
            <>
              <div className="editor-summary">
                <div><span>الحالة</span><strong>{detail.invoice.status === "paid" ? "مدفوعة" : detail.invoice.status === "pending" ? "بانتظار التحصيل" : detail.invoice.status}</strong></div>
                <div><span>الإجمالي الحالي</span><strong>{formatCurrency(detail.invoice.total)}</strong></div>
                <div><span>الفحوصات الحالية</span><strong>{currentCodes.length}</strong></div>
                <div><span>الإجمالي بعد التعديل</span><strong className="teal-text">{formatCurrency(total)}</strong></div>
              </div>

              <div className="modal-subsection">
                <div><span className="eyebrow">معاينة الطبيب</span><h3>يمكن تغيير نوع المعاينة أو إزالتها بالكامل</h3></div>
                <ConsultationChoice value={activeConsultation} onChange={setConsultationType} prices={prices} />
              </div>

              <div className="modal-subsection">
                <div><span className="eyebrow">بنود الفحص</span><h3>أضف فحصًا جديدًا أو احذف فحصًا قديمًا مع الحفاظ على أسعار البنود المتبقية</h3></div>
                <TestPicker catalog={catalog} selected={selected} onToggle={toggleTest} />
              </div>

              {removedCompleted.size > 0 && <div className="locked-banner danger"><AlertCircle size={18} /><div><strong>لا يمكن حذف فحص صدرت نتيجته</strong><span>الفحوصات: {[...removedCompleted].join("، ")}. أعد تحديدها قبل الحفظ.</span></div></div>}

              <label className="form-field full-field"><span>سبب التعديل (إلزامي) *</span><textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} placeholder="مثال: إضافة فحص CBC بطلب من الطبيب" /></label>
              <div className="modal-hint"><ShieldCheck size={15} /><span>يُحفظ سجل التعديل بالأسعار القديمة والجديدة. إضافة فحص إلى فاتورة مدفوعة تُعيدها إلى انتظار التحصيل، ويُحجب المختبر حتى السداد.</span></div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="button button-secondary" onClick={onClose}>إلغاء</button>
          <button className="button button-primary" disabled={!canSave || removedCompleted.size > 0} onClick={save}><BadgeCheck size={16} />{updateMutation.isPending ? "جارٍ الحفظ..." : "حفظ تعديل الفاتورة"}</button>
        </div>
      </div>
    </div>
  );
}

export function LoginDialog({ onClose, onToast }: { onClose: () => void; onToast: (message: string) => void }) {
  const previewQuery = trpc.auth.previewAvailable.useQuery(undefined, { retry: false });
  const previewMutation = trpc.auth.previewLogin.useMutation();
  const [error, setError] = useState("");
  const roles: Role[] = ["admin", "supervisor", "cashier", "lab"];

  const officialLogin = () => {
    try {
      startLogin();
    } catch {
      setError("لم تُهيَّأ بوابة الدخول الموحد في هذه البيئة. استخدم دخول المعاينة بالصلاحية المطلوبة.");
    }
  };

  const previewLogin = (role: Role) => {
    previewMutation.mutate({ role }, {
      onSuccess: () => {
        onToast(`تم الدخول بصلاحية ${roleLabels[role]}`);
        window.setTimeout(() => window.location.reload(), 300);
      },
      onError: mutationError => setError(mutationError.message || "تعذر تفعيل دخول المعاينة"),
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card login-card" onMouseDown={event => event.stopPropagation()}>
        <div className="login-hero">
          <AppLogo />
          <button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button>
          <div className="login-symbol"><ShieldCheck size={29} /></div>
          <span className="eyebrow">دخول آمن للمستوصف</span>
          <h2>اختر طريقة الدخول</h2>
          <p>سجّل الدخول بحساب Manus الرسمي، أو استخدم دخول المعاينة لمراجعة صلاحيات كل دور على قاعدة البيانات الفعلية.</p>
        </div>
        <div className="modal-body login-body">
          <button className="button button-primary full-width login-main-action" onClick={officialLogin}><LogIn size={17} />الدخول الموحد عبر Manus</button>
          {error && <div className="login-error"><AlertCircle size={15} />{error}</div>}
          {previewQuery.data?.enabled && (
            <>
              <div className="login-divider"><span>دخول المعاينة بالصلاحية</span></div>
              <div className="demo-role-grid">
                {roles.map(role => (
                  <button key={role} disabled={previewMutation.isPending} onClick={() => previewLogin(role)}>
                    <span className="demo-role-icon"><ShieldCheck size={16} /></span>
                    <span><strong>{roleLabels[role]}</strong><small>{roleDescriptions[role]}</small></span>
                  </button>
                ))}
              </div>
              <p className="login-note">دخول المعاينة يفعّل جلسة حقيقية على قاعدة البيانات، ويحفظ كل إجراء باسم الحساب التجريبي. عطّله بإزالة ALLOW_PREVIEW_LOGIN من بيئة الإنتاج.</p>
            </>
          )}
          {previewQuery.isSuccess && !previewQuery.data.enabled && <p className="login-note">دخول المعاينة غير مفعّل في هذه البيئة. استخدم حساب Manus الرسمي.</p>}
        </div>
      </div>
    </div>
  );
}

export function PatientDrawer({ patient, catalog, prices, onClose, onPrintInvoice, onPrintMedicalReport, onEditInvoice, onAddInvoice, onNavigate }: {
  patient: Patient;
  catalog: LabTest[];
  prices: ConsultationPrices;
  onClose: () => void;
  onPrintInvoice: () => void;
  onPrintMedicalReport: () => void;
  onEditInvoice: () => void;
  onAddInvoice: () => void;
  onNavigate: (section: "lab" | "billing") => void;
}) {
  const chip = consultationChip(patient);
  const editable = patient.databaseInvoiceId != null && patient.invoiceStatus !== "cancelled" && patient.invoiceStatus !== "refunded";
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="patient-drawer" onMouseDown={event => event.stopPropagation()}>
        <div className="drawer-header"><div><span className="eyebrow">سجل المريض</span><h2>{patient.name}</h2><span>{patient.id} · {patient.gender} · {patient.age == null ? "العمر غير محدد" : `${patient.age} سنة`}</span></div><button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button></div>
        <div className="drawer-body">
          <div className="drawer-profile"><div className="avatar large">{initials(patient.name)}</div><div><strong>{patient.phone}</strong><span>{patient.address}</span><StatusPill status={patient.status} /></div></div>
          <div className="drawer-summary">
            <div><span>الفاتورة الحالية</span><strong>{patient.invoice}</strong></div>
            <div><span>الإجمالي</span><strong>{formatCurrency(getInvoiceTotal(patient, catalog, prices))}</strong></div>
            <div><span>الفحوصات</span><strong>{getInvoiceTests(patient).length}</strong></div>
          </div>
          {chip && <div className="drawer-chip-row"><span className="consultation-chip"><Stethoscope size={14} />{chip} · {formatCurrency(getConsultationFee(patient, prices))}</span></div>}
          <div className="drawer-section">
            <span className="eyebrow">رحلة المريض</span>
            <div className="patient-journey">
              <div className="journey-step done"><span><BadgeCheck size={14} /></span><div><strong>تم التسجيل</strong><small>{formatClinicDateFromKey(patient.registeredDate ?? getClinicDateKey())} · {patient.registeredAt}</small></div></div>
              <div className="journey-step done"><span><CreditCard size={14} /></span><div><strong>{patient.paid ? "تم التحصيل" : "بانتظار التحصيل"}</strong><small>{patient.invoice} · {patient.invoiceStatus ?? "pending"}</small></div></div>
              <div className={`journey-step ${patient.status === "في المختبر" ? "active" : ""}`}><span><FlaskConical size={14} /></span><div><strong>المختبر</strong><small>{getInvoiceTests(patient).length} فحوصات مرتبطة</small></div></div>
              <div className="journey-step"><span><FileCheck2 size={14} /></span><div><strong>إصدار النتيجة</strong><small>بعد سحب العينة واكتمال الفحص</small></div></div>
            </div>
          </div>
          <div className="drawer-section">
            <div className="drawer-section-head"><span className="eyebrow">الفحوصات المطلوبة</span><button className="link-button" onClick={onAddInvoice}>فاتورة إضافية <Plus size={14} /></button></div>
            <div className="drawer-tests">
              {getInvoiceTests(patient).length ? getInvoiceTests(patient).map(code => {
                const test = catalog.find(item => item.code === code);
                return <div key={code}><div className="test-code">{code}</div><div><strong>{test?.name ?? "فحص مخبري"}</strong><span>{test?.sample ?? "—"}</span></div><BadgeCheck size={16} className="teal-text" /></div>;
              }) : <p className="muted-cell">لم تُضف فحوصات مخبرية لهذه الفاتورة. يمكن إضافتها من محرر الفاتورة.</p>}
            </div>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="button button-secondary" onClick={onPrintInvoice}><ReceiptText size={16} />الفاتورة</button>
          <button className="button button-secondary" onClick={onPrintMedicalReport}><FileText size={16} />التقرير الطبي</button>
          {editable && <button className="button button-secondary" onClick={onEditInvoice}><Pencil size={16} />تعديل</button>}
          <button className="button button-primary" onClick={() => { onNavigate(patient.tests.length ? "lab" : "billing"); onClose(); }}><FlaskConical size={16} />{patient.tests.length ? "فتح في المختبر" : "فتح الفاتورة"}</button>
        </div>
      </aside>
    </div>
  );
}

export function InvoiceLinesPreview({ patient, catalog, prices }: { patient: Patient; catalog: LabTest[]; prices: ConsultationPrices }) {
  const lines = getInvoiceLines(patient, catalog, prices);
  return (
    <div className="invoice-lines-preview">
      {lines.map((line, index) => <div key={`${line.description}-${index}`}><span>{line.description}</span><strong>{formatCurrency(line.unitPrice)}</strong></div>)}
    </div>
  );
}

export function ConsultationBadge({ patient, prices }: { patient: Patient; prices: ConsultationPrices }) {
  const type = getConsultationType(patient);
  if (type === "none") return null;
  return <span className="consultation-chip"><Stethoscope size={13} />{CONSULTATION_LABELS[type]} · {formatCurrency(getConsultationFee(patient, prices))}</span>;
}

export function EmptyInvoicesHint() {
  return <div className="empty-state"><CalendarDays size={22} /><strong>لا توجد فواتير</strong><span>سجّل مريضًا جديدًا أو أصدر فاتورة لمريض موجود.</span></div>;
}

export function TestCountBadge({ count }: { count: number }) {
  return <span className="catalog-count"><TestTube2 size={14} />{count} فحص</span>;
}
