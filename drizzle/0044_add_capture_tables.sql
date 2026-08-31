-- Menyimpan data marketplace yang dilihat tim advertising.
-- Rencana lengkap: docs/vbox/capture-plan.md
--
-- Dua tabel, bukan satu tabel per metrik. `capture_endpoints` adalah katalog
-- sekaligus saklar; `capture_payloads` menyimpan isi response mentah apa adanya
-- (parsing dilakukan saat dibaca, mengikuti pola fb_act.data_json).

CREATE TABLE `capture_endpoints` (
  `id` int AUTO_INCREMENT NOT NULL,
  `platform` varchar(32) NOT NULL,
  `endpoint_key` varchar(255) NOT NULL,
  `sample_url` text,
  `capture_body` tinyint NOT NULL DEFAULT 0,
  `unit_note` varchar(255),
  `hit_count` int NOT NULL DEFAULT 0,
  `note` text,
  `first_seen_at` timestamp NOT NULL DEFAULT (now()),
  `last_seen_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `capture_endpoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capture_endpoints_key_unique` ON `capture_endpoints` (`platform`,`endpoint_key`);
--> statement-breakpoint
CREATE INDEX `capture_endpoints_body_idx` ON `capture_endpoints` (`capture_body`);
--> statement-breakpoint

CREATE TABLE `capture_payloads` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `platform` varchar(32) NOT NULL,
  `endpoint_key` varchar(255) NOT NULL,
  `chrome_profile_uuid` varchar(36) NOT NULL,
  `customer_id` int,
  `user_id` int,
  `shop_id` varchar(64),
  `shop_name` varchar(255),
  `method` varchar(8) NOT NULL,
  `query_json` json,
  `request_body` longtext,
  `payload_hash` varchar(64) NOT NULL,
  `payload` longtext NOT NULL,
  `captured_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `capture_payloads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Kunci dedup memakai chrome_profile_uuid, BUKAN shop_id: uuid selalu terisi,
-- sedangkan 90% response Shopee tidak memuat shop_id. Kalau kolom kunci boleh
-- NULL, MySQL menganggap tiap NULL berbeda dan dedup berhenti bekerja diam-diam.
-- Panjang kunci: (36+32+255+64) * 4 byte = 1548, masih di bawah batas 3072 InnoDB.
CREATE UNIQUE INDEX `capture_payloads_dedup_unique` ON `capture_payloads` (`chrome_profile_uuid`,`platform`,`endpoint_key`,`payload_hash`);
--> statement-breakpoint
CREATE INDEX `capture_payloads_lookup_idx` ON `capture_payloads` (`customer_id`,`platform`,`endpoint_key`,`captured_at`);
--> statement-breakpoint
ALTER TABLE `capture_payloads` ADD CONSTRAINT `capture_payloads_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `capture_payloads` ADD CONSTRAINT `capture_payloads_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
