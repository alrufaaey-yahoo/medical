CREATE TABLE IF NOT EXISTS `shift_handoffs` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `shiftId` int NOT NULL,
  `staffRole` enum('cashier','lab') NOT NULL,
  `originalUserId` int NOT NULL,
  `substituteUserId` int NOT NULL,
  `reason` varchar(500) NOT NULL,
  `approvedBy` int NOT NULL,
  `approvedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `shift_handoffs_shift_role_unique` (`shiftId`,`staffRole`),
  INDEX `shift_handoffs_shift_idx` (`shiftId`)
);
