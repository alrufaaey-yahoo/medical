import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  FileBarChart,
  FlaskConical,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MoreHorizontal,
  ReceiptText,
  Settings2,
  ShieldCheck,
  TestTube2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CONSULTATION_PRICES, type ConsultationType } from "@shared/billing";
import { trpc } from "@/lib/trpc";
import { buildCatalog, DEFAULT_CATALOG, type LabTest } from "@/lib/catalog";
import { CBC_ANALYZER_EXTRA_FIELDS } from "@/lib/cbc-import";
import {
  formatClinicDate,
  formatClinicTime,
  getClinicDateKey,
  getClinicShiftDateKey,
  getCurrentClinicShift,
} from "@/lib/clinic-workflow";
import { formatCurrency } from "@/lib/clinic-utils";
import type { FieldValue, OrderStatus, Patient, PrintMode, ReportRange, Role, Section, Shift } from "@/lib/clinic-types";
import { EMPTY_PATIENT, roleLabels, roleSections, sectionLabels, serverShiftByLabel } from "@/lib/clinic-types";
import type { ClinicSettingsDraft } from "@/components/clinic/Settings";
import { TeamCommunication } from "@/components/clinic/TeamCommunication";
import { NotificationCenter } from "@/components/clinic/NotificationCenter";
import { AccountMenu } from "@/components/clinic/AccountMenu";
import { AppLogo, SectionTitle } from "@/components/clinic/ui";

const Billing = lazy(() => import("@/components/clinic/Billing").then(module => ({ default: module.Billing })));
const CatalogPanel = lazy(() => import("@/components/clinic/Catalog").then(module => ({ default: module.CatalogPanel })));
const LoginDialog = lazy(() => import("@/components/clinic/dialogs").then(module => ({ default: module.LoginDialog })));
const ExistingInvoiceDialog = lazy(() => import("@/components/clinic/dialogs").then(module => ({ default: module.ExistingInvoiceDialog })));
const InvoiceEditor = lazy(() => import("@/components/clinic/dialogs").then(module => ({ default: module.InvoiceEditor })));
const PatientDialog = lazy(() => import("@/components/clinic/dialogs").then(module => ({ default: module.PatientDialog })));
const PatientDrawer = lazy(() => import("@/components/clinic/dialogs").then(module => ({ default: module.PatientDrawer })));
const Lab = lazy(() => import("@/components/clinic/Lab").then(module => ({ default: module.Lab })));
const Overview = lazy(() => import("@/components/clinic/Overview").then(module => ({ default: module.Overview })));
const Patients = lazy(() => import("@/components/clinic/Patients").then(module => ({ default: module.Patients })));
const PrintDocument = lazy(() => import("@/components/clinic/print").then(module => ({ default: module.PrintDocument })));
const Reports = lazy(() => import("@/components/clinic/Reports").then(module => ({ default: module.Reports })));
const Settings = lazy(() => import("@/components/clinic/Settings").then(module => ({ default: module.Settings })));
const TeamPanel = lazy(() => import("@/components/clinic/Team").then(module => ({ default: module.TeamPanel })));
const AccountSettingsDialog = lazy(() => import("@/components/clinic/Team").then(module => ({ default: module.AccountSettingsDialog })));
const SetupWizard = lazy(() => import("@/components/clinic/SetupWizard").then(module => ({ default: module.SetupWizard })));

type NavItem = { id: Section; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
  { id: "patients", label: "المرضى", icon: Users },
  { id: "billing", label: "الفواتير", icon: ReceiptText },
  { id: "lab", label: "المختبر", icon: FlaskConical },
  { id: "tests", label: "الفحوصات والتسعير", icon: TestTube2 },
  { id: "reports", label: "التقارير", icon: FileBarChart },
  { id: "users", label: "فريق التشغيل", icon: UserPlus },
  { id: "settings", label: "الإعدادات", icon: Settings2 },
];

const OPERATIONAL_ROLES: Role[] = ["admin", "supervisor", "cashier", "lab"];

function isOperationalRole(value: string | null | undefined): value is Role {
  return value != null && (OPERATIONAL_ROLES as string[]).includes(value);
}

