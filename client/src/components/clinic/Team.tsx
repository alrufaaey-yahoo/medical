import { AlertCircle, BadgeCheck, CalendarDays, KeyRound, Mail, Pencil, Phone, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { trpc } from "@/lib/trpc";
import { formatClinicTime, getClinicDateKey } from "@/lib/clinic-workflow";
import { initials } from "@/lib/clinic-utils";
import { roleDescriptions, roleLabels, type Role } from "@/lib/clinic-types";
import { SectionTitle } from "./ui";

type StaffRole = "cashier" | "lab" | "supervisor";

const staffRoleLabels: Record<StaffRole, string> = {
  cashier: "كاشير / استقبال",
  lab: "فني المختبر",
  supervisor: "مشرف التشغيل",
};

const shiftTypes = [{ value: "morning", label: "صباحية" }, { value: "evening", label: "مسائية" }, { value: "night", label: "سهرة" }] as const;
type ShiftTypeValue = typeof shiftTypes[number]["value"];

const emptyDraft = { id: 0, fullName: "", email: "", phone: "", role: "cashier" as StaffRole, active: true };

export function TeamPanel({ role, onToast }: { role: Role; onToast: (message: string) => void }) {
  const isAdmin = role === "admin";
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [accountName, setAccountName] = useState("");
  const [accountUsername, setAccountUsername] = useState("");
  const [accountRole, setAccountRole] = useState<"admin" | "supervisor" | "cashier" | "lab">("cashier");
  const [accountPassword, setAccountPassword] = useState("");
  const staffQuery = trpc.staff.list.useQuery(undefined, { retry: false });
  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: isAdmin, retry: false });
  const createMutation = trpc.staff.create.useMutation();
  const updateMutation = trpc.staff.update.useMutation();
  const updateRoleMutation = trpc.users.updateRole.useMutation();
  const accountsQuery = trpc.loginAccounts.list.useQuery(undefined, { retry: false });
  const createAccountMutation = trpc.loginAccounts.create.useMutation();
  const setAccountActiveMutation = trpc.loginAccounts.setActive.useMutation();
  const trpcUtils = trpc.useUtils();

  const refresh = () => {
    void trpcUtils.staff.list.invalidate();
    void trpcUtils.users.list.invalidate();
  };

  const openCreate = () => {
    setDraft(emptyDraft);
    setEditorOpen(true);
  };

  const openEdit = (row: { id: number; fullName: string; email: string | null; phone: string | null; role: StaffRole; active: number }) => {
    setDraft({ id: row.id, fullName: row.fullName, email: row.email ?? "", phone: row.phone ?? "", role: row.role, active: row.active === 1 });
    setEditorOpen(true);
  };

  const save = () => {
    const email = draft.email.trim();
    if (draft.id) {
      updateMutation.mutate({
        id: draft.id,
        fullName: draft.fullName.trim(),
        email: email || null,
        phone: draft.phone.trim() || null,
        role: draft.role,
        active: draft.active,
      }, {
        onSuccess: () => { setEditorOpen(false); onToast("تم تحديث بيانات الموظف"); refresh(); },
        onError: error => onToast(error.message || "تعذر تحديث بيانات الموظف"),
      });
      return;
    }
    createMutation.mutate({
      fullName: draft.fullName.trim(),
      email: email || undefined,
      phone: draft.phone.trim() || undefined,
      role: draft.role,
    }, {
      onSuccess: result => {
        setEditorOpen(false);
        onToast(result.linked ? "تمت إضافة الموظف وربطه بحسابه الحالي" : "تمت إضافة الموظف؛ سيُربط تلقائيًا عند أول دخول بنفس البريد");
        refresh();
      },
      onError: error => onToast(error.message || "تعذر إضافة الموظف"),
    });
  };

  const changeAccountRole = (userId: number, nextRole: Role) => {
    updateRoleMutation.mutate({ userId, role: nextRole }, {
      onSuccess: () => { onToast("تم تحديث صلاحية الحساب"); refresh(); },
      onError: error => onToast(error.message || "تعذر تحديث صلاحية الحساب"),
    });
  };

  const staff = staffQuery.data ?? [];

  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="فريق التشغيل"
        title={isAdmin ? "المستخدمون والصلاحيات" : "الكاشير وفنيو المختبر"}
        description={isAdmin
          ? "أضف الموظفين واربطهم بحسابات الدخول، ووزّع الكاشير وفني المختبر على ورديات اليوم."
          : "أضف حسابات الكاشير وفني المختبر. لا يمكن لمشرف التشغيل إنشاء حساب مشرف آخر أو تعديل كتالوج الفحوصات."}
        action={<button className="button button-primary" onClick={openCreate}><UserPlus size={16} />إضافة موظف</button>}
      />

      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">دخول فردي بكلمة مرور</span><h2>حسابات الموظفين</h2></div><ShieldCheck size={18} className="muted-icon" /></div>
        <p className="settings-readonly-note">المدير يستطيع إنشاء جميع الأدوار بما فيها المديرين. مشرف النظام يستطيع إنشاء حسابات الاستقبال/الكاشير والمختبر فقط.</p>
        <div className="form-grid" style={{ marginBottom: 18 }}>
          <label className="form-field"><span>اسم الموظف *</span><input value={accountName} onChange={event => setAccountName(event.target.value)} placeholder="الاسم الذي سيظهر في اللوحة" maxLength={180} /></label>
          <label className="form-field"><span>اسم المستخدم *</span><input dir="ltr" autoComplete="username" value={accountUsername} onChange={event => setAccountUsername(event.target.value)} placeholder="مثال: lab_ahmed" maxLength={32} /></label>
          <label className="form-field"><span>الدور *</span><select value={accountRole} onChange={event => setAccountRole(event.target.value as typeof accountRole)}><option value="cashier">كاشير / استقبال</option><option value="lab">فني المختبر</option>{isAdmin && <><option value="supervisor">مشرف النظام</option><option value="admin">مدير</option></>}</select></label>
          <label className="form-field"><span>كلمة المرور (8 أحرف على الأقل) *</span><input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={accountPassword} onChange={event => setAccountPassword(event.target.value)} /></label>
          <div className="form-field" style={{ justifyContent: "end" }}><button className="button button-primary" disabled={createAccountMutation.isPending || accountName.trim().length < 2 || !/^[a-zA-Z0-9._-]{3,32}$/.test(accountUsername.trim()) || accountPassword.length < 8} onClick={() => createAccountMutation.mutate({ name: accountName.trim(), username: accountUsername.trim(), role: accountRole, password: accountPassword }, { onSuccess: () => { setAccountName(""); setAccountUsername(""); setAccountPassword(""); void accountsQuery.refetch(); onToast("تم إنشاء حساب الدخول"); }, onError: error => onToast(error.message || "تعذر إنشاء الحساب") })}><UserPlus size={16} />إنشاء حساب</button></div>
        </div>
        {accountsQuery.isError ? <div className="empty-state"><AlertCircle size={20} /><strong>تعذر تحميل الحسابات</strong></div> : <div className="table-wrap"><table><thead><tr><th>اسم المستخدم</th><th>الموظف</th><th>الدور</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{(accountsQuery.data ?? []).map(account => <tr key={account.userId}><td dir="ltr"><strong>{account.username}</strong></td><td><strong>{account.name ?? "بدون اسم"}</strong></td><td>{roleLabels[account.role as Role] ?? account.role}</td><td>{account.active ? "نشط" : "موقوف"}</td><td><button className="button button-secondary" disabled={setAccountActiveMutation.isPending} onClick={() => setAccountActiveMutation.mutate({ userId: account.userId, active: !account.active }, { onSuccess: () => { void accountsQuery.refetch(); onToast(account.active ? "تم إيقاف الحساب" : "تم تفعيل الحساب"); }, onError: error => onToast(error.message) })}>{account.active ? "إيقاف" : "تفعيل"}</button></td></tr>)}</tbody></table></div>}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div><span className="eyebrow">سجل الموظفين · {staff.length}</span><h2>فريق المستوصف</h2></div>
          <span className={isAdmin ? "saved-badge" : "readonly-badge"}><ShieldCheck size={14} />{isAdmin ? "صلاحية كاملة" : "كاشير وفني مختبر فقط"}</span>
        </div>
        {staffQuery.isError ? <div className="empty-state"><AlertCircle size={22} /><strong>تعذر تحميل الموظفين</strong><span>{staffQuery.error.message}</span></div> : staffQuery.isLoading ? <div className="empty-state"><strong>جارٍ تحميل الموظفين...</strong></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>الموظف</th><th>الدور</th><th>التواصل</th><th>حساب الدخول</th><th>الحالة</th><th /></tr></thead>
              <tbody>
                {staff.map(row => (
                  <tr key={row.id}>
                    <td><div className="person-cell"><div className="avatar small">{initials(row.fullName)}</div><div><strong>{row.fullName}</strong><span>{row.phone ?? "بدون هاتف"}</span></div></div></td>
                    <td><span className="shift-label">{staffRoleLabels[row.role]}</span></td>
                    <td><div className="contact-lines"><span><Mail size={13} />{row.email ?? "بدون بريد"}</span><span><Phone size={13} />{row.phone ?? "—"}</span></div></td>
                    <td>{row.account ? <span className="account-chip"><BadgeCheck size={14} />{row.account.name ?? row.account.email}</span> : <span className="muted-line">سيُربط عند الدخول بنفس البريد</span>}</td>
                    <td><span className={`payment-label ${row.active === 1 ? "paid" : "unpaid"}`}>{row.active === 1 ? "نشط" : "موقوف"}</span></td>
                    <td><button className="row-menu" aria-label={`تعديل ${row.fullName}`} onClick={() => openEdit(row)}><Pencil size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {staff.length === 0 && <div className="empty-state"><Users size={22} /><strong>لا يوجد موظفون مسجلون</strong><span>أضف كاشير الاستقبال وفني المختبر لبدء التشغيل.</span></div>}
          </div>
        )}
      </section>

      {isAdmin && (
        <>
          <section className="panel">
            <div className="panel-header"><div><span className="eyebrow">حسابات الدخول · {usersQuery.data?.length ?? 0}</span><h2>صلاحيات الحسابات</h2></div><ShieldCheck size={18} className="muted-icon" /></div>
            {usersQuery.isError ? <div className="empty-state"><AlertCircle size={22} /><strong>تعذر تحميل الحسابات</strong><span>{usersQuery.error.message}</span></div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>الحساب / اسم المستخدم</th><th>طريقة الدخول</th><th>آخر دخول</th><th>الصلاحية</th></tr></thead>
                  <tbody>
                    {(usersQuery.data ?? []).map(user => (
                      <tr key={user.id}>
                        <td><div className="person-cell"><div className="avatar small">{initials(user.name ?? user.email ?? "مستخدم")}</div><div><strong>{user.name ?? "بدون اسم"}</strong><span dir={user.username ? "ltr" : undefined}>{user.username ? `@${user.username}` : user.email ?? "لا يوجد بريد"}</span></div></div></td>
                        <td>{user.loginMethod ?? "Manus"}</td>
                        <td className="muted-cell">{user.lastSignedIn ? formatClinicTime(new Date(user.lastSignedIn)) : "—"}</td>
                        <td>
                          <select value={user.role} disabled={updateRoleMutation.isPending} onChange={event => changeAccountRole(user.id, event.target.value as Role)}>
                            {user.role === "user" && <option value="user">غير معيّن</option>}
                            {(Object.keys(roleLabels) as Role[]).map(item => <option key={item} value={item}>{roleLabels[item]}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <ShiftAssignments onToast={onToast} />
        </>
      )}

      {!isAdmin && (
        <section className="panel role-card">
          <div className="panel-header"><div><span className="eyebrow">حدود الصلاحية</span><h2>دور مشرف التشغيل</h2></div><ShieldCheck size={19} className="muted-icon" /></div>
          <p>{roleDescriptions.supervisor}</p>
          <div className="role-permissions">
            {["إصدار التقارير اليومية والأسبوعية والشهرية", "إضافة الكاشير وفني المختبر", "تعديل أسعار الفحوصات وسعر المعاينة", "لا يصل إلى المختبر أو ملفات المرضى"].map(item => <span key={item}><BadgeCheck size={14} />{item}</span>)}
          </div>
        </section>
      )}

      {editorOpen && (
        <div className="modal-backdrop" onMouseDown={() => setEditorOpen(false)}>
          <div className="modal-card" onMouseDown={event => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">فريق التشغيل</span><h2>{draft.id ? "تعديل بيانات الموظف" : "إضافة موظف جديد"}</h2></div><button className="icon-button" onClick={() => setEditorOpen(false)}><X size={18} /></button></div>
            <div className="modal-body">
              <div className="form-grid">
                <label className="form-field full-field"><span>الاسم الكامل *</span><input autoFocus value={draft.fullName} onChange={event => setDraft({ ...draft, fullName: event.target.value })} placeholder="مثال: سامر عبد الله" /></label>
                <label className="form-field"><span>البريد الإلكتروني</span><input type="email" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} placeholder="name@example.com" /><small>نفس بريد الدخول لربط الحساب تلقائيًا.</small></label>
                <label className="form-field"><span>رقم الهاتف</span><input value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} placeholder="09xx xxx xxx" /></label>
                <label className="form-field"><span>الدور *</span><select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as StaffRole })}>
                  <option value="cashier">كاشير / استقبال</option>
                  <option value="lab">فني المختبر</option>
                  {isAdmin && <option value="supervisor">مشرف التشغيل</option>}
                </select></label>
                {draft.id > 0 && <label className="form-field checkbox-field"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /><span>الحساب نشط ويستطيع الدخول</span></label>}
              </div>
              <div className="modal-hint"><UserPlus size={15} /><span>لن يُنشأ حساب دخول بكلمة مرور من هنا؛ يُربط الموظف بحساب Manus عند أول دخول بنفس البريد، أو يُنشأ له حساب من إدارة المستخدمين.</span></div>
            </div>
            <div className="modal-footer">
              <button className="button button-secondary" onClick={() => setEditorOpen(false)}>إلغاء</button>
              <button className="button button-primary" disabled={createMutation.isPending || updateMutation.isPending || draft.fullName.trim().length < 2 || (draft.email.trim() !== "" && !/^\S+@\S+\.\S+$/.test(draft.email.trim()))} onClick={save}><BadgeCheck size={16} />{createMutation.isPending || updateMutation.isPending ? "جارٍ الحفظ..." : "حفظ الموظف"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AccountSettingsDialog({ onClose, onToast }: { onClose: () => void; onToast: (message: string) => void }) {
  const authQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const updateMutation = trpc.auth.updateOwnAccount.useMutation();
  const trpcUtils = trpc.useUtils();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!authQuery.data) return;
    setName(authQuery.data.name ?? "");
    setUsername(authQuery.data.username ?? "");
  }, [authQuery.data]);

  const isLocalAccount = authQuery.data?.loginMethod === "local-password";
  const usernameValid = /^[a-zA-Z0-9._-]{3,32}$/.test(username.trim());
  const passwordValid = !newPassword || (newPassword.length >= 8 && newPassword === confirmPassword);
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLocalAccount || !usernameValid || name.trim().length < 2 || !currentPassword || !passwordValid) return;
    updateMutation.mutate({ username: username.trim(), name: name.trim(), currentPassword, ...(newPassword ? { newPassword } : {}) }, {
      onSuccess: () => {
        void trpcUtils.auth.me.invalidate();
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        onToast("تم تحديث بيانات حسابك");
      },
      onError: error => onToast(error.message || "تعذر تحديث بيانات الحساب"),
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="account-settings-title" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header"><div><span className="eyebrow">إعدادات المستخدم</span><h2 id="account-settings-title">بيانات حسابي</h2></div><button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button></div>
        <form onSubmit={save}>
          <div className="modal-body">
            {authQuery.isLoading ? <div className="empty-state"><strong>جارٍ تحميل الحساب...</strong></div> : !isLocalAccount ? <div className="settings-readonly-note"><ShieldCheck size={16} />هذا الحساب مرتبط بتسجيل دخول Manus؛ تُدار بياناته من مزوّد تسجيل الدخول.</div> : (
              <div className="form-grid">
                <label className="form-field full-field"><span>الاسم الظاهر *</span><input autoFocus maxLength={180} value={name} onChange={event => setName(event.target.value)} /></label>
                <label className="form-field full-field"><span>اسم المستخدم *</span><input dir="ltr" autoComplete="username" maxLength={32} value={username} onChange={event => setUsername(event.target.value)} /><small>3–32 حرفًا إنجليزيًا أو رقمًا أو نقطة أو شرطة.</small></label>
                <label className="form-field full-field"><span>كلمة المرور الحالية *</span><input type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></label>
                <label className="form-field"><span>كلمة المرور الجديدة</span><input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="اتركها فارغة للإبقاء عليها" /></label>
                <label className="form-field"><span>تأكيد كلمة المرور الجديدة</span><input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
                {newPassword && newPassword !== confirmPassword && <div className="settings-readonly-note full-field"><KeyRound size={15} />كلمتا المرور الجديدتان غير متطابقتين.</div>}
                {newPassword && newPassword.length < 8 && <div className="settings-readonly-note full-field"><KeyRound size={15} />يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.</div>}
              </div>
            )}
          </div>
          <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>إغلاق</button>{isLocalAccount && <button type="submit" className="button button-primary" disabled={updateMutation.isPending || !usernameValid || name.trim().length < 2 || !currentPassword || !passwordValid}><BadgeCheck size={16} />{updateMutation.isPending ? "جارٍ الحفظ..." : "حفظ بيانات الحساب"}</button>}</div>
        </form>
      </div>
    </div>
  );
}

function ShiftAssignments({ onToast }: { onToast: (message: string) => void }) {
  const date = getClinicDateKey();
  const assignmentsQuery = trpc.shifts.assignments.useQuery({ shiftDate: date }, { retry: false });
  const assignMutation = trpc.shifts.assignUsers.useMutation();
  const closeMutation = trpc.shifts.close.useMutation();
  const [draft, setDraft] = useState<Record<ShiftTypeValue, { cashierUserId: string; labUserId: string }>>({
    morning: { cashierUserId: "", labUserId: "" },
    evening: { cashierUserId: "", labUserId: "" },
    night: { cashierUserId: "", labUserId: "" },
  });
  useEffect(() => {
    if (!assignmentsQuery.data) return;
    setDraft(Object.fromEntries(shiftTypes.map(({ value }) => {
      const shift = assignmentsQuery.data?.shifts.find(item => item.shiftType === value);
      return [value, { cashierUserId: shift?.cashierUserId ? String(shift.cashierUserId) : "", labUserId: shift?.labUserId ? String(shift.labUserId) : "" }];
    })) as Record<ShiftTypeValue, { cashierUserId: string; labUserId: string }>);
  }, [assignmentsQuery.data]);

  const save = (shiftType: ShiftTypeValue) => {
    const selected = draft[shiftType];
    assignMutation.mutate({
      shiftDate: date,
      shiftType,
      cashierUserId: selected.cashierUserId ? Number(selected.cashierUserId) : null,
      labUserId: selected.labUserId ? Number(selected.labUserId) : null,
    }, {
      onSuccess: () => { void assignmentsQuery.refetch(); onToast(`تم حفظ توزيع الوردية ${shiftTypes.find(item => item.value === shiftType)?.label}`); },
      onError: error => onToast(error.message || "تعذر حفظ توزيع الوردية"),
    });
  };

  const closeShift = (shiftType: ShiftTypeValue) => {
    if (!window.confirm("قبل إغلاق الوردية: راجع الفواتير والتحصيلات واحفظ أي عمل معلّق، واستخرج تقرير الوردية من قسم التقارير. بعد الإغلاق لن يمكن تسجيل مرضى جدد فيها. هل تريد المتابعة؟")) return;
    closeMutation.mutate({ shiftDate: date, shiftType }, {
      onSuccess: () => { void assignmentsQuery.refetch(); onToast(`تم إغلاق الوردية ${shiftTypes.find(item => item.value === shiftType)?.label}`); },
      onError: error => onToast(error.message || "تعذر إغلاق الوردية"),
    });
  };

  const staff = assignmentsQuery.data?.staff ?? [];
  const cashiers = staff.filter(user => user.role === "cashier");
  const labTechnicians = staff.filter(user => user.role === "lab");

  return (
    <section className="panel">
      <div className="panel-header"><div><span className="eyebrow">توزيع الورديات · {date}</span><h2>الكاشير وفني المختبر</h2></div><span className="saved-badge"><CalendarDays size={14} />اليوم</span></div>
      <p className="settings-readonly-note" style={{ margin: "0 0 16px" }}>يمكن تعيين موظف مختلف لكل وردية، ويمكن للموظف نفسه العمل في أكثر من وردية دون خلط أرقام المرضى. إغلاق الوردية يمنع تسجيل مرضى جدد فيها.</p>
      {assignmentsQuery.isError ? <div className="empty-state"><AlertCircle size={22} /><strong>تعذر تحميل توزيع الورديات</strong><span>{assignmentsQuery.error.message}</span></div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الوردية</th><th>الكاشير / الاستقبال</th><th>فني المختبر</th><th>الحالة</th><th /></tr></thead>
            <tbody>
              {shiftTypes.map(({ value, label }) => {
                const shift = assignmentsQuery.data?.shifts.find(item => item.shiftType === value);
                const isClosed = shift?.status === "closed";
                return (
                  <tr key={value}>
                    <td><strong>{label}</strong><span className="muted-line">08–14 / 14–22 / 22–08</span></td>
                    <td><select value={draft[value].cashierUserId} disabled={assignMutation.isPending || isClosed} onChange={event => setDraft(current => ({ ...current, [value]: { ...current[value], cashierUserId: event.target.value } }))}><option value="">غير معيّن</option>{cashiers.map(user => <option key={user.id} value={user.id}>{user.name ?? user.email ?? `حساب ${user.id}`}</option>)}</select></td>
                    <td><select value={draft[value].labUserId} disabled={assignMutation.isPending || isClosed} onChange={event => setDraft(current => ({ ...current, [value]: { ...current[value], labUserId: event.target.value } }))}><option value="">غير معيّن</option>{labTechnicians.map(user => <option key={user.id} value={user.id}>{user.name ?? user.email ?? `حساب ${user.id}`}</option>)}</select></td>
                    <td><span className={`payment-label ${isClosed ? "unpaid" : "paid"}`}>{isClosed ? "مغلقة" : "مفتوحة"}</span></td>
                    <td><div className="table-actions"><button className="button button-soft" disabled={assignMutation.isPending || isClosed} onClick={() => save(value)}>حفظ</button><button className="button button-secondary" disabled={closeMutation.isPending || isClosed || !shift} onClick={() => closeShift(value)}>إغلاق</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
