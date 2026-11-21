CREATE TABLE `clinic_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`logoUrl` varchar(500),
	`address` varchar(255),
	`phone` varchar(120),
	`email` varchar(180),
	`website` varchar(180),
	`footerText` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clinic_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`labTestId` int,
	`description` varchar(180) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` int NOT NULL DEFAULT 0,
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceNumber` varchar(40) NOT NULL,
	`patientId` int NOT NULL,
	`shiftId` int,
	`total` int NOT NULL DEFAULT 0,
	`status` enum('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
	`paymentMethod` varchar(40),
	`createdBy` int,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `lab_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(40) NOT NULL,
	`patientId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`labTestId` int NOT NULL,
	`status` enum('queued','in_progress','completed','blocked') NOT NULL DEFAULT 'blocked',
	`collectedAt` timestamp,
	`resultIssuedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `lab_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`labOrderId` int NOT NULL,
	`technicianUserId` int,
	`valuesJson` text NOT NULL,
	`remarks` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_results_labOrderId_unique` UNIQUE(`labOrderId`)
);
--> statement-breakpoint
CREATE TABLE `lab_tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`nameAr` varchar(180) NOT NULL,
	`nameEn` varchar(180),
	`category` varchar(100),
	`sample` varchar(120),
	`price` int NOT NULL DEFAULT 0,
	`fieldsJson` text,
	`active` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_tests_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_tests_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientNumber` varchar(32) NOT NULL,
	`name` varchar(180) NOT NULL,
	`gender` enum('male','female') NOT NULL,
	`age` int,
	`phone` varchar(60),
	`address` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_patientNumber_unique` UNIQUE(`patientNumber`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shiftDate` varchar(10) NOT NULL,
	`shiftType` enum('morning','evening','night') NOT NULL,
	`sequenceStart` int NOT NULL DEFAULT 1,
	`sequenceCurrent` int NOT NULL DEFAULT 0,
	`cashierUserId` int,
	`labUserId` int,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`openedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','cashier','lab','supervisor') NOT NULL DEFAULT 'user';