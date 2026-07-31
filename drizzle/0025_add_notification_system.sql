CREATE TABLE `notification_settings_global` (
  `user_id` INT NOT NULL,
  `telegram_username` VARCHAR(64),
  `extra_telegram_username` VARCHAR(64),
  `telegram_status` TINYINT NOT NULL DEFAULT 0,
  `telegram_verified_at` TIMESTAMP NULL,
  `quiet_hours_start` TINYINT NOT NULL DEFAULT 22,
  `quiet_hours_end` TINYINT NOT NULL DEFAULT 6,
  `daily_report_time` TINYINT NOT NULL DEFAULT 5,
  `language` VARCHAR(8) NOT NULL DEFAULT 'id',
  `paused_until` TIMESTAMP NULL,
  `paused_reason` VARCHAR(255),
  `data_json` JSON,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `notification_settings_global_user_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE `notification_preferences` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `fb_act_id` INT NULL,
  `notif_code` VARCHAR(64) NOT NULL,
  `enabled` TINYINT NOT NULL DEFAULT 1,
  `channel` VARCHAR(32) NOT NULL DEFAULT 'telegram',
  `data_json` JSON,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `notif_pref_user_act_code_unique` (`user_id`, `fb_act_id`, `notif_code`, `channel`),
  KEY `notif_pref_user_idx` (`user_id`),
  KEY `notif_pref_act_idx` (`fb_act_id`),
  CONSTRAINT `notif_pref_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `notif_pref_act_fk` FOREIGN KEY (`fb_act_id`) REFERENCES `fb_act`(`id`) ON DELETE CASCADE
);

CREATE TABLE `notification_log` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `fb_act_id` INT NULL,
  `notif_code` VARCHAR(64) NOT NULL,
  `mode` VARCHAR(1) NOT NULL,
  `dedupe_key` VARCHAR(191) NOT NULL,
  `recipient` VARCHAR(128) NOT NULL,
  `title` VARCHAR(255),
  `preview` VARCHAR(500),
  `body` TEXT,
  `status` ENUM('sent','failed','skipped') NOT NULL,
  `reason` VARCHAR(255),
  `read_at` TIMESTAMP NULL,
  `data_json` JSON,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `notif_log_dedupe_unique` (`dedupe_key`, `recipient`, `notif_code`),
  KEY `notif_log_user_date_idx` (`user_id`, `created_at`),
  KEY `notif_log_act_code_idx` (`fb_act_id`, `notif_code`),
  KEY `notif_log_unread_idx` (`user_id`, `read_at`),
  CONSTRAINT `notif_log_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `notif_log_act_fk` FOREIGN KEY (`fb_act_id`) REFERENCES `fb_act`(`id`) ON DELETE SET NULL
);
