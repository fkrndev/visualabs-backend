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

cd ~/web/vims.dots.my.id/private/v-auto-backend/
/home/visualabs/web/vims.dots.my.id/private/v-auto-backend


# deploy backend

**Otomatis: push ke `main` → live.** GitHub Actions SSH ke server dan mengirim
`deploy v-auto-backend`; git pull, `bun install`, dan `pm2 restart vims` semuanya
berjalan di server (`~/bin/deploy.sh`). Tidak ada langkah manual.

⚠️ **Migrasi DB TIDAK ikut otomatis.** Kalau schema berubah, jalankan sendiri:
```sh
ssh visualabs@51.79.222.48
cd ~/web/vims.dots.my.id/private/v-auto-backend && bun scripts/apply-migration.ts drizzle/<file>.sql
```

Deploy manual (kalau Actions bermasalah):
```sh
ssh visualabs@51.79.222.48 '~/bin/deploy.sh v-auto-backend'
```


https://developers.facebook.com/tools/accesstoken/