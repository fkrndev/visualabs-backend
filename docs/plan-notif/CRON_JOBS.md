# Notification Cron Jobs

Entri crontab production untuk seluruh sistem notifikasi Telegram. Tambahkan ke user `visualabs` (atau service account yg menjalankan v-auto-backend) via `crontab -e`.

```cron
# ─── Meta Ads Daily Report ─────────────────────────────────
0 5 * * * cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-meta-ads-report.ts

# ─── Real-time balance check (Tier 1 alerts) ───────────────
# Setiap 2 jam — saldo habis, critical, token invalid
0 */2 * * * cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-realtime-balance-check.ts

# ─── Reminders ─────────────────────────────────────────────
# Meeting reminders — tiap 15 menit
*/15 * * * * cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-notification-reminders.ts meetings

# Todo + ticket follow-up — pagi 09:00 WIB
0 9 * * * cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-notification-reminders.ts todos
0 9 * * * cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-notification-reminders.ts tickets

# Scorecard input due & alert
0 16 * * 5 cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-notification-reminders.ts scorecards
0 9  * * 1 cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-notification-reminders.ts scorecards

# ─── Summaries ─────────────────────────────────────────────
# Weekly — Senin 08:00 WIB
0 8 * * 1 cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-weekly-summary.ts

# Monthly — tanggal 1 jam 09:00 WIB
0 9 1 * * cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-monthly-summary.ts
```

> **Timezone**: Crontab di server berjalan pada WIB (Asia/Jakarta). Konfirmasi: `timedatectl status`.

## Mode A — Real-time (sub-2-hour)

| Cron | File | Notif Code |
|---|---|---|
| `0 */2 * * *` | `scripts/run-realtime-balance-check.ts` | `BALANCE_DEPLETED`, `BALANCE_CRITICAL_RT`, `TOKEN_INVALID`, `CRON_FAILED` |

Catatan: notif Tier 1 di-dispatch via `forceSend: true` sehingga byp​ass quiet hours & paused_until. Dedupe per (`act_id`, `tanggal`, `level`) supaya tidak dobel tiap 2 jam.

## Mode B — Reminder (terjadwal pendek)

| Cron | File | Mode arg | Notif Code |
|---|---|---|---|
| `*/15 * * * *` | `notification-reminders.ts` | `meetings` | `MEETING_REMINDER_24H/1H/15M` |
| `0 9 * * *` | sda | `todos` | `TODO_DEADLINE`, `TODO_OVERDUE` |
| `0 9 * * *` | sda | `tickets` | `TICKET_FOLLOWUP` |
| `0 16 * * 5` + `0 9 * * 1` | sda | `scorecards` | `SCORECARD_INPUT_DUE`, `SCORECARD_ALERT` |

## Mode C — Summary periodik

| Cron | File | Notif Code |
|---|---|---|
| `0 5 * * *` | `run-meta-ads-report.ts` | `DAILY_REPORT`, `BALANCE_WARNING/CRITICAL`, `DAILY_REPORT_ERROR`, dan anomaly (`SPEND_SPIKE`, `RESULT_DROP`, `ZERO_SPEND`, `ROAS_MILESTONE`) — anomaly dipanggil inline di akhir loop |
| `0 8 * * 1` | `run-weekly-summary.ts` | `WEEKLY_SUMMARY` |
| `0 9 1 * *` | `run-monthly-summary.ts` | `MONTHLY_SUMMARY` |

## Manual test

```bash
# Cek balance + alert untuk semua akun aktif
bun run scripts/run-realtime-balance-check.ts

# Trigger reminders
bun run scripts/run-notification-reminders.ts all
bun run scripts/run-notification-reminders.ts meetings
bun run scripts/run-notification-reminders.ts todos
bun run scripts/run-notification-reminders.ts tickets
bun run scripts/run-notification-reminders.ts scorecards

# Trigger summaries (anomaly tetap lewat daily report)
bun run scripts/run-weekly-summary.ts
bun run scripts/run-monthly-summary.ts
```

## Env vars yang diperlukan

| Var | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_NOTIFY_URL` | optional | Default `https://mail.dots.my.id/api/notifications/telegram/send` |
| `TELEGRAM_NOTIFY_TOKEN` | wajib utk kirim | Bearer token relay API. Tanpa ini, semua dispatch akan skipped dengan reason `no_api_token` |
| `TELEGRAM_NOTIFY_USERNAME` | optional | Fallback recipient kalau advertiser tidak punya username (Tier 4 fallback) |
| `ADMIN_NOTIFY_USERNAME` | optional | Recipient `CRON_FAILED` untuk admin |
| `ADMIN_NOTIFY_USER_ID` | optional | ID user untuk `CRON_FAILED` (dipakai dispatcher untuk lookup preferences) |

## Verifikasi end-to-end

```bash
# 1. Pastikan migrasi sudah jalan
mysql -u <user> -p <db> < drizzle/0025_add_notification_system.sql

# 2. Sanity check tabel
mysql> SHOW TABLES LIKE 'notification%';
# notification_log
# notification_preferences
# notification_settings_global

# 3. Test endpoint API (butuh JWT user)
curl -H "Authorization: Bearer <jwt>" http://localhost:3000/api/notifications/preferences
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"username":"andi_va","target":"main"}' \
  http://localhost:3000/api/notifications/test

# 4. Test dispatcher via daily report manual
bun run scripts/run-meta-ads-report.ts
# Cek tabel: SELECT * FROM notification_log ORDER BY id DESC LIMIT 5;
```
