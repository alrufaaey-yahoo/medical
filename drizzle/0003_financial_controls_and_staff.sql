ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','cashier','lab','supervisor','accountant') NOT NULL DEFAULT 'user';

ALTER TABLE `invoices`
  MODIFY COLUMN `status` enum('pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
  ADD COLUMN `refundedAt` timestamp NULL,
  ADD COLUMN `refundedBy` int NULL,
  ADD COLUMN `refundReason` varchar(500) NULL;

CREATE TABLE `invoice_adjustments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `invoiceId` int NOT NULL,
  `type` enum('add_test','remove_test','edit','cancel','refund') NOT NULL,
  `amountBefore` int NOT NULL,
  `amountAfter` int NOT NULL,
  `delta` int NOT NULL,
  `reason` varchar(500) NOT NULL,
  `metadataJson` text,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `invoice_adjustments_id` PRIMARY KEY(`id`)
);

CREATE TABLE `user_shift_assignments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `shiftId` int NOT NULL,
  `userId` int NOT NULL,
  `assignedBy` int NOT NULL,
  `assignedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `user_shift_assignments_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_shift_assignments_unique` UNIQUE(`shiftId`,`userId`)
);
***
