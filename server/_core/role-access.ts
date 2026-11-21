export type AppRole = "admin" | "cashier" | "lab" | "supervisor";

export function hasRoleAccess(role: AppRole | "user" | undefined, allowedRoles: readonly AppRole[]) {
  return role === "admin" || (role !== undefined && allowedRoles.includes(role as AppRole));
}
