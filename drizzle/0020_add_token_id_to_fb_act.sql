-- Migration: add token_id column to fb_act
-- Created: 2026-04-27

ALTER TABLE `fb_act`
  ADD COLUMN `token_id` int NULL AFTER `subscription_id`;

ALTER TABLE `fb_act`
  ADD CONSTRAINT `fb_act_token_id_fb_token_id_fk`
  FOREIGN KEY (`token_id`) REFERENCES `fb_token`(`id`) ON DELETE set null ON UPDATE no action;

CREATE INDEX `fb_act_token_idx` ON `fb_act` (`token_id`);
