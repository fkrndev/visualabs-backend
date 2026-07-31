-- HR Fase 5: Payroll / Kompensasi (payroll, tunjangan, lembur, kasbon,
-- reimbursement, pengaturan payroll/pajak/BPJS/pembulatan).
-- Single-tenant (tanpa business_id). Apply manual ke DB production.
-- Urutan tabel mengikuti dependency FK (yang direferensi dibuat lebih dulu).

-- ============================================================
-- Payroll inti
-- ============================================================

CREATE TABLE `payroll_periods` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `period_month` TINYINT NOT NULL,
  `period_year` INT NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `payment_date` DATE NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `created_by` INT NULL,
  `approved_by` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `payroll_periods_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `payroll_periods_approved_by_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE UNIQUE INDEX `payroll_periods_unique` ON `payroll_periods` (`period_year`, `period_month`);

CREATE TABLE `payrolls` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `payroll_period_id` INT NOT NULL,
  `employee_id` INT NOT NULL,
  `basic_salary` DECIMAL(15,2) NULL DEFAULT 0,
  `total_allowance` DECIMAL(15,2) NULL DEFAULT 0,
  `total_overtime` DECIMAL(15,2) NULL DEFAULT 0,
  `total_bonus` DECIMAL(15,2) NULL DEFAULT 0,
  `total_deduction` DECIMAL(15,2) NULL DEFAULT 0,
  `total_tax` DECIMAL(15,2) NULL DEFAULT 0,
  `total_bpjs` DECIMAL(15,2) NULL DEFAULT 0,
  `gross_salary` DECIMAL(15,2) NULL DEFAULT 0,
  `net_salary` DECIMAL(15,2) NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 0,
  `paid_at` TIMESTAMP NULL,
  `payment_method` TINYINT NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `payrolls_period_fk` FOREIGN KEY (`payroll_period_id`) REFERENCES `payroll_periods`(`id`) ON DELETE CASCADE,
  CONSTRAINT `payrolls_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT
);
CREATE INDEX `payrolls_period_idx` ON `payrolls` (`payroll_period_id`);
CREATE UNIQUE INDEX `payrolls_period_employee_unique` ON `payrolls` (`payroll_period_id`, `employee_id`);

CREATE TABLE `payroll_components` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `payroll_id` INT NOT NULL,
  `component_type` TINYINT NOT NULL,
  `category` TINYINT NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  CONSTRAINT `payroll_components_payroll_fk` FOREIGN KEY (`payroll_id`) REFERENCES `payrolls`(`id`) ON DELETE CASCADE
);
CREATE INDEX `payroll_components_payroll_idx` ON `payroll_components` (`payroll_id`);

CREATE TABLE `salary_structures` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `basic_salary` DECIMAL(15,2) NOT NULL,
  `effective_date` DATE NOT NULL,
  `end_date` DATE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `salary_structures_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `salary_structures_employee_idx` ON `salary_structures` (`employee_id`);

-- ============================================================
-- Tunjangan
-- ============================================================

CREATE TABLE `allowances` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `type` TINYINT NOT NULL DEFAULT 0,
  `amount` DECIMAL(15,2) NULL DEFAULT 0,
  `is_taxable` TINYINT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `employee_allowances` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `allowance_id` INT NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `effective_date` DATE NOT NULL,
  `end_date` DATE NULL,
  CONSTRAINT `employee_allowances_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `employee_allowances_allowance_fk` FOREIGN KEY (`allowance_id`) REFERENCES `allowances`(`id`) ON DELETE RESTRICT
);
CREATE INDEX `employee_allowances_employee_idx` ON `employee_allowances` (`employee_id`);
CREATE INDEX `employee_allowances_allowance_idx` ON `employee_allowances` (`allowance_id`);

-- ============================================================
-- Lembur
-- ============================================================

CREATE TABLE `overtimes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `start_time` TIME NULL,
  `end_time` TIME NULL,
  `total_hours` DECIMAL(5,2) NULL,
  `reason` TEXT NULL,
  `amount` DECIMAL(15,2) NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 0,
  `approver_id` INT NULL,
  `approved_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `overtimes_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `overtimes_approver_fk` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `overtimes_employee_idx` ON `overtimes` (`employee_id`);

-- ============================================================
-- Keuangan karyawan (kasbon, reimbursement)
-- ============================================================

