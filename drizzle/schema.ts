import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  username: text("username").unique(),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin", "cashier", "lab", "supervisor"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()).notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
});

export const previewLoginAccounts = sqliteTable("preview_login_accounts", {
  role: text("role", { enum: ["admin", "supervisor", "cashier", "lab"] }).primaryKey(),
  passwordHash: text("passwordHash").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
});

/** Named password accounts provisioned by an administrator or operations supervisor. */
export const localLoginAccounts = sqliteTable("local_login_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  passwordHash: text("passwordHash").notNull(),
  active: integer("active").default(1).notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("local_login_accounts_user_unique").on(table.userId)]);

export const clinicSettings = sqliteTable("clinic_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  logoUrl: text("logoUrl"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  footerText: text("footerText"),
  // Consultation (doctor visit) pricing, editable by the operations supervisor.
  consultationGeneralPrice: integer("consultationGeneralPrice").default(35000).notNull(),
  consultationSpecialistPrice: integer("consultationSpecialistPrice").default(50000).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()).notNull(),
});

/** Optional analyzer bridge configuration; the singleton row is id=1 and tokenHash is never returned. */
export const cbcBridgeConfig = sqliteTable("cbc_bridge_config", {
  id: integer("id").primaryKey(),
  enabled: integer("enabled").default(0).notNull(),
  mode: text("mode", { enum: ["local", "hosted"] }).default("local").notNull(),
  deviceIp: text("deviceIp").default("192.168.1.100").notNull(),
  computerIp: text("computerIp").default("192.168.1.111").notNull(),
  listenPort: integer("listenPort").default(5006).notNull(),
  protocol: text("protocol", { enum: ["mllp", "raw-idle"] }).default("mllp").notNull(),
  transSelect: text("transSelect").default("Net").notNull(),
  autoTrans: integer("autoTrans").default(1).notNull(),
  subnet: text("subnet").default("255.255.255.0").notNull(),
  tokenHash: text("tokenHash"),
  lastHeartbeat: integer("lastHeartbeat", { mode: "timestamp_ms" }),
  lastMessageAt: integer("lastMessageAt", { mode: "timestamp_ms" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()).notNull(),
});

/** Analyzer results are staged as samples and never create or complete a lab result by themselves. */
export const cbcBridgeSamples = sqliteTable("cbc_bridge_samples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sampleId: text("sampleId").notNull(),
  patientNumber: text("patientNumber").notNull(),
  collectedAt: text("collectedAt"),
  messageControlId: text("messageControlId").notNull(),
  contentHash: text("contentHash").notNull().unique(),
  resultsJson: text("resultsJson").notNull(),
  receivedAt: integer("receivedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [index("cbc_bridge_samples_sample_idx").on(table.sampleId), index("cbc_bridge_samples_received_idx").on(table.receivedAt)]);

export const shifts = sqliteTable("shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftDate: text("shiftDate").notNull(),
  shiftType: text("shiftType", { enum: ["morning", "evening", "night"] }).notNull(),
  sequenceStart: integer("sequenceStart").default(1).notNull(),
  sequenceCurrent: integer("sequenceCurrent").default(0).notNull(),
  cashierUserId: integer("cashierUserId"),
  labUserId: integer("labUserId"),
  status: text("status", { enum: ["open", "closed"] }).default("open").notNull(),
  openedAt: integer("openedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  closedAt: integer("closedAt", { mode: "timestamp_ms" }),
}, (table) => [uniqueIndex("shifts_date_type_unique").on(table.shiftDate, table.shiftType)]);

export const userShiftAssignments = sqliteTable("user_shift_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shiftId").notNull(),
  userId: integer("userId").notNull(),
  assignedBy: integer("assignedBy").notNull(),
  assignedAt: integer("assignedAt").default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [uniqueIndex("user_shift_assignments_unique").on(table.shiftId, table.userId)]);

/** Approved coverage keeps the original shift owner while authorizing a substitute. */
export const shiftHandoffs = sqliteTable("shift_handoffs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shiftId").notNull(),
  staffRole: text("staffRole", { enum: ["cashier", "lab"] }).notNull(),
  originalUserId: integer("originalUserId").notNull(),
  substituteUserId: integer("substituteUserId").notNull(),
  reason: text("reason").notNull(),
  approvedBy: integer("approvedBy").notNull(),
  approvedAt: integer("approvedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex("shift_handoffs_shift_role_unique").on(table.shiftId, table.staffRole),
  index("shift_handoffs_shift_idx").on(table.shiftId),
]);

export const patients = sqliteTable("patients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientNumber: text("patientNumber").notNull().unique(),
  name: text("name").notNull(),
  gender: text("gender", { enum: ["male", "female"] }).notNull(),
  age: integer("age"),
  phone: text("phone"),
  address: text("address"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()).notNull(),
});

