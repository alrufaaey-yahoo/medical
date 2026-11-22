import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import {
  CONSULTATION_LABELS,
  consultationFeeFor,
  consultationTypeFromDescription,
  describeLabTest,
  invoiceTotal,
  isConsultationDescription,
  isConsultationType,
  normalizeConsultationType,
  resolveConsultationPrices,
  type ConsultationType,
} from "@shared/billing";
import { and, desc, eq, gte, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  auditLog,
  clinicSettings,
  cbcBridgeConfig,
  invoiceAdjustments,
  invoiceItems,
  invoices,
  cashierAttention,
  labResultDrafts,
  labOrders,
  labResults,
  labTests,
  patients,
  paymentBanks,
  priceChanges,
  shifts,
  staffMembers,
  staffMessages,
  previewLoginAccounts,
  localLoginAccounts,
  userShiftAssignments,
  users,
} from "../drizzle/schema";
import { verifyPreviewPassword } from "./_core/preview-auth";
import { getDb } from "./db";
import { hashLocalPassword, verifyLocalPassword } from "./local-auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, roleProcedure, router } from "./_core/trpc";
import {
  canAdminUpdateRole,
  canAssignStaffRole,
  canManagePrices,
  canManageStaff,
} from "./_core/role-access";
import { isPreviewLoginEnabled } from "./_core/preview-auth";
import { sdk } from "./_core/sdk";
import { sumInvoiceItems, toInvoiceNumber, toPatientNumber, uniqueTestCodes } from "./medical-workflow";
import { buildOperationalReport, getReportWindow, getShiftWindow } from "./operational-reports";
import { diffCatalogPrices, diffConsultationPrices, normalizePrice } from "./pricing";
import { getCbcBridgeSettings, getCbcBridgeStatus, rotateCbcBridgeToken, updateCbcBridgeSettings } from "./cbc-bridge";

const patientInput = z.object({
  name: z.string().trim().min(2).max(180),
  gender: z.enum(["male", "female"]),
  age: z.number().int().min(0).max(130).optional(),
  phone: z.string().trim().max(60).optional(),
  address: z.string().trim().max(255).optional(),
});

const clinicInput = z.object({
  name: z.string().trim().min(2).max(180),
  logoUrl: z.string().url().max(500).refine(value => new URL(value).protocol === "https:", "رابط الشعار يجب أن يستخدم HTTPS").nullable().optional(),
  address: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(120).optional(),
  email: z.string().email().max(180).optional(),
  website: z.string().url().max(180).optional(),
  footerText: z.string().trim().max(1000).optional(),
});

const resultInput = z.object({
  labOrderId: z.number().int().positive(),
  values: z.record(z.string(), z.string()),
  remarks: z.string().max(5000).optional(),
});

const clinicDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "تاريخ الوردية غير صالح");

const shiftTypeInput = z.enum(["morning", "evening", "night"]);
const consultationTypeInput = z.enum(["none", "general", "specialist"]);

const visitInput = patientInput.extend({
  shiftDate: clinicDate,
  shiftType: shiftTypeInput,
  testCodes: z.array(z.string().trim().min(1).max(32)).max(50).default([]),
  consultationType: consultationTypeInput.default("general"),
});

const followUpInput = z.object({
  patientNumber: z.string().trim().min(1).max(32),
  shiftDate: clinicDate,
  shiftType: shiftTypeInput,
  testCodes: z.array(z.string().trim().min(1).max(32)).max(50).default([]),
  consultationType: consultationTypeInput.default("none"),
});

const labTestInput = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, "رمز الفحص يجب أن يكون بالإنجليزية والأرقام فقط"),
  nameAr: z.string().trim().min(2).max(180),
  nameEn: z.string().trim().max(180).optional(),
  category: z.string().trim().max(100).optional(),
  sample: z.string().trim().max(120).optional(),
  turnaround: z.string().trim().max(60).optional(),
  price: z.number().int().min(0).max(100000000),
  fieldsJson: z.string().max(30000).refine(value => {
    try {
      const fields = JSON.parse(value) as unknown;
      return Array.isArray(fields) && fields.every(field => typeof field === "object" && field !== null);
    } catch {
      return false;
    }
  }, "حقول الفحص يجب أن تكون JSON صالحًا"),
  active: z.number().int().min(0).max(1).default(1),
});

const reasonInput = z.string().trim().min(3).max(500);
const invoiceActionInput = z.object({ invoiceId: z.number().int().positive(), reason: reasonInput });
const invoiceEditInput = z.object({
  invoiceId: z.number().int().positive(),
  testCodes: z.array(z.string().trim().min(1).max(32)).max(50),
  consultationType: consultationTypeInput,
  reason: reasonInput,
});

const staffInput = z.object({
  fullName: z.string().trim().min(2).max(180),
  email: z.string().trim().email("البريد الإلكتروني غير صالح").max(320).optional(),
  phone: z.string().trim().max(60).optional(),
  role: z.enum(["cashier", "lab", "supervisor"]),
});

const usernameInput = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم يقبل الحروف الإنجليزية والأرقام والنقطة والشرطة فقط").transform(value => value.toLowerCase());

const PREVIEW_NAMES: Record<"admin" | "supervisor" | "cashier" | "lab", string> = {
  admin: "مدير النظام (معاينة)",
  supervisor: "مشرف التشغيل (معاينة)",
  cashier: "كاشير الاستقبال (معاينة)",
  lab: "فني المختبر (معاينة)",
};

type DbExecutor = any;

async function assertCashierShiftAccess(tx: DbExecutor, shiftId: number, userId: number, mutation = false) {
  const [shift] = await tx.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1).for("update");
  if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "الوردية المرتبطة بالسجل غير موجودة" });
  const [assignment] = await tx.select({ id: userShiftAssignments.id }).from(userShiftAssignments)
    .where(and(eq(userShiftAssignments.shiftId, shift.id), eq(userShiftAssignments.userId, userId))).limit(1);
  if (shift.cashierUserId !== userId && !assignment) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى بيانات كاشير آخر" });
  }
  if (mutation && shift.status !== "open") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن تعديل عملية مرتبطة بورديّة مغلقة" });
  }
  return shift;
}

async function assertCashierCanUseShift(tx: DbExecutor, shiftDate: string, shiftType: "morning" | "evening" | "night", userId: number) {
  const [shift] = await tx.select().from(shifts)
    .where(and(eq(shifts.shiftDate, shiftDate), eq(shifts.shiftType, shiftType))).limit(1).for("update");
  if (!shift) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا توجد وردية مسندة لهذا التاريخ والنوع" });
  return assertCashierShiftAccess(tx, shift.id, userId, true);
}

async function assertLabOrderAccess(tx: DbExecutor, orderId: number, userId: number, requiredStatus?: "queued" | "in_progress") {
  const [row] = await tx.select({ order: labOrders, shift: shifts }).from(labOrders)
    .innerJoin(invoices, eq(invoices.id, labOrders.invoiceId))
    .innerJoin(shifts, eq(shifts.id, invoices.shiftId))
    .where(eq(labOrders.id, orderId)).limit(1).for("update");
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المختبر غير موجود" });
  const [assignment] = await tx.select({ id: userShiftAssignments.id }).from(userShiftAssignments)
    .where(and(eq(userShiftAssignments.shiftId, row.shift.id), eq(userShiftAssignments.userId, userId))).limit(1);
  if (row.shift.labUserId !== userId && !assignment) {
    throw new TRPCError({ code: "FORBIDDEN", message: "طلب المختبر غير مسند إلى الفني الحالي" });
  }
  if (requiredStatus && row.order.status !== requiredStatus) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: requiredStatus === "in_progress" ? "يجب استلام العينة قبل إدخال النتيجة" : "حالة طلب المختبر لا تسمح بهذا الإجراء" });
  }
  return row;
}

