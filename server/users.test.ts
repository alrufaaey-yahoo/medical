import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

type TestUser = NonNullable<TrpcContext["user"]>;

function createCaller(user?: TestUser) {
  const context = {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user,
  } as TrpcContext;

  return appRouter.createCaller(context);
}

describe("user administration API permissions", () => {
  it("denies unauthenticated callers before listing users", async () => {
    const caller = createCaller();

    await expect(caller.users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires an authenticated session before changing the caller's own login details", async () => {
    const caller = createCaller();

    await expect(caller.auth.updateOwnAccount({
      username: "newusername",
      name: "موظف جديد",
      currentPassword: "wrong-password",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("denies non-admin staff before changing a role", async () => {
    const caller = createCaller({ id: 2, role: "supervisor" } as TestUser);

    await expect(caller.users.updateRole({ userId: 3, role: "cashier" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("prevents an admin from demoting their own account before database access", async () => {
    const caller = createCaller({ id: 7, role: "admin" } as TestUser);

    await expect(caller.users.updateRole({ userId: 7, role: "cashier" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("rejects the demo-only role as an account role", async () => {
    const caller = createCaller({ id: 7, role: "admin" } as TestUser);

    await expect(
      caller.users.updateRole({ userId: 8, role: "user" as "cashier" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("denies non-admin callers before loading shift assignments", async () => {
    const caller = createCaller({ id: 2, role: "supervisor" } as TestUser);

    await expect(caller.shifts.assignments({ shiftDate: "2026-11-21" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("keeps shift handoff history admin-only", async () => {
    const caller = createCaller({ id: 2, role: "supervisor" } as TestUser);

    await expect(caller.shifts.handoffs({ shiftDate: "2026-11-21" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.shifts.recordHandoff({
      shiftDate: "2026-11-21",
      shiftType: "morning",
      staffRole: "cashier",
      originalUserId: 8,
      substituteUserId: 9,
      reason: "تغطية مؤقتة",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates shift handoff ids and reason before database access", async () => {
    const caller = createCaller({ id: 7, role: "admin" } as TestUser);

    await expect(caller.shifts.recordHandoff({
      shiftDate: "2026-11-21",
      shiftType: "morning",
      staffRole: "cashier",
      originalUserId: 0,
      substituteUserId: 9,
      reason: "تغطية مؤقتة",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.shifts.recordHandoff({
      shiftDate: "2026-11-21",
      shiftType: "morning",
      staffRole: "cashier",
      originalUserId: 8,
      substituteUserId: 9,
      reason: "لا",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("validates positive staff ids for shift assignments", async () => {
    const caller = createCaller({ id: 7, role: "admin" } as TestUser);

    await expect(caller.shifts.assignUsers({
      shiftDate: "2026-11-21",
      shiftType: "morning",
      cashierUserId: 0,
      labUserId: null,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("denies cashier access to catalog mutations", async () => {
    const caller = createCaller({ id: 9, role: "cashier" } as TestUser);

    await expect(caller.catalog.save({
      code: "TEST",
      nameAr: "فحص تجريبي",
      nameEn: "Test",
      category: "عام",
      sample: "دم",
      price: 100,
      fieldsJson: "[]",
      active: 1,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps test definitions admin-only even for the operations supervisor", async () => {
    const caller = createCaller({ id: 2, role: "supervisor" } as TestUser);

    await expect(caller.catalog.save({
      code: "CBC",
      nameAr: "صورة الدم",
      price: 100,
      fieldsJson: "[]",
      active: 1,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets the supervisor reach price updates and validates their input", async () => {
    const caller = createCaller({ id: 2, role: "supervisor" } as TestUser);

    await expect(caller.catalog.updatePrices({ items: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.pricing.updateConsultation({ generalPrice: -1, specialistPrice: 50000 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("denies cashier callers from closing a shift", async () => {
    const caller = createCaller({ id: 9, role: "cashier" } as TestUser);

    await expect(caller.shifts.close({ shiftDate: "2026-11-21", shiftType: "morning" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
