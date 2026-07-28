CREATE TABLE `meeting_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meeting_id` int NOT NULL,
	`user_id` int NOT NULL,
	CONSTRAINT `meeting_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `meeting_members` ADD CONSTRAINT `meeting_members_meeting_id_meetings_id_fk` FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meeting_members` ADD CONSTRAINT `meeting_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `meeting_members_meeting_idx` ON `meeting_members` (`meeting_id`);--> statement-breakpoint
CREATE INDEX `meeting_members_user_idx` ON `meeting_members` (`user_id`);