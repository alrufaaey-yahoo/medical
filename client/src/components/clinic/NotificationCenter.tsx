import { Bell, BellRing, Check, Clock3, MessageCircle, ReceiptText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Role, Section } from "@/lib/clinic-types";
import { trpc } from "@/lib/trpc";

export function NotificationCenter({
  role,
  userId,
  onOpenChat,
  onNavigate,
}: {
  role: Role;
  userId: number;
  onOpenChat: () => void;
  onNavigate: (section: Section) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lastSeenMessageId, setLastSeenMessageId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialisedKey = useRef("");
  const utils = trpc.useUtils();
  const canReadTeamMessages = role === "cashier" || role === "lab";
  const storageKey = `clinic.notifications.lastSeenMessage.${userId}.${role}`;
  const messagesQuery = trpc.teamCommunication.messages.useQuery(undefined, {
    enabled: canReadTeamMessages,
    refetchInterval: canReadTeamMessages ? 12000 : false,
    retry: false,
  });
  const alertsQuery = trpc.teamCommunication.cashierAlerts.useQuery(undefined, {
    enabled: role === "cashier",
    refetchInterval: role === "cashier" ? 12000 : false,
    retry: false,
  });
  const resolveMutation = trpc.teamCommunication.resolveCashierAlert.useMutation({
    onSuccess: () => void utils.teamCommunication.cashierAlerts.invalidate(),
  });

  const messages = messagesQuery.data ?? [];
  const highestMessageId = messages.reduce((highest, item) => Math.max(highest, item.id), 0);

  useEffect(() => {
    if (!canReadTeamMessages || !messagesQuery.isSuccess || initialisedKey.current === storageKey) return;
    const stored = window.localStorage.getItem(storageKey);
    const baseline = stored == null ? highestMessageId : Number(stored) || 0;
    setLastSeenMessageId(baseline);
    if (stored == null) window.localStorage.setItem(storageKey, String(baseline));
    initialisedKey.current = storageKey;
  }, [canReadTeamMessages, highestMessageId, messagesQuery.isSuccess, storageKey]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const unreadMessages = lastSeenMessageId == null ? [] : messages.filter(item => item.senderRole !== role && item.id > lastSeenMessageId);
  const alerts = alertsQuery.data ?? [];
  const notificationCount = alerts.length + unreadMessages.length;

  const markMessagesSeen = () => {
    setLastSeenMessageId(highestMessageId);
    window.localStorage.setItem(storageKey, String(highestMessageId));
  };

  const openChat = () => {
    markMessagesSeen();
    setOpen(false);
    onOpenChat();
  };

  const formatTime = (value: Date | string) => new Date(value).toLocaleTimeString("ar-SD", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="notification-center" ref={panelRef} dir="rtl">
      <button className="icon-button notification-button" onClick={() => setOpen(value => !value)} aria-label={`التنبيهات${notificationCount ? `، ${notificationCount} جديدة` : ""}`} aria-expanded={open} aria-haspopup="dialog" title="مركز الإشعارات">
        <Bell size={18} />
        {notificationCount > 0 && <span className="notification-count">{notificationCount > 99 ? "99+" : notificationCount}</span>}
      </button>

      {open && (
        <section className="notification-panel" role="dialog" aria-label="مركز الإشعارات">
          <header className="notification-panel-header">
            <div className="notification-panel-icon"><BellRing size={17} /></div>
            <div><strong>مركز الإشعارات</strong><span>{notificationCount ? `${notificationCount} تنبيه${notificationCount === 1 ? "" : "ات"} بحاجة لمراجعتك` : "متابعة تنبيهات التشغيل ورسائل الفريق"}</span></div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="إغلاق الإشعارات"><X size={17} /></button>
          </header>

          <div className="notification-panel-body">
            {role === "cashier" && (
              <section className="notification-group">
                <div className="notification-group-title"><span>تنبيهات المختبر</span><b>{alerts.length}</b></div>
                {alertsQuery.isLoading && <p className="notification-empty"><Clock3 size={14} /> جارٍ تحميل التنبيهات…</p>}
                {alertsQuery.isError && <p className="notification-error">تعذر تحميل تنبيهات الفواتير. أعد فتح الإشعارات للمحاولة.</p>}
                {alerts.map(alert => (
                  <article className="notification-item notification-alert" key={alert.id}>
                    <span className="notification-item-icon amber"><BellRing size={15} /></span>
                    <div className="notification-item-copy">
                      <strong>فاتورة بانتظار التحصيل</strong>
                      <span>{alert.patientName} · {alert.patientNumber}</span>
                      {alert.note && <p>{alert.note}</p>}
                      <small>الفاتورة {alert.invoiceNumber} · من {alert.flaggedByName ?? "المختبر"} · {formatTime(alert.flaggedAt)}</small>
                      <button className="notification-inline-action" onClick={() => { setOpen(false); onNavigate("billing"); }}><ReceiptText size={13} /> فتح الفواتير</button>
                    </div>
                    <button className="notification-resolve" title="تمت المتابعة" aria-label={`إغلاق تنبيه ${alert.patientName}`} disabled={resolveMutation.isPending} onClick={() => resolveMutation.mutate({ id: alert.id })}><Check size={16} /></button>
                  </article>
                ))}
                {!alertsQuery.isLoading && !alertsQuery.isError && alerts.length === 0 && <p className="notification-empty"><Check size={14} /> لا توجد فواتير معلقة أُحيلت للمتابعة.</p>}
              </section>
            )}

            {canReadTeamMessages && (
              <section className="notification-group">
                <div className="notification-group-title"><span>رسائل الفريق الجديدة</span><b>{unreadMessages.length}</b></div>
                {messagesQuery.isError && <p className="notification-error">تعذر تحديث رسائل الفريق.</p>}
                {unreadMessages.slice(-6).reverse().map(item => (
                  <button className="notification-item notification-message" key={item.id} onClick={openChat}>
                    <span className="notification-item-icon blue"><MessageCircle size={15} /></span>
                    <span className="notification-item-copy"><strong>رسالة من {item.senderName ?? (item.senderRole === "lab" ? "المختبر" : "الكاشير")}</strong><span className="notification-message-preview">{item.body}</span><small>{formatTime(item.createdAt)} · اضغط لفتح المحادثة</small></span>
                  </button>
                ))}
                {unreadMessages.length === 0 && <p className="notification-empty"><Check size={14} /> لا توجد رسائل جديدة.</p>}
                {unreadMessages.length > 0 && <button className="notification-mark-read" onClick={markMessagesSeen}>تحديد الرسائل كمقروءة</button>}
              </section>
            )}

            {role !== "cashier" && !canReadTeamMessages && <p className="notification-empty notification-no-feed"><Check size={15} /> لا توجد إشعارات تشغيلية لهذا الدور حاليًا.</p>}
          </div>

          {canReadTeamMessages && <footer className="notification-panel-footer"><button className="button button-secondary" onClick={openChat}><MessageCircle size={15} /> فتح المحادثة</button></footer>}
        </section>
      )}
    </div>
  );
}
