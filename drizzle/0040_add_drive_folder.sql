-- Google Drive List Directory: cache struktur folder/file Drive di DB lokal.
-- Sync on-demand per folder saat dibuka; upsert by google_id, hapus yang hilang via synced_at.

CREATE TABLE `drive_folder` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `parent_id` INT NOT NULL DEFAULT 0,
  `name` VARCHAR(512) NOT NULL,
  `drive_id` VARCHAR(128) NULL,
  `mime_type` VARCHAR(191) NOT NULL,
  `google_id` VARCHAR(191) NOT NULL,
  `parent_google_id` VARCHAR(191) NOT NULL,
  `web_view_link` VARCHAR(1024) NULL,
  `icon_link` VARCHAR(1024) NULL,
  `size_bytes` BIGINT NULL,
  `modified_time` TIMESTAMP NULL,
  `synced_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `drive_folder_google_id_uq` (`google_id`)
);

CREATE INDEX `drive_folder_parent_idx` ON `drive_folder` (`parent_id`);
CREATE INDEX `drive_folder_parent_google_idx` ON `drive_folder` (`parent_google_id`);

CREATE TABLE `drive_folder_client` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `folder_id` INT NOT NULL,
  `customer_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `drive_folder_client_folder_fk` FOREIGN KEY (`folder_id`) REFERENCES `drive_folder`(`id`) ON DELETE CASCADE,
  CONSTRAINT `drive_folder_client_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `drive_folder_client_uq` (`folder_id`, `customer_id`)
);

CREATE INDEX `drive_folder_client_customer_idx` ON `drive_folder_client` (`customer_id`);