async function writeAudit(tx: DbExecutor, input: {
  actorId: number;
  action: string;
  entity: string;
  entityId?: number | null;
  shiftId?: number | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  await tx.insert(auditLog).values({
    actorId: input.actorId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    shiftId: input.shiftId ?? null,
    reason: input.reason ?? null,
    beforeJson: input.before == null ? null : JSON.stringify(input.before),
    afterJson: input.after == null ? null : JSON.stringify(input.after),
  });
}

type InvoiceEditResult = {
  invoice: typeof invoices.$inferSelect;
  added: string[];
  removed: string[];
  consultationType: ConsultationType;
  requiresRecollection: boolean;
  delta: number;
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ?? null),
    namedAccounts: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: users.id, username: users.username, name: users.name, role: users.role })
        .from(localLoginAccounts).innerJoin(users, eq(users.id, localLoginAccounts.userId))
        .where(and(eq(localLoginAccounts.active, 1), inArray(users.role, ["admin", "supervisor", "cashier", "lab"])))
        .orderBy(users.role, users.name);
    }),
    namedLogin: publicProcedure.input(z.object({ username: usernameInput, password: z.string().min(1).max(128) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [row] = await db.select({ userId: users.id, openId: users.openId, name: users.name, passwordHash: localLoginAccounts.passwordHash })
        .from(localLoginAccounts).innerJoin(users, eq(users.id, localLoginAccounts.userId))
        .where(and(eq(users.username, input.username), eq(localLoginAccounts.active, 1))).limit(1);
      if (!row || !(await verifyLocalPassword(input.password, row.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور غير صحيحة" });
      }
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, row.userId));
      const token = await sdk.createSessionToken(row.openId, { name: row.name ?? "" , expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { success: true } as const;
    }),
    updateOwnAccount: protectedProcedure.input(z.object({
      username: usernameInput,
      name: z.string().trim().min(2).max(180),
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(8).max(128).optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [account] = await db.select({ openId: users.openId, passwordHash: localLoginAccounts.passwordHash })
        .from(localLoginAccounts).innerJoin(users, eq(users.id, localLoginAccounts.userId))
        .where(and(eq(users.id, ctx.user.id), eq(localLoginAccounts.active, 1))).limit(1);
      if (!account) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "تعديل بيانات الدخول متاح للحسابات المحلية فقط" });
      if (!(await verifyLocalPassword(input.currentPassword, account.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور الحالية غير صحيحة" });
      }
      const [duplicate] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
      if (duplicate && duplicate.id !== ctx.user.id) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم بالفعل" });
      try {
        await db.transaction(async tx => {
          await tx.update(users).set({ username: input.username, name: input.name }).where(eq(users.id, ctx.user.id));
          if (input.newPassword) {
            await tx.update(localLoginAccounts).set({ passwordHash: await hashLocalPassword(input.newPassword), mustChangePassword: 0, failedAttempts: 0, lockedUntil: null }).where(eq(localLoginAccounts.userId, ctx.user.id));
          }
        });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
          throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم بالفعل" });
        }
        throw error;
      }
      const token = await sdk.createSessionToken(account.openId, { name: input.name, expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    previewAvailable: publicProcedure.query(() => ({ enabled: isPreviewLoginEnabled() })),
    /** Preview-only password sign-in for isolated test accounts. */
    previewLogin: publicProcedure.input(z.object({
      role: z.enum(["admin", "supervisor", "cashier", "lab"]),
      password: z.string().min(6).max(128),
    })).mutation(async ({ input, ctx }) => {
      if (!isPreviewLoginEnabled()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "الدخول التجريبي غير مفعّل في هذه البيئة" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [account] = await db.select().from(previewLoginAccounts).where(eq(previewLoginAccounts.role, input.role)).limit(1);
      if (!account || !verifyPreviewPassword(input.password, account.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور غير صحيحة لهذا الدور" });
      }
      const openId = `preview-${input.role}`;
      await db.insert(users).values({
        openId,
        name: PREVIEW_NAMES[input.role],
        email: `${openId}@preview.local`,
        loginMethod: "preview",
        role: input.role,
      }).onDuplicateKeyUpdate({ set: { name: PREVIEW_NAMES[input.role], role: input.role } });
      const token = await sdk.createSessionToken(openId, { name: PREVIEW_NAMES[input.role], expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { success: true, role: input.role } as const;
    }),
  }),

  loginAccounts: router({
    list: roleProcedure("supervisor").query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const rows = await db.select({ userId: users.id, username: users.username, name: users.name, role: users.role, active: localLoginAccounts.active, createdAt: localLoginAccounts.createdAt })
        .from(localLoginAccounts).innerJoin(users, eq(users.id, localLoginAccounts.userId)).orderBy(users.name);
      return ctx.user.role === "admin" ? rows : rows.filter(row => row.role === "cashier" || row.role === "lab");
    }),
    create: roleProcedure("supervisor").input(z.object({ name: z.string().trim().min(2).max(180), username: usernameInput, role: z.enum(["admin", "supervisor", "cashier", "lab"]), password: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "supervisor" && input.role !== "cashier" && input.role !== "lab") throw new TRPCError({ code: "FORBIDDEN", message: "مشرف النظام يستطيع إنشاء حسابات الاستقبال والمختبر فقط" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [duplicate] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم بالفعل" });
      const openId = `local_${randomBytes(20).toString("hex")}`;
      const passwordHash = await hashLocalPassword(input.password);
      await db.transaction(async tx => {
        await tx.insert(users).values({ openId, name: input.name, username: input.username, loginMethod: "local-password", role: input.role });
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
        if (!user) throw new Error("تعذر إنشاء سجل المستخدم");
        await tx.insert(localLoginAccounts).values({ userId: user.id, passwordHash, createdBy: ctx.user.id, active: 1 });
      });
      return { success: true } as const;
    }),
    setActive: roleProcedure("supervisor").input(z.object({ userId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعطيل حسابك الحالي" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target || (ctx.user.role === "supervisor" && target.role !== "cashier" && target.role !== "lab")) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعديل هذا الحساب" });
      await db.update(localLoginAccounts).set({ active: input.active ? 1 : 0 }).where(eq(localLoginAccounts.userId, input.userId));
      return { success: true } as const;
    }),
    changePassword: roleProcedure("supervisor").input(z.object({ userId: z.number().int().positive(), password: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target || (ctx.user.role === "supervisor" && target.role !== "cashier" && target.role !== "lab")) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعديل كلمة مرور هذا الحساب" });
      await db.update(localLoginAccounts).set({ passwordHash: await hashLocalPassword(input.password) }).where(eq(localLoginAccounts.userId, input.userId));
      return { success: true } as const;
    }),
  }),

  users: router({
    list: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        loginMethod: users.loginMethod,
        role: users.role,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users).orderBy(desc(users.createdAt));
    }),
    updateRole: adminProcedure.input(z.object({
      userId: z.number().int().positive(),
      role: z.enum(["admin", "cashier", "lab", "supervisor"]),
    })).mutation(async ({ input, ctx }) => {
      if (!canAdminUpdateRole(ctx.user.id, input.userId, input.role)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن للمدير خفض صلاحية حسابه الحالي" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const result = await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      if (result[0].affectedRows === 0) throw new TRPCError({ code: "NOT_FOUND", message: "حساب المستخدم غير موجود" });
      return { success: true, userId: input.userId, role: input.role } as const;
    }),
  }),

  staff: router({
    list: roleProcedure("supervisor").query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const rows = await db.select().from(staffMembers).orderBy(desc(staffMembers.active), staffMembers.fullName);
      const visible = ctx.user.role === "admin" ? rows : rows.filter(row => row.role !== "supervisor");
      const linkedIds = visible.map(row => row.userId).filter((id): id is number => id != null);
      const linked = linkedIds.length
        ? await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn })
          .from(users).where(inArray(users.id, linkedIds))
        : [];
      return visible.map(row => ({ ...row, account: linked.find(user => user.id === row.userId) ?? null }));
    }),
    create: roleProcedure("supervisor").input(staffInput).mutation(async ({ input, ctx }) => {
      if (!canManageStaff(ctx.user.role) || !canAssignStaffRole(ctx.user.role, input.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن لهذا الدور إضافة مستخدم بهذه الصلاحية" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const email = input.email?.trim().toLowerCase() || null;
      if (email) {
        const [duplicate] = await db.select({ id: staffMembers.id }).from(staffMembers).where(eq(staffMembers.email, email)).limit(1);
        if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "يوجد مستخدم مسجل بهذا البريد الإلكتروني" });
      }
      const [account] = email
        ? await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1)
        : [];
      const result = await db.insert(staffMembers).values({
        fullName: input.fullName,
        email,
        phone: input.phone || null,
        role: input.role,
        userId: account?.id ?? null,
        createdBy: ctx.user.id,
      });
      // Link an existing account immediately when it has no operational role yet.
      if (account && account.role === "user") {
        await db.update(users).set({ role: input.role }).where(eq(users.id, account.id));
      }
      return { id: result[0].insertId, linked: Boolean(account) } as const;
    }),
    update: roleProcedure("supervisor").input(z.object({
      id: z.number().int().positive(),
      fullName: z.string().trim().min(2).max(180),
      email: z.string().trim().email("البريد الإلكتروني غير صالح").max(320).nullable(),
      phone: z.string().trim().max(60).nullable(),
      role: z.enum(["cashier", "lab", "supervisor"]),
      active: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [existing] = await db.select().from(staffMembers).where(eq(staffMembers.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      if (!canManageStaff(ctx.user.role) || !canAssignStaffRole(ctx.user.role, existing.role) || !canAssignStaffRole(ctx.user.role, input.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل هذا المستخدم" });
      }
      const email = input.email?.trim().toLowerCase() || null;
      if (email) {
        const [duplicate] = await db.select({ id: staffMembers.id }).from(staffMembers).where(eq(staffMembers.email, email)).limit(1);
        if (duplicate && duplicate.id !== input.id) throw new TRPCError({ code: "CONFLICT", message: "يوجد مستخدم آخر بهذا البريد الإلكتروني" });
      }
      const [account] = email
        ? await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1)
        : [];
      await db.update(staffMembers).set({
        fullName: input.fullName,
        email,
        phone: input.phone || null,
        role: input.role,
        active: input.active ? 1 : 0,
        userId: account?.id ?? null,
      }).where(eq(staffMembers.id, input.id));
      if (account && account.role === "user") {
        await db.update(users).set({ role: input.role }).where(eq(users.id, account.id));
      }
      return { success: true } as const;
    }),
  }),

  clinic: router({
    getSettings: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      const [settings] = await db.select().from(clinicSettings).limit(1);
      return settings ?? null;
    }),
    saveSettings: adminProcedure.input(clinicInput).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [existing] = await db.select({ id: clinicSettings.id }).from(clinicSettings).limit(1);
      if (existing) {
        await db.update(clinicSettings).set(input).where(eq(clinicSettings.id, existing.id));
        return { id: existing.id, updated: true };
      }
      const result = await db.insert(clinicSettings).values(input);
      return { id: result[0].insertId, updated: false };
    }),
    listPaymentBanks: roleProcedure("cashier", "admin").query(async () => {
      const db = await getDb();
      if (!db) return [{ id: 0, name: "بنكك", active: 1 }, { id: 0, name: "أوكاش", active: 1 }, { id: 0, name: "فوري", active: 1 }];
      const existing = await db.select({ id: paymentBanks.id }).from(paymentBanks).limit(1);
      if (!existing.length) await db.insert(paymentBanks).values([{ name: "بنكك" }, { name: "أوكاش" }, { name: "فوري" }]).onDuplicateKeyUpdate({ set: { active: 1 } });
      return db.select().from(paymentBanks).where(eq(paymentBanks.active, 1)).orderBy(paymentBanks.id);
    }),
    addPaymentBank: adminProcedure.input(z.object({ name: z.string().trim().min(2).max(120) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      await db.insert(paymentBanks).values({ name: input.name }).onDuplicateKeyUpdate({ set: { active: 1 } });
      return { success: true };
    }),
    removePaymentBank: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      await db.update(paymentBanks).set({ active: 0 }).where(eq(paymentBanks.id, input.id));
      return { success: true };
    }),
  }),

  pricing: router({
    get: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { general: 35000, specialist: 50000 };
      const [settings] = await db.select({
        consultationGeneralPrice: clinicSettings.consultationGeneralPrice,
        consultationSpecialistPrice: clinicSettings.consultationSpecialistPrice,
      }).from(clinicSettings).limit(1);
      return resolveConsultationPrices(settings);
    }),
    updateConsultation: roleProcedure("supervisor").input(z.object({
      generalPrice: z.number().int().min(0).max(100000000),
      specialistPrice: z.number().int().min(0).max(100000000),
    })).mutation(async ({ input, ctx }) => {
      if (!canManagePrices(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل الأسعار" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [settings] = await db.select().from(clinicSettings).limit(1);
      const current = resolveConsultationPrices(settings);
      const next = { general: input.generalPrice, specialist: input.specialistPrice };
      const changes = diffConsultationPrices(current, next);
      if (settings) {
        await db.update(clinicSettings).set({
          consultationGeneralPrice: next.general,
          consultationSpecialistPrice: next.specialist,
        }).where(eq(clinicSettings.id, settings.id));
      } else {
        await db.insert(clinicSettings).values({
          name: "مستوصف بكّا الطبي الحديث",
          consultationGeneralPrice: next.general,
          consultationSpecialistPrice: next.specialist,
        });
      }
      if (changes.length) {
        await db.insert(priceChanges).values(changes.map(change => ({ ...change, changedBy: ctx.user.id })));
      }
      return { ...next, changed: changes.length } as const;
    }),
    history: roleProcedure("supervisor").query(async () => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        id: priceChanges.id,
        entity: priceChanges.entity,
        reference: priceChanges.reference,
        oldPrice: priceChanges.oldPrice,
        newPrice: priceChanges.newPrice,
        changedBy: priceChanges.changedBy,
        createdAt: priceChanges.createdAt,
      }).from(priceChanges).orderBy(desc(priceChanges.createdAt)).limit(40);
      const actorIds = [...new Set(rows.map(row => row.changedBy))];
      const actors = actorIds.length
        ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds))
        : [];
      return rows.map(row => ({ ...row, actorName: actors.find(actor => actor.id === row.changedBy)?.name ?? null }));
    }),
  }),

  patients: router({
    list: roleProcedure("cashier", "lab").input(z.object({ search: z.string().trim().max(100).optional() }).optional()).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const search = input?.search;
      if (ctx.user.role === "lab") {
        return db.select({
          id: patients.id, patientNumber: patients.patientNumber, name: patients.name,
          gender: patients.gender, age: patients.age, createdAt: patients.createdAt,
        }).from(patients).innerJoin(labOrders, eq(labOrders.patientId, patients.id))
          .where(and(inArray(labOrders.status, ["queued", "in_progress"]), search ? like(patients.name, `%${search}%`) : undefined))
          .orderBy(desc(patients.createdAt)).limit(100);
      }
      const invoicePatientRows = await db.select({ patientId: invoices.patientId }).from(invoices).where(eq(invoices.createdBy, ctx.user.id)).limit(500);
      const ownedIds = [...new Set(invoicePatientRows.map(row => row.patientId))];
      const ownership = ownedIds.length ? or(eq(patients.registeredBy, ctx.user.id), inArray(patients.id, ownedIds)) : eq(patients.registeredBy, ctx.user.id);
      return db.select().from(patients).where(and(ownership, search ? like(patients.name, `%${search}%`) : undefined)).orderBy(desc(patients.createdAt)).limit(100);
    }),
    workspace: roleProcedure("cashier", "lab").query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      if (ctx.user.role === "lab") {
        const orderRows = await db.select().from(labOrders)
          .where(inArray(labOrders.status, ["queued", "in_progress"])).orderBy(desc(labOrders.createdAt)).limit(500);
        const patientIds = [...new Set(orderRows.map(order => order.patientId))];
        const patientRows = patientIds.length
          ? await db.select({ id: patients.id, patientNumber: patients.patientNumber, name: patients.name, gender: patients.gender, age: patients.age, createdAt: patients.createdAt })
            .from(patients).where(inArray(patients.id, patientIds))
          : [];
        const testIds = [...new Set(orderRows.map(order => order.labTestId))];
        const testRows = testIds.length ? await db.select().from(labTests).where(inArray(labTests.id, testIds)) : [];
        const resultRows = orderRows.length ? await db.select().from(labResults).where(inArray(labResults.labOrderId, orderRows.map(order => order.id))) : [];
        return { patients: patientRows, invoices: [], invoiceItems: [], labOrders: orderRows, labTests: testRows, labResults: resultRows };
      }
      const invoicePatientRows = await db.select({ patientId: invoices.patientId }).from(invoices).where(eq(invoices.createdBy, ctx.user.id)).limit(500);
      const ownedIds = [...new Set(invoicePatientRows.map(row => row.patientId))];
      const ownership = ownedIds.length ? or(eq(patients.registeredBy, ctx.user.id), inArray(patients.id, ownedIds)) : eq(patients.registeredBy, ctx.user.id);
      const patientRows = await db.select().from(patients).where(ownership).orderBy(desc(patients.createdAt)).limit(100);
      if (patientRows.length === 0) return { patients: [], invoices: [], invoiceItems: [], labOrders: [], labTests: [], labResults: [] };
      const patientIds = patientRows.map(patient => patient.id);
      const invoiceRows = await db.select().from(invoices).where(and(inArray(invoices.patientId, patientIds), eq(invoices.createdBy, ctx.user.id))).orderBy(desc(invoices.createdAt)).limit(500);
      const invoiceIds = invoiceRows.map(invoice => invoice.id);
      const [itemRows, orderRows, testRows] = await Promise.all([
        invoiceIds.length ? db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds)) : Promise.resolve([]),
        db.select().from(labOrders).where(inArray(labOrders.patientId, patientIds)).orderBy(desc(labOrders.createdAt)).limit(500),
        db.select().from(labTests).where(eq(labTests.active, 1)).orderBy(labTests.category, labTests.nameAr),
      ]);
      const resultRows = orderRows.length
        ? await db.select().from(labResults).where(inArray(labResults.labOrderId, orderRows.map(order => order.id)))
        : [];
      return { patients: patientRows, invoices: invoiceRows, invoiceItems: itemRows, labOrders: orderRows, labTests: testRows, labResults: resultRows };
    }),
    register: roleProcedure("cashier").input(visitInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة؛ لم يتم حفظ التسجيل" });
      const codes = uniqueTestCodes(input.testCodes);
      const consultationType = normalizeConsultationType(input.consultationType, "general");
      if (codes.length === 0 && consultationType === "none") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اختر معاينة طبيب أو فحصًا واحدًا على الأقل" });
      }

      return db.transaction(async tx => {
        const shift = await assertCashierCanUseShift(tx, input.shiftDate, input.shiftType, ctx.user.id);

        const tests = codes.length
          ? await tx.select().from(labTests).where(and(inArray(labTests.code, codes), eq(labTests.active, 1)))
          : [];
        if (tests.length !== codes.length) {
          const found = new Set(tests.map(test => test.code));
          const missing = codes.filter(code => !found.has(code));
          throw new TRPCError({ code: "BAD_REQUEST", message: `فحوصات غير موجودة أو غير مفعلة: ${missing.join(", ")}` });
        }

        const [settings] = await tx.select({
          consultationGeneralPrice: clinicSettings.consultationGeneralPrice,
          consultationSpecialistPrice: clinicSettings.consultationSpecialistPrice,
        }).from(clinicSettings).limit(1);
        const consultationFee = consultationFeeFor(consultationType, resolveConsultationPrices(settings));

        const sequence = shift.sequenceCurrent + 1;
        const patientNumber = toPatientNumber(input.shiftDate, input.shiftType, sequence);
        await tx.update(shifts).set({ sequenceCurrent: sequence }).where(eq(shifts.id, shift.id));
        const patientResult = await tx.insert(patients).values({
          patientNumber,
          name: input.name,
          gender: input.gender,
          age: input.age,
          phone: input.phone,
          address: input.address,
          registeredBy: ctx.user.id,
          registeredShiftId: shift.id,
          shiftDate: input.shiftDate,
        });
        const patientId = patientResult[0].insertId;
        const invoiceNumber = toInvoiceNumber(patientNumber);
        const consultationLine = consultationType === "none"
          ? []
          : [{ invoiceId: 0, labTestId: null, description: CONSULTATION_LABELS[consultationType], quantity: 1, unitPrice: consultationFee }];
        const testLines = tests.map(test => ({
          invoiceId: 0,
          labTestId: test.id,
          description: describeLabTest(test.code, test.nameAr),
          quantity: 1,
          unitPrice: test.price,
        }));
        const total = sumInvoiceItems([...consultationLine, ...testLines]);
        const invoiceResult = await tx.insert(invoices).values({
          invoiceNumber,
          patientId,
          shiftId: shift.id,
          shiftDate: input.shiftDate,
          total,
          consultationType,
          consultationFee,
          createdBy: ctx.user.id,
        });
        const invoiceId = invoiceResult[0].insertId;
        await tx.insert(invoiceItems).values([...consultationLine, ...testLines].map(line => ({ ...line, invoiceId })));
        if (tests.length) {
          await tx.insert(labOrders).values(tests.map(test => ({
            orderNumber: `ORD-${patientNumber.replaceAll("-", "")}-${test.id}-${String(sequence).padStart(2, "0")}`,
            patientId,
            invoiceId,
            labTestId: test.id,
            status: "blocked" as const,
          })));
        }
        await writeAudit(tx, {
          actorId: ctx.user.id,
          action: "create",
          entity: "patient_visit",
          entityId: patientId,
          shiftId: shift.id,
          after: { patientId, invoiceId, patientNumber, shiftId: shift.id },
        });
        return {
          id: patientId,
          patientNumber,
          sequence,
          shiftId: shift.id,
          invoiceId,
          invoiceNumber,
          total,
          consultationType,
          consultationFee,
          testCodes: codes,
        };
      });
    }),
    addTests: roleProcedure("cashier").input(followUpInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة؛ لم يتم حفظ الفحوصات" });
      const codes = uniqueTestCodes(input.testCodes);
      const consultationType = normalizeConsultationType(input.consultationType, "none");
      if (codes.length === 0 && consultationType === "none") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اختر فحصًا واحدًا على الأقل" });
      }

      return db.transaction(async tx => {
        const [patient] = await tx.select().from(patients).where(eq(patients.patientNumber, input.patientNumber)).limit(1).for("update");
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "ملف المريض غير موجود" });
        const shift = await assertCashierCanUseShift(tx, input.shiftDate, input.shiftType, ctx.user.id);
        const tests = codes.length
          ? await tx.select().from(labTests).where(and(inArray(labTests.code, codes), eq(labTests.active, 1)))
          : [];
        if (tests.length !== codes.length) {
          const found = new Set(tests.map(test => test.code));
          throw new TRPCError({ code: "BAD_REQUEST", message: `فحوصات غير موجودة أو غير مفعلة: ${codes.filter(code => !found.has(code)).join(", ")}` });
        }
        const [settings] = await tx.select({
          consultationGeneralPrice: clinicSettings.consultationGeneralPrice,
          consultationSpecialistPrice: clinicSettings.consultationSpecialistPrice,
        }).from(clinicSettings).limit(1);
        const consultationFee = consultationFeeFor(consultationType, resolveConsultationPrices(settings));
        const [countRow] = await tx.select({ count: sql<number>`count(*)` }).from(invoices).where(eq(invoices.patientId, patient.id));
        const invoiceNumber = toInvoiceNumber(patient.patientNumber, Number(countRow?.count ?? 0) + 1);
        const lines = [
          ...(consultationType === "none" ? [] : [{ invoiceId: 0, labTestId: null, description: CONSULTATION_LABELS[consultationType], quantity: 1, unitPrice: consultationFee }]),
          ...tests.map(test => ({ invoiceId: 0, labTestId: test.id, description: describeLabTest(test.code, test.nameAr), quantity: 1, unitPrice: test.price })),
        ];
        const total = sumInvoiceItems(lines);
        const invoiceResult = await tx.insert(invoices).values({
          invoiceNumber,
          patientId: patient.id,
          shiftId: shift.id,
          shiftDate: input.shiftDate,
          total,
          consultationType,
          consultationFee,
          createdBy: ctx.user.id,
        });
        const invoiceId = invoiceResult[0].insertId;
        await tx.insert(invoiceItems).values(lines.map(line => ({ ...line, invoiceId })));
        if (tests.length) {
          await tx.insert(labOrders).values(tests.map(test => ({
            orderNumber: `ORD-${patient.patientNumber.replaceAll("-", "")}-${test.id}-${invoiceId}`,
            patientId: patient.id,
            invoiceId,
            labTestId: test.id,
            status: "blocked" as const,
          })));
        }
        return { patientId: patient.id, patientNumber: patient.patientNumber, invoiceId, invoiceNumber, total, consultationType, consultationFee, testCodes: codes };
      });
    }),
  }),

  shifts: router({
    assignments: adminProcedure.input(z.object({ shiftDate: clinicDate })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [shiftRows, staffRows] = await Promise.all([
        db.select().from(shifts).where(eq(shifts.shiftDate, input.shiftDate)).orderBy(shifts.id),
        db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
          .from(users)
          .where(inArray(users.role, ["cashier", "lab"])),
      ]);
      return { shifts: shiftRows, staff: staffRows };
    }),
    assignUsers: adminProcedure.input(z.object({
      shiftDate: clinicDate,
      shiftType: shiftTypeInput,
      cashierUserId: z.number().int().positive().nullable(),
      labUserId: z.number().int().positive().nullable(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const requestedIds = [input.cashierUserId, input.labUserId].filter((id): id is number => id !== null);
      const selectedUsers = requestedIds.length
        ? await db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, requestedIds))
        : [];
      if (selectedUsers.length !== requestedIds.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "أحد الحسابات المختارة غير موجود" });
      }
      const cashier = input.cashierUserId === null ? undefined : selectedUsers.find(user => user.id === input.cashierUserId);
      const lab = input.labUserId === null ? undefined : selectedUsers.find(user => user.id === input.labUserId);
      if (cashier && cashier.role !== "cashier") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار حساب كاشير لوردية الاستقبال" });
      }
      if (lab && lab.role !== "lab") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار حساب مختبر لوردية المعمل" });
      }
      await db.insert(shifts).values({
        shiftDate: input.shiftDate,
        shiftType: input.shiftType,
        cashierUserId: input.cashierUserId,
        labUserId: input.labUserId,
      }).onDuplicateKeyUpdate({ set: {
        cashierUserId: input.cashierUserId,
        labUserId: input.labUserId,
      } });
      const [shift] = await db.select().from(shifts)
        .where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType)))
        .limit(1);
      return shift;
    }),
    assignStaff: adminProcedure.input(z.object({
      shiftDate: clinicDate,
      shiftType: shiftTypeInput,
      userIds: z.array(z.number().int().positive()).max(100),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const [shift] = await tx.select().from(shifts).where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType))).limit(1).for("update");
        if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "الوردية غير موجودة" });
        if (shift.status === "closed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن تعديل وردية مغلقة" });
        const uniqueIds = [...new Set(input.userIds)];
        if (uniqueIds.length) {
          const staff = await tx.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, uniqueIds));
          if (staff.length !== uniqueIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "أحد المستخدمين غير موجود" });
        }
        await tx.delete(userShiftAssignments).where(eq(userShiftAssignments.shiftId, shift.id));
        if (uniqueIds.length) await tx.insert(userShiftAssignments).values(uniqueIds.map(userId => ({ shiftId: shift.id, userId, assignedBy: ctx.user.id })));
        return { shiftId: shift.id, userIds: uniqueIds };
      });
    }),
    myAssignments: protectedProcedure.input(z.object({ shiftDate: clinicDate })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ shift: shifts, assignment: userShiftAssignments })
        .from(userShiftAssignments)
        .innerJoin(shifts, eq(userShiftAssignments.shiftId, shifts.id))
        .where(and(eq(userShiftAssignments.userId, ctx.user.id), eq(shifts.shiftDate, input.shiftDate)));
    }),
    close: roleProcedure("supervisor").input(z.object({
      shiftDate: clinicDate,
      shiftType: shiftTypeInput,
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const [shift] = await tx.select().from(shifts)
          .where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType)))
          .limit(1).for("update");
        if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "الوردية غير موجودة" });
        if (shift.status === "closed") return shift;
        await tx.update(shifts).set({ status: "closed", closedAt: new Date() }).where(eq(shifts.id, shift.id));
        const [closed] = await tx.select().from(shifts).where(eq(shifts.id, shift.id)).limit(1);
        return closed;
      });
    }),
    current: protectedProcedure.input(z.object({ shiftDate: clinicDate, shiftType: shiftTypeInput })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [shift] = await db.select().from(shifts).where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType))).orderBy(desc(shifts.id)).limit(1);
      return shift ?? null;
    }),
    open: roleProcedure("cashier").input(z.object({ shiftDate: clinicDate, shiftType: shiftTypeInput })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const [existing] = await tx.select({ id: shifts.id, status: shifts.status, sequenceCurrent: shifts.sequenceCurrent, cashierUserId: shifts.cashierUserId })
          .from(shifts).where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType))).limit(1).for("update");
        if (existing) {
          await assertCashierShiftAccess(tx, existing.id, ctx.user.id);
          if (existing.status === "closed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "الوردية مغلقة" });
          return existing;
        }
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا توجد وردية مسندة؛ اطلب من المدير تعيينك قبل الفتح" });
      });
    }),
  }),

  billing: router({
    recent: roleProcedure("cashier").query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(invoices)
        .where(or(eq(invoices.createdBy, ctx.user.id), eq(invoices.collectedBy, ctx.user.id)))
        .orderBy(desc(invoices.createdAt)).limit(100);
    }),
    detail: roleProcedure("cashier").input(z.object({ invoiceId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });
      await assertCashierShiftAccess(db, invoice.shiftId ?? 0, ctx.user.id);
      const [patient] = await db.select().from(patients).where(eq(patients.id, invoice.patientId)).limit(1);
      const [items, orders] = await Promise.all([
        db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id)),
        db.select().from(labOrders).where(eq(labOrders.invoiceId, invoice.id)),
      ]);
      const testIds = [...new Set([...items.map(item => item.labTestId), ...orders.map(order => order.labTestId)].filter((id): id is number => id != null))];
      const tests = testIds.length ? await db.select().from(labTests).where(inArray(labTests.id, testIds)) : [];
      return { invoice, patient: patient ?? null, items, orders, tests };
    }),
    markPaid: roleProcedure("cashier").input(z.object({ invoiceId: z.number().int().positive(), paymentMethod: z.enum(["cash", "bank"]), paymentBank: z.string().trim().min(1).max(120).optional(), transactionNumber: z.string().trim().min(1).max(64).optional() }).superRefine((value, ctx) => {
      if (value.paymentMethod === "bank" && !value.paymentBank) ctx.addIssue({ code: "custom", message: "اختر البنك" });
      if (value.paymentMethod === "bank" && !value.transactionNumber) ctx.addIssue({ code: "custom", message: "رقم العملية يجب أن يتراوح بين 1 و64 محرفًا" });
      if (value.paymentMethod === "cash" && (value.paymentBank || value.transactionNumber)) ctx.addIssue({ code: "custom", message: "بيانات البنك غير مطلوبة للدفع النقدي" });
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const [invoice] = await tx.select({ id: invoices.id, status: invoices.status, shiftId: invoices.shiftId }).from(invoices)
          .where(eq(invoices.id, input.invoiceId)).limit(1).for("update");
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });
        const shift = await assertCashierShiftAccess(tx, invoice.shiftId ?? 0, ctx.user.id, true);
        if (invoice.status === "cancelled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن تحصيل فاتورة ملغاة" });
        if (invoice.status === "refunded") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن تحصيل فاتورة مسترجعة" });
        if (invoice.status === "paid") return { success: true, alreadyPaid: true } as const;
        if (input.paymentMethod === "bank") {
          const [bank] = await tx.select({ id: paymentBanks.id }).from(paymentBanks).where(and(eq(paymentBanks.name, input.paymentBank!), eq(paymentBanks.active, 1))).limit(1);
          if (!bank) throw new TRPCError({ code: "BAD_REQUEST", message: "البنك المحدد غير متاح" });
        }
        const paidAt = new Date();
        await tx.update(invoices).set({ status: "paid", paymentMethod: input.paymentMethod, paymentBank: input.paymentBank ?? null, transactionNumber: input.transactionNumber ?? null, paidAt, collectedAt: paidAt, collectedBy: ctx.user.id, collectedShiftId: shift.id }).where(eq(invoices.id, input.invoiceId));
        await tx.update(labOrders).set({ status: "queued" })
          .where(and(eq(labOrders.invoiceId, input.invoiceId), eq(labOrders.status, "blocked")));
        await writeAudit(tx, { actorId: ctx.user.id, action: "collect", entity: "invoice", entityId: invoice.id, shiftId: shift.id, after: { status: "paid", paymentMethod: input.paymentMethod } });
        return { success: true, alreadyPaid: false } as const;
      });
    }),
    cancel: roleProcedure("cashier").input(invoiceActionInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1).for("update");
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });
        const shift = await assertCashierShiftAccess(tx, invoice.shiftId ?? 0, ctx.user.id, true);
        if (invoice.status === "cancelled" || invoice.status === "refunded") return invoice;
        await tx.update(invoices).set({ status: "cancelled" }).where(eq(invoices.id, invoice.id));
        await tx.update(labOrders).set({ status: "blocked" }).where(eq(labOrders.invoiceId, invoice.id));
        await tx.insert(invoiceAdjustments).values({ invoiceId: invoice.id, type: "cancel", amountBefore: invoice.total, amountAfter: 0, delta: -invoice.total, reason: input.reason, createdBy: ctx.user.id });
        await writeAudit(tx, { actorId: ctx.user.id, action: "cancel", entity: "invoice", entityId: invoice.id, shiftId: shift.id, reason: input.reason, before: { status: invoice.status }, after: { status: "cancelled" } });
        const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
        return updated;
      });
    }),
    refund: roleProcedure("cashier").input(invoiceActionInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1).for("update");
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });
        const shift = await assertCashierShiftAccess(tx, invoice.shiftId ?? 0, ctx.user.id, true);
        if (invoice.status !== "paid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن استرجاع فاتورة غير محصلة" });
        await tx.update(invoices).set({ status: "refunded", refundedAt: new Date(), refundedBy: ctx.user.id, refundReason: input.reason }).where(eq(invoices.id, invoice.id));
        await tx.update(labOrders).set({ status: "blocked" }).where(eq(labOrders.invoiceId, invoice.id));
        await tx.insert(invoiceAdjustments).values({ invoiceId: invoice.id, type: "refund", amountBefore: invoice.total, amountAfter: 0, delta: -invoice.total, reason: input.reason, createdBy: ctx.user.id });
        await writeAudit(tx, { actorId: ctx.user.id, action: "refund", entity: "invoice", entityId: invoice.id, shiftId: shift.id, reason: input.reason, before: { status: invoice.status }, after: { status: "refunded" } });
        const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
        return updated;
      });
    }),
    updateInvoice: roleProcedure("cashier").input(invoiceEditInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1).for("update");
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });
        await assertCashierShiftAccess(tx, invoice.shiftId ?? 0, ctx.user.id, true);
        if (invoice.status === "cancelled" || invoice.status === "refunded") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن تعديل هذه الفاتورة" });
        }
        return applyInvoiceEdit(tx, invoice, input, ctx.user.id);
      });
    }),
  }),

  laboratory: router({
    listDrafts: roleProcedure("lab").input(z.object({ labOrderIds: z.array(z.number().int().positive()).max(50) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      if (!input.labOrderIds.length) return [];
      return db.select({ labOrderId: labResultDrafts.labOrderId, valuesJson: labResultDrafts.valuesJson })
        .from(labResultDrafts).innerJoin(labOrders, eq(labOrders.id, labResultDrafts.labOrderId))
        .innerJoin(invoices, eq(invoices.id, labOrders.invoiceId))
        .where(and(inArray(labResultDrafts.labOrderId, input.labOrderIds), eq(invoices.status, "paid"))).limit(50);
    }),
    saveDraft: roleProcedure("lab").input(resultInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      await assertLabOrderAccess(db, input.labOrderId, ctx.user.id, "in_progress");
      const [order] = await db.select({ id: labOrders.id, status: labOrders.status, invoiceStatus: invoices.status })
        .from(labOrders).innerJoin(invoices, eq(invoices.id, labOrders.invoiceId))
        .where(eq(labOrders.id, input.labOrderId)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المختبر غير موجود" });
      if (order.invoiceStatus !== "paid" || order.status === "blocked") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن حفظ مسودة قبل اكتمال الدفع" });
      if (order.status === "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "النتيجة معتمدة بالفعل" });
      await db.insert(labResultDrafts).values({ labOrderId: input.labOrderId, technicianUserId: ctx.user.id, valuesJson: JSON.stringify(input.values) })
        .onDuplicateKeyUpdate({ set: { technicianUserId: ctx.user.id, valuesJson: JSON.stringify(input.values) } });
      return { success: true } as const;
    }),
    pending: roleProcedure("lab").query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(labOrders).where(eq(labOrders.status, "queued")).orderBy(desc(labOrders.createdAt)).limit(100);
    }),
    collectSample: roleProcedure("lab").input(z.object({ labOrderId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [order] = await db.select().from(labOrders).where(eq(labOrders.id, input.labOrderId)).limit(1);
      await assertLabOrderAccess(db, input.labOrderId, ctx.user.id, "queued");
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المختبر غير موجود" });
      const [invoice] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, order.invoiceId)).limit(1);
      if (!invoice || invoice.status !== "paid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن سحب العينة قبل اكتمال الدفع" });
      if (order.status === "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "صدرت نتيجة هذا الفحص بالفعل" });
      await db.update(labOrders).set({ status: "in_progress", collectedAt: order.collectedAt ?? new Date() }).where(eq(labOrders.id, order.id));
      return { success: true } as const;
    }),
    saveResult: roleProcedure("lab").input(resultInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      await assertLabOrderAccess(db, input.labOrderId, ctx.user.id, "in_progress");
      const [order] = await db.select().from(labOrders).where(eq(labOrders.id, input.labOrderId)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "طلب المختبر غير موجود" });
      const [invoice] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, order.invoiceId)).limit(1);
      if (!invoice || invoice.status !== "paid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن إصدار النتيجة قبل اكتمال الدفع" });
      const [existing] = await db.select({ id: labResults.id }).from(labResults).where(eq(labResults.labOrderId, input.labOrderId)).limit(1);
      const valuesJson = JSON.stringify(input.values);
      if (existing) {
        await db.update(labResults).set({ valuesJson, remarks: input.remarks, technicianUserId: ctx.user.id }).where(eq(labResults.id, existing.id));
      } else {
        await db.insert(labResults).values({ labOrderId: input.labOrderId, valuesJson, remarks: input.remarks, technicianUserId: ctx.user.id });
      }
      await db.delete(labResultDrafts).where(eq(labResultDrafts.labOrderId, input.labOrderId));
      await db.update(labOrders).set({ status: "completed", resultIssuedAt: new Date(), collectedAt: order.collectedAt ?? new Date() }).where(eq(labOrders.id, input.labOrderId));
      return { success: true } as const;
    }),
    saveResults: roleProcedure("lab").input(z.object({ results: z.array(resultInput).min(1).max(50) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      if (new Set(input.results.map(result => result.labOrderId)).size !== input.results.length) throw new TRPCError({ code: "BAD_REQUEST", message: "توجد طلبات مكررة في الحفظ" });
      await db.transaction(async tx => {
        for (const result of input.results) {
          await assertLabOrderAccess(tx, result.labOrderId, ctx.user.id, "in_progress");
          const [order] = await tx.select().from(labOrders).where(eq(labOrders.id, result.labOrderId)).limit(1);
          if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "أحد طلبات المختبر غير موجود" });
          const [invoice] = await tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, order.invoiceId)).limit(1);
          if (!invoice || invoice.status !== "paid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن إصدار النتائج قبل اكتمال الدفع" });
          const [existing] = await tx.select({ id: labResults.id }).from(labResults).where(eq(labResults.labOrderId, result.labOrderId)).limit(1);
          const fields = { valuesJson: JSON.stringify(result.values), remarks: result.remarks, technicianUserId: ctx.user.id };
          if (existing) await tx.update(labResults).set(fields).where(eq(labResults.id, existing.id));
          else await tx.insert(labResults).values({ labOrderId: result.labOrderId, ...fields });
          await tx.delete(labResultDrafts).where(eq(labResultDrafts.labOrderId, result.labOrderId));
          await tx.update(labOrders).set({ status: "completed", resultIssuedAt: new Date(), collectedAt: order.collectedAt ?? new Date() }).where(eq(labOrders.id, result.labOrderId));
        }
      });
      return { success: true, savedCount: input.results.length } as const;
    }),
  }),

  teamCommunication: router({
    messages: roleProcedure("cashier", "lab").query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const rows = await db.select({ id: staffMessages.id, body: staffMessages.body, createdAt: staffMessages.createdAt, senderUserId: users.id, senderName: users.name, senderRole: users.role })
        .from(staffMessages).innerJoin(users, eq(users.id, staffMessages.senderUserId)).orderBy(desc(staffMessages.createdAt)).limit(100);
      return rows.reverse();
    }),
    sendMessage: roleProcedure("cashier", "lab").input(z.object({ body: z.string().trim().min(1).max(1000) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      await db.insert(staffMessages).values({ senderUserId: ctx.user.id, body: input.body });
      return { success: true } as const;
    }),
    cashierAlerts: roleProcedure("cashier").query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.select({ id: cashierAttention.id, invoiceId: invoices.id, invoiceNumber: invoices.invoiceNumber, patientNumber: patients.patientNumber, patientName: patients.name, note: cashierAttention.note, flaggedAt: cashierAttention.flaggedAt, flaggedByName: users.name })
        .from(cashierAttention).innerJoin(invoices, eq(invoices.id, cashierAttention.invoiceId))
        .innerJoin(patients, eq(patients.id, invoices.patientId)).leftJoin(users, eq(users.id, cashierAttention.flaggedBy))
        .where(and(eq(invoices.status, "pending"), isNull(cashierAttention.resolvedAt))).orderBy(desc(cashierAttention.flaggedAt)).limit(100);
    }),
    flagCashier: roleProcedure("lab").input(z.object({ invoiceId: z.number().int().positive(), note: z.string().trim().max(500).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [invoice] = await db.select({ id: invoices.id, status: invoices.status }).from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });
      if (invoice.status !== "pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "التنبيه متاح للفواتير التي تنتظر الدفع فقط" });
      await db.insert(cashierAttention).values({ invoiceId: input.invoiceId, flaggedBy: ctx.user.id, note: input.note || null })
        .onDuplicateKeyUpdate({ set: { flaggedBy: ctx.user.id, flaggedAt: new Date(), note: input.note || null, resolvedBy: null, resolvedAt: null } });
      return { success: true } as const;
    }),
    resolveCashierAlert: roleProcedure("cashier").input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      await db.update(cashierAttention).set({ resolvedBy: ctx.user.id, resolvedAt: new Date() }).where(and(eq(cashierAttention.id, input.id), isNull(cashierAttention.resolvedAt)));
      return { success: true } as const;
    }),
  }),

  reports: router({
    summary: roleProcedure("supervisor").input(z.object({
      period: z.enum(["daily", "weekly", "monthly"]),
      date: clinicDate,
    })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const window = getReportWindow(input.period, input.date);
      const [issuedRows, collectedRows] = await Promise.all([
        db.select({
          invoiceNumber: invoices.invoiceNumber,
          patientNumber: patients.patientNumber,
          createdAt: invoices.createdAt,
          paidAt: invoices.paidAt,
          total: invoices.total,
          status: invoices.status,
          paymentMethod: invoices.paymentMethod,
          paymentBank: invoices.paymentBank,
          transactionNumber: invoices.transactionNumber,
          employeeName: users.name,
          consultationType: invoices.consultationType,
          consultationFee: invoices.consultationFee,
        }).from(invoices).innerJoin(patients, eq(invoices.patientId, patients.id)).leftJoin(users, eq(invoices.createdBy, users.id))
          .where(and(gte(invoices.createdAt, window.start), lt(invoices.createdAt, window.end)))
          .orderBy(desc(invoices.createdAt)),
        db.select({
          invoiceNumber: invoices.invoiceNumber,
          patientNumber: patients.patientNumber,
          createdAt: invoices.createdAt,
          paidAt: invoices.paidAt,
          refundedAt: invoices.refundedAt,
          total: invoices.total,
          status: invoices.status,
          paymentMethod: invoices.paymentMethod,
          paymentBank: invoices.paymentBank,
          transactionNumber: invoices.transactionNumber,
          employeeName: users.name,
          consultationType: invoices.consultationType,
          consultationFee: invoices.consultationFee,
        }).from(invoices).innerJoin(patients, eq(invoices.patientId, patients.id)).leftJoin(users, eq(invoices.createdBy, users.id))
          .where(or(
            and(eq(invoices.status, "paid"), gte(invoices.paidAt, window.start), lt(invoices.paidAt, window.end)),
            and(eq(invoices.status, "refunded"), gte(invoices.refundedAt, window.start), lt(invoices.refundedAt, window.end)),
          ))
          .orderBy(desc(invoices.paidAt)),
      ]);
      return buildOperationalReport(window, issuedRows, collectedRows, {
        reportGeneratedByName: ctx.user.name,
      });
    }),
    shift: roleProcedure("cashier", "supervisor").input(z.object({
      shiftDate: clinicDate,
      shiftType: shiftTypeInput,
    })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const window = getShiftWindow(input.shiftDate, input.shiftType);
      const [shift] = await db.select().from(shifts)
        .where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType)))
        .limit(1);
      if (!shift) {
        return {
          shift: null,
          report: buildOperationalReport(window, [], [], { reportGeneratedByName: ctx.user.name }),
        };
      }
      if (ctx.user.role === "cashier") {
        const [assigned] = await db.select({ id: userShiftAssignments.id }).from(userShiftAssignments)
          .where(and(eq(userShiftAssignments.shiftId, shift.id), eq(userShiftAssignments.userId, ctx.user.id))).limit(1);
        if (!assigned && shift.cashierUserId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك مشاهدة تقرير وردية غير مسندة إليك" });
        }
      }
      const rows = await db.select({
        invoiceNumber: invoices.invoiceNumber,
        patientNumber: patients.patientNumber,
        createdAt: invoices.createdAt,
        paidAt: invoices.paidAt,
        refundedAt: invoices.refundedAt,
        total: invoices.total,
        status: invoices.status,
        paymentMethod: invoices.paymentMethod,
        paymentBank: invoices.paymentBank,
        transactionNumber: invoices.transactionNumber,
        employeeName: users.name,
        consultationType: invoices.consultationType,
        consultationFee: invoices.consultationFee,
      }).from(invoices).innerJoin(patients, eq(invoices.patientId, patients.id)).leftJoin(users, eq(invoices.createdBy, users.id))
        .where(eq(invoices.shiftId, shift.id))
        .orderBy(desc(invoices.createdAt));
      const staffIds = [shift.cashierUserId, shift.labUserId].filter((id): id is number => id != null);
      const staffRows = staffIds.length
        ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, staffIds))
        : [];
      const staffById = new Map(staffRows.map(row => [row.id, row.name]));
      return {
        shift,
        report: buildOperationalReport(window, rows, rows, {
          shiftOwnerName: shift.cashierUserId ? staffById.get(shift.cashierUserId) : null,
          shiftLabName: shift.labUserId ? staffById.get(shift.labUserId) : null,
          reportGeneratedByName: ctx.user.name,
        }),
      };
    }),
  }),

  catalog: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(labTests).where(eq(labTests.active, 1)).orderBy(labTests.category, labTests.nameAr);
    }),
    save: adminProcedure.input(labTestInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [existing] = await db.select({ id: labTests.id, price: labTests.price }).from(labTests).where(eq(labTests.code, input.code)).limit(1);
      if (existing) {
        await db.update(labTests).set(input).where(eq(labTests.id, existing.id));
        if (existing.price !== input.price) {
          await db.insert(priceChanges).values({ entity: "lab_test", reference: input.code, oldPrice: existing.price, newPrice: input.price, changedBy: ctx.user.id });
        }
        return { id: existing.id, created: false } as const;
      }
      const result = await db.insert(labTests).values(input);
      return { id: result[0].insertId, created: true } as const;
    }),
    updatePrices: roleProcedure("supervisor").input(z.object({
      items: z.array(z.object({
        code: z.string().trim().min(1).max(32),
        price: z.number().int().min(0).max(100000000),
      })).min(1).max(200),
    })).mutation(async ({ input, ctx }) => {
      if (!canManagePrices(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل الأسعار" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const codes = [...new Set(input.items.map(item => item.code))];
        const rows = await tx.select({ id: labTests.id, code: labTests.code, price: labTests.price })
          .from(labTests).where(inArray(labTests.code, codes));
        if (rows.length !== codes.length) {
          const found = new Set(rows.map(row => row.code));
          throw new TRPCError({ code: "BAD_REQUEST", message: `فحوصات غير موجودة: ${codes.filter(code => !found.has(code)).join(", ")}` });
        }
        const current = new Map(rows.map(row => [row.code, row.price] as const));
        const normalized = input.items.map(item => ({ code: item.code, price: normalizePrice(item.price) ?? 0 }));
        const changes = diffCatalogPrices(current, normalized);
        for (const change of changes) {
          await tx.update(labTests).set({ price: change.newPrice }).where(eq(labTests.code, change.reference));
        }
        if (changes.length) {
          await tx.insert(priceChanges).values(changes.map(change => ({ ...change, changedBy: ctx.user.id })));
        }
        return { updated: changes.length, unchanged: codes.length - changes.length } as const;
      });
    }),
  }),

  cbcBridge: router({
    /** Device network settings and whether a one-time token exists; admin only. */
    settings: adminProcedure.query(async () => getCbcBridgeSettings()),
    status: roleProcedure("lab").query(async () => getCbcBridgeStatus()),
    update: adminProcedure.input(z.object({
      enabled: z.boolean(),
      mode: z.enum(["local", "hosted"]),
      deviceIp: z.string().trim().min(1).max(45).refine(value => isIP(value) !== 0, "عنوان الجهاز يجب أن يكون IP صالحًا"),
      computerIp: z.string().trim().min(1).max(45).refine(value => isIP(value) !== 0, "عنوان الحاسوب يجب أن يكون IP صالحًا"),
      listenPort: z.number().int().min(1024).max(65535),
      protocol: z.enum(["mllp", "raw-idle"]),
      transSelect: z.string().trim().min(1).max(32),
      autoTrans: z.boolean(),
      subnet: z.string().trim().min(7).max(45).refine(value => isIP(value) === 4, "قناع الشبكة يجب أن يكون IPv4 صالحًا"),
    })).mutation(async ({ input }) => updateCbcBridgeSettings(input)),
    rotateToken: adminProcedure.mutation(async () => rotateCbcBridgeToken()),
  }),
});

