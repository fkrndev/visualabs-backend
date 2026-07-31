ALTER TABLE `chrome_profiles`
  ADD COLUMN `user_agent` TEXT NULL AFTER `name`,
  ADD COLUMN `proxy` VARCHAR(255) NULL AFTER `user_agent`,
  ADD COLUMN `cookies` JSON NULL AFTER `proxy`,
  ADD COLUMN `fingerprint` JSON NULL AFTER `cookies`,
  ADD COLUMN `status` INT NOT NULL DEFAULT 0 AFTER `fingerprint`;
