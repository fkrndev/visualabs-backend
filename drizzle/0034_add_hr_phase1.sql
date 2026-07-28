-- HR Fase 1–3: Master Organisasi + Karyawan (HRIS) + Presensi/Jadwal + Cuti.
-- Single-tenant (tanpa business_id). Karyawan (employees) nyantol ke users.id.
-- CATATAN: apply manual ke DB production (jangan auto-migrate). Journal drizzle
-- beku di 0016 jadi migrasi ini hand-written seperti 0017–0033.

-- ============================================================
-- Master Organisasi
-- ============================================================

CREATE TABLE `branches` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(64) NULL,
  `address` TEXT NULL,
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `radius` INT NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `branches_code_unique` ON `branches` (`code`);

CREATE TABLE `departments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(64) NULL,
  `parent_id` INT NULL,
  `head_employee_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX `departments_parent_idx` ON `departments` (`parent_id`);

CREATE TABLE `positions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `department_id` INT NULL,
  `name` VARCHAR(191) NOT NULL,
  `level` TINYINT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `positions_department_fk` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL
);
CREATE INDEX `positions_department_idx` ON `positions` (`department_id`);

-- ============================================================
-- Karyawan (HRIS)
-- ============================================================

CREATE TABLE `employees` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `branch_id` INT NULL,
  `department_id` INT NULL,
  `position_id` INT NULL,
  `nik` VARCHAR(64) NULL,
  `nik_ktp` VARCHAR(32) NULL,
  `full_name` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(100) NULL,
  `gender` TINYINT NULL,
  `birth_place` VARCHAR(100) NULL,
  `birth_date` DATE NULL,
  `religion` TINYINT NULL,
  `marital_status` TINYINT NULL,
  `blood_type` TINYINT NULL,
  `address` TEXT NULL,
  `phone` VARCHAR(32) NULL,
  `email` VARCHAR(191) NULL,
  `photo` VARCHAR(500) NULL,
  `join_date` DATE NULL,
  `resign_date` DATE NULL,
  `employment_type` TINYINT NULL,
  `employment_status` TINYINT NOT NULL DEFAULT 0,
  `npwp` VARCHAR(32) NULL,
  `bpjs_kesehatan_no` VARCHAR(64) NULL,
  `bpjs_ketenagakerjaan_no` VARCHAR(64) NULL,
  `citizenship` TINYINT NULL,
  `identity_type` TINYINT NULL,
  `landline_phone` VARCHAR(32) NULL,
  `residential_address` TEXT NULL,
  `tax_status_code` TINYINT NULL,
  `tax_withholder_npwp` VARCHAR(32) NULL,
  `tax_withholder_name` VARCHAR(191) NULL,
  `default_work_schedule_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `employees_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `employees_branch_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL,
  CONSTRAINT `employees_department_fk` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `employees_position_fk` FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON DELETE SET NULL
);
CREATE INDEX `employees_user_idx` ON `employees` (`user_id`);
CREATE INDEX `employees_branch_idx` ON `employees` (`branch_id`);
CREATE INDEX `employees_department_idx` ON `employees` (`department_id`);
CREATE UNIQUE INDEX `employees_nik_unique` ON `employees` (`nik`);

CREATE TABLE `employee_families` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `relationship` TINYINT NOT NULL,
  `gender` TINYINT NULL,
  `birth_date` DATE NULL,
  `nik_ktp` VARCHAR(32) NULL,
  `is_dependent` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `employee_families_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `employee_families_employee_idx` ON `employee_families` (`employee_id`);

CREATE TABLE `employee_documents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `document_type` TINYINT NOT NULL,
  `document_number` VARCHAR(100) NULL,
  `file_url` VARCHAR(500) NULL,
  `expired_at` DATE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `employee_documents_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `employee_documents_employee_idx` ON `employee_documents` (`employee_id`);

CREATE TABLE `employee_educations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `level` TINYINT NULL,
  `institution` VARCHAR(191) NULL,
  `major` VARCHAR(191) NULL,
  `start_year` INT NULL,
  `end_year` INT NULL,
  `gpa` DECIMAL(4,2) NULL,
  CONSTRAINT `employee_educations_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `employee_educations_employee_idx` ON `employee_educations` (`employee_id`);

CREATE TABLE `employee_experiences` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `company_name` VARCHAR(191) NULL,
  `position` VARCHAR(191) NULL,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `description` TEXT NULL,
  CONSTRAINT `employee_experiences_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `employee_experiences_employee_idx` ON `employee_experiences` (`employee_id`);

CREATE TABLE `employee_emergency_contacts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `relationship` VARCHAR(64) NULL,
  `phone` VARCHAR(32) NULL,
  `address` TEXT NULL,
  CONSTRAINT `employee_emergency_contacts_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `employee_emergency_contacts_employee_idx` ON `employee_emergency_contacts` (`employee_id`);

