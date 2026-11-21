import { COOKIE_NAME } from "@shared/const";
import { and, desc, eq, like } from "drizzle-orm";
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

function createPatientNumber(sequence: number) {
  return `P-${String(sequence).padStart(6, "0")}`;
}

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
    list: protectedProcedure.input(z.object({ search: z.string().trim().max(100).optional() }).optional()).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const search = input?.search;
      return db.select().from(patients).where(search ? like(patients.name, `%${search}%`) : undefined).orderBy(desc(patients.createdAt)).limit(100);
    }),
    create: roleProcedure("cashier", "supervisor").input(patientInput).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not available");
      const [latest] = await db.select({ id: patients.id }).from(patients).orderBy(desc(patients.id)).limit(1);
      const patientNumber = createPatientNumber((latest?.id ?? 0) + 1);
      const result = await db.insert(patients).values({
        patientNumber,
        name: input.name,
        gender: input.gender,
        age: input.age,
        phone: input.phone,
        address: input.address,
      });
      return { id: result[0].insertId, patientNumber };
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
      const result = await db.insert(shifts).values({ shiftDate: input.shiftDate, shiftType: input.shiftType, cashierUserId: ctx.user.id });
      return { id: result[0].insertId };
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
      await db.update(invoices).set({ status: "paid", paymentMethod: input.paymentMethod, paidAt: new Date() }).where(eq(invoices.id, input.invoiceId));
      await db.update(labOrders).set({ status: "queued" }).where(eq(labOrders.invoiceId, input.invoiceId));
      return { success: true } as const;
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
