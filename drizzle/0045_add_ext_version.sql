-- Melacak versi extension yang benar-benar berjalan di tiap profil Chrome.
-- Lihat docs/vbox/capture-plan.md.
--
-- Dilaporkan sendiri oleh vbox-controller lewat panggilan yang sudah ada, bukan
-- dicatat saat mengunduh: berkas yang terunduh belum tentu terpasang, sedangkan
-- laporan ini hanya mungkin datang dari extension yang sedang berjalan.

ALTER TABLE `chrome_profiles` ADD COLUMN `ext_version` varchar(20);
--> statement-breakpoint
ALTER TABLE `chrome_profiles` ADD COLUMN `ext_seen_at` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `chrome_profiles_ext_version_idx` ON `chrome_profiles` (`ext_version`);
