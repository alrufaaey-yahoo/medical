import { COOKIE_NAME } from "@shared/const";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  clinicSettings,
  invoiceItems,
  invoices,
  labOrders,
  labResults,
  labTests,
  patients,
  shifts,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, roleProcedure, router } from "./_core/trpc";
import { sumInvoiceItems, toInvoiceNumber, toPatientNumber, uniqueTestCodes } from "./medical-workflow";

const patientInput = z.object({
  name: z.string().trim().min(2).max(180),
  gender: z.enum(["male", "female"]),
  age: z.number().int().min(0).max(130).optional(),
  phone: z.string().trim().max(60).optional(),
  address: z.string().trim().max(255).optional(),
});

const clinicInput = z.object({
  name: z.string().trim().min(2).max(180),
  logoUrl: z.string().url().max(500).optional(),
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

const CONSULTATION_FEE = 35000;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
    list: roleProcedure("cashier", "lab", "supervisor").input(z.object({ search: z.string().trim().max(100).optional() }).optional()).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const search = input?.search;
      return db.select().from(patients).where(search ? like(patients.name, `%${search}%`) : undefined).orderBy(desc(patients.createdAt)).limit(100);
    }),
    workspace: roleProcedure("cashier", "lab", "supervisor").query(async () => {
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
        await tx.insert(shifts).values({
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
        await tx.insert(shifts).values({
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
    current: protectedProcedure.input(z.object({ shiftDate: z.string(), shiftType: z.enum(["morning", "evening", "night"]) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [shift] = await db.select().from(shifts).where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType))).orderBy(desc(shifts.id)).limit(1);
      return shift ?? null;
    }),
    open: roleProcedure("cashier", "supervisor").input(z.object({ shiftDate: z.string(), shiftType: z.enum(["morning", "evening", "night"]) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      await db.insert(shifts).values({ shiftDate: input.shiftDate, shiftType: input.shiftType, cashierUserId: ctx.user.id })
        .onDuplicateKeyUpdate({ set: { shiftDate: input.shiftDate } });
      const [shift] = await db.select({ id: shifts.id, status: shifts.status, sequenceCurrent: shifts.sequenceCurrent })
        .from(shifts).where(and(eq(shifts.shiftDate, input.shiftDate), eq(shifts.shiftType, input.shiftType))).limit(1);
      if (!shift) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر فتح الوردية" });
      return shift;
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

  catalog: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(labTests).where(eq(labTests.active, 1)).orderBy(labTests.category, labTests.nameAr);
    }),
  }),
});

export type AppRouter = typeof appRouter;
