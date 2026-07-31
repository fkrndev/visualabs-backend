CREATE TABLE `user_onboarding_progress` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `flow_key` VARCHAR(64) NOT NULL,
  `step_key` VARCHAR(64) NOT NULL,
  `manual` TINYINT NOT NULL DEFAULT 0,
  `completed_at` TIMESTAMP NULL,
  `dismissed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `uop_user_flow_step_unique` (`user_id`, `flow_key`, `step_key`),
  KEY `uop_user_idx` (`user_id`),
  KEY `uop_flow_idx` (`flow_key`),
  CONSTRAINT `uop_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
