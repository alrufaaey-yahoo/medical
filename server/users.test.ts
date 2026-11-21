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

  it("validates positive staff ids for shift assignments", async () => {
    const caller = createCaller({ id: 7, role: "admin" } as TestUser);

    await expect(caller.shifts.assignUsers({
      shiftDate: "2026-11-21",
      shiftType: "morning",
      cashierUserId: 0,
      labUserId: null,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