export const labTests = sqliteTable("lab_tests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  nameAr: text("nameAr").notNull(),
  nameEn: text("nameEn"),
  category: text("category"),
  sample: text("sample"),
  turnaround: text("turnaround"),
  price: integer("price").default(0).notNull(),
  fieldsJson: text("fieldsJson"),
  active: integer("active").default(1).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()).notNull(),
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoiceNumber").notNull().unique(),
  patientId: integer("patientId").notNull(),
  shiftId: integer("shiftId"),
  total: integer("total").default(0).notNull(),
  // Snapshot of the doctor consultation sold with this invoice.
  consultationType: text("consultationType", { enum: ["none", "general", "specialist"] }).default("none").notNull(),
  consultationFee: integer("consultationFee").default(0).notNull(),
  status: text("status", { enum: ["pending", "paid", "cancelled", "refunded"] }).default("pending").notNull(),
  paymentMethod: text("paymentMethod"),
  paymentBank: text("paymentBank"),
  transactionNumber: text("transactionNumber"),
  createdBy: integer("createdBy"),
  paidAt: integer("paidAt", { mode: "timestamp_ms" }),
  refundedAt: integer("refundedAt", { mode: "timestamp_ms" }),
  refundedBy: integer("refundedBy"),
  refundReason: text("refundReason"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
});

export const paymentBanks = sqliteTable("payment_banks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  active: integer("active").default(1).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
});

export const invoiceItems = sqliteTable("invoice_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoiceId").notNull(),
  labTestId: integer("labTestId"),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: integer("unitPrice").default(0).notNull(),
});

export const invoiceAdjustments = sqliteTable("invoice_adjustments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoiceId").notNull(),
  type: text("type", { enum: ["add_test", "remove_test", "edit", "cancel", "refund"] }).notNull(),
  amountBefore: integer("amountBefore").notNull(),
  amountAfter: integer("amountAfter").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  metadataJson: text("metadataJson"),
  createdBy: integer("createdBy").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
});

export const labOrders = sqliteTable("lab_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNumber: text("orderNumber").notNull().unique(),
  patientId: integer("patientId").notNull(),
  invoiceId: integer("invoiceId").notNull(),
  labTestId: integer("labTestId").notNull(),
  status: text("status", { enum: ["queued", "in_progress", "completed", "blocked"] }).default("blocked").notNull(),
  collectedAt: integer("collectedAt", { mode: "timestamp_ms" }),
  resultIssuedAt: integer("resultIssuedAt", { mode: "timestamp_ms" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
});

export const labResults = sqliteTable("lab_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  labOrderId: integer("labOrderId").notNull().unique(),
  technicianUserId: integer("technicianUserId"),
  valuesJson: text("valuesJson").notNull(),
  remarks: text("remarks"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()).notNull(),
});

export const labResultDrafts = sqliteTable("lab_result_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  labOrderId: integer("labOrderId").notNull(),
  technicianUserId: integer("technicianUserId").notNull(),
  valuesJson: text("valuesJson").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("lab_result_drafts_order_unique").on(table.labOrderId)]);

export const cashierAttention = sqliteTable("cashier_attention", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoiceId").notNull(),
  flaggedBy: integer("flaggedBy").notNull(),
  flaggedAt: integer("flaggedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  note: text("note"),
  resolvedBy: integer("resolvedBy"),
  resolvedAt: integer("resolvedAt", { mode: "timestamp_ms" }),
}, (table) => [uniqueIndex("cashier_attention_invoice_unique").on(table.invoiceId), index("cashier_attention_open_idx").on(table.resolvedAt, table.flaggedAt)]);

export const staffMessages = sqliteTable("staff_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  senderUserId: integer("senderUserId").notNull(),
  body: text("body").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [index("staff_messages_created_idx").on(table.createdAt)]);

/**
 * Staff roster managed by the operations supervisor: lab technicians and
 * cashiers are added here before they sign in. When a Manus account with the
 * same email signs in, its role is linked automatically.
 */
export const staffMembers = sqliteTable("staff_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("fullName").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("staffRole", { enum: ["cashier", "lab", "supervisor"] }).notNull(),
  active: integer("active").default(1).notNull(),
  userId: integer("userId"),
  createdBy: integer("createdBy").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("staff_members_email_unique").on(table.email)]);

/** Audit trail for price changes (catalog tests and consultation fees). */
export const priceChanges = sqliteTable("price_changes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entity: text("entity", { enum: ["lab_test", "consultation"] }).notNull(),
  reference: text("reference").notNull(),
  oldPrice: integer("oldPrice").notNull(),
  newPrice: integer("newPrice").notNull(),
  changedBy: integer("changedBy").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ClinicSettings = typeof clinicSettings.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type LabTest = typeof labTests.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type LabOrder = typeof labOrders.$inferSelect;
export type LabResult = typeof labResults.$inferSelect;
export type InvoiceAdjustment = typeof invoiceAdjustments.$inferSelect;
export type StaffMember = typeof staffMembers.$inferSelect;
export type PriceChange = typeof priceChanges.$inferSelect;
