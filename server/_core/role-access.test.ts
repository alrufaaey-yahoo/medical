import { describe, expect, it } from "vitest";
import { canAdminUpdateRole, hasRoleAccess } from "./role-access";

describe("role access", () => {
  const settingsRoles = ["supervisor"] as const;

  it("allows admin to bypass a narrower role list", () => {
    expect(hasRoleAccess("admin", settingsRoles)).toBe(true);
  });

  it("allows supervisor to save clinic settings", () => {
    expect(hasRoleAccess("supervisor", settingsRoles)).toBe(true);
  });


  it("prevents an admin from demoting the current account", () => {
    expect(canAdminUpdateRole(7, 7, "cashier")).toBe(false);
    expect(canAdminUpdateRole(7, 7, "admin")).toBe(true);
    expect(canAdminUpdateRole(7, 8, "cashier")).toBe(true);
  });

  it("denies cashier, lab, and demo users", () => {
    expect(hasRoleAccess("cashier", settingsRoles)).toBe(false);
    expect(hasRoleAccess("lab", settingsRoles)).toBe(false);
    expect(hasRoleAccess("user", settingsRoles)).toBe(false);
    expect(hasRoleAccess(undefined, settingsRoles)).toBe(false);
  });
});
