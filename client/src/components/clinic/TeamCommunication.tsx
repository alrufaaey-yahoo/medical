import { BellRing, Check, Clock3, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import type { Patient } from "@/lib/clinic-types";
import { trpc } from "@/lib/trpc";

export function TeamCommunication({ role, patient }: { role: "lab" | "cashier"; patient?: Patient }) {
  const [message, setMessage] = useState("");
  const [attentionNote, setAttentionNote] = useState("");
  const utils = trpc.useUtils();
  const messagesQuery = trpc.teamCommunication.messages.useQuery(undefined, { refetchInterval: 5000, retry: false });
  const alertsQuery = trpc.teamCommunication.cashierAlerts.useQuery(undefined, { enabled: role === "cashier", refetchInterval: 5000, retry: false });
  const sendMutation = trpc.teamCommunication.sendMessage.useMutation({
    onSuccess: () => { setMessage(""); void utils.teamCommunication.messages.invalidate(); },
  });
  const flagMutation = trpc.teamCommunication.flagCashier.useMutation({
    onSuccess: () => { setAttentionNote(""); void utils.teamCommunication.cashierAlerts.invalidate(); },
  });
  const resolveMutation = trpc.teamCommunication.resolveCashierAlert.useMutation({
    onSuccess: () => { void utils.teamCommunication.cashierAlerts.invalidate(); },
  });
  const isPendingInvoice = role === "lab" && patient?.invoiceStatus === "pending" && Boolean(patient.databaseInvoiceId);

  return (
    <section className="panel team-communication">
      <div className="panel-header"><div><span className="eyebrow">تواصل التشغيل</span><h2><MessageCircle size={18} /> المختبر والكاشير</h2></div><span className="communication-live"><i /> متصل</span></div>
      {role === "lab" && patient && <div className="attention-compose">
        <div><strong><BellRing size={16} /> تنبيه للكاشير عن فاتورة معلّقة</strong><span>{isPendingInvoice ? `${patient.name} · ${patient.id} · ${patient.tests.join("، ") || "فحوصات"}` : "يتاح التنبيه عندما تكون فاتورة المريض بانتظار الدفع."}</span></div>
        {isPendingInvoice && <>
          <input value={attentionNote} maxLength={500} onChange={event => setAttentionNote(event.target.value)} placeholder="ملاحظة اختيارية للكاشير" aria-label="ملاحظة تنبيه الكاشير" />
          <button className="button button-soft" disabled={flagMutation.isPending} onClick={() => flagMutation.mutate({ invoiceId: patient.databaseInvoiceId!, note: attentionNote.trim() || undefined })}><BellRing size={14} />{flagMutation.isPending ? "جارٍ الإرسال" : "إرسال تنبيه"}</button>
        </>}
        {flagMutation.error && <small className="communication-error">{flagMutation.error.message}</small>}
      </div>}
      {role === "cashier" && <div className="cashier-alert-list">
        <strong className="communication-section-title"><BellRing size={15} /> تنبيهات المختبر للفواتير المعلّقة</strong>
        {(alertsQuery.data ?? []).map(alert => <article className="cashier-alert" key={alert.id}>
          <div><strong>{alert.patientName}</strong><span>{alert.patientNumber} · الفاتورة {alert.invoiceNumber}</span>{alert.note && <p>{alert.note}</p>}<small>من {alert.flaggedByName ?? "المختبر"} · {new Date(alert.flaggedAt).toLocaleTimeString("ar-SD", { hour: "2-digit", minute: "2-digit" })}</small></div>
          <button className="row-menu" title="تمت المتابعة" aria-label={`إغلاق تنبيه ${alert.patientName}`} disabled={resolveMutation.isPending} onClick={() => resolveMutation.mutate({ id: alert.id })}><Check size={16} /></button>
        </article>)}
        {alertsQuery.data?.length === 0 && <span className="communication-empty"><Clock3 size={14} /> لا توجد تنبيهات مفتوحة.</span>}
      </div>}
      <div className="team-chat">
        <strong className="communication-section-title"><MessageCircle size={15} /> المحادثة المشتركة</strong>
        <div className="team-chat-messages" aria-live="polite">
          {(messagesQuery.data ?? []).map(item => <article className={`team-chat-message ${item.senderRole === role ? "mine" : "theirs"}`} key={item.id}>
            <div><strong>{item.senderName ?? (item.senderRole === "lab" ? "المختبر" : "الكاشير")}</strong><time>{new Date(item.createdAt).toLocaleTimeString("ar-SD", { hour: "2-digit", minute: "2-digit" })}</time></div>
            <p>{item.body}</p>
          </article>)}
          {messagesQuery.data?.length === 0 && <span className="communication-empty">ابدأ رسالة للفريق، وتظهر الرسائل تلقائيًا لدى الدور الآخر.</span>}
        </div>
        <form className="team-chat-compose" onSubmit={event => { event.preventDefault(); const body = message.trim(); if (body) sendMutation.mutate({ body }); }}>
          <input value={message} maxLength={1000} onChange={event => setMessage(event.target.value)} placeholder="اكتب رسالة للكاشير والمختبر..." aria-label="رسالة إلى فريق المختبر والكاشير" />
          <button className="button button-primary" disabled={sendMutation.isPending || !message.trim()} aria-label="إرسال الرسالة"><Send size={15} /> إرسال</button>
        </form>
        {sendMutation.error && <small className="communication-error">تعذر إرسال الرسالة: {sendMutation.error.message}</small>}
      </div>
    </section>
  );
}
