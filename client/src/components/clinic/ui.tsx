import { HeartPulse } from "lucide-react";
import type { Patient } from "@/lib/clinic-types";

export function StatusPill({ status }: { status: Patient["status"] }) {
  const classes = status === "مكتملة" ? "success" : status === "في المختبر" ? "info" : "warning";
  return <span className={`status-pill ${classes}`}><span className="status-dot" />{status}</span>;
}

export function SectionTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`app-logo ${compact ? "compact" : ""}`}>
      <div className="logo-mark"><HeartPulse size={20} strokeWidth={2.4} /></div>
      {!compact && <div><strong>بكّا الطبي</strong><span>نظام التشغيل الطبي</span></div>}
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="empty-state">{icon}<strong>{title}</strong><span>{description}</span></div>;
}
