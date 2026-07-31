CREATE TABLE `scorecards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int,
	`subscription_id` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`assigned_to` int,
	`pic` int NOT NULL DEFAULT 0,
	`category` int NOT NULL DEFAULT 0,
	`target_value` decimal(14,2),
	`unit_value` int NOT NULL DEFAULT 0,
	`unit_custom` varchar(100),
	`frequency` int NOT NULL DEFAULT 1,
	`show_on_scorecard` int NOT NULL DEFAULT 1,
	`status` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scorecards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scorecard_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kpi_id` int NOT NULL,
	`year` int NOT NULL,
	`month` int,
	`week` int,
	`day` int,
	`actual_value` decimal(14,2),
	`target_value` decimal(14,2),
	`status` int NOT NULL DEFAULT 1,
	`threshold` int NOT NULL DEFAULT 0,
	`entered_by` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scorecard_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `scorecards` ADD CONSTRAINT `scorecards_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scorecards` ADD CONSTRAINT `scorecards_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scorecards` ADD CONSTRAINT `scorecards_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scorecard_data` ADD CONSTRAINT `scorecard_data_kpi_id_scorecards_id_fk` FOREIGN KEY (`kpi_id`) REFERENCES `scorecards`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_scorecard_id_scorecards_id_fk` FOREIGN KEY (`scorecard_id`) REFERENCES `scorecards`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD CONSTRAINT `todo_rpt_hist_scorecard_id_fk` FOREIGN KEY (`scorecard_id`) REFERENCES `scorecards`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `scorecards_customer_idx` ON `scorecards` (`customer_id`);--> statement-breakpoint
CREATE INDEX `scorecards_subscription_idx` ON `scorecards` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `scorecards_assigned_idx` ON `scorecards` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `scorecards_status_idx` ON `scorecards` (`status`);--> statement-breakpoint
CREATE INDEX `scorecard_data_kpi_idx` ON `scorecard_data` (`kpi_id`);--> statement-breakpoint
CREATE INDEX `scorecard_data_period_idx` ON `scorecard_data` (`year`, `month`, `week`);--> statement-breakpoint
CREATE INDEX `scorecard_data_status_idx` ON `scorecard_data` (`status`);
