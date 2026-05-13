# TODO: Implementasi Halaman Monitoring Iklan (Meta Ads)

Checklist eksekusi untuk dashboard "Monitoring Iklan" — pantau saldo, performa, notifikasi, dan token health akun Meta Ads.
Referensi: [monitoring-ads.md](./monitoring-ads.md) · [monitoring-ads-wireframe.md](./monitoring-ads-wireframe.md)

Legenda: `[ ]` belum · `[x]` selesai · `[~]` in-progress · `[!]` blocked

---

## Fase 0 — Schema Threshold Override (¼ hari) ✅

### Backend (v-auto-backend)
- [x] Tambah 3 kolom di definisi `fbAct` ([src/db/schema.ts](../../src/db/schema.ts)):
  - `thresholdWarningOverride` `decimal(20,2)` nullable
  - `thresholdCriticalOverride` `decimal(20,2)` nullable
  - `postpaidThresholdOverride` `decimal(20,2)` nullable
- [x] Tulis migration manual `drizzle/0024_add_fb_act_threshold_overrides.sql` (`ALTER TABLE fb_act ADD COLUMN …` ×3)
- [x] Apply ke DB lokal via `bun scripts/apply-migration.ts drizzle/0024_add_fb_act_threshold_overrides.sql`
- [ ] Smoke test: `SELECT threshold_warning_override FROM fb_act LIMIT 1;`

### Update cron / notifier (TS — `src/jobs/metaAdsDailyReport.ts`)
- [x] Patch `getSaldoStatus` agar terima `overrides` param dan baca override sebelum fallback default
- [x] Tambah helper `computeStatusLevel(balance, balanceType, overrides)` dengan logic sama
- [x] Query `acts` di-extend untuk select 3 kolom override
- [x] Pemanggilan dalam loop pakai `thresholdOverrides` per akun; `statusLevel` dipakai ulang di 2 tempat (insert + onDuplicateKeyUpdate)
- [ ] Re-run cron dry-run di staging, verifikasi `fb_act_daily_data.status_level` masih konsisten — manual

---

## Fase 1 — Backend Foundation (1 hari) ✅

### Setup route file
- [x] Buat `src/routes/adsMonitoring.ts` + register di [src/index.ts](../../src/index.ts) pada path `/ads-monitoring`
- [x] Auth: `requireAuth` di semua endpoint
- [x] Scope resolver helper `resolveScope(payload)`:
  - admin (`rol === 1`) → tanpa filter
  - non-admin → resolve `advertiserUserId = payload.sub`, derive `customerIds` & `fbActIds` via `subscriptions.advertiserId`
- [x] Util `effectiveThreshold(fbAct)` → return `{ warning, critical, postpaid }` (override-or-default)

### Endpoints (overview)
- [x] `GET /summary?customerId&advertiserUserId` → KPI: totalAkun, akunCritical, akunWarning, spendD1, notifBelumTerkirim, tokenTidakValid
- [x] `GET /accounts?customerId&status&balanceType&advertiserUserId&page&pageSize` → tabel akun + snapshot latest (join `fb_act` ↔ `fb_act_daily_data` ↔ `customers` ↔ `subscriptions` ↔ `fb_token` ↔ `customer_profiles`)
- [x] `GET /alerts` → list akun dengan `status_level >= 1` di snapshot terbaru
- [x] `GET /customers` → list customer dalam scope user
- [x] `GET /tokens` → health token: `fb_token` rows + akun terdampak

### Quality
- [x] Typecheck clean (`bunx tsc --noEmit`)
- [ ] Smoke test via curl: user admin, user advertiser, user lain (harus 403/empty) — defer ke Fase 5

---

## Fase 2 — Backend Detail & Threshold (¾ hari) ✅

### Detail endpoints
- [x] `GET /accounts/:fbActId` — master + daily terbaru + customer + advertiser + token + thresholds
- [x] `GET /accounts/:fbActId/daily?from&to` — series `fb_act_daily_data` (limit 90 baris terbaru)
- [x] `GET /accounts/:fbActId/campaigns?date` — `fb_act_campaign_daily_insights` (default tanggal terbaru)
- [x] `GET /accounts/:fbActId/results?from&to` — `fb_act_result_breakdown_daily` + flag `hasPurchase`
- [x] `GET /accounts/:fbActId/notifications?limit` — `fb_act_notifications_log`
- [x] `GET /report-runs?from&to` — `fb_act_report_runs`
- [x] `GET /advertisers` (admin-only) — list distinct advertiser users

### Threshold endpoints
- [x] `GET /accounts/:fbActId/thresholds` → `{ default, override, effective }`
- [x] `PUT /accounts/:fbActId/thresholds` body `{ warning?, critical?, postpaid? }`
  - [x] Validasi: angka ≥ 0; `critical ≤ warning` jika dua-duanya diisi
  - [x] Permission: ownership lewat `loadFbActForScope` (advertiser owner / admin)
  - [x] Audit: append ke `fb_act.data_json.threshold_audit` (siapa, kapan, before→after) — capped 50 entry

### Quality
- [x] Ownership check via `loadFbActForScope` (`scope.fbActIds.includes`) — advertiser lain dapat 403
- [x] Typecheck clean

---

