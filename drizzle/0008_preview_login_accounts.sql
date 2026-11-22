CREATE TABLE IF NOT EXISTS `preview_login_accounts` (
  `role` enum('admin','supervisor','cashier','lab') NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role`)
);