CREATE TABLE `employee_bank_accounts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `bank_name` VARCHAR(100) NOT NULL,
  `account_number` VARCHAR(64) NOT NULL,
  `account_holder` VARCHAR(191) NOT NULL,
  `is_primary` TINYINT NOT NULL DEFAULT 0,
  CONSTRAINT `employee_bank_accounts_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `employee_bank_accounts_employee_idx` ON `employee_bank_accounts` (`employee_id`);

-- ============================================================
-- Presensi / Jadwal
-- ============================================================

CREATE TABLE `holidays` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `date` DATE NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` TINYINT NOT NULL DEFAULT 0,
  `is_recurring` TINYINT NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX `holidays_date_idx` ON `holidays` (`date`);
CREATE UNIQUE INDEX `holidays_date_name_unique` ON `holidays` (`date`, `name`);

CREATE TABLE `work_schedules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `type` TINYINT NOT NULL DEFAULT 0,
  `start_time` TIME NULL,
  `end_time` TIME NULL,
  `break_duration` INT NULL,
  `late_tolerance` INT NULL,
  `early_leave_tolerance` INT NULL,
  `working_days` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `employee_schedules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `work_schedule_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `employee_schedules_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `employee_schedules_ws_fk` FOREIGN KEY (`work_schedule_id`) REFERENCES `work_schedules`(`id`) ON DELETE CASCADE
);
CREATE INDEX `employee_schedules_employee_idx` ON `employee_schedules` (`employee_id`);
CREATE UNIQUE INDEX `employee_schedules_employee_date_unique` ON `employee_schedules` (`employee_id`, `date`);

CREATE TABLE `attendances` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `work_schedule_id` INT NULL,
  `date` DATE NOT NULL,
  `check_in_at` TIMESTAMP NULL,
  `check_out_at` TIMESTAMP NULL,
  `check_in_latitude` DECIMAL(10,7) NULL,
  `check_in_longitude` DECIMAL(10,7) NULL,
  `check_out_latitude` DECIMAL(10,7) NULL,
  `check_out_longitude` DECIMAL(10,7) NULL,
  `check_in_photo` VARCHAR(500) NULL,
  `check_out_photo` VARCHAR(500) NULL,
  `check_in_address` TEXT NULL,
  `check_out_address` TEXT NULL,
  `check_in_type` TINYINT NULL,
  `check_out_type` TINYINT NULL,
  `late_minutes` INT NULL DEFAULT 0,
  `early_leave_minutes` INT NULL DEFAULT 0,
  `overtime_minutes` INT NULL DEFAULT 0,
  `work_minutes` INT NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `attendances_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `attendances_ws_fk` FOREIGN KEY (`work_schedule_id`) REFERENCES `work_schedules`(`id`) ON DELETE SET NULL
);
CREATE INDEX `attendances_employee_idx` ON `attendances` (`employee_id`);
CREATE UNIQUE INDEX `attendances_employee_date_unique` ON `attendances` (`employee_id`, `date`);

CREATE TABLE `attendance_approvals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `attendance_id` INT NULL,
  `employee_id` INT NOT NULL,
  `request_type` TINYINT NOT NULL,
  `requested_check_in` TIMESTAMP NULL,
  `requested_check_out` TIMESTAMP NULL,
  `reason` TEXT NULL,
  `attachment` VARCHAR(500) NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `approver_id` INT NULL,
  `approved_at` TIMESTAMP NULL,
  `rejection_reason` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_approvals_attendance_fk` FOREIGN KEY (`attendance_id`) REFERENCES `attendances`(`id`) ON DELETE SET NULL,
  CONSTRAINT `attendance_approvals_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `attendance_approvals_approver_fk` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `attendance_approvals_employee_idx` ON `attendance_approvals` (`employee_id`);

-- ============================================================
-- Cuti
-- ============================================================

CREATE TABLE `leave_types` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(64) NULL,
  `max_days_per_year` INT NULL,
  `is_paid` TINYINT NOT NULL DEFAULT 1,
  `requires_attachment` TINYINT NOT NULL DEFAULT 0,
  `gender` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `leaves` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `leave_type_id` INT NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `total_days` DECIMAL(5,2) NULL,
  `reason` TEXT NULL,
  `attachment` VARCHAR(500) NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `approver_id` INT NULL,
  `approved_at` TIMESTAMP NULL,
  `rejection_reason` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `leaves_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `leaves_type_fk` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `leaves_approver_fk` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `leaves_employee_idx` ON `leaves` (`employee_id`);

CREATE TABLE `leave_balances` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `leave_type_id` INT NOT NULL,
  `year` INT NOT NULL,
  `total_quota` DECIMAL(5,2) NULL DEFAULT 0,
  `used` DECIMAL(5,2) NULL DEFAULT 0,
  `remaining` DECIMAL(5,2) NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `leave_balances_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `leave_balances_type_fk` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `leave_balances_unique` ON `leave_balances` (`employee_id`, `leave_type_id`, `year`);
