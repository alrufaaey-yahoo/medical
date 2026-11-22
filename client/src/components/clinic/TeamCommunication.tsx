import { BellRing, Check, Clock3, MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Patient } from "@/lib/clinic-types";
import { trpc } from "@/lib/trpc";

export function TeamCommunication({
  role,
  patient,
  open,
  onOpenChange,
}: {
  role: "lab" | "cashier";
  patient?: Patient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [message, setMessage] = useState("");
  const [attentionNote, setAttentionNote] = useState("");
  const utils = trpc.useUtils();
  const messagesQuery = trpc.teamCommunication.messages.useQuery(undefined, {
    enabled: open,
    refetchInterval: open ? 5000 : false,
    retry: false,
  });
  const sendMutation = trpc.teamCommunication.sendMessage.useMutation({
    onSuccess: () => {
      setMessage("");
      void utils.teamCommunication.messages.invalidate();
    },
  });
  const flagMutation = trpc.teamCommunication.flagCashier.useMutation({
    onSuccess: () => {
      setAttentionNote("");
      void utils.teamCommunication.cashierAlerts.invalidate();
    },
  });
  const endOfMessages = useRef<HTMLDivElement>(null);
  const isPendingInvoice = role === "lab" && patient?.invoiceStatus === "pending" && Boolean(patient.databaseInvoiceId);
  const messages = messagesQuery.data ?? [];

  useEffect(() => {
    if (open) endOfMessages.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  useEffect(() => {
    if (!open) setMessage("");
  }, [open]);

  return (
    <div className="team-communication-root" dir="rtl">
      {open && (
        <section className="team-communication-panel" role="dialog" aria-modal="false" aria-labelledby="team-chat-title">
          <header className="team-communication-header">
            <div className="team-chat-heading-icon"><MessageCircle size={19} /></div>
            <div className="team-chat-heading-copy">
              <strong id="team-chat-title">تواصل فريق التشغيل</strong>
              <span><i /> المختبر والكاشير · رسائل مباشرة</span>
            </div>
            <button className="icon-button team-chat-close" onClick={() => onOpenChange(false)} aria-label="إغلاق المحادثة"><X size={18} /></button>
          </header>

          {role === "lab" && patient && (
            <div className="attention-compose">
              <div className="attention-compose-copy">
                <strong><BellRing size={15} /> تنبيه للكاشير</strong>
                <span>{isPendingInvoice ? `${patient.name} · ${patient.id} · فاتورة بانتظار الدفع` : "أرسل تنبيهًا عندما تكون الفاتورة بانتظار الدفع."}</span>
              </div>
              {isPendingInvoice && (
                <>
                  <input value={attentionNote} maxLength={500} onChange={event => setAttentionNote(event.target.value)} placeholder="ملاحظة اختيارية" aria-label="ملاحظة تنبيه الكاشير" />
                  <button className="button button-soft" disabled={flagMutation.isPending} onClick={() => flagMutation.mutate({ invoiceId: patient.databaseInvoiceId!, note: attentionNote.trim() || undefined })}>
                    <BellRing size={14} />{flagMutation.isPending ? "جارٍ الإرسال" : "إرسال التنبيه"}
                  </button>
                </>
              )}
              {flagMutation.error && <small className="communication-error">تعذر إرسال التنبيه: {flagMutation.error.message}</small>}
            </div>
          )}

          <div className="team-chat">
            <div className="team-chat-status-row">
              <strong className="communication-section-title">المحادثة المشتركة</strong>
              <span className="communication-live"><i /> مباشر</span>
            </div>
            <div className="team-chat-messages" aria-live="polite" aria-relevant="additions text">
              {messages.map(item => (
                <article className={`team-chat-message ${item.senderRole === role ? "mine" : "theirs"}`} key={item.id}>
                  <div><strong>{item.senderName ?? (item.senderRole === "lab" ? "المختبر" : "الكاشير")}</strong><time>{new Date(item.createdAt).toLocaleTimeString("ar-SD", { hour: "2-digit", minute: "2-digit" })}</time></div>
                  <p>{item.body}</p>
                </article>
              ))}
              {messagesQuery.isLoading && <span className="communication-empty"><Clock3 size={14} /> جارٍ تحميل الرسائل…</span>}
              {messagesQuery.isError && <span className="communication-error">تعذر تحميل المحادثة. تحقق من الاتصال ثم أعد فتحها.</span>}
              {messagesQuery.isSuccess && messages.length === 0 && <span className="communication-empty">ابدأ رسالة للفريق؛ ستصل تلقائيًا إلى الدور الآخر.</span>}
              <div ref={endOfMessages} />
            </div>
            <form className="team-chat-compose" onSubmit={event => { event.preventDefault(); const body = message.trim(); if (body) sendMutation.mutate({ body }); }}>
              <input value={message} maxLength={1000} onChange={event => setMessage(event.target.value)} placeholder="اكتب رسالة للفريق…" aria-label="رسالة إلى فريق المختبر والكاشير" />
              <button className="button button-primary" disabled={sendMutation.isPending || !message.trim()} aria-label="إرسال الرسالة"><Send size={15} /><span>إرسال</span></button>
            </form>
            {sendMutation.error && <small className="communication-error">تعذر إرسال الرسالة: {sendMutation.error.message}</small>}
          </div>
        </section>
      )}
      <button className={`team-chat-fab ${open ? "active" : ""}`} onClick={() => onOpenChange(!open)} aria-label={open ? "إخفاء محادثة المختبر والكاشير" : "فتح محادثة المختبر والكاشير"} aria-expanded={open} title="محادثة المختبر والكاشير">
        {open ? <X size={22} /> : <MessageCircle size={23} />}
        <span className="team-chat-fab-label">{open ? "إغلاق" : "تواصل الفريق"}</span>
      </button>
    </div>
  );
}
