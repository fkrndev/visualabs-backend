ALTER TABLE `subscriptions` ADD `onboarding_date` date;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `onboarding_status` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `target` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `onboarding_updated_at` timestamp;