-- Team Skill Hub — registry skill Hermes milik tim.
-- Lihat docs/plan-hermes/manage-skill.md.
--
-- `content` sengaja mediumtext, BUKAN text: Hermes membatasi SKILL.md di
-- 100.000 karakter, yang pada teks non-ASCII bisa melewati batas 65.535 byte
-- milik `text` dan terpotong tanpa error.

CREATE TABLE `team_skills` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(150) NOT NULL,
  `category` varchar(100),
  `description` varchar(500),
  `version` varchar(32),
  `tags` json,
  `content` mediumtext NOT NULL,
  `content_hash` varchar(64) NOT NULL,
  `author_user_id` int NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'published',
  `install_count` int NOT NULL DEFAULT 0,
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0',
  `rating_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `team_skills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_skills_name_uq` ON `team_skills` (`name`);
--> statement-breakpoint
CREATE INDEX `team_skills_status_idx` ON `team_skills` (`status`);
--> statement-breakpoint
CREATE INDEX `team_skills_author_idx` ON `team_skills` (`author_user_id`);
--> statement-breakpoint
ALTER TABLE `team_skills` ADD CONSTRAINT `team_skills_author_user_id_users_id_fk`
  FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE `team_skill_ratings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `skill_id` int NOT NULL,
  `user_id` int NOT NULL,
  `rating` int NOT NULL,
  `comment` varchar(1000),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `team_skill_ratings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_skill_ratings_uq` ON `team_skill_ratings` (`skill_id`,`user_id`);
--> statement-breakpoint
ALTER TABLE `team_skill_ratings` ADD CONSTRAINT `team_skill_ratings_skill_id_team_skills_id_fk`
  FOREIGN KEY (`skill_id`) REFERENCES `team_skills`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `team_skill_ratings` ADD CONSTRAINT `team_skill_ratings_user_id_users_id_fk`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE `team_skill_usage` (
  `id` int AUTO_INCREMENT NOT NULL,
  `skill_id` int NOT NULL,
  `user_id` int NOT NULL,
  `use_count` int NOT NULL DEFAULT 0,
  `view_count` int NOT NULL DEFAULT 0,
  `patch_count` int NOT NULL DEFAULT 0,
  `last_used_at` timestamp NULL,
  `reported_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `team_skill_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_skill_usage_uq` ON `team_skill_usage` (`skill_id`,`user_id`);
--> statement-breakpoint
ALTER TABLE `team_skill_usage` ADD CONSTRAINT `team_skill_usage_skill_id_team_skills_id_fk`
  FOREIGN KEY (`skill_id`) REFERENCES `team_skills`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `team_skill_usage` ADD CONSTRAINT `team_skill_usage_user_id_users_id_fk`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
