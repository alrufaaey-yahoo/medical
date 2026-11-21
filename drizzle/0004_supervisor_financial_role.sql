UPDATE `users` SET `role` = 'supervisor' WHERE `role` = 'accountant';
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','cashier','lab','supervisor') NOT NULL DEFAULT 'user';