CREATE TABLE `cash_advances` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `reason` TEXT NULL,
  `request_date` DATE NOT NULL,
  `repayment_method` TINYINT NOT NULL DEFAULT 0,
  `installment_count` INT NULL,
  `installment_amount` DECIMAL(15,2) NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `approver_id` INT NULL,
  `approved_at` TIMESTAMP NULL,
  `disbursed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cash_advances_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `cash_advances_approver_fk` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `cash_advances_employee_idx` ON `cash_advances` (`employee_id`);

CREATE TABLE `cash_advance_repayments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cash_advance_id` INT NOT NULL,
  `payroll_id` INT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `paid_at` TIMESTAMP NULL,
  CONSTRAINT `cash_advance_repayments_advance_fk` FOREIGN KEY (`cash_advance_id`) REFERENCES `cash_advances`(`id`) ON DELETE CASCADE,
  CONSTRAINT `cash_advance_repayments_payroll_fk` FOREIGN KEY (`payroll_id`) REFERENCES `payrolls`(`id`) ON DELETE SET NULL
);
CREATE INDEX `cash_advance_repayments_advance_idx` ON `cash_advance_repayments` (`cash_advance_id`);
CREATE INDEX `cash_advance_repayments_payroll_idx` ON `cash_advance_repayments` (`payroll_id`);

CREATE TABLE `reimbursements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `category` TINYINT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `transaction_date` DATE NOT NULL,
  `description` TEXT NULL,
  `attachment` VARCHAR(500) NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `approver_id` INT NULL,
  `approved_at` TIMESTAMP NULL,
  `paid_at` TIMESTAMP NULL,
  `payment_method` TINYINT NULL,
  `rejection_reason` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `reimbursements_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE,
  CONSTRAINT `reimbursements_approver_fk` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `reimbursements_employee_idx` ON `reimbursements` (`employee_id`);

-- ============================================================
-- Pengaturan Payroll
-- ============================================================

CREATE TABLE `payroll_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `payroll_cutoff_date` TINYINT NULL,
  `payment_date` TINYINT NULL,
  `rounding_type` TINYINT NOT NULL DEFAULT 0,
  `rounding_value` INT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `payslip_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `show_company_logo` TINYINT NOT NULL DEFAULT 1,
  `show_signature` TINYINT NOT NULL DEFAULT 0,
  `signature_name` VARCHAR(191) NULL,
  `signature_position` VARCHAR(191) NULL,
  `footer_note` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `overtime_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `calculation_method` TINYINT NOT NULL DEFAULT 0,
  `hourly_rate_formula` VARCHAR(255) NULL,
  `weekday_multiplier` JSON NULL,
  `weekend_multiplier` JSON NULL,
  `holiday_multiplier` JSON NULL,
  `min_overtime_minutes` INT NULL DEFAULT 30,
  `max_overtime_hours_per_day` INT NULL DEFAULT 4,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `prorate_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `calculation_basis` TINYINT NOT NULL DEFAULT 0,
  `apply_to` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `tax_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `calculation_method` TINYINT NOT NULL DEFAULT 0,
  `ter_enabled` TINYINT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `tax_brackets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `min_income` DECIMAL(15,2) NOT NULL,
  `max_income` DECIMAL(15,2) NULL,
  `rate` DECIMAL(5,2) NOT NULL,
  `effective_year` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `tax_brackets_year_idx` ON `tax_brackets` (`effective_year`);

CREATE TABLE `ptkp_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` TINYINT NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `effective_year` INT NOT NULL
);
CREATE UNIQUE INDEX `ptkp_settings_year_code_unique` ON `ptkp_settings` (`effective_year`, `code`);

CREATE TABLE `bpjs_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `bpjs_type` TINYINT NOT NULL,
  `employer_rate` DECIMAL(5,2) NULL DEFAULT 0,
  `employee_rate` DECIMAL(5,2) NULL DEFAULT 0,
  `salary_cap` DECIMAL(15,2) NULL,
  `jkk_risk_level` TINYINT NULL,
  `effective_date` DATE NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX `bpjs_settings_type_idx` ON `bpjs_settings` (`bpjs_type`);

CREATE TABLE `rounding_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `target` TINYINT NOT NULL,
  `rounding_type` TINYINT NOT NULL DEFAULT 2,
  `nominal` INT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `rounding_settings_target_unique` ON `rounding_settings` (`target`);

-- ============================================================
-- Detail BPJS per payroll
-- ============================================================

CREATE TABLE `payroll_bpjs_details` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `payroll_id` INT NOT NULL,
  `employee_id` INT NOT NULL,
  `bpjs_type` TINYINT NOT NULL,
  `bpjs_number` VARCHAR(64) NULL,
  `base_salary` DECIMAL(15,2) NULL DEFAULT 0,
  `employer_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `employee_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `total_amount` DECIMAL(15,2) NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `payroll_bpjs_details_payroll_fk` FOREIGN KEY (`payroll_id`) REFERENCES `payrolls`(`id`) ON DELETE CASCADE,
  CONSTRAINT `payroll_bpjs_details_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);
CREATE INDEX `payroll_bpjs_details_payroll_idx` ON `payroll_bpjs_details` (`payroll_id`);
CREATE INDEX `payroll_bpjs_details_employee_idx` ON `payroll_bpjs_details` (`employee_id`);
