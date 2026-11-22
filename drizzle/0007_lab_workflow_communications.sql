CREATE TABLE `lab_result_drafts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `labOrderId` int NOT NULL,
  `technicianUserId` int NOT NULL,
  `valuesJson` text NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `lab_result_drafts_id` PRIMARY KEY(`id`),
  CONSTRAINT `lab_result_drafts_order_unique` UNIQUE(`labOrderId`)
);
--> statement-breakpoint
CREATE TABLE `cashier_attention` (
  `id` int AUTO_INCREMENT NOT NULL,
  `invoiceId` int NOT NULL,
  `flaggedBy` int NOT NULL,
  `flaggedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` varchar(500),
  `resolvedBy` int,
  `resolvedAt` timestamp NULL,
  CONSTRAINT `cashier_attention_id` PRIMARY KEY(`id`),
  CONSTRAINT `cashier_attention_invoice_unique` UNIQUE(`invoiceId`),
  INDEX `cashier_attention_open_idx` (`resolvedAt`, `flaggedAt`)
);
--> statement-breakpoint
CREATE TABLE `staff_messages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `senderUserId` int NOT NULL,
  `body` varchar(1000) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `staff_messages_id` PRIMARY KEY(`id`),
  INDEX `staff_messages_created_idx` (`createdAt`)
);
