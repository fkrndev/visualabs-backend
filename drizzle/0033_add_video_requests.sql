-- Request Video AI: pustaka produk & talent reusable + antrian permintaan video AI.
-- Kuota 50 video/bulan per brand (subscription). Prompt 4-flow di-snapshot saat submit.

CREATE TABLE `client_products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `primary_photo_url` VARCHAR(512) NOT NULL,
  `gallery_json` JSON NULL,
  `description` TEXT NULL,
  `benefits` TEXT NULL,
  `archived` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `client_products_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
);
CREATE INDEX `client_products_customer_idx` ON `client_products` (`customer_id`);

CREATE TABLE `client_talents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `name` VARCHAR(255) NULL,
  `photo_url` VARCHAR(512) NOT NULL,
  `note` VARCHAR(512) NULL,
  `archived` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `client_talents_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
);
CREATE INDEX `client_talents_customer_idx` ON `client_talents` (`customer_id`);

CREATE TABLE `video_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `subscription_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `talent_id` INT NULL,
  `talent_brief_json` JSON NULL,
  `description` TEXT NULL,
  `benefits` TEXT NULL,
  `audience_json` JSON NULL,
  `content_style` VARCHAR(40) NOT NULL DEFAULT 'grwm',
  `platform` VARCHAR(40) NOT NULL DEFAULT 'tiktok',
  `requested_count` INT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'submitted',
  `prompts_json` JSON NULL,
  `delivered_urls` JSON NULL,
  `admin_note` TEXT NULL,
  `processed_by` INT NULL,
  `delivered_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `video_requests_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `video_requests_subscription_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `video_requests_product_fk` FOREIGN KEY (`product_id`) REFERENCES `client_products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `video_requests_talent_fk` FOREIGN KEY (`talent_id`) REFERENCES `client_talents`(`id`) ON DELETE SET NULL,
  CONSTRAINT `video_requests_processor_fk` FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `video_requests_subscription_idx` ON `video_requests` (`subscription_id`, `created_at`);
CREATE INDEX `video_requests_customer_idx` ON `video_requests` (`customer_id`);
CREATE INDEX `video_requests_status_idx` ON `video_requests` (`status`);
