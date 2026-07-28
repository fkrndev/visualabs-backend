ALTER TABLE `scorecard_data` DROP FOREIGN KEY `scorecard_data_kpi_id_scorecards_id_fk`;--> statement-breakpoint
DROP INDEX `scorecard_data_kpi_idx` ON `scorecard_data`;--> statement-breakpoint
ALTER TABLE `scorecard_data` CHANGE `kpi_id` `scorecard_id` int NOT NULL;--> statement-breakpoint
CREATE INDEX `scorecard_data_scorecard_idx` ON `scorecard_data` (`scorecard_id`);--> statement-breakpoint
ALTER TABLE `scorecard_data` ADD CONSTRAINT `scorecard_data_scorecard_id_scorecards_id_fk` FOREIGN KEY (`scorecard_id`) REFERENCES `scorecards`(`id`) ON DELETE cascade ON UPDATE no action;
