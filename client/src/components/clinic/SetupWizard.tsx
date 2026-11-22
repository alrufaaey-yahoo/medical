import { useState } from "react";
import type { FormEvent } from "react";
import {
  BadgeCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { DEFAULT_CONSULTATION_PRICES } from "@shared/billing";
import { trpc } from "@/lib/trpc";
import { AppLogo } from "./ui";

type SetupWizardProps = { onCompleted: () => void };

type FormState = {
  name: string;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  footerText: string;
  generalPrice: string;
  specialistPrice: string;
  adminName: string;
  username: string;
  password: string;
  confirmPassword: string;
};

const initialState: FormState = {
  name: "",
  logoUrl: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  footerText: "نتمنى لكم دوام الصحة والعافية.",
  generalPrice: String(DEFAULT_CONSULTATION_PRICES.general),
  specialistPrice: String(DEFAULT_CONSULTATION_PRICES.specialist),
  adminName: "",
  username: "",
  password: "",
  confirmPassword: "",
};

export function SetupWizard({ onCompleted }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState("");
  const setupMutation = trpc.setup.complete.useMutation({
    onSuccess: onCompleted,
    onError: e => setError(e.message),
  });
  const update = (key: keyof FormState, value: string) =>
    setForm(current => ({ ...current, [key]: value }));
  const next = () => {
    setError("");
    if (
      step === 0 &&
      (!form.name.trim() || !form.address.trim() || !form.phone.trim())
    )
      return setError("أكمل اسم المستوصف والعنوان ورقم الهاتف للمتابعة.");
    if (
      step === 1 &&
      (!form.adminName.trim() ||
        !form.username.trim() ||
        form.password.length < 8 ||
        form.password !== form.confirmPassword)
    )
      return setError(
        "أدخل بيانات المدير، واجعل كلمة المرور 8 أحرف على الأقل ومتطابقة."
      );
    setStep(current => Math.min(2, current + 1));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setupMutation.mutate({
      clinic: {
        name: form.name.trim(),
        logoUrl: form.logoUrl.trim() || undefined,
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        website: form.website.trim() || undefined,
        footerText: form.footerText.trim() || undefined,
      },
      admin: {
        name: form.adminName.trim(),
        username: form.username.trim(),
        password: form.password,
      },
      pricing: {
        generalPrice: Number(form.generalPrice),
        specialistPrice: Number(form.specialistPrice),
      },
    });
  };
  const field = (
    key: keyof FormState,
    label: string,
    type = "text",
    required = false
  ) => (
    <label className="form-field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        required={required}
        value={form[key]}
        onChange={event => update(key, event.target.value)}
      />
    </label>
  );

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-header">
          <AppLogo />
          <span className="eyebrow">تهيئة النظام لأول تشغيل</span>
          <h1>لنجهّز المستوصف للعمل</h1>
          <p>
            أدخل بيانات المنشأة وأنشئ حساب المدير الرئيسي. ستظهر هذه البيانات في
            الفواتير والتقارير.
          </p>
          <div className="setup-progress">
            {["بيانات المستوصف", "حساب المدير", "الإعدادات الأساسية"].map(
              (label, index) => (
                <div key={label} className={index <= step ? "active" : ""}>
                  <b>{index + 1}</b>
                  <span>{label}</span>
                </div>
              )
            )}
          </div>
        </div>
        <form onSubmit={submit} className="setup-body">
          {step === 0 && (
            <div className="setup-fields">
              <div className="setup-section-title">
                <Building2 size={19} />
                <div>
                  <strong>بيانات المستوصف</strong>
                  <span>البيانات التي ستظهر للمرضى وفي المستندات المطبوعة</span>
                </div>
              </div>
              {field("name", "اسم المستوصف", "text", true)}
              {field("logoUrl", "رابط الشعار (HTTPS)", "url")}
              {field("address", "العنوان الكامل", "text", true)}
              {field("phone", "رقم الهاتف", "tel", true)}
              {field("email", "البريد الإلكتروني", "email")}
              {field("website", "الموقع الإلكتروني", "url")}
              {field("footerText", "رسالة التذييل في التقارير", "text")}
            </div>
          )}
          {step === 1 && (
            <div className="setup-fields">
              <div className="setup-section-title">
                <ShieldCheck size={19} />
                <div>
                  <strong>إنشاء مدير النظام</strong>
                  <span>
                    سيكون هذا الحساب مسؤولًا عن المستخدمين والأسعار والإعدادات
                  </span>
                </div>
              </div>
              {field("adminName", "اسم المدير الكامل", "text", true)}
              {field("username", "اسم المستخدم", "text", true)}
              {field("password", "كلمة المرور", "password", true)}
              {field("confirmPassword", "تأكيد كلمة المرور", "password", true)}
              <div className="setup-hint">
                <KeyRound size={15} />
                كلمة المرور يجب ألا تقل عن 8 أحرف، واحفظها في مكان آمن.
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="setup-fields">
              <div className="setup-section-title">
                <BadgeCheck size={19} />
                <div>
                  <strong>الإعدادات الأساسية</strong>
                  <span>
                    يمكن تعديل هذه القيم لاحقًا من صفحة الإعدادات والتسعير
                  </span>
                </div>
              </div>
              {field(
                "generalPrice",
                "سعر معاينة الطبيب العمومي",
                "number",
                true
              )}
              {field(
                "specialistPrice",
                "سعر معاينة الطبيب الاختصاصي",
                "number",
                true
              )}
              <div className="setup-summary">
                <strong>مراجعة سريعة</strong>
                <span>
                  {form.name} · {form.address}
                </span>
                <span>
                  المدير: {form.adminName} ({form.username})
                </span>
                <span>سيتم إنشاء البنوك الافتراضية: بنكك، أوكاش، فوري.</span>
              </div>
            </div>
          )}
          {error && <div className="setup-error">{error}</div>}
          <div className="setup-actions">
            {step > 0 && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setError("");
                  setStep(current => current - 1);
                }}
              >
                <ChevronRight size={16} />
                السابق
              </button>
            )}
            {step < 2 ? (
              <button
                type="button"
                className="button button-primary"
                onClick={next}
              >
                التالي
                <ChevronLeft size={16} />
              </button>
            ) : (
              <button
                type="submit"
                className="button button-primary"
                disabled={setupMutation.isPending}
              >
                {setupMutation.isPending
                  ? "جارٍ حفظ التهيئة..."
                  : "إتمام التهيئة"}
                <BadgeCheck size={16} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
