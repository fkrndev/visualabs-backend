ALTER TABLE `fb_act`
  ADD COLUMN `threshold_warning_override` DECIMAL(20,2) NULL AFTER `data_json`,
  ADD COLUMN `threshold_critical_override` DECIMAL(20,2) NULL AFTER `threshold_warning_override`,
  ADD COLUMN `postpaid_threshold_override` DECIMAL(20,2) NULL AFTER `threshold_critical_override`;
