-- Migration: Add Shopee Optimization tables
-- Generated manually untuk PBI-4.1 (drizzle-kit interactive tidak support di Windows)
-- Additive migration: CREATE TABLE only, tidak ALTER table existing.

CREATE TABLE `shopee_scrape_sessions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `profile_id` varchar(36) NOT NULL,
  `profile_name` varchar(255),
  `status` enum('scraping','analyzing','done','failed') NOT NULL DEFAULT 'scraping',
  `error_reason` varchar(100),
  `shop_url` varchar(500),
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `shopee_sessions_profile_idx` (`profile_id`),
  INDEX `shopee_sessions_status_idx` (`status`)
);

CREATE TABLE `shopee_shops` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `session_id` int NOT NULL,
  `shop_name` varchar(255),
  `shop_slug` varchar(255),
  `shop_url` varchar(500),
  `shop_bio` text,
  `shop_stats` json,
  `seller_data` json,
  `logo_url` varchar(500),
  `logo_local` varchar(500),
  `banner_url` varchar(500),
  `banner_local` varchar(500),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `shopee_shops_session_uq` (`session_id`),
  CONSTRAINT `shopee_shops_session_fk` FOREIGN KEY (`session_id`) REFERENCES `shopee_scrape_sessions`(`id`) ON DELETE CASCADE
);

CREATE TABLE `shopee_products` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `session_id` int NOT NULL,
  `product_id` varchar(50),
  `title` varchar(500),
  `description` text,
  `price` varchar(100),
  `original_price` varchar(100),
  `categories` json,
  `variants` json,
  `stock` varchar(50),
  `rating` varchar(20),
  `sold` varchar(50),
  `product_url` varchar(500),
  `thumbnail_url` varchar(500),
  `thumbnail_local` varchar(500),
  `detail_error` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `shopee_products_session_idx` (`session_id`),
  INDEX `shopee_products_product_id_idx` (`product_id`),
  CONSTRAINT `shopee_products_session_fk` FOREIGN KEY (`session_id`) REFERENCES `shopee_scrape_sessions`(`id`) ON DELETE CASCADE
);

CREATE TABLE `shopee_images` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `session_id` int NOT NULL,
  `product_id` int,
  `type` enum('shop_logo','shop_banner','product_thumbnail','product_photo') NOT NULL,
  `original_url` varchar(500),
  `local_path` varchar(500) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `shopee_images_session_idx` (`session_id`),
  INDEX `shopee_images_product_idx` (`product_id`),
  INDEX `shopee_images_type_idx` (`type`),
  CONSTRAINT `shopee_images_session_fk` FOREIGN KEY (`session_id`) REFERENCES `shopee_scrape_sessions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `shopee_images_product_fk` FOREIGN KEY (`product_id`) REFERENCES `shopee_products`(`id`) ON DELETE CASCADE
);

CREATE TABLE `shopee_scores` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `session_id` int NOT NULL,
  `product_id` int,
  `item_type` enum('shop','product') NOT NULL,
  `banner_score` int,
  `logo_score` int,
  `bio_score` int,
  `title_score` int,
  `description_score` int,
  `photo_score` int,
  `total_score` int,
  `verdict` enum('good','needs_improvement','poor'),
  `feedback` json,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `shopee_scores_session_idx` (`session_id`),
  INDEX `shopee_scores_product_idx` (`product_id`),
  INDEX `shopee_scores_item_type_idx` (`item_type`),
  CONSTRAINT `shopee_scores_session_fk` FOREIGN KEY (`session_id`) REFERENCES `shopee_scrape_sessions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `shopee_scores_product_fk` FOREIGN KEY (`product_id`) REFERENCES `shopee_products`(`id`) ON DELETE CASCADE
);

CREATE TABLE `shopee_drafts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `session_id` int NOT NULL,
  `product_id` int,
  `item_type` enum('shop','product') NOT NULL,
  `draft_type` enum('shop_bio','product_title','product_description','template_prompt','composite_prompt') NOT NULL,
  `content` longtext,
  `generated_image_url` varchar(500),
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `shopee_drafts_session_idx` (`session_id`),
  INDEX `shopee_drafts_product_idx` (`product_id`),
  INDEX `shopee_drafts_status_idx` (`status`),
  INDEX `shopee_drafts_type_idx` (`draft_type`),
  CONSTRAINT `shopee_drafts_session_fk` FOREIGN KEY (`session_id`) REFERENCES `shopee_scrape_sessions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `shopee_drafts_product_fk` FOREIGN KEY (`product_id`) REFERENCES `shopee_products`(`id`) ON DELETE CASCADE
);
