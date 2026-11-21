import { COOKIE_NAME } from "@shared/const";
import { and, desc, eq, gte, inArray, like, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  clinicSettings,
  invoiceAdjustments,
  invoiceItems,
  invoices,
  labOrders,
  labResults,
  labTests,
  patients,
  shifts,
  userShiftAssignments,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, roleProcedure, router } from "./_core/trpc";
import { canAdminUpdateRole } from "./_core/role-access";
import { sumInvoiceItems, toInvoiceNumber, toPatientNumber, uniqueTestCodes } from "./medical-workflow";
import { getReportWindow } from "./operational-reports";

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

const visitInput = patientInput.extend({
  shiftDate: clinicDate,
  shiftType: z.enum(["morning", "evening", "night"]),
  testCodes: z.array(z.string().trim().min(1).max(32)).max(50).default([]),
});

const followUpInput = z.object({
  patientNumber: z.string().trim().min(1).max(32),
  shiftDate: clinicDate,
  shiftType: z.enum(["morning", "evening", "night"]),
  testCodes: z.array(z.string().trim().min(1).max(32)).min(1).max(50),
});

const labTestInput = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, "رمز الفحص يجب أن يكون بالإنجليزية والأرقام فقط"),
  nameAr: z.string().trim().min(2).max(180),
  nameEn: z.string().trim().max(180).optional(),
  category: z.string().trim().max(100).optional(),
  sample: z.string().trim().max(120).optional(),
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

const CONSULTATION_FEE = 35000;

