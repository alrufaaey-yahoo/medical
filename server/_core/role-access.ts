export type AppRole = "admin" | "cashier" | "lab" | "supervisor" | "accountant";

export function hasRoleAccess(role: AppRole | "user" | undefined, allowedRoles: readonly AppRole[]) {
  return role === "admin" || (role !== undefined && allowedRoles.includes(role as AppRole));
}

export function canAdminUpdateRole(actorId: number, targetId: number, nextRole: AppRole) {
  return actorId !== targetId || nextRole === "admin";
}