## Fase 3 — Frontend List Page (1 hari) ✅

### Setup (v-auto-frontend)
- [x] Route baru: `src/routes/monitoring-ads/+page.svelte`
- [x] API client: `src/lib/api/ads-monitoring.ts` wrap semua endpoint (14 fungsi)
- [x] Role-aware: tampil di sidebar untuk admin dan advertiser
- [x] Sidebar entry "Monitoring Iklan" di `app-sidebar.svelte` (line 104, ikon `ActivityIcon`)

### Komponen list page (`src/lib/components/monitoring-ads/`)
- [x] Filter bar: Customer / Status / Tipe Akun (admin tambah: Advertiser)
- [x] 6 KPI cards (Total / Critical / Warning / Spend D-1 / Notif Belum / Token Tidak Valid) — `KpiCard.svelte`
- [x] Section "Akun Butuh Perhatian" — `AlertList.svelte`
- [x] Section "Token Health" — `TokenHealthTable.svelte`
- [x] Tabel akun group by Customer — `AccountsTable.svelte`, status badge `StatusBadge.svelte`, token badge `TokenBadge.svelte`, saldo adaptif `SaldoLabel.svelte`
- [ ] Section Tren chart (Spend harian + Result stacked + ROAS harian) — deferred, agen fokus list+detail dulu
- [x] Section Status Cron — `CronStatusTable.svelte`

### States
- [x] Skeleton per section saat loading
- [x] Empty states (no akun, no warning, no notif)
- [x] Error toast via svelte-sonner
- [ ] Stale data badge jika `last sync > 24h` — nice-to-have, defer

---

## Fase 4 — Frontend Detail Page (1 hari) ✅

- [x] Route: `src/routes/monitoring-ads/[fbActId]/+page.svelte` (636 baris)
- [x] Header: nama akun, customer, advertiser (admin only), tipe, status badge, token badge
- [x] Card "Saldo & Threshold" (read snapshot terbaru)
- [x] Card "Threshold Override" dengan tombol Edit
- [x] Modal Edit Threshold: 3 input nullable + validasi + call `PUT /thresholds` — `ThresholdEditModal.svelte`
- [x] Chart timeline saldo (30 hari) + threshold lines
- [x] Tabel Daily Insights
- [x] Tabel Breakdown Result (per label)
- [x] Tabel Campaign harian (date picker)
- [x] Section Purchase Metrics (conditional via flag `hasPurchase`)
- [x] Log Notifikasi

---

## Fase 5 — Polish, Permission, Test (½ hari) — partial

### Permission (code-level — verified via implementation)
- [x] Backend `loadFbActForScope` cek `scope.fbActIds.includes(row.id)` → advertiser lain dapat 403
- [x] `PUT /thresholds` lewat helper yang sama → non-owner 403
- [x] `/advertisers` endpoint admin-only check
- [x] Frontend filter Advertiser hanya muncul untuk role admin (logic di +page.svelte)

### Responsif & UX
- [x] Loading skeleton & error states komplit (toast via svelte-sonner)
- [x] Toast sukses/error untuk edit threshold
- [ ] Mobile breakpoint review — perlu pengetesan manual

### Smoke test end-to-end (manual — perlu dev server jalan)
- [ ] Login admin → buka `/monitoring-ads` → lihat semua akun, filter advertiser & customer
- [ ] Login advertiser → buka `/monitoring-ads` → hanya akun miliknya
- [ ] Detail akun → edit threshold → verifikasi tersimpan dan (setelah cron next run) `status_level` diperbarui
- [ ] Verifikasi angka match dengan pesan Telegram terbaru dari `notify.py`

---

## Deployment

- [ ] Migration 0024 dijalankan di server prod: `bun scripts/apply-migration.ts drizzle/0024_add_fb_act_threshold_overrides.sql`
- [ ] Deploy update notifier (read override sebelum default)
- [ ] Restart systemd service v-auto-backend
- [ ] Deploy v-auto-frontend (build + reload)
- [ ] Setelah commit: `npx gitnexus analyze --embeddings` untuk refresh index
- [ ] Monitoring 24 jam pertama: pastikan cron tetap kirim notif Telegram tanpa regresi

---

## Risiko & Pertanyaan Terbuka (re-check sebelum start)

- [ ] Konfirmasi join path advertiser → fb_act: `users → subscriptions(advertiser_id) → fb_act(subscription_id)` — apakah selalu lewat subscriptions, atau ada fb_act yang `subscription_id` null secara historis?
- [ ] Konfirmasi semantik `fb_token.user_id` — apakah token bisa shared antar advertiser?
- [ ] Apakah edit threshold perlu audit log terpisah (tabel `fb_act_threshold_audit`) atau cukup `data_json.threshold_audit`?
- [ ] Apakah perlu endpoint bulk update threshold (admin override massal) di Fase 2, atau cukup single-akun via detail page?
- [ ] Konfirmasi chart lib yang sudah dipakai di v-auto-frontend (reuse `marketing/line-chart.svelte`?)
- [ ] Estimasi volume `fb_act_daily_data` — sekarang masih kecil; kalau >100 akun × 365 hari, chart 30-hari masih OK
- [ ] Permission string untuk "Internal viewer" (opsional di plan §2) — sementara skip, fokus dua role utama
