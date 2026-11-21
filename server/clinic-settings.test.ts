import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

function createAdminCaller() {
  const context = {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: { id: 1, role: "admin" },
  } as TrpcContext;

  return appRouter.createCaller(context);
}

describe("clinic.saveSettings logo URL validation", () => {
  it("rejects non-HTTPS logo URLs before accessing the database", async () => {
    const caller = createAdminCaller();

    await expect(caller.clinic.saveSettings({
      name: "مستوصف الاختبار",
      logoUrl: "http://clinic.example/logo.png",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects malformed logo URLs before accessing the database", async () => {
    const caller = createAdminCaller();

    await expect(caller.clinic.saveSettings({
      name: "مستوصف الاختبار",
      logoUrl: "not-a-url",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
