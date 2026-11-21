ALTER TABLE `clinic_settings`
  ADD COLUMN `consultationGeneralPrice` int NOT NULL DEFAULT 35000,
  ADD COLUMN `consultationSpecialistPrice` int NOT NULL DEFAULT 50000;
--> statement-breakpoint
ALTER TABLE `invoices`
  ADD COLUMN `consultationType` enum('none','general','specialist') NOT NULL DEFAULT 'none',
  ADD COLUMN `consultationFee` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `lab_tests` ADD COLUMN `turnaround` varchar(60);
--> statement-breakpoint
CREATE TABLE `staff_members` (
  `id` int AUTO_INCREMENT NOT NULL,
  `fullName` varchar(180) NOT NULL,
  `email` varchar(320),
  `phone` varchar(60),
  `staffRole` enum('cashier','lab','supervisor') NOT NULL,
  `active` int NOT NULL DEFAULT 1,
  `userId` int,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `staff_members_id` PRIMARY KEY(`id`),
  CONSTRAINT `staff_members_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `price_changes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `entity` enum('lab_test','consultation') NOT NULL,
  `reference` varchar(40) NOT NULL,
  `oldPrice` int NOT NULL,
  `newPrice` int NOT NULL,
  `changedBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `price_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
UPDATE `invoices` `i`
JOIN `invoice_items` `it` ON `it`.`invoiceId` = `i`.`id`
SET `i`.`consultationType` = 'general',
    `i`.`consultationFee` = `it`.`unitPrice`
WHERE `it`.`description` = 'المعاينة الطبية';
