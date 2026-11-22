import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type AccountMenuProps = {
  name?: string | null;
  username?: string | null;
  roleLabel: string;
  onEditAccount: () => void;
  onSwitchAccount: () => void;
  onLogout: () => void;
};

export function AccountMenu({ name, username, roleLabel, onEditAccount, onSwitchAccount, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const displayName = name?.trim() || username || "مستخدم";
  const initials = displayName.slice(0, 2);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const runAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="account-menu" ref={rootRef} dir="rtl">
      <button
        ref={triggerRef}
        type="button"
        className="account-menu-trigger"
        aria-label={`قائمة المستخدم: ${displayName}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(value => !value)}
      >
        <span className="account-menu-avatar" aria-hidden="true">{initials}</span>
        <span className="account-menu-trigger-copy">
          <strong>{displayName}</strong>
          <small>{roleLabel}</small>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <section className="account-menu-popover" role="dialog" aria-label="قائمة بيانات المستخدم">
          <header className="account-menu-identity">
            <span className="account-menu-avatar account-menu-avatar-large" aria-hidden="true">{initials}</span>
            <div>
              <strong>{displayName}</strong>
              {username && <span dir="ltr">@{username}</span>}
              <small>{roleLabel}</small>
            </div>
          </header>
          <div className="account-menu-divider" />
          <button type="button" className="account-menu-item" onClick={() => runAction(onEditAccount)}>
            <UserRound size={16} />
            <span>بيانات الحساب</span>
          </button>
          <button type="button" className="account-menu-item" onClick={() => runAction(onSwitchAccount)}>
            <KeyRound size={16} />
            <span>تغيير الحساب</span>
          </button>
          <div className="account-menu-divider" />
          <button type="button" className="account-menu-item account-menu-logout" onClick={() => runAction(onLogout)}>
            <LogOut size={16} />
            <span>تسجيل الخروج</span>
          </button>
        </section>
      )}
    </div>
  );
}
