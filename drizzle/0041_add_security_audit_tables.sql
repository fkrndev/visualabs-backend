-- Security & audit tables declared in schema.ts but missing from prior
-- hand-written migrations (rate limiting, account lockout, audit trail).
-- These are referenced by middleware (rate limit cleanup, account lockout
-- cleanup) and must exist even when the feature flags are off.

CREATE TABLE `rate_limit_entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `identifier` varchar(255) NOT NULL,
  `count` int NOT NULL DEFAULT 0,
  `reset_time` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `rate_limit_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_identifier_unique` ON `rate_limit_entries` (`identifier`);
--> statement-breakpoint
CREATE INDEX `rate_limit_reset_time_idx` ON `rate_limit_entries` (`reset_time`);
--> statement-breakpoint

CREATE TABLE `account_lockout_entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `identifier` varchar(255) NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `lock_until` timestamp,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `account_lockout_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_lockout_identifier_unique` ON `account_lockout_entries` (`identifier`);
--> statement-breakpoint
CREATE INDEX `account_lockout_lock_until_idx` ON `account_lockout_entries` (`lock_until`);
--> statement-breakpoint

CREATE TABLE `audit_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int,
  `customer_id` int,
  `action` varchar(50) NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` int,
  `changes` json,
  `ip_address` varchar(45),
  `user_agent` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `audit_logs_user_idx` ON `audit_logs` (`user_id`);
--> statement-breakpoint
CREATE INDEX `audit_logs_customer_idx` ON `audit_logs` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`, `entity_id`);
--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);
