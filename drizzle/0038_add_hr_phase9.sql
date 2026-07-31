-- HR Fase 9: Field / Sales (klien, kunjungan klien, pelacakan lokasi).
-- Single-tenant (tanpa business_id). Apply manual ke DB production.
-- Urutan tabel mengikuti dependency FK (clients dibuat lebih dulu).

CREATE TABLE `clients` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(64) NULL,
  `contact_person` VARCHAR(191) NULL,
  `phone` VARCHAR(32) NULL,
  `email` VARCHAR(191) NULL,
  `address` TEXT NULL,
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `category` TINYINT NULL,
  `pic_employee_id` INT NULL,
  `notes` TEXT NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `clients_pic_employee_fk` FOREIGN KEY (`pic_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL
);

CREATE TABLE `client_visits` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `client_id` INT NOT NULL,
  `visit_date` DATE NOT NULL,
  `check_in_at` TIMESTAMP NULL,
  `check_out_at` TIMESTAMP NULL,
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `address` TEXT NULL,
  `photo` VARCHAR(500) NULL,
  `purpose` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `client_visits_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `client_visits_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE RESTRICT
);
CREATE INDEX `client_visits_employee_idx` ON `client_visits` (`employee_id`);
CREATE INDEX `client_visits_client_idx` ON `client_visits` (`client_id`);

CREATE TABLE `location_tracks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `latitude` DECIMAL(10,7) NOT NULL,
  `longitude` DECIMAL(10,7) NOT NULL,
  `accuracy` DECIMAL(8,2) NULL,
  `address` TEXT NULL,
  `battery_level` TINYINT NULL,
  `is_mock_location` TINYINT NULL DEFAULT 0,
  `tracked_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `location_tracks_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `location_tracks_employee_idx` ON `location_tracks` (`employee_id`);
CREATE INDEX `location_tracks_tracked_at_idx` ON `location_tracks` (`tracked_at`);
