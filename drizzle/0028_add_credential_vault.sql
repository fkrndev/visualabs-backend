CREATE TABLE `credentials` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `owner_id` INT NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `type` INT NOT NULL DEFAULT 0,
  `visibility` INT NOT NULL DEFAULT 0,
  `category` VARCHAR(100) NULL,
  `url` VARCHAR(500) NULL,
  `username` VARCHAR(191) NULL,
  `secret_enc` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  KEY `credentials_owner_idx` (`owner_id`),
  KEY `credentials_visibility_idx` (`visibility`),
  KEY `credentials_type_idx` (`type`),
  CONSTRAINT `credentials_owner_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE `credential_shares` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `credential_id` INT NOT NULL,
  `principal_type` INT NOT NULL,
  `principal_id` INT NOT NULL,
  `permission` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `cred_share_unique` (`credential_id`, `principal_type`, `principal_id`),
  KEY `cred_share_credential_idx` (`credential_id`),
  CONSTRAINT `cred_share_credential_fk` FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON DELETE CASCADE
);

CREATE TABLE `credential_access_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `credential_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `action` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  KEY `cred_log_credential_idx` (`credential_id`),
  KEY `cred_log_user_idx` (`user_id`)
);
