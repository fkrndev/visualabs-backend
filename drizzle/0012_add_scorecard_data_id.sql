ALTER TABLE `todos` ADD `scorecard_data_id` int;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD `scorecard_data_id` int;--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_scorecard_data_id_scorecard_data_id_fk` FOREIGN KEY (`scorecard_data_id`) REFERENCES `scorecard_data`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_repeat_histories` ADD CONSTRAINT `todo_rpt_hist_sc_data_id_fk` FOREIGN KEY (`scorecard_data_id`) REFERENCES `scorecard_data`(`id`) ON DELETE set null ON UPDATE no action;
