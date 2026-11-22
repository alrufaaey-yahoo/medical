import { AlertCircle, BadgeCheck, Copy, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Draft = {
  enabled: boolean;
  mode: "local" | "hosted";
  deviceIp: string;
  computerIp: string;
  listenPort: number;
  protocol: "mllp" | "raw-idle";
  transSelect: string;
  autoTrans: boolean;
  subnet: string;
};

const DEFAULT_DRAFT: Draft = {
  enabled: false,
  mode: "local",
  deviceIp: "192.168.1.100",
  computerIp: "192.168.1.111",
  listenPort: 5006,
  protocol: "mllp",
  transSelect: "Net",
  autoTrans: true,
  subnet: "255.255.255.0",
};

export function CBCBridgeSettings() {
  const query = trpc.cbcBridge.settings.useQuery(undefined, { retry: false, staleTime: 5_000 });
  const update = trpc.cbcBridge.update.useMutation({
    onSuccess: () => { void query.refetch(); toast.success("تم حفظ إعدادات CBC Bridge"); },
    onError: error => toast.error(`تعذر حفظ إعدادات الربط: ${error.message}`),
  });
  const rotate = trpc.cbcBridge.rotateToken.useMutation({
    onSuccess: result => { setNewToken(result.token); void query.refetch(); },
    onError: error => toast.error(`تعذر إنشاء رمز الجسر: ${error.message}`),
  });
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [newToken, setNewToken] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setDraft({
      enabled: query.data.enabled,
      mode: query.data.mode,
      deviceIp: query.data.deviceIp,
      computerIp: query.data.computerIp,
      listenPort: query.data.listenPort,
      protocol: query.data.protocol,
      transSelect: query.data.transSelect,
      autoTrans: query.data.autoTrans,
      subnet: query.data.subnet,
    });
  }, [query.data]);

  const updateField = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(newToken);
      toast.success("نُسخ الرمز؛ احفظه محليًا خارج المستودع");
    } catch {
      toast.error("تعذر النسخ؛ انسخ الرمز الظاهر يدويًا");
    }
  };

  return (
    <section className="settings-section border-top cbc-bridge-settings">
      <div className="panel-header">
        <div><span className="eyebrow">ربط اختياري</span><h2>CBC Analyzer Bridge</h2></div>
        <span className={draft.enabled ? "saved-badge" : "readonly-badge"}>{draft.enabled ? "مفعّل حسب الإعداد" : "متوقف افتراضيًا"}</span>
      </div>
      <div className="settings-readonly-note"><AlertCircle size={15} /><span>لا يبدأ الربط حتى تفعّله هنا. لا يتصل خادم الاستضافة بعنوان الجهاز المحلي؛ في Hosted Mode يرفع الجسر النتائج باتصال HTTPS صادر. لا تفتح منفذ 5006 إلى الإنترنت.</span></div>
      {query.isError && <div className="settings-readonly-note"><AlertCircle size={15} /><span>تعذر تحميل إعدادات CBC Bridge. تحقق من تطبيق الترحيل الإضافي في بيئة المعاينة.</span></div>}
      <div className="settings-form cbc-bridge-form">
        <label className="form-field"><span>حالة التكامل</span><select value={draft.enabled ? "on" : "off"} onChange={event => updateField("enabled", event.target.value === "on")}><option value="off">متوقف</option><option value="on">مفعّل</option></select></label>
        <label className="form-field"><span>وضع التشغيل</span><select value={draft.mode} onChange={event => updateField("mode", event.target.value as Draft["mode"])}><option value="local">Local Mode</option><option value="hosted">Hosted Mode (HTTPS صادر)</option></select></label>
        <label className="form-field"><span>عنوان IP جهاز CBC</span><input value={draft.deviceIp} onChange={event => updateField("deviceIp", event.target.value)} placeholder="192.168.1.100" /></label>
        <label className="form-field"><span>عنوان IP حاسوب المختبر (واجهة الاستماع)</span><input value={draft.computerIp} onChange={event => updateField("computerIp", event.target.value)} placeholder="192.168.1.111" /></label>
        <label className="form-field"><span>منفذ الاستماع</span><input type="number" min={1024} max={65535} value={draft.listenPort} onChange={event => updateField("listenPort", Number(event.target.value))} /></label>
        <label className="form-field"><span>تأطير HL7</span><select value={draft.protocol} onChange={event => updateField("protocol", event.target.value as Draft["protocol"])}><option value="mllp">MLLP (الموصى به عند تأكيده)</option><option value="raw-idle">HL7 خام (تحديد الرسالة بسكون الاتصال)</option></select></label>
        <label className="form-field"><span>Trans Select</span><input value={draft.transSelect} onChange={event => updateField("transSelect", event.target.value)} /></label>
        <label className="form-field"><span>Subnet Mask</span><input value={draft.subnet} onChange={event => updateField("subnet", event.target.value)} /></label>
        <label className="form-field"><span>Auto Trans</span><select value={draft.autoTrans ? "on" : "off"} onChange={event => updateField("autoTrans", event.target.value === "on")}><option value="on">On</option><option value="off">Off</option></select></label>
      </div>
      <div className="cbc-bridge-actions">
        <button className="button button-primary" disabled={update.isPending || query.isLoading} onClick={() => update.mutate(draft)}><BadgeCheck size={15} />{update.isPending ? "جارٍ الحفظ..." : "حفظ إعدادات CBC"}</button>
        <button className="button button-secondary" disabled={rotate.isPending} onClick={() => { setNewToken(""); rotate.mutate(); }}><KeyRound size={15} />{rotate.isPending ? "جارٍ الإنشاء..." : "إنشاء / تدوير رمز الجسر"}</button>
      </div>
      {query.data && <p className="cbc-bridge-meta"><ShieldCheck size={14} />{query.data.tokenConfigured ? "يوجد رمز مخزن بصيغة hash فقط؛ لا يمكن عرضه مرة أخرى." : "لم يُنشأ رمز للجسر بعد."} · آخر نبضة: {query.data.lastHeartbeat ? new Date(query.data.lastHeartbeat).toLocaleString("ar") : "لا توجد"}</p>}
      {newToken && <div className="cbc-token-reveal"><strong>احفظ هذا الرمز الآن — لن يظهر بعد مغادرة الصفحة:</strong><code dir="ltr">{newToken}</code><button className="button button-soft" onClick={() => void copy()}><Copy size={14} />نسخ الرمز</button></div>}
      <div className="cbc-bridge-help">
        <strong>تشغيل CBC Local Bridge</strong>
        <code dir="ltr">CBC_SERVER_URL=http://127.0.0.1:3000</code>
        <code dir="ltr">CBC_BRIDGE_TOKEN=ضع_الرمز_المولد_هنا</code>
        <span>في Hosted Mode استخدم رابط HTTPS الخاص بالمستوصف في CBC_SERVER_URL. احتفظ بملف .env على حاسوب المعمل فقط، ولا تضع الرمز في Git أو صور عامة. بعد تغيير IP/المنفذ أعد تشغيل الجسر؛ يلزم اختبار رسالة فعلية من الجهاز لتأكيد التوافق.</span>
      </div>
      <div className="cbc-bridge-health"><RefreshCw size={14} />حالة آخر اتصال: {query.data?.lastHeartbeat ? "وصلت نبضة من الجسر" : "بانتظار تشغيل الجسر"}</div>
    </section>
  );
}