const reasonInput = z.string().trim().min(3).max(500);
const invoiceActionInput = z.object({ invoiceId: z.number().int().positive(), reason: reasonInput });
const invoiceTestsUpdateInput = z.object({
  invoiceId: z.number().int().positive(),
  testCodes: z.array(z.string().trim().min(1).max(32)).max(50),
  reason: reasonInput,
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ?? null),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
        email: users.email,
        loginMethod: users.loginMethod,
        role: users.role,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users).orderBy(desc(users.createdAt));
    }),
    updateRole: adminProcedure.input(z.object({
      userId: z.number().int().positive(),
      role: z.enum(["admin", "cashier", "lab", "supervisor", "accountant"]),
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

  clinic: router({
    getSettings: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      const [settings] = await db.select().from(clinicSettings).limit(1);
      return settings ?? null;
    }),
    saveSettings: roleProcedure("supervisor").input(clinicInput).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const [existing] = await db.select({ id: clinicSettings.id }).from(clinicSettings).limit(1);
      if (existing) {
        await db.update(clinicSettings).set(input).where(eq(clinicSettings.id, existing.id));
        return { id: existing.id, updated: true };
      }
      const result = await db.insert(clinicSettings).values(input);
      return { id: result[0].insertId, updated: false };
    }),
  }),

  patients: router({
    list: roleProcedure("cashier", "lab", "supervisor", "accountant").input(z.object({ search: z.string().trim().max(100).optional() }).optional()).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const search = input?.search;
      return db.select().from(patients).where(search ? like(patients.name, `%${search}%`) : undefined).orderBy(desc(patients.createdAt)).limit(100);
    }),
    workspace: roleProcedure("cashier", "lab", "supervisor", "accountant").query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const patientRows = await db.select().from(patients).orderBy(desc(patients.createdAt)).limit(100);
      if (patientRows.length === 0) return { patients: [], invoices: [], invoiceItems: [], labOrders: [], labTests: [] };
      const patientIds = patientRows.map(patient => patient.id);
      const invoiceRows = await db.select().from(invoices).where(inArray(invoices.patientId, patientIds)).orderBy(desc(invoices.createdAt)).limit(500);
      const invoiceIds = invoiceRows.map(invoice => invoice.id);
      const [itemRows, orderRows, testRows] = await Promise.all([
        invoiceIds.length ? db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds)) : Promise.resolve([]),
        db.select().from(labOrders).where(inArray(labOrders.patientId, patientIds)).orderBy(desc(labOrders.createdAt)).limit(500),
        db.select().from(labTests).where(eq(labTests.active, 1)).orderBy(labTests.category, labTests.nameAr),
      ]);
      return { patients: patientRows, invoices: invoiceRows, invoiceItems: itemRows, labOrders: orderRows, labTests: testRows };
    }),
    register: roleProcedure("cashier", "supervisor").input(visitInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة؛ لم يتم حفظ التسجيل" });
      const codes = uniqueTestCodes(input.testCodes);

      return db.transaction(async tx => {
        const [knownShift] = await tx.select().from(shifts)
          .where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType)))
          .limit(1).for("update");
        if (!knownShift) await tx.insert(shifts).values({
          shiftDate: input.shiftDate,
          shiftType: input.shiftType,
          cashierUserId: ctx.user.id,
        }).onDuplicateKeyUpdate({ set: { shiftDate: input.shiftDate } });
        const [shift] = await tx.select().from(shifts)
          .where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType)))
          .limit(1).for("update");
        if (!shift) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر فتح الوردية" });
        if (shift.status !== "open") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "الوردية مغلقة؛ افتح وردية بديلة قبل التسجيل" });

        const tests = codes.length
          ? await tx.select().from(labTests).where(and(inArray(labTests.code, codes), eq(labTests.active, 1)))
          : [];
        if (tests.length !== codes.length) {
          const found = new Set(tests.map(test => test.code));
          const missing = codes.filter(code => !found.has(code));
          throw new TRPCError({ code: "BAD_REQUEST", message: `فحوصات غير موجودة أو غير مفعلة: ${missing.join(", ")}` });
        }

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
        });
        const patientId = patientResult[0].insertId;
        const invoiceNumber = toInvoiceNumber(patientNumber);
        const invoiceLines = [
          { quantity: 1, unitPrice: CONSULTATION_FEE },
          ...tests.map(test => ({ quantity: 1, unitPrice: test.price })),
        ];
        const total = sumInvoiceItems(invoiceLines);
        const invoiceResult = await tx.insert(invoices).values({
          invoiceNumber,
          patientId,
          shiftId: shift.id,
          total,
          createdBy: ctx.user.id,
        });
        const invoiceId = invoiceResult[0].insertId;
        await tx.insert(invoiceItems).values([
          { invoiceId, description: "المعاينة الطبية", quantity: 1, unitPrice: CONSULTATION_FEE },
          ...tests.map(test => ({ invoiceId, labTestId: test.id, description: `${test.code} · ${test.nameAr}`, quantity: 1, unitPrice: test.price })),
        ]);
        if (tests.length) {
          await tx.insert(labOrders).values(tests.map(test => ({
            orderNumber: `ORD-${patientNumber.replaceAll("-", "")}-${test.id}-${String(sequence).padStart(2, "0")}`,
            patientId,
            invoiceId,
            labTestId: test.id,
            status: "blocked" as const,
          })));
        }
        return { id: patientId, patientNumber, sequence, shiftId: shift.id, invoiceId, invoiceNumber, total, testCodes: codes };
      });
    }),
    addTests: roleProcedure("cashier", "supervisor").input(followUpInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة؛ لم يتم حفظ الفحوصات" });
      const codes = uniqueTestCodes(input.testCodes);

      return db.transaction(async tx => {
        const [patient] = await tx.select().from(patients).where(eq(patients.patientNumber, input.patientNumber)).limit(1).for("update");
        if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "ملف المريض غير موجود" });
        const [knownShift] = await tx.select().from(shifts)
          .where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType)))
          .limit(1).for("update");
        if (!knownShift) await tx.insert(shifts).values({
          shiftDate: input.shiftDate,
          shiftType: input.shiftType,
          cashierUserId: ctx.user.id,
        }).onDuplicateKeyUpdate({ set: { shiftDate: input.shiftDate } });
        const [shift] = await tx.select().from(shifts)
          .where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType)))
          .limit(1).for("update");
        if (!shift || shift.status !== "open") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "الوردية المطلوبة غير مفتوحة" });
        const tests = await tx.select().from(labTests).where(and(inArray(labTests.code, codes), eq(labTests.active, 1)));
        if (tests.length !== codes.length) {
          const found = new Set(tests.map(test => test.code));
          throw new TRPCError({ code: "BAD_REQUEST", message: `فحوصات غير موجودة أو غير مفعلة: ${codes.filter(code => !found.has(code)).join(", ")}` });
        }
        const [countRow] = await tx.select({ count: sql<number>`count(*)` }).from(invoices).where(eq(invoices.patientId, patient.id));
        const invoiceNumber = toInvoiceNumber(patient.patientNumber, Number(countRow?.count ?? 0) + 1);
        const total = sumInvoiceItems(tests.map(test => ({ quantity: 1, unitPrice: test.price })));
        const invoiceResult = await tx.insert(invoices).values({
          invoiceNumber,
          patientId: patient.id,
          shiftId: shift.id,
          total,
          createdBy: ctx.user.id,
        });
        const invoiceId = invoiceResult[0].insertId;
        await tx.insert(invoiceItems).values(tests.map(test => ({
          invoiceId,
          labTestId: test.id,
          description: `${test.code} · ${test.nameAr}`,
          quantity: 1,
          unitPrice: test.price,
        })));
        await tx.insert(labOrders).values(tests.map(test => ({
          orderNumber: `ORD-${patient.patientNumber.replaceAll("-", "")}-${test.id}-${invoiceId}`,
          patientId: patient.id,
          invoiceId,
          labTestId: test.id,
          status: "blocked" as const,
        })));
        return { patientId: patient.id, patientNumber: patient.patientNumber, invoiceId, invoiceNumber, total, testCodes: codes };
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
      shiftType: z.enum(["morning", "evening", "night"]),
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
      shiftType: z.enum(["morning", "evening", "night"]),
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
    close: roleProcedure("admin", "supervisor").input(z.object({
      shiftDate: clinicDate,
      shiftType: z.enum(["morning", "evening", "night"]),
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
    current: protectedProcedure.input(z.object({ shiftDate: z.string(), shiftType: z.enum(["morning", "evening", "night"]) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [shift] = await db.select().from(shifts).where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType))).orderBy(desc(shifts.id)).limit(1);
      return shift ?? null;
    }),
    open: roleProcedure("cashier", "supervisor").input(z.object({ shiftDate: z.string(), shiftType: z.enum(["morning", "evening", "night"]) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      return db.transaction(async tx => {
        const [existing] = await tx.select({ id: shifts.id, status: shifts.status, sequenceCurrent: shifts.sequenceCurrent })
          .from(shifts).where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType))).limit(1).for("update");
        if (existing) {
          if (existing.status === "closed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "الوردية مغلقة" });
          return existing;
        }
        await tx.insert(shifts).values({ shiftDate: input.shiftDate, shiftType: input.shiftType, cashierUserId: ctx.user.id })
          .onDuplicateKeyUpdate({ set: { shiftDate: input.shiftDate } });
        const [shift] = await tx.select({ id: shifts.id, status: shifts.status, sequenceCurrent: shifts.sequenceCurrent })
          .from(shifts).where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType))).limit(1).for("update");
        if (!shift) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر فتح الوردية" });
        return shift;
      });
    }),
  }),

  billing: router({
    recent: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(100);
    }),
    markPaid: roleProcedure("cashier", "supervisor").input(z.object({ invoiceId: z.number().int().positive(), paymentMethod: z.string().max(40).default("cash") })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      return db.transaction(async tx => {
        const [invoice] = await tx.select({ id: invoices.id, status: invoices.status }).from(invoices)
          .where(eq(invoices.id, input.invoiceId)).limit(1).for("update");
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });
        if (invoice.status === "cancelled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن تحصيل فاتورة ملغاة" });
        if (invoice.status === "paid") return { success: true, alreadyPaid: true } as const;
        await tx.update(invoices).set({ status: "paid", paymentMethod: input.paymentMethod, paidAt: new Date() }).where(eq(invoices.id, input.invoiceId));
        await tx.update(labOrders).set({ status: "queued" })
          .where(and(eq(labOrders.invoiceId, input.invoiceId), eq(labOrders.status, "blocked")));
        return { success: true, alreadyPaid: false } as const;
      });
    }),
    cancel: roleProcedure("admin", "cashier").input(invoiceActionInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1).for("update");
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });
        if (invoice.status === "cancelled" || invoice.status === "refunded") return invoice;
        await tx.update(invoices).set({ status: "cancelled" }).where(eq(invoices.id, invoice.id));
        await tx.update(labOrders).set({ status: "blocked" }).where(eq(labOrders.invoiceId, invoice.id));
        await tx.insert(invoiceAdjustments).values({ invoiceId: invoice.id, type: "cancel", amountBefore: invoice.total, amountAfter: 0, delta: -invoice.total, reason: input.reason, createdBy: ctx.user.id });
        const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
        return updated;
      });
    }),
    refund: roleProcedure("admin", "cashier").input(invoiceActionInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      return db.transaction(async tx => {
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1).for("update");
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });
        if (invoice.status !== "paid") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن استرجاع فاتورة غير محصلة" });
        await tx.update(invoices).set({ status: "refunded", refundedAt: new Date(), refundedBy: ctx.user.id, refundReason: input.reason }).where(eq(invoices.id, invoice.id));
        await tx.update(labOrders).set({ status: "blocked" }).where(eq(labOrders.invoiceId, invoice.id));
        await tx.insert(invoiceAdjustments).values({ invoiceId: invoice.id, type: "refund", amountBefore: invoice.total, amountAfter: 0, delta: -invoice.total, reason: input.reason, createdBy: ctx.user.id });
        const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
        return updated;
      });
    }),
    updateTests: roleProcedure("admin", "cashier").input(invoiceTestsUpdateInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const codes = uniqueTestCodes(input.testCodes);
      return db.transaction(async tx => {
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1).for("update");
        if (!invoice || invoice.status === "cancelled" || invoice.status === "refunded") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن تعديل هذه الفاتورة" });
        const tests = codes.length ? await tx.select().from(labTests).where(and(inArray(labTests.code, codes), eq(labTests.active, 1))) : [];
        if (tests.length !== codes.length) throw new TRPCError({ code: "BAD_REQUEST", message: "يوجد فحص غير موجود أو غير مفعل" });
        const currentOrders = await tx.select().from(labOrders).where(eq(labOrders.invoiceId, invoice.id));
        const completedCodes = new Set(currentOrders.filter(order => order.status === "completed").map(order => order.labTestId));
        const removedIds = currentOrders.filter(order => !tests.some(test => test.id === order.labTestId)).map(order => order.labTestId);
        if (removedIds.some(id => completedCodes.has(id))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن حذف فحص صدرت نتيجته" });
        const oldTotal = invoice.total;
        const newTotal = CONSULTATION_FEE + tests.reduce((sum, test) => sum + test.price, 0);
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
        await tx.insert(invoiceItems).values([{ invoiceId: invoice.id, description: "المعاينة الطبية", quantity: 1, unitPrice: CONSULTATION_FEE }, ...tests.map(test => ({ invoiceId: invoice.id, labTestId: test.id, description: `${test.code} · ${test.nameAr}`, quantity: 1, unitPrice: test.price }))]);
        for (const order of currentOrders) if (!tests.some(test => test.id === order.labTestId)) await tx.delete(labOrders).where(eq(labOrders.id, order.id));
        const currentIds = new Set(currentOrders.map(order => order.labTestId));
        const newTests = tests.filter(test => !currentIds.has(test.id));
        if (newTests.length) await tx.insert(labOrders).values(newTests.map(test => ({ orderNumber: `ORD-${invoice.invoiceNumber.replaceAll("-", "")}-${test.id}-${Date.now()}`, patientId: invoice.patientId, invoiceId: invoice.id, labTestId: test.id, status: invoice.status === "paid" && newTotal === oldTotal ? "queued" as const : "blocked" as const })));
        const nextStatus = invoice.status === "paid" && newTotal === oldTotal ? "paid" as const : "pending" as const;
        if (nextStatus === "pending") await tx.update(labOrders).set({ status: "blocked" }).where(eq(labOrders.invoiceId, invoice.id));
        await tx.update(invoices).set({ total: newTotal, status: nextStatus }).where(eq(invoices.id, invoice.id));
        await tx.insert(invoiceAdjustments).values({ invoiceId: invoice.id, type: "edit", amountBefore: oldTotal, amountAfter: newTotal, delta: newTotal - oldTotal, reason: input.reason, metadataJson: JSON.stringify({ testCodes: codes }), createdBy: ctx.user.id });
        const [updated] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1);
        return { invoice: updated, requiresRecollection: nextStatus === "pending", delta: newTotal - oldTotal };
      });
    }),
  }),

  laboratory: router({
    pending: roleProcedure("lab", "supervisor").query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(labOrders).where(eq(labOrders.status, "queued")).orderBy(desc(labOrders.createdAt)).limit(100);
    }),
    saveResult: roleProcedure("lab", "supervisor").input(resultInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const [order] = await db.select().from(labOrders).where(eq(labOrders.id, input.labOrderId)).limit(1);
      if (!order) throw new Error("Lab order not found");
      const [invoice] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, order.invoiceId)).limit(1);
      if (!invoice || invoice.status !== "paid") throw new Error("لا يمكن إصدار النتيجة قبل اكتمال الدفع");
      const [existing] = await db.select({ id: labResults.id }).from(labResults).where(eq(labResults.labOrderId, input.labOrderId)).limit(1);
      const valuesJson = JSON.stringify(input.values);
      if (existing) {
        await db.update(labResults).set({ valuesJson, remarks: input.remarks, technicianUserId: ctx.user.id }).where(eq(labResults.id, existing.id));
      } else {
        await db.insert(labResults).values({ labOrderId: input.labOrderId, valuesJson, remarks: input.remarks, technicianUserId: ctx.user.id });
      }
      await db.update(labOrders).set({ status: "completed", resultIssuedAt: new Date() }).where(eq(labOrders.id, input.labOrderId));
      return { success: true } as const;
    }),
  }),

  reports: router({
    summary: roleProcedure("admin", "supervisor", "accountant").input(z.object({ period: z.enum(["daily", "monthly"]), date: clinicDate })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const window = getReportWindow(input.period, input.date);
      const rows = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, total: invoices.total, status: invoices.status, createdAt: invoices.createdAt, paidAt: invoices.paidAt, patientNumber: patients.patientNumber })
        .from(invoices).innerJoin(patients, eq(invoices.patientId, patients.id))
        .where(and(gte(invoices.createdAt, window.start), lt(invoices.createdAt, window.end))).orderBy(desc(invoices.createdAt));
      const paidRows = rows.filter(row => row.status === "paid" && row.paidAt && row.paidAt >= window.start && row.paidAt < window.end);
      const refundRows = rows.filter(row => row.status === "refunded");
      return { period: input.period, date: input.date, issuedCount: rows.filter(row => row.status !== "cancelled").length, paidCount: paidRows.length, cancelledCount: rows.filter(row => row.status === "cancelled").length, refundedCount: refundRows.length, grossTotal: paidRows.reduce((sum, row) => sum + row.total, 0), refundTotal: refundRows.reduce((sum, row) => sum + row.total, 0), netTotal: paidRows.reduce((sum, row) => sum + row.total, 0) - refundRows.reduce((sum, row) => sum + row.total, 0), rows };
    }),
    shift: roleProcedure("admin", "supervisor", "cashier", "accountant").input(z.object({ shiftDate: clinicDate, shiftType: z.enum(["morning", "evening", "night"]) })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [shift] = await db.select().from(shifts).where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType))).limit(1);
      if (!shift) return { shift: null, invoiceCount: 0, paidCount: 0, grossTotal: 0, refundTotal: 0, netTotal: 0, rows: [] };
      if (ctx.user.role === "cashier") {
        const [assigned] = await db.select({ id: userShiftAssignments.id }).from(userShiftAssignments).where(and(eq(userShiftAssignments.shiftId, shift.id), eq(userShiftAssignments.userId, ctx.user.id))).limit(1);
        if (!assigned && shift.cashierUserId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك مشاهدة تقرير وردية غير مسندة إليك" });
      }
      const rows = await db.select({ invoiceNumber: invoices.invoiceNumber, total: invoices.total, status: invoices.status, patientNumber: patients.patientNumber, createdAt: invoices.createdAt, paidAt: invoices.paidAt }).from(invoices).innerJoin(patients, eq(invoices.patientId, patients.id)).where(eq(invoices.shiftId, shift.id)).orderBy(desc(invoices.createdAt));
      const paidRows = rows.filter(row => row.status === "paid");
      const refundRows = rows.filter(row => row.status === "refunded");
      return { shift, invoiceCount: rows.length, paidCount: paidRows.length, grossTotal: paidRows.reduce((sum, row) => sum + row.total, 0), refundTotal: refundRows.reduce((sum, row) => sum + row.total, 0), netTotal: paidRows.reduce((sum, row) => sum + row.total, 0) - refundRows.reduce((sum, row) => sum + row.total, 0), rows };
    }),
  }),

  catalog: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(labTests).where(eq(labTests.active, 1)).orderBy(labTests.category, labTests.nameAr);
    }),
    save: roleProcedure("admin", "supervisor").input(labTestInput).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "قاعدة البيانات غير متصلة" });
      const [existing] = await db.select({ id: labTests.id }).from(labTests).where(eq(labTests.code, input.code)).limit(1);
      if (existing) {
        await db.update(labTests).set(input).where(eq(labTests.id, existing.id));
        return { id: existing.id, created: false } as const;
      }
      const result = await db.insert(labTests).values(input);
      return { id: result[0].insertId, created: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
