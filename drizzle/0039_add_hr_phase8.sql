-- HR Fase 8/7: Compliance & Laporan (kas kecil, THR, tunjangan cuti, pesangon,
-- pajak & bukti potong / Coretax, template & log laporan).
-- Single-tenant (tanpa business_id). Apply manual ke DB production.
-- Urutan tabel mengikuti dependency FK (yang direferensi dibuat lebih dulu).

-- ============================================================
-- Kas Kecil (Petty Cash)
-- ============================================================

CREATE TABLE `company_bank_accounts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `bank_name` VARCHAR(100) NOT NULL,
  `account_number` VARCHAR(64) NOT NULL,
  `account_holder` VARCHAR(191) NOT NULL,
  `branch` VARCHAR(100) NULL,
  `is_primary` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `petty_cash` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `branch_id` INT NULL,
  `balance` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `holder_employee_id` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `petty_cash_branch_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL,
  CONSTRAINT `petty_cash_holder_fk` FOREIGN KEY (`holder_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL
);

CREATE TABLE `petty_cash_transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `petty_cash_id` INT NOT NULL,
  `transaction_type` TINYINT NOT NULL,
  `category` TINYINT NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `description` TEXT NULL,
  `attachment` VARCHAR(500) NULL,
  `transaction_date` DATE NOT NULL,
  `created_by` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `petty_cash_transactions_petty_cash_fk` FOREIGN KEY (`petty_cash_id`) REFERENCES `petty_cash`(`id`) ON DELETE CASCADE,
  CONSTRAINT `petty_cash_transactions_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `petty_cash_transactions_petty_cash_idx` ON `petty_cash_transactions` (`petty_cash_id`);

-- ============================================================
-- THR & Tunjangan Cuti
-- ============================================================

CREATE TABLE `thr_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `calculation_type` TINYINT NOT NULL DEFAULT 0,
  `min_working_months` INT NULL DEFAULT 1,
  `payment_before_holiday_days` INT NULL DEFAULT 7,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `thr_disbursements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `year` INT NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `religion_holiday` TINYINT NOT NULL,
  `paid_at` TIMESTAMP NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `thr_disbursements_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `thr_disbursements_unique` ON `thr_disbursements` (`employee_id`, `year`, `religion_holiday`);

CREATE TABLE `leave_allowance_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `leave_type_id` INT NOT NULL,
  `amount_per_day` DECIMAL(15,2) NOT NULL,
  `max_days_paid` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `leave_allowance_settings_leave_type_fk` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE CASCADE
);

-- ============================================================
-- Pesangon (Severance)
-- ============================================================

CREATE TABLE `severance_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `severance_multiplier` JSON NULL,
  `service_award_multiplier` JSON NULL,
  `compensation_multiplier` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `severance_payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `termination_date` DATE NOT NULL,
  `termination_reason` TINYINT NOT NULL,
  `working_years` DECIMAL(5,2) NULL,
  `severance_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `service_award_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `compensation_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `total_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 0,
  `paid_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `severance_payments_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `severance_payments_employee_idx` ON `severance_payments` (`employee_id`);

-- ============================================================
-- Pajak & Bukti Potong (Coretax)
-- ============================================================

CREATE TABLE `employee_tax_profiles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `year` INT NOT NULL,
  `npwp` VARCHAR(32) NULL,
  `ptkp_code` TINYINT NULL,
  `tax_status` TINYINT NOT NULL DEFAULT 0,
  `is_npwp_holder` TINYINT NOT NULL DEFAULT 1,
  `foreign_country_code` VARCHAR(8) NULL,
  `start_period` DATE NULL,
  `end_period` DATE NULL,
  `effective_date` DATE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `employee_tax_profiles_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `employee_tax_profiles_unique` ON `employee_tax_profiles` (`employee_id`, `year`);

CREATE TABLE `tax_withholding_slips` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `payroll_period_id` INT NULL,
  `slip_type` TINYINT NOT NULL,
  `document_number` VARCHAR(100) NULL,
  `period_month` TINYINT NULL,
  `period_year` INT NOT NULL,
  `is_annual` TINYINT NOT NULL DEFAULT 0,
  `gross_income` DECIMAL(15,2) NULL DEFAULT 0,
  `ptkp_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `taxable_income` DECIMAL(15,2) NULL DEFAULT 0,
  `tax_rate` DECIMAL(5,2) NULL DEFAULT 0,
  `tax_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `ntpn` VARCHAR(64) NULL,
  `signer_name` VARCHAR(191) NULL,
  `signer_nik` VARCHAR(32) NULL,
  `signer_position` VARCHAR(191) NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `issued_at` TIMESTAMP NULL,
  `file_url` VARCHAR(500) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tax_withholding_slips_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `tax_withholding_slips_period_fk` FOREIGN KEY (`payroll_period_id`) REFERENCES `payroll_periods`(`id`) ON DELETE SET NULL
);
CREATE INDEX `tax_withholding_slips_employee_idx` ON `tax_withholding_slips` (`employee_id`);
CREATE UNIQUE INDEX `tax_withholding_slips_document_number_unique` ON `tax_withholding_slips` (`document_number`);

CREATE TABLE `coretax_submissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `period_month` TINYINT NULL,
  `period_year` INT NOT NULL,
  `submission_type` TINYINT NOT NULL,
  `total_slips` INT NULL DEFAULT 0,
  `total_tax_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `ntpn_batch` VARCHAR(64) NULL,
  `file_url` VARCHAR(500) NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `submitted_at` TIMESTAMP NULL,
  `accepted_at` TIMESTAMP NULL,
  `rejection_reason` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- Laporan (Report Templates & Logs)
-- ============================================================

CREATE TABLE `report_templates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `module` TINYINT NOT NULL,
  `config` JSON NULL,
  `created_by` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `report_templates_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE `report_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `report_template_id` INT NULL,
  `employee_id` INT NULL,
  `params` JSON NULL,
  `file_url` VARCHAR(500) NULL,
  `format` TINYINT NOT NULL DEFAULT 0,
  `generated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `report_logs_template_fk` FOREIGN KEY (`report_template_id`) REFERENCES `report_templates`(`id`) ON DELETE SET NULL,
  CONSTRAINT `report_logs_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL
);
CREATE INDEX `report_logs_template_idx` ON `report_logs` (`report_template_id`);
