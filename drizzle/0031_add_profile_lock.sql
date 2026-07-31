-- Profile lock (device exclusivity) untuk chrome_profiles.
-- Satu profile hanya boleh dibuka oleh satu device pada satu waktu.
-- Lock aktif selama lock_expires_at > NOW(); aplikasi mengirim heartbeat
-- tiap 30 detik untuk memperpanjang lock_expires_at. Saat release, keempat
-- kolom di-set NULL kembali.

ALTER TABLE `chrome_profiles`
  ADD `locked_by` INT NULL,
  ADD `lock_device_id` VARCHAR(255) NULL,
  ADD `locked_at` TIMESTAMP NULL,
  ADD `lock_expires_at` TIMESTAMP NULL;

ALTER TABLE `chrome_profiles`
  ADD CONSTRAINT `chrome_profiles_locked_by_users_id_fk`
  FOREIGN KEY (`locked_by`) REFERENCES `users`(`id`) ON DELETE SET NULL;

CREATE INDEX `chrome_profiles_locked_by_idx` ON `chrome_profiles` (`locked_by`);
CREATE INDEX `chrome_profiles_lock_expires_idx` ON `chrome_profiles` (`lock_expires_at`);
