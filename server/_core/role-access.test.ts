import { describe, expect, it } from "vitest";
import { hasRoleAccess } from "./role-access";

describe("role access", () => {
  const settingsRoles = ["supervisor"] as const;

  it("allows admin to bypass a narrower role list", () => {
    expect(hasRoleAccess("admin", settingsRoles)).toBe(true);
  });

  it("allows supervisor to save clinic settings", () => {
    expect(hasRoleAccess("supervisor", settingsRoles)).toBe(true);
  });

  it("denies cashier, lab, and demo users", () => {
    expect(hasRoleAccess("cashier", settingsRoles)).toBe(false);
    expect(hasRoleAccess("lab", settingsRoles)).toBe(false);
    expect(hasRoleAccess("user", settingsRoles)).toBe(false);
    expect(hasRoleAccess(undefined, settingsRoles)).toBe(false);
  });
});
