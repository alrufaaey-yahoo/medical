import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "cashier", "lab", "supervisor"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const previewLoginAccounts = mysqlTable("preview_login_accounts", {
  role: mysqlEnum("role", ["admin", "supervisor", "cashier", "lab"]).primaryKey(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const clinicSettings = mysqlTable("clinic_settings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  logoUrl: varchar("logoUrl", { length: 500 }),
  address: varchar("address", { length: 255 }),
  phone: varchar("phone", { length: 120 }),
  email: varchar("email", { length: 180 }),
  website: varchar("website", { length: 180 }),
  footerText: text("footerText"),
  // Consultation (doctor visit) pricing, editable by the operations supervisor.
  consultationGeneralPrice: int("consultationGeneralPrice").default(35000).notNull(),
  consultationSpecialistPrice: int("consultationSpecialistPrice").default(50000).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Optional analyzer bridge configuration; the singleton row is id=1 and tokenHash is never returned. */
export const cbcBridgeConfig = mysqlTable("cbc_bridge_config", {
  id: int("id").primaryKey(),
  enabled: int("enabled").default(0).notNull(),
  mode: mysqlEnum("mode", ["local", "hosted"]).default("local").notNull(),
  deviceIp: varchar("deviceIp", { length: 45 }).default("192.168.1.100").notNull(),
  computerIp: varchar("computerIp", { length: 45 }).default("192.168.1.111").notNull(),
  listenPort: int("listenPort").default(5006).notNull(),
  protocol: mysqlEnum("protocol", ["mllp", "raw-idle"]).default("mllp").notNull(),
  transSelect: varchar("transSelect", { length: 32 }).default("Net").notNull(),
  autoTrans: int("autoTrans").default(1).notNull(),
  subnet: varchar("subnet", { length: 45 }).default("255.255.255.0").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }),
  lastHeartbeat: timestamp("lastHeartbeat"),
  lastMessageAt: timestamp("lastMessageAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Analyzer results are staged as samples and never create or complete a lab result by themselves. */
export const cbcBridgeSamples = mysqlTable("cbc_bridge_samples", {
  id: int("id").autoincrement().primaryKey(),
  sampleId: varchar("sampleId", { length: 128 }).notNull(),
  patientNumber: varchar("patientNumber", { length: 64 }).notNull(),
  collectedAt: varchar("collectedAt", { length: 40 }),
  messageControlId: varchar("messageControlId", { length: 128 }).notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull().unique(),
  resultsJson: text("resultsJson").notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, (table) => [index("cbc_bridge_samples_sample_idx").on(table.sampleId), index("cbc_bridge_samples_received_idx").on(table.receivedAt)]);

export const shifts = mysqlTable("shifts", {
  id: int("id").autoincrement().primaryKey(),
  shiftDate: varchar("shiftDate", { length: 10 }).notNull(),
  shiftType: mysqlEnum("shiftType", ["morning", "evening", "night"]).notNull(),
  sequenceStart: int("sequenceStart").default(1).notNull(),
  sequenceCurrent: int("sequenceCurrent").default(0).notNull(),
  cashierUserId: int("cashierUserId"),
  labUserId: int("labUserId"),
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
}, (table) => [uniqueIndex("shifts_date_type_unique").on(table.shiftDate, table.shiftType)]);

export const userShiftAssignments = mysqlTable("user_shift_assignments", {
  id: int("id").autoincrement().primaryKey(),
  shiftId: int("shiftId").notNull(),
  userId: int("userId").notNull(),
  assignedBy: int("assignedBy").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("user_shift_assignments_unique").on(table.shiftId, table.userId)]);

export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  patientNumber: varchar("patientNumber", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  gender: mysqlEnum("gender", ["male", "female"]).notNull(),
  age: int("age"),
  phone: varchar("phone", { length: 60 }),
  address: varchar("address", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const labTests = mysqlTable("lab_tests", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  nameAr: varchar("nameAr", { length: 180 }).notNull(),
  nameEn: varchar("nameEn", { length: 180 }),
  category: varchar("category", { length: 100 }),
  sample: varchar("sample", { length: 120 }),
  turnaround: varchar("turnaround", { length: 60 }),
  price: int("price").default(0).notNull(),
  fieldsJson: text("fieldsJson"),
  active: int("active").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 40 }).notNull().unique(),
  patientId: int("patientId").notNull(),
  shiftId: int("shiftId"),
  total: int("total").default(0).notNull(),
  // Snapshot of the doctor consultation sold with this invoice.
  consultationType: mysqlEnum("consultationType", ["none", "general", "specialist"]).default("none").notNull(),
  consultationFee: int("consultationFee").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "cancelled", "refunded"]).default("pending").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 40 }),
  paymentBank: varchar("paymentBank", { length: 120 }),
  transactionNumber: varchar("transactionNumber", { length: 4 }),
  createdBy: int("createdBy"),
  paidAt: timestamp("paidAt"),
  refundedAt: timestamp("refundedAt"),
  refundedBy: int("refundedBy"),
  refundReason: varchar("refundReason", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const paymentBanks = mysqlTable("payment_banks", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const invoiceItems = mysqlTable("invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  labTestId: int("labTestId"),
  description: varchar("description", { length: 180 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: int("unitPrice").default(0).notNull(),
});

export const invoiceAdjustments = mysqlTable("invoice_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  type: mysqlEnum("type", ["add_test", "remove_test", "edit", "cancel", "refund"]).notNull(),
  amountBefore: int("amountBefore").notNull(),
  amountAfter: int("amountAfter").notNull(),
  delta: int("delta").notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  metadataJson: text("metadataJson"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const labOrders = mysqlTable("lab_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 40 }).notNull().unique(),
  patientId: int("patientId").notNull(),
  invoiceId: int("invoiceId").notNull(),
  labTestId: int("labTestId").notNull(),
  status: mysqlEnum("status", ["queued", "in_progress", "completed", "blocked"]).default("blocked").notNull(),
  collectedAt: timestamp("collectedAt"),
  resultIssuedAt: timestamp("resultIssuedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const labResults = mysqlTable("lab_results", {
  id: int("id").autoincrement().primaryKey(),
  labOrderId: int("labOrderId").notNull().unique(),
  technicianUserId: int("technicianUserId"),
  valuesJson: text("valuesJson").notNull(),
  remarks: text("remarks"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const labResultDrafts = mysqlTable("lab_result_drafts", {
  id: int("id").autoincrement().primaryKey(),
  labOrderId: int("labOrderId").notNull(),
  technicianUserId: int("technicianUserId").notNull(),
  valuesJson: text("valuesJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("lab_result_drafts_order_unique").on(table.labOrderId)]);

export const cashierAttention = mysqlTable("cashier_attention", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  flaggedBy: int("flaggedBy").notNull(),
  flaggedAt: timestamp("flaggedAt").defaultNow().notNull(),
  note: varchar("note", { length: 500 }),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
}, (table) => [uniqueIndex("cashier_attention_invoice_unique").on(table.invoiceId), index("cashier_attention_open_idx").on(table.resolvedAt, table.flaggedAt)]);

export const staffMessages = mysqlTable("staff_messages", {
  id: int("id").autoincrement().primaryKey(),
  senderUserId: int("senderUserId").notNull(),
  body: varchar("body", { length: 1000 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("staff_messages_created_idx").on(table.createdAt)]);

/**
 * Staff roster managed by the operations supervisor: lab technicians and
 * cashiers are added here before they sign in. When a Manus account with the
 * same email signs in, its role is linked automatically.
 */
export const staffMembers = mysqlTable("staff_members", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("fullName", { length: 180 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 60 }),
  role: mysqlEnum("staffRole", ["cashier", "lab", "supervisor"]).notNull(),
  active: int("active").default(1).notNull(),
  userId: int("userId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("staff_members_email_unique").on(table.email)]);

/** Audit trail for price changes (catalog tests and consultation fees). */
export const priceChanges = mysqlTable("price_changes", {
  id: int("id").autoincrement().primaryKey(),
  entity: mysqlEnum("entity", ["lab_test", "consultation"]).notNull(),
  reference: varchar("reference", { length: 40 }).notNull(),
  oldPrice: int("oldPrice").notNull(),
  newPrice: int("newPrice").notNull(),
  changedBy: int("changedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
