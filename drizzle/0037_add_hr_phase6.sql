-- HR Fase 6 (deps ESS): pengumuman, audit log, notifikasi in-app. Single-tenant.
-- Apply manual ke DB production.

CREATE TABLE `announcements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `content` LONGTEXT NULL,
  `category` TINYINT NOT NULL DEFAULT 0,
  `target` TINYINT NOT NULL DEFAULT 0,
  `target_ids` JSON NULL,
  `attachment` VARCHAR(500) NULL,
  `published_at` TIMESTAMP NULL,
  `expired_at` TIMESTAMP NULL,
  `created_by` INT NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `announcements_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE `announcement_reads` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `announcement_id` INT NOT NULL,
  `employee_id` INT NOT NULL,
  `read_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `announcement_reads_announcement_fk` FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON DELETE CASCADE,
  CONSTRAINT `announcement_reads_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `announcement_reads_unique` ON `announcement_reads` (`announcement_id`, `employee_id`);

CREATE TABLE `activity_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `action` TINYINT NOT NULL,
  `module` VARCHAR(64) NULL,
  `reference_id` INT NULL,
  `old_value` JSON NULL,
  `new_value` JSON NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `activity_logs_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `activity_logs_user_idx` ON `activity_logs` (`user_id`);
CREATE INDEX `activity_logs_module_ref_idx` ON `activity_logs` (`module`, `reference_id`);

CREATE TABLE `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NULL,
  `type` TINYINT NOT NULL DEFAULT 0,
  `module` VARCHAR(64) NULL,
  `reference_id` INT NULL,
  `is_read` TINYINT NOT NULL DEFAULT 0,
  `read_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `notifications_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);
CREATE INDEX `notifications_unread_idx` ON `notifications` (`user_id`, `is_read`);
