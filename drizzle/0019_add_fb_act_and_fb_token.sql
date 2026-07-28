-- Migration: add fb_act and fb_token tables
-- Created: 2026-04-27

CREATE TABLE `fb_act` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customer_id` int NOT NULL,
  `subscription_id` int NOT NULL,
  `token_id` int,
  `act_id` varchar(191) NOT NULL,
  `act_name` varchar(255),
  `name` varchar(255),
  `data_json` json,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fb_act_id` PRIMARY KEY(`id`)
);

CREATE INDEX `fb_act_customer_idx` ON `fb_act` (`customer_id`);
CREATE INDEX `fb_act_subscription_idx` ON `fb_act` (`subscription_id`);
CREATE INDEX `fb_act_act_id_idx` ON `fb_act` (`act_id`);

ALTER TABLE `fb_act`
  ADD CONSTRAINT `fb_act_customer_id_customers_id_fk`
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `fb_act`
  ADD CONSTRAINT `fb_act_subscription_id_subscriptions_id_fk`
  FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `fb_act`
  ADD CONSTRAINT `fb_act_token_id_fb_token_id_fk`
  FOREIGN KEY (`token_id`) REFERENCES `fb_token`(`id`) ON DELETE set null ON UPDATE no action;

CREATE TABLE `fb_token` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `token` text NOT NULL,
  `status` tinyint NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fb_token_id` PRIMARY KEY(`id`)
);

CREATE INDEX `fb_token_user_idx` ON `fb_token` (`user_id`);
CREATE INDEX `fb_token_status_idx` ON `fb_token` (`status`);

ALTER TABLE `fb_token`
  ADD CONSTRAINT `fb_token_user_id_users_id_fk`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
