-- Halaman products/admin sudah lama menampilkan bulk action "Ubah Status",
-- "Soft Delete", dan "Pulihkan", tapi tabel products tidak punya kolom untuk
-- menyimpannya sehingga endpoint-nya tidak pernah bisa dibuat.
--
-- status: active | inactive | archived
-- deleted_at/deleted_by: soft delete, produk tetap tersimpan dan bisa dipulihkan.
-- Baris lama otomatis dianggap 'active' dan belum terhapus.

ALTER TABLE `products` ADD COLUMN `status` varchar(20) NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `deleted_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `deleted_by` varchar(100) NULL;
--> statement-breakpoint
CREATE INDEX `products_status_idx` ON `products` (`status`);
--> statement-breakpoint
CREATE INDEX `products_deleted_at_idx` ON `products` (`deleted_at`);
--> statement-breakpoint

-- audit_logs dideklarasikan di schema.ts dan dibuat oleh migrasi 0041, tapi di
-- production tabel itu belum ada (0041 baru sebagian diterapkan: hanya
-- rate_limit_entries yang sudah dibuat). Endpoint /api/audit-trail butuh tabel
-- ini, jadi dibuat di sini dengan IF NOT EXISTS supaya tetap aman kalau 0041
-- dijalankan belakangan.
CREATE TABLE IF NOT EXISTS `audit_logs` (
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
  CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`),
  INDEX `audit_logs_user_idx` (`user_id`),
  INDEX `audit_logs_customer_idx` (`customer_id`),
  INDEX `audit_logs_entity_idx` (`entity_type`, `entity_id`),
  INDEX `audit_logs_action_idx` (`action`),
  INDEX `audit_logs_created_at_idx` (`created_at`)
);
