To install dependencies:
```sh
bun install
```

To run:
```sh
bun run dev
```

pm2 start ecosystem.config.cjs


visualabs@51.79.222.48
ssh visualabs@51.79.222.48


bun scripts/apply-migration.ts drizzle/0027_add_cancel_reason_to_subscriptions.sql
bun scripts/apply-migration.ts drizzle/0029_add_recurring_todo_fields.sql
bun scripts/apply-migration.ts drizzle/0030_add_exclude_weekdays.sql


# Recurring Todo generator (cron harian 06:00 WIB)
# 0 6 * * *  cd /path/v-auto-backend && bun run job:recurring-todos
bun run job:recurring-todos          # manual / hari ini
bun run job:recurring-todos 2026-06-01   # acuan tanggal tertentu (catch-up)
