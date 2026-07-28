CREATE TABLE `chrome_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`history_id` int NOT NULL,
	`type` int NOT NULL,
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chrome_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chrome_histories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`customer_id` int NOT NULL,
	`profile_id` int NOT NULL,
	`url` varchar(2048) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chrome_histories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chrome_htmls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`history_id` int NOT NULL,
	`html` longtext,
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chrome_htmls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chrome_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`customer_id` int NOT NULL,
	`name` varchar(191) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chrome_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chrome_whatsapp_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`whatsapp_id` int NOT NULL,
	`name` varchar(191),
	`phone` varchar(32),
	`waid` varchar(191),
	`lid` varchar(191),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chrome_whatsapp_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chrome_whatsapps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`phone` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chrome_whatsapps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`name` varchar(150),
	`email` varchar(191),
	`phone` varchar(32),
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_profiles_customer_unique` UNIQUE(`customer_id`)
);
--> statement-breakpoint
CREATE TABLE `customer_refresh_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `crt_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(191),
	`username` varchar(100),
	`phone` varchar(32),
	`fbid` varchar(191),
	`googleid` varchar(191),
	`password` varchar(255),
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_email_unique` UNIQUE(`email`),
	CONSTRAINT `customers_username_unique` UNIQUE(`username`),
	CONSTRAINT `customers_phone_unique` UNIQUE(`phone`),
	CONSTRAINT `customers_fbid_unique` UNIQUE(`fbid`),
	CONSTRAINT `customers_googleid_unique` UNIQUE(`googleid`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(150),
	`email` varchar(191),
	`phone` varchar(32),
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `profiles_user_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `refresh_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `setting_multiple` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`key` varchar(191) NOT NULL,
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `setting_multiple_id` PRIMARY KEY(`id`),
	CONSTRAINT `setting_multiple_name_key_unique` UNIQUE(`name`,`key`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(191) NOT NULL,
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `store_category_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`key` varchar(191) NOT NULL,
	`data_json` json,
	`is_show` int NOT NULL DEFAULT 1,
	`position` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_category_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_category_products_name_unique` UNIQUE(`name`),
	CONSTRAINT `store_category_products_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(191),
	`username` varchar(100),
	`phone` varchar(32),
	`fbid` varchar(191),
	`googleid` varchar(191),
	`password` varchar(255),
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `users_phone_unique` UNIQUE(`phone`),
	CONSTRAINT `users_fbid_unique` UNIQUE(`fbid`),
	CONSTRAINT `users_googleid_unique` UNIQUE(`googleid`)
);
--> statement-breakpoint
ALTER TABLE `chrome_actions` ADD CONSTRAINT `chrome_actions_history_id_chrome_histories_id_fk` FOREIGN KEY (`history_id`) REFERENCES `chrome_histories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chrome_histories` ADD CONSTRAINT `chrome_histories_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chrome_histories` ADD CONSTRAINT `chrome_histories_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chrome_histories` ADD CONSTRAINT `chrome_histories_profile_id_chrome_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `chrome_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chrome_htmls` ADD CONSTRAINT `chrome_htmls_history_id_chrome_histories_id_fk` FOREIGN KEY (`history_id`) REFERENCES `chrome_histories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chrome_profiles` ADD CONSTRAINT `chrome_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chrome_profiles` ADD CONSTRAINT `chrome_profiles_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chrome_whatsapp_contacts` ADD CONSTRAINT `chrome_whatsapp_contacts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chrome_whatsapp_contacts` ADD CONSTRAINT `chrome_whatsapp_contacts_whatsapp_id_chrome_whatsapps_id_fk` FOREIGN KEY (`whatsapp_id`) REFERENCES `chrome_whatsapps`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chrome_whatsapps` ADD CONSTRAINT `chrome_whatsapps_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_profiles` ADD CONSTRAINT `customer_profiles_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_refresh_tokens` ADD CONSTRAINT `customer_refresh_tokens_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `chrome_actions_history_idx` ON `chrome_actions` (`history_id`);--> statement-breakpoint
CREATE INDEX `chrome_histories_user_idx` ON `chrome_histories` (`user_id`);--> statement-breakpoint
CREATE INDEX `chrome_histories_customer_idx` ON `chrome_histories` (`customer_id`);--> statement-breakpoint
CREATE INDEX `chrome_histories_profile_idx` ON `chrome_histories` (`profile_id`);--> statement-breakpoint
CREATE INDEX `chrome_htmls_history_idx` ON `chrome_htmls` (`history_id`);--> statement-breakpoint
CREATE INDEX `chrome_profiles_user_idx` ON `chrome_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `chrome_profiles_customer_idx` ON `chrome_profiles` (`customer_id`);--> statement-breakpoint
CREATE INDEX `chrome_wa_contacts_user_idx` ON `chrome_whatsapp_contacts` (`user_id`);--> statement-breakpoint
CREATE INDEX `chrome_wa_contacts_whatsapp_idx` ON `chrome_whatsapp_contacts` (`whatsapp_id`);--> statement-breakpoint
CREATE INDEX `chrome_whatsapps_user_idx` ON `chrome_whatsapps` (`user_id`);--> statement-breakpoint
CREATE INDEX `customer_profiles_customer_idx` ON `customer_profiles` (`customer_id`);--> statement-breakpoint
CREATE INDEX `crt_customer_idx` ON `customer_refresh_tokens` (`customer_id`);--> statement-breakpoint
CREATE INDEX `profiles_user_idx` ON `profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `store_category_products_visible_idx` ON `store_category_products` (`is_show`,`position`);