-- Recurring Todo: perkaya repeat_tasks + anchor idempotensi di todo_repeat_histories
-- Tabel sudah ada (migrasi 0013/0014), jadi ini murni ADD COLUMN/INDEX.

-- 1) repeat_tasks: konfigurasi rekurensi + cursor cron
ALTER TABLE `repeat_tasks`
  ADD `interval` INT NOT NULL DEFAULT 1,
  ADD `by_weekday` INT NULL,
  ADD `by_month_day` INT NULL,
  ADD `by_month` INT NULL,
  ADD `start_date` DATE NULL,
  ADD `end_date` DATE NULL,
  ADD `max_occurrences` INT NULL,
  ADD `generated_count` INT NOT NULL DEFAULT 0,
  ADD `last_run_date` DATE NULL,
  ADD `next_run_date` DATE NULL;

ALTER TABLE `repeat_tasks`
  ADD KEY `repeat_task_next_run_idx` (`status`, `next_run_date`);

-- 2) todo_repeat_histories: tanggal occurrence + unique anti-duplikat
--    Tabel mungkin sudah berisi baris → tambah NULL dulu, backfill, baru NOT NULL.
ALTER TABLE `todo_repeat_histories`
  ADD `occurrence_date` DATE NULL;

UPDATE `todo_repeat_histories`
  SET `occurrence_date` = COALESCE(`start_date`, `due_date`, DATE(`created_at`))
  WHERE `occurrence_date` IS NULL;

ALTER TABLE `todo_repeat_histories`
  MODIFY `occurrence_date` DATE NOT NULL;

ALTER TABLE `todo_repeat_histories`
  ADD UNIQUE KEY `todo_repeat_hist_repeat_occurrence_unique` (`repeat_task_id`, `occurrence_date`);
