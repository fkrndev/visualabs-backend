-- Client app (v-auto-client) — tabel untuk aplikasi client Visualabs.
-- client_updates        : feed update/saran dari tim advertiser ke client
-- client_update_reads   : read-tracking per client (badge notifikasi in-app)
-- asset_requests        : request aset media (video/foto/copy) ke tim client
-- platform_daily_metrics: metric harian TikTok/Shopee (input manual/CSV; Meta tetap dari fb_act_*)
-- subscriptions.phase   : fase iklan (learning|optimization|scaling|steady) untuk edukasi ekspektasi

CREATE TABLE `client_updates` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `customer_id` INT NOT NULL,
  `subscription_id` INT NULL,
  `author_user_id` INT NULL,
  `type` VARCHAR(32) NOT NULL DEFAULT 'info',
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NULL,
  `metric_snapshot` JSON NULL,
  `published_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `client_updates_id` PRIMARY KEY (`id`),
  CONSTRAINT `client_updates_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `client_updates_subscription_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL,
  CONSTRAINT `client_updates_author_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `client_updates_customer_published_idx` ON `client_updates` (`customer_id`, `published_at`);
CREATE INDEX `client_updates_subscription_idx` ON `client_updates` (`subscription_id`);

CREATE TABLE `client_update_reads` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `update_id` INT NOT NULL,
  `customer_id` INT NOT NULL,
  `read_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `client_update_reads_id` PRIMARY KEY (`id`),
  CONSTRAINT `client_update_reads_update_fk` FOREIGN KEY (`update_id`) REFERENCES `client_updates`(`id`) ON DELETE CASCADE,
  CONSTRAINT `client_update_reads_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `client_update_reads_unique` UNIQUE (`update_id`, `customer_id`)
);
CREATE INDEX `client_update_reads_customer_idx` ON `client_update_reads` (`customer_id`);

CREATE TABLE `asset_requests` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `customer_id` INT NOT NULL,
  `subscription_id` INT NULL,
  `requested_by` INT NULL,
  `type` VARCHAR(32) NOT NULL DEFAULT 'other',
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `due_date` DATE NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'requested',
  `delivered_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `asset_requests_id` PRIMARY KEY (`id`),
  CONSTRAINT `asset_requests_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  CONSTRAINT `asset_requests_subscription_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL,
  CONSTRAINT `asset_requests_requested_by_fk` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `asset_requests_customer_idx` ON `asset_requests` (`customer_id`, `status`);
CREATE INDEX `asset_requests_subscription_idx` ON `asset_requests` (`subscription_id`);

CREATE TABLE `platform_daily_metrics` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `subscription_id` INT NOT NULL,
  `platform` VARCHAR(32) NOT NULL,
  `date` DATE NOT NULL,
  `spend` DECIMAL(20,2) NULL,
  `revenue` DECIMAL(20,2) NULL,
  `orders` INT NULL,
  `clicks` INT NULL,
  `impressions` INT NULL,
  `note` VARCHAR(500) NULL,
  `source` VARCHAR(16) NOT NULL DEFAULT 'manual',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `platform_daily_metrics_id` PRIMARY KEY (`id`),
  CONSTRAINT `platform_daily_metrics_subscription_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `platform_daily_metrics_unique` UNIQUE (`subscription_id`, `platform`, `date`)
);
CREATE INDEX `platform_daily_metrics_sub_date_idx` ON `platform_daily_metrics` (`subscription_id`, `date`);

ALTER TABLE `subscriptions`
  ADD `phase` VARCHAR(32) NULL,
  ADD `phase_updated_at` TIMESTAMP NULL,
  ADD `phase_note` VARCHAR(255) NULL;
