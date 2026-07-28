-- Meta Ads v16 — 5 tabel pendukung untuk daily report job
-- (fb_act dan fb_token sudah dibuat di migration 0019/0020)

-- ─── fb_act_daily_data ─────────────────────────────────────────────
CREATE TABLE `fb_act_daily_data` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fb_act_id` int DEFAULT NULL,
  `act_id` varchar(64) NOT NULL,
  `date` date NOT NULL,
  `balance` decimal(20,2) DEFAULT NULL,
  `amount_spent` decimal(20,2) DEFAULT NULL,
  `spend_cap` decimal(20,2) DEFAULT NULL,
  `effective_balance` decimal(20,2) DEFAULT NULL,
  `balance_type` varchar(32) DEFAULT NULL,
  `spending_limit` decimal(20,2) DEFAULT NULL,
  `outstanding_balance` decimal(20,2) DEFAULT NULL,
  `status_level` tinyint NOT NULL DEFAULT 0,
  `warning_message` text,
  `spend` decimal(20,2) DEFAULT NULL,
  `impressions` int DEFAULT NULL,
  `reach` int DEFAULT NULL,
  `frequency` decimal(10,4) DEFAULT NULL,
  `link_clicks` int DEFAULT NULL,
  `ctr` decimal(10,4) DEFAULT NULL,
  `cpm` decimal(20,2) DEFAULT NULL,
  `cpc` decimal(20,2) DEFAULT NULL,
  `data_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fb_act_daily_data_act_date_unique` (`act_id`,`date`),
  KEY `fb_act_daily_data_act_idx` (`act_id`),
  KEY `fb_act_daily_data_date_idx` (`date`),
  KEY `fb_act_daily_data_fb_act_id_fk` (`fb_act_id`),
  CONSTRAINT `fb_act_daily_data_fb_act_id_fk` FOREIGN KEY (`fb_act_id`) REFERENCES `fb_act` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── fb_act_result_config ──────────────────────────────────────────
CREATE TABLE `fb_act_result_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fb_act_id` int DEFAULT NULL,
  `act_id` varchar(64) NOT NULL,
  `action_type` varchar(128) NOT NULL,
  `result_type` varchar(32) NOT NULL,
  `label` varchar(128) NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_fallback` tinyint NOT NULL DEFAULT 0,
  `data_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fb_act_result_config_act_action_unique` (`act_id`,`action_type`),
  KEY `fb_act_result_config_act_idx` (`act_id`),
  KEY `fb_act_result_config_fb_act_id_fk` (`fb_act_id`),
  CONSTRAINT `fb_act_result_config_fb_act_id_fk` FOREIGN KEY (`fb_act_id`) REFERENCES `fb_act` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── fb_act_campaign_daily_insights ────────────────────────────────
CREATE TABLE `fb_act_campaign_daily_insights` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fb_act_id` int DEFAULT NULL,
  `act_id` varchar(64) NOT NULL,
  `date` date NOT NULL,
  `campaign_id` varchar(64) NOT NULL,
  `campaign_name` varchar(255) DEFAULT NULL,
  `spend` decimal(20,2) DEFAULT NULL,
  `link_clicks` int DEFAULT NULL,
  `is_traffic_campaign` tinyint NOT NULL DEFAULT 0,
  `resolved_primary_action_type` varchar(128) DEFAULT NULL,
  `data_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fb_act_campaign_daily_act_date_camp_unique` (`act_id`,`date`,`campaign_id`),
  KEY `fb_act_campaign_daily_act_idx` (`act_id`),
  KEY `fb_act_campaign_daily_date_idx` (`date`),
  KEY `fb_act_campaign_daily_fb_act_id_fk` (`fb_act_id`),
  CONSTRAINT `fb_act_campaign_daily_fb_act_id_fk` FOREIGN KEY (`fb_act_id`) REFERENCES `fb_act` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── fb_act_result_breakdown_daily ─────────────────────────────────
CREATE TABLE `fb_act_result_breakdown_daily` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fb_act_id` int DEFAULT NULL,
  `act_id` varchar(64) NOT NULL,
  `date` date NOT NULL,
  `label` varchar(128) NOT NULL,
  `result_type` tinyint NOT NULL DEFAULT 0,
  `results` int NOT NULL DEFAULT 0,
  `spent` decimal(20,2) DEFAULT NULL,
  `total_purchase` int DEFAULT NULL,
  `purchase_value` decimal(20,2) DEFAULT NULL,
  `cost_per_purchase` decimal(20,2) DEFAULT NULL,
  `roas` decimal(10,4) DEFAULT NULL,
  `data_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fb_act_breakdown_act_date_label_unique` (`act_id`,`date`,`label`),
  KEY `fb_act_breakdown_act_idx` (`act_id`),
  KEY `fb_act_breakdown_date_idx` (`date`),
  KEY `fb_act_breakdown_fb_act_id_fk` (`fb_act_id`),
  CONSTRAINT `fb_act_breakdown_fb_act_id_fk` FOREIGN KEY (`fb_act_id`) REFERENCES `fb_act` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── fb_act_notifications_log ──────────────────────────────────────
CREATE TABLE `fb_act_notifications_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fb_act_id` int DEFAULT NULL,
  `act_id` varchar(64) NOT NULL,
  `date` date NOT NULL,
  `type` varchar(64) NOT NULL,
  `data_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fb_act_notif_log_act_idx` (`act_id`),
  KEY `fb_act_notif_log_date_idx` (`date`),
  KEY `fb_act_notif_log_type_idx` (`type`),
  KEY `fb_act_notif_log_fb_act_id_fk` (`fb_act_id`),
  CONSTRAINT `fb_act_notif_log_fb_act_id_fk` FOREIGN KEY (`fb_act_id`) REFERENCES `fb_act` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── fb_act_report_runs ────────────────────────────────────────────
CREATE TABLE `fb_act_report_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `finished_at` timestamp NULL DEFAULT NULL,
  `accounts_total` int NOT NULL DEFAULT 0,
  `accounts_success` int NOT NULL DEFAULT 0,
  `accounts_failed` int NOT NULL DEFAULT 0,
  `data_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fb_act_report_runs_date_unique` (`date`),
  KEY `fb_act_report_runs_date_idx` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
