export type AppRole = "admin" | "cashier" | "lab" | "supervisor";

export type StaffRole = "cashier" | "lab" | "supervisor";

export type AppSection =
  | "overview"
  | "patients"
  | "billing"
  | "lab"
  | "tests"
  | "reports"
  | "users"
  | "settings";

/**
 * Section visibility per role.
 *
 * The operations supervisor owns reporting, pricing, and staffing only; the
 * laboratory and patient records stay with the lab technician, cashier, and
 * system administrator.
 */
export const ROLE_SECTIONS: Record<AppRole, readonly AppSection[]> = {
  admin: ["overview", "patients", "billing", "lab", "tests", "reports", "users", "settings"],
  supervisor: ["reports", "tests", "users"],
  cashier: ["overview", "patients", "billing", "reports"],
  lab: ["overview", "lab", "tests"],
};

export function hasRoleAccess(role: AppRole | "user" | undefined, allowedRoles: readonly AppRole[]) {
  return role === "admin" || (role !== undefined && allowedRoles.includes(role as AppRole));
}

export function canAdminUpdateRole(actorId: number, targetId: number, nextRole: AppRole) {
  return actorId !== targetId || nextRole === "admin";
}

export function canAccessPatients(role: string | null | undefined): boolean {
  return role === "admin" || role === "cashier" || role === "lab";
}

export function canAccessLaboratory(role: string | null | undefined): boolean {
  return role === "admin" || role === "lab";
}

/** Prices (tests and doctor consultations) are editable by supervisor and admin. */
export function canManagePrices(role: string | null | undefined): boolean {
  return role === "admin" || role === "supervisor";
}

/** Test definitions (name, sample, result fields, ranges) are admin-only. */
export function canManageCatalogDefinitions(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canManageStaff(role: string | null | undefined): boolean {
  return role === "admin" || role === "supervisor";
}

/** A supervisor can only add cashiers and lab technicians, never other supervisors. */
export function canAssignStaffRole(actorRole: string | null | undefined, targetRole: StaffRole): boolean {
  if (actorRole === "admin") return true;
  if (actorRole === "supervisor") return targetRole === "cashier" || targetRole === "lab";
  return false;
}

export function canManageBilling(role: string | null | undefined): boolean {
  return role === "admin" || role === "cashier";
}

export function canViewReports(role: string | null | undefined): boolean {
  return role === "admin" || role === "supervisor" || role === "cashier";
}

export function canManageClinicSettings(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canCloseShift(role: string | null | undefined): boolean {
  return role === "admin" || role === "supervisor";
}
