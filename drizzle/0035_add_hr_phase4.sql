-- HR Fase 4: Approval Workflow generik (polimorfik via module + reference_id).
-- Single-tenant (tanpa business_id). Apply manual ke DB production.

CREATE TABLE `approval_workflows` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `module` TINYINT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `approval_workflow_steps` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `workflow_id` INT NOT NULL,
  `step_order` INT NOT NULL,
  `approver_type` TINYINT NOT NULL,
  `approver_id` INT NULL,
  `role` TINYINT NULL,
  CONSTRAINT `approval_workflow_steps_workflow_fk` FOREIGN KEY (`workflow_id`) REFERENCES `approval_workflows`(`id`) ON DELETE CASCADE,
  CONSTRAINT `approval_workflow_steps_approver_fk` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `approval_workflow_steps_workflow_idx` ON `approval_workflow_steps` (`workflow_id`);

CREATE TABLE `approvals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `module` TINYINT NOT NULL,
  `reference_id` INT NOT NULL,
  `step_order` INT NOT NULL,
  `approver_id` INT NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `approved_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `approvals_approver_fk` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `approvals_module_ref_idx` ON `approvals` (`module`, `reference_id`);