/**
 * Applies an invoice edit by diffing the requested tests against the stored
 * lines. Existing lines (and their historical prices) are preserved, so adding
 * a test never drops the tests that were already on the invoice.
 */
async function applyInvoiceEdit(
  tx: any,
  invoice: typeof invoices.$inferSelect,
  input: { testCodes: string[]; consultationType: ConsultationType; reason: string },
  userId: number,
): Promise<InvoiceEditResult> {
  const codes = uniqueTestCodes(input.testCodes);
  const tests = codes.length
    ? await tx.select().from(labTests).where(and(inArray(labTests.code, codes), eq(labTests.active, 1)))
    : [];
  if (tests.length !== codes.length) {
    const found = new Set(tests.map((test: typeof labTests.$inferSelect) => test.code));
    throw new TRPCError({ code: "BAD_REQUEST", message: `فحوصات غير موجودة أو غير مفعلة: ${codes.filter(code => !found.has(code)).join(", ")}` });
  }
  const [items, orders, settingsRows] = await Promise.all([
    tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id)),
    tx.select().from(labOrders).where(eq(labOrders.invoiceId, invoice.id)),
    tx.select({
      consultationGeneralPrice: clinicSettings.consultationGeneralPrice,
      consultationSpecialistPrice: clinicSettings.consultationSpecialistPrice,
    }).from(clinicSettings).limit(1),
  ]);
  const nextTestIds = new Set<number>(tests.map((test: typeof labTests.$inferSelect) => test.id));
  const currentTestIds = new Set<number>(items.filter((item: typeof invoiceItems.$inferSelect) => item.labTestId != null).map((item: typeof invoiceItems.$inferSelect) => item.labTestId as number));
  const removedIds = [...currentTestIds].filter(id => !nextTestIds.has(id));
  const addedTests = tests.filter((test: typeof labTests.$inferSelect) => !currentTestIds.has(test.id));
  const completedIds = new Set<number>(orders.filter((order: typeof labOrders.$inferSelect) => order.status === "completed").map((order: typeof labOrders.$inferSelect) => order.labTestId));
  if (removedIds.some(id => completedIds.has(id))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن حذف فحص صدرت نتيجته" });
  }

  const legacyConsultation = items.find((item: typeof invoiceItems.$inferSelect) => item.labTestId == null && isConsultationDescription(item.description));
  const currentConsultation: ConsultationType = isConsultationType(invoice.consultationType) && invoice.consultationType !== "none"
    ? invoice.consultationType
    : legacyConsultation ? consultationTypeFromDescription(legacyConsultation.description) : "none";
  const currentFee = invoice.consultationFee > 0 ? invoice.consultationFee : legacyConsultation?.unitPrice ?? 0;
  const prices = resolveConsultationPrices(settingsRows[0]);
  const nextFee = input.consultationType === "none"
    ? 0
    : input.consultationType === currentConsultation && currentFee > 0
      ? currentFee
      : consultationFeeFor(input.consultationType, prices);

  const nextLines: Array<{ labTestId: number | null; description: string; quantity: number; unitPrice: number }> = [];
  if (input.consultationType !== "none") {
    nextLines.push({ labTestId: null, description: CONSULTATION_LABELS[input.consultationType], quantity: 1, unitPrice: nextFee });
  }
  for (const item of items as Array<typeof invoiceItems.$inferSelect>) {
    if (item.labTestId != null) {
      if (nextTestIds.has(item.labTestId)) {
        nextLines.push({ labTestId: item.labTestId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice });
      }
    } else if (!isConsultationDescription(item.description)) {
      // Preserve any other manual service line instead of silently deleting it.
      nextLines.push({ labTestId: null, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice });
    }
  }
  for (const test of addedTests as Array<typeof labTests.$inferSelect>) {
    nextLines.push({ labTestId: test.id, description: describeLabTest(test.code, test.nameAr), quantity: 1, unitPrice: test.price });
  }

  const total = invoiceTotal(nextLines);
  const totalChanged = total !== invoice.total;
  const nextStatus = invoice.status === "paid" && totalChanged ? "pending" as const : invoice.status;

  await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
  if (nextLines.length) {
    await tx.insert(invoiceItems).values(nextLines.map(line => ({ ...line, invoiceId: invoice.id })));
  }
  for (const removedId of removedIds) {
    await tx.delete(labOrders).where(and(eq(labOrders.invoiceId, invoice.id), eq(labOrders.labTestId, removedId)));
  }
  if (addedTests.length) {
    await tx.insert(labOrders).values(addedTests.map((test: typeof labTests.$inferSelect) => ({
      orderNumber: `ORD-${invoice.invoiceNumber.replaceAll("-", "")}-${test.id}-${Date.now()}`,
      patientId: invoice.patientId,
      invoiceId: invoice.id,
      labTestId: test.id,
      status: nextStatus === "paid" ? "queued" as const : "blocked" as const,
    })));
  }
  if (nextStatus === "pending") {
    await tx.update(labOrders).set({ status: "blocked" }).where(eq(labOrders.invoiceId, invoice.id));
  }
  await tx.update(invoices).set({
    total,
    status: nextStatus,
    consultationType: input.consultationType,
    consultationFee: nextFee,
  }).where(eq(invoices.id, invoice.id));

  const adjustmentType = removedIds.length > 0 && addedTests.length === 0
    ? "remove_test" as const
    : addedTests.length > 0 && removedIds.length === 0
      ? "add_test" as const
      : "edit" as const;
  await tx.insert(invoiceAdjustments).values({
    invoiceId: invoice.id,
    type: adjustmentType,
    amountBefore: invoice.total,
    amountAfter: total,
    delta: total - invoice.total,
    reason: input.reason,
    metadataJson: JSON.stringify({
      addedTests: addedTests.map((test: typeof labTests.$inferSelect) => test.code),
      removedTestIds: removedIds,
      consultationFrom: currentConsultation,
      consultationTo: input.consultationType,
      consultationFee: nextFee,
    }),
    createdBy: userId,
  });
  const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
  return {
    invoice: updated,
    added: addedTests.map((test: typeof labTests.$inferSelect) => test.code),
    removed: removedIds.map(String),
    consultationType: input.consultationType,
    requiresRecollection: nextStatus === "pending",
    delta: total - invoice.total,
  };
}

export type AppRouter = typeof appRouter;
