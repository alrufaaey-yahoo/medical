import { AlertCircle, BadgeCheck, CalendarDays, ChevronDown, ShieldCheck, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isHttpsLogoUrl } from "@/lib/clinic-workflow";
import { roleDescriptions, roleLabels, rolePermissions, type Role, type Shift } from "@/lib/clinic-types";
import { SectionTitle } from "./ui";

export type ClinicSettingsDraft = {
  name: string;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  footerText: string;
};

export function Settings({ role, shift, setShift, settings, canSave, saving, onSave, banks, onAddBank, onRemoveBank }: {
  role: Role;
  shift: Shift;
  setShift: (shift: Shift) => void;
  settings: Partial<{ [K in keyof ClinicSettingsDraft]: string | null }> | null | undefined;
  canSave: boolean;
  saving: boolean;
  onSave: (draft: ClinicSettingsDraft) => void;
  banks: { id: number; name: string }[];
  onAddBank: (name: string) => void;
  onRemoveBank: (id: number) => void;
}) {
  const [bankName, setBankName] = useState("");
  const [draft, setDraft] = useState<ClinicSettingsDraft>({
    name: settings?.name ?? "مستوصف بكّا الطبي الحديث",
    logoUrl: settings?.logoUrl ?? "",
    address: settings?.address ?? "الخرطوم بحري · السودان",
    phone: settings?.phone ?? "011 234 5678 · 0912 440 218",
    email: settings?.email ?? "info@bakka-clinic.sd",
    website: settings?.website ?? "www.bakka-clinic.sd",
    footerText: settings?.footerText ?? "نتمنى لكم دوام الصحة والعافية. هذه النتيجة تعتمد على العينة والطريقة المعتمدة بالمختبر.",
  });

  useEffect(() => {
    setDraft({
      name: settings?.name ?? "مستوصف بكّا الطبي الحديث",
      logoUrl: settings?.logoUrl ?? "",
      address: settings?.address ?? "الخرطوم بحري · السودان",
      phone: settings?.phone ?? "011 234 5678 · 0912 440 218",
      email: settings?.email ?? "info@bakka-clinic.sd",
      website: settings?.website ?? "www.bakka-clinic.sd",
      footerText: settings?.footerText ?? "نتمنى لكم دوام الصحة والعافية. هذه النتيجة تعتمد على العينة والطريقة المعتمدة بالمختبر.",
    });
  }, [settings?.name, settings?.logoUrl, settings?.address, settings?.phone, settings?.email, settings?.website, settings?.footerText]);

  const update = (key: keyof ClinicSettingsDraft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const logoUrlIsValid = isHttpsLogoUrl(draft.logoUrl);

  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="الإدارة والهوية"
        title="إعدادات المستوصف"
        description="بيانات المنشأة التي تظهر في الفواتير والتقارير المطبوعة، مع مراجعة صلاحيات الدور الحالي."
        action={<button className="button button-primary" disabled={!canSave || saving || draft.name.trim().length < 2 || !logoUrlIsValid} onClick={() => onSave(draft)}><BadgeCheck size={16} />{saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}</button>}
      />

      <div className="settings-grid">
        <section className="panel settings-main">
          <div className="settings-section">
            <div className="panel-header"><div><span className="eyebrow">هوية المنشأة</span><h2>بيانات المستوصف</h2></div><span className={canSave ? "saved-badge" : "readonly-badge"}>{canSave ? "قابلة للتحديث" : "قراءة فقط"}</span></div>
            <div className="settings-form">
              <div className="settings-readonly-note"><AlertCircle size={15} /><span>{canSave ? "عدّل البيانات ثم احفظها لتظهر في الفواتير والتقارير المطبوعة." : "تعديل بيانات المستوصف من صلاحية مدير النظام فقط. مشرف التشغيل يعدّل الأسعار والتقارير والموظفين."}</span></div>
              <label className="form-field"><span>اسم المستوصف</span><input value={draft.name} disabled={!canSave} onChange={event => update("name", event.target.value)} /></label>
              <label className="form-field"><span>العنوان</span><input value={draft.address} disabled={!canSave} onChange={event => update("address", event.target.value)} /></label>
              <label className="form-field"><span>هاتف التواصل</span><input value={draft.phone} disabled={!canSave} onChange={event => update("phone", event.target.value)} /></label>
              <label className="form-field"><span>البريد الإلكتروني</span><input type="email" value={draft.email} disabled={!canSave} onChange={event => update("email", event.target.value)} /></label>
              <label className="form-field"><span>الموقع الإلكتروني</span><input value={draft.website} disabled={!canSave} onChange={event => update("website", event.target.value)} placeholder="https://example.com" /></label>
              <label className="form-field full-field"><span>رابط شعار المستوصف (HTTPS)</span><input type="url" value={draft.logoUrl} disabled={!canSave} onChange={event => update("logoUrl", event.target.value)} placeholder="https://example.com/logo.png" aria-invalid={!logoUrlIsValid} /><small>{logoUrlIsValid ? "اتركه فارغًا لاستخدام الشعار الافتراضي، أو أدخل رابط صورة آمنًا." : "أدخل رابط صورة صالحًا يبدأ بـ https://"}</small></label>
              <div className="full-field logo-preview"><img src={logoUrlIsValid && draft.logoUrl.trim() ? draft.logoUrl.trim() : "/logo.svg"} alt="معاينة شعار المستوصف" onError={event => { event.currentTarget.src = "/logo.svg"; }} /><span>{logoUrlIsValid ? (draft.logoUrl.trim() ? "معاينة الشعار الذي سيظهر في قوالب الطباعة" : "سيُستخدم الشعار الافتراضي عند ترك الرابط فارغًا") : "الرابط غير صالح؛ لن يُحفظ الشعار حتى تصحيحه"}</span></div>
              <label className="form-field full-field"><span>رسالة أسفل التقرير</span><textarea rows={3} value={draft.footerText} disabled={!canSave} onChange={event => update("footerText", event.target.value)} /></label>
            </div>
          </div>
          <div className="settings-section border-top">
            <div className="panel-header"><div><span className="eyebrow">التحصيل البنكي</span><h2>قائمة البنوك</h2></div><span className={role === "admin" ? "saved-badge" : "readonly-badge"}>{role === "admin" ? "إدارة المدير" : "قراءة فقط"}</span></div>
            <p className="settings-readonly-note">تظهر هذه الأسماء عند تسجيل الدفع البنكي. البنوك الافتراضية: بنكك، أوكاش، فوري.</p>
            {role === "admin" && <div className="heading-actions"><input aria-label="اسم بنك جديد" value={bankName} onChange={event => setBankName(event.target.value)} placeholder="اسم البنك" /><button className="button button-primary" disabled={bankName.trim().length < 2} onClick={() => { onAddBank(bankName.trim()); setBankName(""); }}><Plus size={15} />إضافة بنك</button></div>}
            <div className="test-tags">{banks.map(bank => <span key={bank.id}>{bank.name}{role === "admin" && bank.id > 0 && <button aria-label={`حذف ${bank.name}`} title="تعطيل البنك" onClick={() => onRemoveBank(bank.id)}><X size={13} /></button>}</span>)}</div>
          </div>
          <div className="settings-section border-top">
            <div className="panel-header"><div><span className="eyebrow">الوردية الحالية</span><h2>توزيع التشغيل</h2></div><CalendarDays size={19} className="muted-icon" /></div>
            <div className="shift-picker">
              {(["صباحية", "مسائية", "سهرة"] as Shift[]).map(item => (
                <button key={item} className={shift === item ? "active" : ""} onClick={() => setShift(item)}>
                  <span>{item}</span>
                  <small>{item === "صباحية" ? "08:00 – 14:00" : item === "مسائية" ? "14:00 – 22:00" : "22:00 – 08:00"}</small>
                </button>
              ))}
            </div>
            <p className="settings-readonly-note">تسلسل أرقام المرضى يُحسب على الخادم لكل وردية على حدة، ويُعاد ضبطه تلقائيًا عند أول تسجيل في وردية جديدة.</p>
          </div>
        </section>

        <aside className="settings-side">
          <section className="panel role-card">
            <div className="panel-header"><div><span className="eyebrow">الصلاحيات</span><h2>دور المستخدم</h2></div><ShieldCheck size={19} className="muted-icon" /></div>
            <div className="role-select"><select value={role} disabled><option value={role}>{roleLabels[role]}</option></select><ChevronDown size={15} /></div>
            <p>الدور مأخوذ من جلسة الدخول الحالية: {roleDescriptions[role]}</p>
            <div className="role-permissions">{rolePermissions[role].map(permission => <span key={permission}><BadgeCheck size={14} />{permission}</span>)}</div>
          </section>
          <section className="panel info-card">
            <div className="info-icon"><ShieldCheck size={19} /></div>
            <strong>البيانات الصحية محمية</strong>
            <p>لا تظهر نتائج المرضى إلا للمستخدمين المصرح لهم، ولا يمكن للمختبر إصدار نتيجة قبل اكتمال الدفع.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
