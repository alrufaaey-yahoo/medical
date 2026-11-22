CREATE TABLE IF NOT EXISTS `cbc_bridge_config` (
  `id` int NOT NULL PRIMARY KEY,
  `enabled` int NOT NULL DEFAULT 0,
  `mode` enum('local','hosted') NOT NULL DEFAULT 'local',
  `deviceIp` varchar(45) NOT NULL DEFAULT '192.168.1.100',
  `computerIp` varchar(45) NOT NULL DEFAULT '192.168.1.111',
  `listenPort` int NOT NULL DEFAULT 5006,
  `protocol` enum('mllp','raw-idle') NOT NULL DEFAULT 'mllp',
  `transSelect` varchar(32) NOT NULL DEFAULT 'Net',
  `autoTrans` int NOT NULL DEFAULT 1,
  `subnet` varchar(45) NOT NULL DEFAULT '255.255.255.0',
  `tokenHash` varchar(64) NULL,
  `lastHeartbeat` timestamp NULL,
  `lastMessageAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cbc_bridge_samples` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sampleId` varchar(128) NOT NULL,
  `patientNumber` varchar(64) NOT NULL,
  `collectedAt` varchar(40) NULL,
  `messageControlId` varchar(128) NOT NULL,
  `contentHash` varchar(64) NOT NULL UNIQUE,
  `resultsJson` text NOT NULL,
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `cbc_bridge_samples_sample_idx` (`sampleId`),
  INDEX `cbc_bridge_samples_received_idx` (`receivedAt`)
);