function parsePatientIdentity(patientNumber: string) {
  const match = patientNumber.match(/^P-(\d{4})(\d{2})(\d{2})-([MEN])-(\d+)$/);
  return {
    registeredDate: match ? `${match[1]}-${match[2]}-${match[3]}` : undefined,
    shift: match ? (match[4] === "M" ? "صباحية" as const : match[4] === "E" ? "مسائية" as const : "سهرة" as const) : undefined,
    sequence: Number(match?.[5] ?? patientNumber.match(/-(\d+)$/)?.[1] ?? 0) || undefined,
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [shift, setShift] = useState<Shift>(() => getCurrentClinicShift());
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [teamChatOpen, setTeamChatOpen] = useState(false);
  const [showPatientDialog, setShowPatientDialog] = useState(false);
  const [existingInvoiceFor, setExistingInvoiceFor] = useState<string | null | undefined>(undefined);
  const [editorInvoiceId, setEditorInvoiceId] = useState<number | null>(null);
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showLogoutReminder, setShowLogoutReminder] = useState(false);
  const [drawerPatient, setDrawerPatient] = useState<Patient | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedTestCode, setSelectedTestCode] = useState("");
  const [resultDrafts, setResultDrafts] = useState<Record<string, FieldValue>>({});
  const dirtyDraftKeys = useRef(new Set<string>());
  const draftRevisions = useRef(new Map<string, number>());
  const [printMode, setPrintMode] = useState<PrintMode>(null);
  const [printPatientSnapshot, setPrintPatientSnapshot] = useState<Patient | null>(null);
  const [printReportRange, setPrintReportRange] = useState<ReportRange>("today");

  const authQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const setupQuery = trpc.setup.status.useQuery(undefined, { retry: false, staleTime: 0 });
  const queryClient = useQueryClient();
  const resetSessionView = async () => {
    setActiveSection("overview");
    setShift(getCurrentClinicShift());
    setSearch("");
    setMobileMenu(false);
    setTeamChatOpen(false);
    setShowPatientDialog(false);
    setExistingInvoiceFor(undefined);
    setEditorInvoiceId(null);
    setShowLoginPanel(false);
    setShowAccountSettings(false);
    setShowLogoutReminder(false);
    setDrawerPatient(null);
    setSelectedPatientId("");
    setSelectedTestCode("");
    setResultDrafts({});
    dirtyDraftKeys.current.clear();
    draftRevisions.current.clear();
    setPrintMode(null);
    setPrintPatientSnapshot(null);
    await queryClient.resetQueries();
  };
  const sessionRole = authQuery.data?.role;
  const operationalRole = isOperationalRole(sessionRole) ? sessionRole : null;
  const effectiveRole: Role = operationalRole ?? "supervisor";
  const accessibleSections = roleSections[effectiveRole];

  const workspaceQuery = trpc.patients.workspace.useQuery(undefined, {
    enabled: operationalRole === "admin" || operationalRole === "cashier" || operationalRole === "lab",
    retry: false,
  });
  const catalogQuery = trpc.catalog.list.useQuery(undefined, { staleTime: 5 * 60 * 1000, retry: false });
  const pricingQuery = trpc.pricing.get.useQuery(undefined, { staleTime: 5 * 60 * 1000, retry: false });
  const clinicQuery = trpc.clinic.getSettings.useQuery(undefined, { staleTime: 5 * 60 * 1000, retry: false });
  const cbcStatusQuery = trpc.cbcBridge.status.useQuery(undefined, {
    enabled: operationalRole === "admin" || operationalRole === "lab",
    retry: false,
    refetchInterval: 30_000,
  });
  const paymentBanksQuery = trpc.clinic.listPaymentBanks.useQuery(undefined, { enabled: operationalRole === "admin" || operationalRole === "cashier", retry: false });
  const currentShiftInput = useMemo(() => ({ shiftDate: getClinicShiftDateKey(), shiftType: serverShiftByLabel[shift] }), [shift]);
  const currentShiftQuery = trpc.shifts.current.useQuery(currentShiftInput, { enabled: Boolean(operationalRole), retry: false });
  const trpcUtils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation({ onSuccess: resetSessionView });

  const registerMutation = trpc.patients.register.useMutation();
  const followUpMutation = trpc.patients.addTests.useMutation();
  const paymentMutation = trpc.billing.markPaid.useMutation();
  const addBankMutation = trpc.clinic.addPaymentBank.useMutation();
  const removeBankMutation = trpc.clinic.removePaymentBank.useMutation();
  const cancelMutation = trpc.billing.cancel.useMutation();
  const refundMutation = trpc.billing.refund.useMutation();
  const batchResultMutation = trpc.laboratory.saveResults.useMutation();
  const draftMutation = trpc.laboratory.saveDraft.useMutation();
  const collectMutation = trpc.laboratory.collectSample.useMutation();
  const openShiftMutation = trpc.shifts.open.useMutation();
  const saveSettingsMutation = trpc.clinic.saveSettings.useMutation();
  const openedShiftKey = useRef("");

  const baseCatalog = useMemo<LabTest[]>(() => (catalogQuery.data?.length ? buildCatalog(catalogQuery.data) : DEFAULT_CATALOG), [catalogQuery.data]);
  const catalog = useMemo<LabTest[]>(() => {
    if (!cbcStatusQuery.data?.enabled) return baseCatalog;
    return baseCatalog.map(test => test.code === "CBC"
      ? { ...test, fields: [...test.fields, ...CBC_ANALYZER_EXTRA_FIELDS.filter(extra => !test.fields.some(field => field.key === extra.key))] }
      : test);
  }, [baseCatalog, cbcStatusQuery.data?.enabled]);
  const prices = pricingQuery.data ?? DEFAULT_CONSULTATION_PRICES;

  const derived = useMemo(() => {
    const data = workspaceQuery.data;
    if (!data) return { patients: [] as Patient[], billingPatients: [] as Patient[], results: {} as Record<string, FieldValue> };
    const codeByTestId = new Map(data.labTests.map(test => [test.id, test.code]));
    const resultByOrderId = new Map(data.labResults.map(result => [result.labOrderId, result]));
    const results: Record<string, FieldValue> = {};

    const patients: Patient[] = data.patients.map(row => {
      const invoicesForPatient = data.invoices.filter(invoice => invoice.patientId === row.id);
      const latest = invoicesForPatient.find(invoice => invoice.status !== "cancelled" && invoice.status !== "refunded") ?? invoicesForPatient[0];
      const items = latest ? data.invoiceItems.filter(item => item.invoiceId === latest.id) : [];
      const activeInvoiceIds = new Set(invoicesForPatient.filter(invoice => invoice.status !== "cancelled" && invoice.status !== "refunded").map(invoice => invoice.id));
      const orders = data.labOrders.filter(order => order.patientId === row.id && activeInvoiceIds.has(order.invoiceId));
      const invoiceOrders = orders;
      const allCodes = [...new Set(orders.map(order => codeByTestId.get(order.labTestId)).filter((code): code is string => Boolean(code)))];
      const invoiceCodes = items.map(item => item.labTestId == null ? undefined : codeByTestId.get(item.labTestId)).filter((code): code is string => Boolean(code));
      const invoiceLines = items.map(item => ({ description: item.description, unitPrice: item.unitPrice, code: item.labTestId == null ? undefined : codeByTestId.get(item.labTestId) }));
      const orderStates: Record<string, OrderStatus> = {};
      const orderIds: Record<string, number> = {};
      for (const order of orders) {
        const code = codeByTestId.get(order.labTestId);
        if (code && orderIds[code] == null) {
          orderIds[code] = order.id;
          orderStates[code] = order.status;
        }
      }
      for (const order of [...orders].reverse()) {
        const code = codeByTestId.get(order.labTestId);
        const result = resultByOrderId.get(order.id);
        if (code && result) {
          try {
            const values = JSON.parse(result.valuesJson) as FieldValue;
            results[`${row.patientNumber}-${code}`] = { ...values, ...(result.remarks ? { remarks: result.remarks } : {}) };
          } catch {
            // Ignore malformed legacy JSON instead of breaking the lab screen.
          }
        }
      }
      const identity = parsePatientIdentity(row.patientNumber);
      const invoiceStatus = latest?.status;
      const paid = invoiceStatus === "paid";
      const completed = invoiceOrders.length > 0 && invoiceOrders.every(order => order.status === "completed");
      const consultationType: ConsultationType = latest?.consultationType ?? (items.some(item => item.description === "المعاينة الطبية") ? "general" : "none");
      const createdAt = toDate(row.createdAt);
      return {
        id: row.patientNumber,
        databaseId: row.id,
        databaseInvoiceId: latest?.id,
        invoiceStatus,
        invoiceTotal: latest?.total ?? 0,
        paymentMethod: latest?.paymentMethod,
        paymentBank: latest?.paymentBank,
        transactionNumber: latest?.transactionNumber,
        invoiceLines,
        consultationType,
        consultationFee: latest?.consultationFee ?? 0,
        orderIds,
        orderStates,
        name: row.name,
        gender: row.gender === "female" ? "أنثى" : "ذكر",
        age: row.age ?? undefined,
        phone: row.phone ?? "—",
        address: row.address ?? "—",
        tests: allCodes,
        invoice: latest?.invoiceNumber ?? "—",
        paid,
        status: completed ? "مكتملة" : paid && allCodes.length > 0 ? "في المختبر" : paid ? "مكتملة" : "في الانتظار",
        registeredAt: Number.isFinite(createdAt.getTime()) ? formatClinicTime(createdAt) : "—",
        registeredDate: identity.registeredDate ?? (Number.isFinite(createdAt.getTime()) ? getClinicDateKey(createdAt) : undefined),
        shift: identity.shift,
        sequence: identity.sequence,
        invoiceTests: invoiceCodes,
      } satisfies Patient;
    });

    const patientByDbId = new Map(patients.map(patient => [patient.databaseId, patient]));
    const billingPatients: Patient[] = data.invoices.flatMap(invoice => {
      const base = patientByDbId.get(invoice.patientId);
      if (!base) return [];
      const items = data.invoiceItems.filter(item => item.invoiceId === invoice.id);
      const orders = data.labOrders.filter(order => order.invoiceId === invoice.id);
      const codes = items.map(item => item.labTestId == null ? undefined : codeByTestId.get(item.labTestId)).filter((code): code is string => Boolean(code));
      const invoiceLines = items.map(item => ({ description: item.description, unitPrice: item.unitPrice, code: item.labTestId == null ? undefined : codeByTestId.get(item.labTestId) }));
      const orderStates: Record<string, OrderStatus> = {};
      const orderIds: Record<string, number> = {};
      for (const order of orders) {
        const code = codeByTestId.get(order.labTestId);
        if (code) {
          orderIds[code] = order.id;
          orderStates[code] = order.status;
        }
      }
      const paid = invoice.status === "paid";
      const completed = orders.length > 0 && orders.every(order => order.status === "completed");
      const createdAt = toDate(invoice.createdAt);
      return [{
        ...base,
        databaseInvoiceId: invoice.id,
        invoiceStatus: invoice.status,
        invoiceTotal: invoice.total,
        paymentMethod: invoice.paymentMethod,
        paymentBank: invoice.paymentBank,
        transactionNumber: invoice.transactionNumber,
        invoice: invoice.invoiceNumber,
        invoiceLines,
        invoiceTests: codes,
        tests: codes,
        consultationType: invoice.consultationType,
        consultationFee: invoice.consultationFee,
        orderIds,
        orderStates,
        paid,
        status: completed ? "مكتملة" : paid && codes.length > 0 ? "في المختبر" : paid ? "مكتملة" : "في الانتظار",
        registeredAt: Number.isFinite(createdAt.getTime()) ? formatClinicTime(createdAt) : base.registeredAt,
        registeredDate: Number.isFinite(createdAt.getTime()) ? getClinicDateKey(createdAt) : base.registeredDate,
      } satisfies Patient];
    });

    return { patients, billingPatients, results };
  }, [workspaceQuery.data]);

  const patients = derived.patients;
  const billingPatients = derived.billingPatients;
  const savedResults = derived.results;
  const selectedPatient = patients.find(patient => patient.id === selectedPatientId) ?? patients[0] ?? EMPTY_PATIENT;
  const selectedTest = catalog.find(test => test.code === selectedTestCode) ?? catalog.find(test => patientHasCode(selectedPatient, test.code)) ?? catalog[0] ?? DEFAULT_CATALOG[0];
  const selectedDraftKey = `${selectedPatient.id}-${selectedTest.code}`;
  const selectedLabOrderId = selectedPatient.orderIds?.[selectedTest.code];
  const selectedOrderIds = Object.values(selectedPatient.orderIds ?? {});
  const draftQuery = trpc.laboratory.listDrafts.useQuery({ labOrderIds: selectedOrderIds }, { enabled: effectiveRole === "lab" && selectedOrderIds.length > 0, retry: false });
  const codeByOrderId = new Map(Object.entries(selectedPatient.orderIds ?? {}).map(([code, id]) => [id, code]));
  const persistedDraftResults: Record<string, FieldValue> = {};
  for (const item of draftQuery.data ?? []) {
    const code = codeByOrderId.get(item.labOrderId);
    if (!code) continue;
    try { persistedDraftResults[`${selectedPatient.id}-${code}`] = JSON.parse(item.valuesJson) as FieldValue; } catch { /* Ignore malformed draft data. */ }
  }
  const resultDraft = resultDrafts[selectedDraftKey] ?? savedResults[selectedDraftKey] ?? persistedDraftResults[selectedDraftKey] ?? {};
  const setResultDraft = (draft: FieldValue) => {
    dirtyDraftKeys.current.add(selectedDraftKey);
    draftRevisions.current.set(selectedDraftKey, (draftRevisions.current.get(selectedDraftKey) ?? 0) + 1);
    setResultDrafts(current => ({ ...current, [selectedDraftKey]: draft }));
  };
  const pageTitle = sectionLabels[activeSection];
  const visibleShiftSequence = operationalRole && currentShiftQuery.isSuccess ? currentShiftQuery.data?.sequenceCurrent ?? 0 : 0;
  const clinicSettings = clinicQuery.data;
  const printClinic = {
    name: clinicSettings?.name ?? "مستوصف بكّا الطبي الحديث",
    address: clinicSettings?.address ?? "الخرطوم بحري · السودان",
    phone: clinicSettings?.phone ?? "011 234 5678",
    website: clinicSettings?.website ?? "www.bakka-clinic.sd",
    footerText: clinicSettings?.footerText ?? "نتمنى لكم دوام الصحة والعافية",
    logoUrl: clinicSettings?.logoUrl ?? "/logo.svg",
  };

  useEffect(() => {
    if (!accessibleSections.includes(activeSection)) setActiveSection(accessibleSections[0]);
  }, [accessibleSections, activeSection]);

  useEffect(() => {
    if (!patients.length) return;
    setSelectedPatientId(current => patients.some(patient => patient.id === current) ? current : patients[0].id);
  }, [patients]);

  useEffect(() => {
    if (!selectedPatient.id) return;
    const fallback = selectedPatient.tests[0] ?? catalog[0]?.code ?? "";
    if (!selectedTestCode || !catalog.some(test => test.code === selectedTestCode)) {
      setSelectedTestCode(fallback);
    }
  }, [catalog, savedResults, selectedPatient.id, selectedPatient.tests, selectedTestCode]);

  useEffect(() => {
    if (operationalRole !== "cashier" && operationalRole !== "admin") return;
    if (!workspaceQuery.isSuccess || currentShiftQuery.isLoading || currentShiftQuery.data) return;
    const key = `${currentShiftInput.shiftDate}:${currentShiftInput.shiftType}`;
    if (openedShiftKey.current === key) return;
    openedShiftKey.current = key;
    openShiftMutation.mutate(currentShiftInput, {
      onSuccess: () => { void trpcUtils.shifts.current.invalidate(currentShiftInput); },
      onError: () => { openedShiftKey.current = ""; },
    });
  }, [currentShiftInput, currentShiftQuery.data, currentShiftQuery.isLoading, openShiftMutation.mutate, operationalRole, trpcUtils.shifts.current, workspaceQuery.isSuccess]);

  useEffect(() => {
    if (effectiveRole !== "lab" || !selectedLabOrderId || !dirtyDraftKeys.current.has(selectedDraftKey)) return;
    // Imported CBC data remains a screen draft until the technician explicitly saves it.
    if (resultDraft.__cbc_import_metadata) return;
    const revision = draftRevisions.current.get(selectedDraftKey) ?? 0;
    const timer = window.setTimeout(() => {
      draftMutation.mutate({ labOrderId: selectedLabOrderId, values: resultDraft, remarks: resultDraft.remarks }, {
        onSuccess: () => {
          if (draftRevisions.current.get(selectedDraftKey) === revision) dirtyDraftKeys.current.delete(selectedDraftKey);
        },
        onError: error => setToast(`تعذر حفظ المسودة تلقائيًا: ${error.message}`),
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draftMutation.mutate, effectiveRole, resultDraft, selectedDraftKey, selectedLabOrderId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const afterPrint = () => { setPrintMode(null); setPrintPatientSnapshot(null); };
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  const invalidateWorkspace = () => {
    void trpcUtils.patients.workspace.invalidate();
    void trpcUtils.shifts.current.invalidate(currentShiftInput);
  };

  const triggerPrint = (mode: Exclude<PrintMode, null>, patient?: Patient, range?: ReportRange) => {
    setPrintPatientSnapshot(patient ?? null);
    if (range) setPrintReportRange(range);
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 120);
  };

  const openExistingInvoice = (patientNumber?: string) => {
    setExistingInvoiceFor(patientNumber ?? null);
  };

  const handleNewPatient = (input: { name: string; gender: Patient["gender"]; age?: number; phone: string; address: string; tests: string[]; consultationType: ConsultationType }) => {
    if (!operationalRole || (operationalRole !== "cashier" && operationalRole !== "admin")) {
      setToast("تسجيل المرضى من صلاحية الكاشير أو مدير النظام");
      return;
    }
    registerMutation.mutate({
      name: input.name,
      gender: input.gender === "أنثى" ? "female" : "male",
      age: input.age,
      phone: input.phone === "—" ? undefined : input.phone,
      address: input.address === "—" ? undefined : input.address,
      testCodes: input.tests,
      consultationType: input.consultationType,
      shiftDate: currentShiftInput.shiftDate,
      shiftType: currentShiftInput.shiftType,
    }, {
      onSuccess: registration => {
        setSelectedPatientId(registration.patientNumber);
        setShowPatientDialog(false);
        setActiveSection("billing");
        invalidateWorkspace();
        setToast(`حُفظ تسجيل ${input.name} · الوردية ${String(registration.sequence).padStart(4, "0")} · الفاتورة ${registration.invoiceNumber}`);
      },
      onError: error => setToast(`لم يُحفظ التسجيل: ${error.message}`),
    });
  };

  const handleAddInvoice = (patientNumber: string, codes: string[], consultationType: ConsultationType) => {
    if (!operationalRole || (operationalRole !== "cashier" && operationalRole !== "admin")) {
      setToast("إصدار الفواتير من صلاحية الكاشير أو مدير النظام");
      return;
    }
    followUpMutation.mutate({
      patientNumber,
      testCodes: codes,
      consultationType,
      shiftDate: currentShiftInput.shiftDate,
      shiftType: currentShiftInput.shiftType,
    }, {
      onSuccess: invoice => {
        setExistingInvoiceFor(undefined);
        setDrawerPatient(null);
        invalidateWorkspace();
        setToast(`حُفظت فاتورة المتابعة ${invoice.invoiceNumber} بقيمة ${formatCurrency(invoice.total)}`);
      },
      onError: error => setToast(`لم تُحفظ الفاتورة: ${error.message}`),
    });
  };

  const handleMarkPaid = (patient: Patient, payment: { paymentMethod: "cash" | "bank"; paymentBank?: string; transactionNumber?: string }, onSuccess: () => void) => {
    if (!patient.databaseInvoiceId) {
      setToast("لا توجد فاتورة محفوظة لهذا السجل");
      return;
    }
    paymentMutation.mutate({ invoiceId: patient.databaseInvoiceId, ...payment }, {
      onSuccess: () => {
        invalidateWorkspace();
        void trpcUtils.clinic.listPaymentBanks.invalidate();
        setToast(`تم تحصيل الفاتورة ${patient.invoice} وتفعيل طلباتها المخبرية`);
        onSuccess();
      },
      onError: error => setToast(`لم يُسجل التحصيل: ${error.message}`),
    });
  };

  const handleCancelInvoice = (patient: Patient) => {
    if (!patient.databaseInvoiceId || !window.confirm(`هل تريد إلغاء الفاتورة ${patient.invoice}؟`)) return;
    const reason = window.prompt("سبب الإلغاء (إلزامي)", "طلب المريض")?.trim();
    if (!reason) return;
    cancelMutation.mutate({ invoiceId: patient.databaseInvoiceId, reason }, {
      onSuccess: () => { invalidateWorkspace(); setToast(`تم إلغاء الفاتورة ${patient.invoice} وتسجيل السبب`); },
      onError: error => setToast(`تعذر الإلغاء: ${error.message}`),
    });
  };

  const handleRefundInvoice = (patient: Patient) => {
    if (!patient.databaseInvoiceId || !window.confirm(`هل تريد إرجاع ${formatCurrency(patient.invoiceTotal ?? 0)} للمريض؟`)) return;
    const reason = window.prompt("سبب إرجاع المال (إلزامي)", "طلب المريض")?.trim();
    if (!reason) return;
    refundMutation.mutate({ invoiceId: patient.databaseInvoiceId, reason }, {
      onSuccess: () => { invalidateWorkspace(); setToast(`تم توثيق استرجاع الفاتورة ${patient.invoice}`); },
      onError: error => setToast(`تعذر الاسترجاع: ${error.message}`),
    });
  };

  const handleSaveResult = () => {
    if (!selectedPatient.paid) {
      setToast("لا يمكن حفظ النتيجة قبل اكتمال الدفع");
      return;
    }
    const results = selectedPatient.tests.map(code => {
      const test = catalog.find(item => item.code === code);
      const key = `${selectedPatient.id}-${code}`;
      const values = resultDrafts[key] ?? savedResults[key] ?? persistedDraftResults[key] ?? {};
      return { code, test, labOrderId: selectedPatient.orderIds?.[code], values };
    });
    const invalid = results.find(item => !item.labOrderId);
    if (invalid) { setToast(`لا يوجد طلب مخبري محفوظ للفحص ${invalid.code}`); return; }
    const blankFields = results.flatMap(item => (item.test?.fields ?? []).filter(field => !item.values[field.key]?.trim()).map(field => `${item.code}: ${field.label}`));
    if (blankFields.length && !window.confirm(`تنبيه: توجد ${blankFields.length} خانة اختيارية فارغة. سيُحفظ المتاح دون اشتراط تعبئتها. هل تريد المتابعة؟`)) return;
    batchResultMutation.mutate({ results: results.map(item => ({ labOrderId: item.labOrderId!, values: item.values, remarks: item.values.remarks })) }, {
      onSuccess: () => {
        const keys = selectedPatient.tests.map(code => `${selectedPatient.id}-${code}`);
        keys.forEach(key => { dirtyDraftKeys.current.delete(key); draftRevisions.current.delete(key); });
        setResultDrafts(current => { const next = { ...current }; keys.forEach(key => delete next[key]); return next; });
        invalidateWorkspace();
        setToast(`تم حفظ نتائج الفحوصات جميعها (${results.length}) للمريض ${selectedPatient.name}${blankFields.length ? ` · تنبيه: ${blankFields.length} خانة اختيارية فارغة` : ""}`);
      },
      onError: error => setToast(`لم تُحفظ النتائج: ${error.message}`),
    });
  };

  const handlePrintResult = () => {
    const tests = selectedPatient.tests.map(code => catalog.find(item => item.code === code)).filter((item): item is LabTest => Boolean(item));
    const blankFields = tests.flatMap(test => {
      const key = `${selectedPatient.id}-${test.code}`;
      const values = resultDrafts[key] ?? savedResults[key] ?? persistedDraftResults[key] ?? {};
      return test.fields.filter(field => !values[field.key]?.trim()).map(field => `${test.code}: ${field.label}`);
    });
    if (blankFields.length && !window.confirm(`تنبيه قبل الطباعة: توجد ${blankFields.length} خانة اختيارية فارغة. ستظهر كشرطة (—) في التقرير. هل تريد الطباعة؟`)) return;
    triggerPrint("result");
  };

  const handleCollectSample = (patient: Patient, code: string) => {
    const labOrderId = patient.orderIds?.[code];
    if (!labOrderId) {
      setToast("لا يوجد طلب مخبري لهذا الفحص");
      return;
    }
    collectMutation.mutate({ labOrderId }, {
      onSuccess: () => { invalidateWorkspace(); setToast(`تم تسجيل سحب عينة ${code}`); },
      onError: error => setToast(`تعذر تسجيل السحب: ${error.message}`),
    });
  };

  const handleSaveSettings = (draft: ClinicSettingsDraft) => {
    if (effectiveRole !== "admin") {
      setToast("تعديل إعدادات المستوصف من صلاحية مدير النظام فقط");
      return;
    }
    const website = draft.website.trim();
    const logoUrl = draft.logoUrl.trim();
    saveSettingsMutation.mutate({
      name: draft.name.trim(),
      logoUrl: logoUrl || null,
      address: draft.address.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      email: draft.email.trim() || undefined,
      website: website ? (website.startsWith("http://") || website.startsWith("https://") ? website : `https://${website}`) : undefined,
      footerText: draft.footerText.trim() || undefined,
    }, {
      onSuccess: () => { void trpcUtils.clinic.getSettings.invalidate(); setToast("تم حفظ إعدادات المستوصف وتحديث قوالب الطباعة"); },
      onError: error => setToast(error.message || "تعذر حفظ إعدادات المستوصف"),
    });
  };

  const renderSection = () => {
    if (!accessibleSections.includes(activeSection)) {
      return (
        <div className="page-stack">
          <SectionTitle eyebrow="الوصول المقيّد" title="هذا القسم غير متاح لهذا الدور" description={`دور ${roleLabels[effectiveRole]} لا يملك صلاحية فتح ${sectionLabels[activeSection]}.`} />
          <div className="panel empty-state"><ShieldCheck size={24} /><strong>الصلاحية غير متوفرة</strong><span>اختر قسمًا من القائمة الجانبية المسموحة لدورك.</span></div>
        </div>
      );
    }
    if (activeSection === "overview") {
      return <Overview patients={patients} shift={shift} shiftSequence={visibleShiftSequence} catalog={catalog} prices={prices} role={effectiveRole} onNavigate={setActiveSection} onAddPatient={() => setShowPatientDialog(true)} onPrintReport={() => triggerPrint("report")} />;
    }
    if (activeSection === "patients") {
      return <Patients patients={patients} search={search} setSearch={setSearch} onAddPatient={() => setShowPatientDialog(true)} onSelectPatient={setDrawerPatient} onPrintInvoice={patient => triggerPrint("invoice", patient)} />;
    }
    if (activeSection === "billing") {
      return <Billing patients={billingPatients} catalog={catalog} prices={prices} banks={(paymentBanksQuery.data ?? []).map(bank => ({ id: bank.id, name: bank.name }))} onAddPatient={() => setShowPatientDialog(true)} onAddInvoice={() => openExistingInvoice()} onPrintInvoice={patient => triggerPrint("invoice", patient)} onEditInvoice={patient => patient.databaseInvoiceId && setEditorInvoiceId(patient.databaseInvoiceId)} onMarkPaid={handleMarkPaid} onCancel={handleCancelInvoice} onRefund={handleRefundInvoice} saving={paymentMutation.isPending || cancelMutation.isPending || refundMutation.isPending || followUpMutation.isPending} canManage={effectiveRole === "admin" || effectiveRole === "cashier"} />;
    }
    if (activeSection === "lab") {
      return <Lab patients={patients} catalog={catalog} prices={prices} cbcEnabled={Boolean(cbcStatusQuery.data?.enabled)} cbcConnection={cbcStatusQuery.data?.connection ?? "disconnected"} selectedPatientId={selectedPatient.id} setSelectedPatientId={id => {
        setSelectedPatientId(id);
        const nextCode = patients.find(patient => patient.id === id)?.tests[0] ?? catalog[0]?.code ?? "";
        setSelectedTestCode(nextCode);
      }} selectedTestCode={selectedTest.code} setSelectedTestCode={code => setSelectedTestCode(code)} results={{ ...persistedDraftResults, ...savedResults, ...resultDrafts }} resultDraft={resultDraft} setResultDraft={setResultDraft} onSaveResult={handleSaveResult} onPrintResult={handlePrintResult} onCollectSample={handleCollectSample} savingResult={batchResultMutation.isPending} collectingSample={collectMutation.isPending} />;
    }
    if (activeSection === "tests") {
      return <CatalogPanel catalog={catalog} prices={prices} canEditDefinitions={effectiveRole === "admin"} canEditPrices={effectiveRole === "admin" || effectiveRole === "supervisor"} onToast={setToast} onChanged={() => { void trpcUtils.catalog.list.invalidate(); void trpcUtils.pricing.get.invalidate(); }} />;
    }
    if (activeSection === "reports") {
      return <Reports patients={billingPatients} catalog={catalog} prices={prices} hasSession={Boolean(operationalRole)} canDownloadPdf={Boolean(operationalRole)} role={effectiveRole} onToast={setToast} onPrintReport={() => triggerPrint("report")} />;
    }
    if (activeSection === "users") {
      return <TeamPanel role={effectiveRole} onToast={setToast} />;
    }
    return <Settings role={effectiveRole} shift={shift} setShift={setShift} settings={clinicSettings} canSave={effectiveRole === "admin"} saving={saveSettingsMutation.isPending} onSave={handleSaveSettings} banks={(paymentBanksQuery.data ?? []).map(bank => ({ id: bank.id, name: bank.name }))} onAddBank={name => addBankMutation.mutate({ name }, { onSuccess: () => { void trpcUtils.clinic.listPaymentBanks.invalidate(); setToast("تمت إضافة البنك"); }, onError: error => setToast(`تعذرت إضافة البنك: ${error.message}`) })} onRemoveBank={id => removeBankMutation.mutate({ id }, { onSuccess: () => { void trpcUtils.clinic.listPaymentBanks.invalidate(); setToast("تم تعطيل البنك"); }, onError: error => setToast(`تعذر تعطيل البنك: ${error.message}`) })} />;
  };

  if (authQuery.isLoading) {
    return <div className="app-splash"><AppLogo /><span>جارٍ التحقق من جلسة الدخول...</span></div>;
  }

  if (setupQuery.isLoading) {
    return <div className="app-splash"><AppLogo /><span>جارٍ التحقق من تهيئة المستوصف...</span></div>;
  }

  if (setupQuery.data?.required) {
    return <Suspense fallback={<div className="app-splash"><AppLogo /><span>جارٍ تحميل شاشة التهيئة...</span></div>}><SetupWizard onCompleted={() => { void setupQuery.refetch(); void authQuery.refetch(); }} /></Suspense>;
  }

  if (!authQuery.data || !operationalRole) {
    return (
      <div className="welcome-screen">
        <div className="welcome-card">
          <AppLogo />
          <span className="eyebrow">نظام إدارة المستوصف والمختبر</span>
          <h1>{authQuery.data ? "حسابك غير مصرح للتشغيل" : "مرحبًا بك في نظام بكّا الطبي"}</h1>
          <p>{authQuery.data
            ? "الحساب مسجل لكنه لا يحمل دورًا تشغيليًا. اطلب من مدير النظام تعيين صلاحية كاشير أو مختبر أو مشرف تشغيل."
            : "سجّل الدخول لإدارة المرضى والفواتير والمختبر والتقارير بصلاحيات منفصلة لكل دور."}</p>
          <div className="welcome-actions">
            <button className="button button-primary" onClick={() => setShowLoginPanel(true)}><LogIn size={17} />تسجيل الدخول</button>
            {authQuery.data && <button className="button button-secondary" onClick={() => { void authQuery.refetch(); }}><ArrowLeft size={16} />إعادة التحقق من الجلسة</button>}
          </div>
          <div className="welcome-roles">
            {(Object.keys(roleLabels) as Role[]).map(role => <div key={role}><ShieldCheck size={16} /><strong>{roleLabels[role]}</strong></div>)}
          </div>
        </div>
        <Suspense fallback={<div className="app-splash"><AppLogo /><span>جارٍ تحميل شاشة الدخول...</span></div>}>
          {showLoginPanel && <LoginDialog onClose={() => setShowLoginPanel(false)} onToast={setToast} onAuthenticated={resetSessionView} />}
        </Suspense>
        {toast && <div className="toast"><BadgeCheck size={17} /><span>{toast}</span><button onClick={() => setToast("")}><X size={14} /></button></div>}
      </div>
    );
  }

  if (printMode) {
    return (
      <Suspense fallback={<div className="app-splash"><AppLogo /><span>جارٍ تجهيز المستند للطباعة...</span></div>}>
        <PrintDocument mode={printMode} patient={printPatientSnapshot ?? selectedPatient} selectedTest={selectedTest} result={savedResults[`${selectedPatient.id}-${selectedTest.code}`] ?? resultDraft} results={{ ...persistedDraftResults, ...savedResults, ...resultDrafts }} reportPatients={billingPatients.length ? billingPatients : patients} reportRange={printReportRange} clinic={printClinic} catalog={catalog} prices={prices} onClose={() => { setPrintMode(null); setPrintPatientSnapshot(null); }} />
      </Suspense>
    );
  }

  const navBadge = (id: Section) => {
    if (id === "patients") return patients.length || undefined;
    if (id === "lab") return patients.reduce((sum, patient) => sum + patient.tests.length, 0) || undefined;
    return undefined;
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="sidebar-top"><AppLogo /><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="إغلاق القائمة"><X size={18} /></button></div>
        <div className="clinic-status"><span className="live-dot" /><div><strong>{clinicSettings?.name ?? "مستوصف بكّا الطبي الحديث"}</strong><span>{workspaceQuery.isError ? "تعذر الاتصال بقاعدة البيانات" : workspaceQuery.isSuccess ? "قاعدة البيانات متصلة · الحفظ دائم" : "جارٍ تحميل السجلات"}</span></div></div>
        <nav className="main-nav">
          {NAV_ITEMS.filter(item => accessibleSections.includes(item.id)).map(item => {
            const Icon = item.icon;
            const badge = navBadge(item.id);
            return <button key={item.id} className={activeSection === item.id ? "active" : ""} onClick={() => { setActiveSection(item.id); setMobileMenu(false); }}><Icon size={18} /><span>{item.label}</span>{badge != null && <em>{badge}</em>}</button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><div className="help-icon"><ShieldCheck size={17} /></div><div><strong>بياناتك محمية</strong><span>جلسة تشغيل موثقة</span></div></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-start">
            <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="فتح القائمة"><Menu size={19} /></button>
            <div className="breadcrumb"><span>نظام المستوصف</span><ArrowLeft size={13} /><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            {(effectiveRole === "cashier" || effectiveRole === "admin") && (
              <div className="shift-switcher"><span className="shift-dot" /><select value={shift} onChange={event => setShift(event.target.value as Shift)}><option>صباحية</option><option>مسائية</option><option>سهرة</option></select><span className="shift-number">#{String(visibleShiftSequence).padStart(4, "0")}</span></div>
            )}
            {effectiveRole === "lab" && <div className="shift-switcher"><span className="shift-dot" /><span className="lab-top-label">محطة المختبر</span></div>}
            <div className="date-chip"><CalendarDays size={15} />{formatClinicDate()}</div>
            <NotificationCenter role={effectiveRole} userId={authQuery.data.id} onOpenChat={() => setTeamChatOpen(true)} onNavigate={section => { setActiveSection(section); setMobileMenu(false); }} />
            <AccountMenu name={authQuery.data.name} username={authQuery.data.username} roleLabel={roleLabels[effectiveRole]} onEditAccount={() => setShowAccountSettings(true)} onSwitchAccount={() => setShowLoginPanel(true)} onLogout={() => setShowLogoutReminder(true)} />
          </div>
        </header>
        <div className="content-wrap">
          <div className="mobile-title-row"><AppLogo compact /><span className="mobile-page-title">{pageTitle}</span></div>
          <Suspense fallback={<div className="panel empty-state"><span>جارٍ تحميل القسم...</span></div>}>
            {renderSection()}
          </Suspense>
        </div>
      </main>

      <Suspense fallback={null}>
        {showPatientDialog && <PatientDialog catalog={catalog} prices={prices} onClose={() => setShowPatientDialog(false)} saving={registerMutation.isPending} onSave={handleNewPatient} />}
        {existingInvoiceFor !== undefined && <ExistingInvoiceDialog patients={patients} catalog={catalog} prices={prices} initialPatientNumber={existingInvoiceFor ?? undefined} onClose={() => setExistingInvoiceFor(undefined)} saving={followUpMutation.isPending} onSave={handleAddInvoice} />}
        {editorInvoiceId != null && <InvoiceEditor invoiceId={editorInvoiceId} catalog={catalog} prices={prices} onClose={() => setEditorInvoiceId(null)} onSaved={invalidateWorkspace} onToast={setToast} />}
        {showAccountSettings && <AccountSettingsDialog onClose={() => setShowAccountSettings(false)} onToast={setToast} />}
        {showLoginPanel && <LoginDialog onClose={() => setShowLoginPanel(false)} onToast={setToast} onAuthenticated={resetSessionView} />}
        {drawerPatient && <PatientDrawer patient={drawerPatient} catalog={catalog} prices={prices} onClose={() => setDrawerPatient(null)} onPrintInvoice={() => { const snapshot = drawerPatient; setDrawerPatient(null); triggerPrint("invoice", snapshot); }} onPrintMedicalReport={() => { const snapshot = drawerPatient; setDrawerPatient(null); triggerPrint("patient-report", snapshot); }} onEditInvoice={() => { if (drawerPatient.databaseInvoiceId) { setEditorInvoiceId(drawerPatient.databaseInvoiceId); setDrawerPatient(null); } }} onAddInvoice={() => { const number = drawerPatient.id; setDrawerPatient(null); openExistingInvoice(number); }} onNavigate={section => { setActiveSection(section); }} />}
      </Suspense>
      {showLogoutReminder && <div className="modal-backdrop" onMouseDown={() => setShowLogoutReminder(false)}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="logout-reminder-title" onMouseDown={event => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">تذكير قبل المغادرة</span><h2 id="logout-reminder-title">راجع الفواتير وتقرير الوردية</h2></div><button className="icon-button" onClick={() => setShowLogoutReminder(false)} aria-label="إغلاق"><X size={18} /></button></div><div className="modal-body"><p className="modal-paragraph">تأكد من حفظ الفواتير وتثبيت التحصيلات قبل تسجيل الخروج. يمكنك مراجعة تقرير الوردية باسمك الآن؛ لا تُغلق الوردية تلقائيًا عند الخروج.</p></div><div className="modal-footer"><button className="button button-secondary" onClick={() => { setShowLogoutReminder(false); setActiveSection("reports"); }}>مراجعة التقارير</button><button className="button button-primary" disabled={logoutMutation.isPending} onClick={() => logoutMutation.mutate()}><LogOut size={16} />{logoutMutation.isPending ? "جارٍ الخروج..." : "تأكيد تسجيل الخروج"}</button></div></div></div>}
      {(effectiveRole === "cashier" || effectiveRole === "lab") && <TeamCommunication role={effectiveRole} patient={effectiveRole === "lab" ? selectedPatient : undefined} open={teamChatOpen} onOpenChange={setTeamChatOpen} />}
      {toast && <div className="toast"><BadgeCheck size={17} /><span>{toast}</span><button onClick={() => setToast("")} aria-label="إغلاق التنبيه"><X size={14} /></button></div>}
    </div>
  );
}

function patientHasCode(patient: Patient, code: string) {
  return patient.tests.includes(code);
}
