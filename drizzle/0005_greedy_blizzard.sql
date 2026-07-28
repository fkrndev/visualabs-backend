ALTER TABLE `chrome_profiles` DROP FOREIGN KEY `chrome_profiles_customer_id_customers_id_fk`;
--> statement-breakpoint
ALTER TABLE `chrome_profiles` MODIFY COLUMN `customer_id` int;--> statement-breakpoint
ALTER TABLE `chrome_profiles` ADD `uuid` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `chrome_profiles` ADD CONSTRAINT `chrome_profiles_uuid_unique` UNIQUE(`uuid`);--> statement-breakpoint
ALTER TABLE `chrome_profiles` ADD CONSTRAINT `chrome_profiles_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;