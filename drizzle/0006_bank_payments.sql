ALTER TABLE `invoices`
  ADD COLUMN `paymentBank` varchar(120) NULL,
  ADD COLUMN `transactionNumber` varchar(4) NULL;
--> statement-breakpoint
CREATE TABLE `payment_banks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(120) NOT NULL,
  `active` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `payment_banks_id` PRIMARY KEY(`id`),
  CONSTRAINT `payment_banks_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
INSERT INTO `payment_banks` (`name`, `active`) VALUES ('بنكك', 1), ('أوكاش', 1), ('فوري', 1);
