CREATE TABLE `cashier_attention` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoiceId` integer NOT NULL,
	`flaggedBy` integer NOT NULL,
	`flaggedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`note` text,
	`resolvedBy` integer,
	`resolvedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cashier_attention_invoice_unique` ON `cashier_attention` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `cashier_attention_open_idx` ON `cashier_attention` (`resolvedAt`,`flaggedAt`);--> statement-breakpoint
CREATE TABLE `cbc_bridge_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`mode` text DEFAULT 'local' NOT NULL,
	`deviceIp` text DEFAULT '192.168.1.100' NOT NULL,
	`computerIp` text DEFAULT '192.168.1.111' NOT NULL,
	`listenPort` integer DEFAULT 5006 NOT NULL,
	`protocol` text DEFAULT 'mllp' NOT NULL,
	`transSelect` text DEFAULT 'Net' NOT NULL,
	`autoTrans` integer DEFAULT 1 NOT NULL,
	`subnet` text DEFAULT '255.255.255.0' NOT NULL,
	`tokenHash` text,
	`lastHeartbeat` integer,
	`lastMessageAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cbc_bridge_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sampleId` text NOT NULL,
	`patientNumber` text NOT NULL,
	`collectedAt` text,
	`messageControlId` text NOT NULL,
	`contentHash` text NOT NULL,
	`resultsJson` text NOT NULL,
	`receivedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cbc_bridge_samples_contentHash_unique` ON `cbc_bridge_samples` (`contentHash`);--> statement-breakpoint
CREATE INDEX `cbc_bridge_samples_sample_idx` ON `cbc_bridge_samples` (`sampleId`);--> statement-breakpoint
CREATE INDEX `cbc_bridge_samples_received_idx` ON `cbc_bridge_samples` (`receivedAt`);--> statement-breakpoint
CREATE TABLE `clinic_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`logoUrl` text,
	`address` text,
	`phone` text,
	`email` text,
	`website` text,
	`footerText` text,
	`consultationGeneralPrice` integer DEFAULT 35000 NOT NULL,
	`consultationSpecialistPrice` integer DEFAULT 50000 NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoiceId` integer NOT NULL,
	`type` text NOT NULL,
	`amountBefore` integer NOT NULL,
	`amountAfter` integer NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`metadataJson` text,
	`createdBy` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoiceId` integer NOT NULL,
	`labTestId` integer,
	`description` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unitPrice` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoiceNumber` text NOT NULL,
	`patientId` integer NOT NULL,
	`shiftId` integer,
	`total` integer DEFAULT 0 NOT NULL,
	`consultationType` text DEFAULT 'none' NOT NULL,
	`consultationFee` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`paymentMethod` text,
	`paymentBank` text,
	`transactionNumber` text,
	`createdBy` integer,
	`paidAt` integer,
	`refundedAt` integer,
	`refundedBy` integer,
	`refundReason` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoiceNumber_unique` ON `invoices` (`invoiceNumber`);--> statement-breakpoint
CREATE TABLE `lab_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderNumber` text NOT NULL,
	`patientId` integer NOT NULL,
	`invoiceId` integer NOT NULL,
	`labTestId` integer NOT NULL,
	`status` text DEFAULT 'blocked' NOT NULL,
	`collectedAt` integer,
	`resultIssuedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_orders_orderNumber_unique` ON `lab_orders` (`orderNumber`);--> statement-breakpoint
CREATE TABLE `lab_result_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`labOrderId` integer NOT NULL,
	`technicianUserId` integer NOT NULL,
	`valuesJson` text NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_result_drafts_order_unique` ON `lab_result_drafts` (`labOrderId`);--> statement-breakpoint
CREATE TABLE `lab_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`labOrderId` integer NOT NULL,
	`technicianUserId` integer,
	`valuesJson` text NOT NULL,
	`remarks` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_results_labOrderId_unique` ON `lab_results` (`labOrderId`);--> statement-breakpoint
CREATE TABLE `lab_tests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`nameAr` text NOT NULL,
	`nameEn` text,
	`category` text,
	`sample` text,
	`turnaround` text,
	`price` integer DEFAULT 0 NOT NULL,
	`fieldsJson` text,
	`active` integer DEFAULT 1 NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_tests_code_unique` ON `lab_tests` (`code`);--> statement-breakpoint
CREATE TABLE `local_login_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`passwordHash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`createdBy` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_login_accounts_user_unique` ON `local_login_accounts` (`userId`);--> statement-breakpoint
CREATE TABLE `patients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patientNumber` text NOT NULL,
	`name` text NOT NULL,
	`gender` text NOT NULL,
	`age` integer,
	`phone` text,
	`address` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patients_patientNumber_unique` ON `patients` (`patientNumber`);--> statement-breakpoint
CREATE TABLE `payment_banks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_banks_name_unique` ON `payment_banks` (`name`);--> statement-breakpoint
CREATE TABLE `preview_login_accounts` (
	`role` text PRIMARY KEY NOT NULL,
	`passwordHash` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`reference` text NOT NULL,
	`oldPrice` integer NOT NULL,
	`newPrice` integer NOT NULL,
	`changedBy` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shift_handoffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shiftId` integer NOT NULL,
	`staffRole` text NOT NULL,
	`originalUserId` integer NOT NULL,
	`substituteUserId` integer NOT NULL,
	`reason` text NOT NULL,
	`approvedBy` integer NOT NULL,
	`approvedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_handoffs_shift_role_unique` ON `shift_handoffs` (`shiftId`,`staffRole`);--> statement-breakpoint
CREATE INDEX `shift_handoffs_shift_idx` ON `shift_handoffs` (`shiftId`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shiftDate` text NOT NULL,
	`shiftType` text NOT NULL,
	`sequenceStart` integer DEFAULT 1 NOT NULL,
	`sequenceCurrent` integer DEFAULT 0 NOT NULL,
	`cashierUserId` integer,
	`labUserId` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`openedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`closedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shifts_date_type_unique` ON `shifts` (`shiftDate`,`shiftType`);--> statement-breakpoint
CREATE TABLE `staff_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fullName` text NOT NULL,
	`email` text,
	`phone` text,
	`staffRole` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`userId` integer,
	`createdBy` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_members_email_unique` ON `staff_members` (`email`);--> statement-breakpoint
CREATE TABLE `staff_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`senderUserId` integer NOT NULL,
	`body` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `staff_messages_created_idx` ON `staff_messages` (`createdAt`);--> statement-breakpoint
CREATE TABLE `user_shift_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shiftId` integer NOT NULL,
	`userId` integer NOT NULL,
	`assignedBy` integer NOT NULL,
	`assignedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_shift_assignments_unique` ON `user_shift_assignments` (`shiftId`,`userId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`username` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`lastSignedIn` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);