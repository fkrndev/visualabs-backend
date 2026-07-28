ALTER TABLE `chrome_histories` DROP FOREIGN KEY `chrome_histories_customer_id_customers_id_fk`;
--> statement-breakpoint
ALTER TABLE `chrome_histories` MODIFY COLUMN `customer_id` int;--> statement-breakpoint
ALTER TABLE `chrome_histories` ADD CONSTRAINT `chrome_histories_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;