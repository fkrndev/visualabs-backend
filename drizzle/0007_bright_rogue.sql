CREATE TABLE `meetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` int NOT NULL DEFAULT 0,
	`title` varchar(255) NOT NULL,
	`date` date,
	`customer_id` int,
	`subscription_id` int,
	`assigned_to` int,
	`members` text,
	`description` text,
	`summary` json,
	`action_items` json,
	`checklist` json,
	`new_target` json,
	`new_kpi` json,
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meetings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `performance_trackers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int,
	`subscription_id` int,
	`assigned_to` int,
	`pic` int NOT NULL DEFAULT 0,
	`date` date,
	`category` varchar(191),
	`description` text,
	`target_value` decimal(14,2),
	`actual_value` decimal(14,2),
	`unit` int NOT NULL DEFAULT 0,
	`achievement_rate` decimal(8,2),
	`status` int NOT NULL DEFAULT 0,
	`action_items` json,
	`data_json` json,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `performance_trackers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repeat_performance_trackers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`performance_tracker_id` int NOT NULL,
	`type` int NOT NULL DEFAULT 0,
	`status` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repeat_performance_trackers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repeat_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`todo_id` int NOT NULL,
	`type` int NOT NULL DEFAULT 0,
	`status` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repeat_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticket_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`customer_id` int,
	`subscription_id` int,
	`assigned_to` int,
	`description` text,
	`status` int NOT NULL DEFAULT 0,
	`pending_on` int NOT NULL DEFAULT 0,
	`hold_since` timestamp,
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ticket_issues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `todo_repeat_histories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repeat_task_id` int NOT NULL,
	`type` int NOT NULL DEFAULT 3,
	`title` varchar(255) NOT NULL,
	`customer_id` int,
	`subscription_id` int,
	`assigned_to` int,
	`pic` int NOT NULL DEFAULT 0,
	`performance_tracker_id` int,
	`meeting_id` int,
	`ticket_issue_id` int,
	`description` text,
	`status` int NOT NULL DEFAULT 0,
	`sub_task` json,
	`checklist` json,
	`start_date` date,
	`due_date` date,
	`priority` int NOT NULL DEFAULT 1,
	`tags` text,
	`platform` varchar(191),
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `todo_repeat_histories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` int NOT NULL DEFAULT 3,
	`title` varchar(255) NOT NULL,
	`customer_id` int,
	`subscription_id` int,
	`assigned_to` int,
	`pic` int NOT NULL DEFAULT 0,
	`performance_tracker_id` int,
	`meeting_id` int,
	`ticket_issue_id` int,
	`description` text,
	`status` int NOT NULL DEFAULT 0,
	`sub_task` json,
	`checklist` json,
	`start_date` date,
	`due_date` date,
	`priority` int NOT NULL DEFAULT 1,
	`tags` text,
	`platform` varchar(191),
	`data_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `todos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `performance_trackers` ADD CONSTRAINT `performance_trackers_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `performance_trackers` ADD CONSTRAINT `performance_trackers_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `performance_trackers` ADD CONSTRAINT `performance_trackers_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repeat_performance_trackers` ADD CONSTRAINT `rpt_perf_tracker_perf_tracker_id_fk` FOREIGN KEY (`performance_tracker_id`) REFERENCES `performance_trackers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repeat_tasks` ADD CONSTRAINT `repeat_tasks_todo_id_todos_id_fk` FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_issues` ADD CONSTRAINT `ticket_issues_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_issues` ADD CONSTRAINT `ticket_issues_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_issues` ADD CONSTRAINT `ticket_issues_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD CONSTRAINT `todo_repeat_histories_repeat_task_id_repeat_tasks_id_fk` FOREIGN KEY (`repeat_task_id`) REFERENCES `repeat_tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD CONSTRAINT `todo_repeat_histories_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD CONSTRAINT `todo_repeat_histories_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD CONSTRAINT `todo_repeat_histories_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD CONSTRAINT `todo_rpt_hist_perf_tracker_id_fk` FOREIGN KEY (`performance_tracker_id`) REFERENCES `performance_trackers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD CONSTRAINT `todo_repeat_histories_meeting_id_meetings_id_fk` FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD CONSTRAINT `todo_repeat_histories_ticket_issue_id_ticket_issues_id_fk` FOREIGN KEY (`ticket_issue_id`) REFERENCES `ticket_issues`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_performance_tracker_id_performance_trackers_id_fk` FOREIGN KEY (`performance_tracker_id`) REFERENCES `performance_trackers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_meeting_id_meetings_id_fk` FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_ticket_issue_id_ticket_issues_id_fk` FOREIGN KEY (`ticket_issue_id`) REFERENCES `ticket_issues`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `meetings_customer_idx` ON `meetings` (`customer_id`);--> statement-breakpoint
CREATE INDEX `meetings_subscription_idx` ON `meetings` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `meetings_assigned_idx` ON `meetings` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `meetings_date_idx` ON `meetings` (`date`);--> statement-breakpoint
CREATE INDEX `perf_tracker_customer_idx` ON `performance_trackers` (`customer_id`);--> statement-breakpoint
CREATE INDEX `perf_tracker_subscription_idx` ON `performance_trackers` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `perf_tracker_assigned_idx` ON `performance_trackers` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `perf_tracker_date_idx` ON `performance_trackers` (`date`);--> statement-breakpoint
CREATE INDEX `perf_tracker_category_idx` ON `performance_trackers` (`category`);--> statement-breakpoint
CREATE INDEX `repeat_perf_tracker_idx` ON `repeat_performance_trackers` (`performance_tracker_id`);--> statement-breakpoint
CREATE INDEX `repeat_task_todo_idx` ON `repeat_tasks` (`todo_id`);--> statement-breakpoint
CREATE INDEX `ticket_issues_customer_idx` ON `ticket_issues` (`customer_id`);--> statement-breakpoint
CREATE INDEX `ticket_issues_subscription_idx` ON `ticket_issues` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `ticket_issues_assigned_idx` ON `ticket_issues` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `ticket_issues_status_idx` ON `ticket_issues` (`status`);--> statement-breakpoint
CREATE INDEX `todo_repeat_hist_repeat_idx` ON `todo_repeat_histories` (`repeat_task_id`);--> statement-breakpoint
CREATE INDEX `todo_repeat_hist_customer_idx` ON `todo_repeat_histories` (`customer_id`);--> statement-breakpoint
CREATE INDEX `todo_repeat_hist_assigned_idx` ON `todo_repeat_histories` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `todo_repeat_hist_status_idx` ON `todo_repeat_histories` (`status`);--> statement-breakpoint
CREATE INDEX `todos_customer_idx` ON `todos` (`customer_id`);--> statement-breakpoint
CREATE INDEX `todos_subscription_idx` ON `todos` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `todos_assigned_idx` ON `todos` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `todos_status_idx` ON `todos` (`status`);--> statement-breakpoint
CREATE INDEX `todos_priority_idx` ON `todos` (`priority`);--> statement-breakpoint
CREATE INDEX `todos_type_idx` ON `todos` (`type`);--> statement-breakpoint
CREATE INDEX `todos_perf_tracker_idx` ON `todos` (`performance_tracker_id`);--> statement-breakpoint
CREATE INDEX `todos_meeting_idx` ON `todos` (`meeting_id`);--> statement-breakpoint
CREATE INDEX `todos_ticket_idx` ON `todos` (`ticket_issue_id`);