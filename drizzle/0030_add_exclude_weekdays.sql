-- Recurring Todo (harian): kecualikan hari tertentu (mis. Minggu).
-- Disimpan sebagai JSON array angka 0=Min..6=Sab. Nullable, default tanpa exclude.

ALTER TABLE `repeat_tasks`
  ADD `exclude_weekdays` JSON NULL;
