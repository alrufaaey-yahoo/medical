ALTER TABLE `users`
  ADD COLUMN `username` varchar(32) NULL;

CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);

UPDATE `users` AS u
INNER JOIN `local_login_accounts` AS a ON a.`userId` = u.`id`
SET u.`username` = CONCAT('staff', u.`id`)
WHERE u.`username` IS NULL;
