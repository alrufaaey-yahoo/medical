ALTER TABLE `local_login_accounts`
  ADD COLUMN `mustChangePassword` int NOT NULL DEFAULT 0,
  ADD COLUMN `failedAttempts` int NOT NULL DEFAULT 0,
  ADD COLUMN `lockedUntil` timestamp NULL;

ALTER TABLE `patients`
  ADD COLUMN `registeredBy` int NULL,
  ADD COLUMN `registeredShiftId` int NULL,
  ADD COLUMN `shiftDate` varchar(10) NULL,
  ADD INDEX `patients_registered_by_idx` (`registeredBy`, `shiftDate`),
  ADD INDEX `patients_registered_shift_idx` (`registeredShiftId`, `createdAt`);

ALTER TABLE `invoices`
  MODIFY COLUMN `transactionNumber` varchar(64) NULL,
  ADD COLUMN `shiftDate` varchar(10) NULL,
  ADD COLUMN `collectedBy` int NULL,
  ADD COLUMN `collectedShiftId` int NULL,
  ADD COLUMN `collectedAt` timestamp NULL,
  ADD INDEX `invoices_created_by_shift_idx` (`createdBy`, `shiftId`, `shiftDate`),
  ADD INDEX `invoices_collected_by_shift_idx` (`collectedBy`, `collectedShiftId`, `collectedAt`),
  ADD INDEX `invoices_shift_created_idx` (`shiftId`, `createdAt`);

CREATE TABLE `audit_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `actorId` int NULL,
  `action` varchar(80) NOT NULL,
  `entity` varchar(80) NOT NULL,
  `entityId` int NULL,
  `beforeJson` text NULL,
  `afterJson` text NULL,
  `shiftId` int NULL,
  `reason` varchar(500) NULL,
  `ipAddress` varchar(45) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `audit_log_id` PRIMARY KEY (`id`),
  INDEX `audit_log_entity_idx` (`entity`, `entityId`, `createdAt`),
  INDEX `audit_log_actor_idx` (`actorId`, `createdAt`)
);
