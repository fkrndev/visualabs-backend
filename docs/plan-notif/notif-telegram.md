# Plan: Notifikasi Telegram untuk Advertiser

Status: **Implementasi selesai (Fase 0–9)** — siap go-live setelah migrasi DB + crontab
Owner: Saiful
Tanggal: 2026-05-21
Dispatcher: [src/services/notifyTelegram.ts](../../src/services/notifyTelegram.ts)
API routes: [src/routes/notifications.ts](../../src/routes/notifications.ts) (prefix `/api/notifications`)
Relay API: `https://mail.dots.my.id/api/notifications/telegram/send` (username-based, parseMode `HTML`)
Cron docs: [CRON_JOBS.md](./CRON_JOBS.md)

---

## 0. Status Implementasi

| Fase | Deskripsi | Status | File Utama |
|---|---|---|---|
| 0 | Schema + migrasi 3 tabel baru | ✅ Done | [schema.ts:1113-1182](../../src/db/schema.ts#L1113-L1182), [0025_add_notification_system.sql](../../drizzle/0025_add_notification_system.sql) |
| 1 | Dispatcher service + endpoint preferences/test/history | ✅ Done | [notifyTelegram.ts](../../src/services/notifyTelegram.ts), [routes/notifications.ts](../../src/routes/notifications.ts) |
| 2 | Endpoint pause/resume + popover quick-setting di header | ✅ Done | [notif-quick-popover.svelte](../../../v-auto-frontend/src/lib/components/notif-quick-popover.svelte) |
| 3 | Halaman setting (`/settings/notifications`) | ✅ Done | [+page.svelte](../../../v-auto-frontend/src/routes/settings/notifications/+page.svelte) — terhubung API |
| 4 | Halaman history (`/notifications`) | ✅ Done | [+page.svelte](../../../v-auto-frontend/src/routes/notifications/+page.svelte) — terhubung API |
| 5 | Migrasi daily report ke `dispatchNotification` | ✅ Done | [metaAdsDailyReport.ts](../../src/jobs/metaAdsDailyReport.ts) (dual-write `fb_act_notifications_log` lama tetap aktif) |
| 6 | Real-time Tier 1 (BALANCE_DEPLETED/CRITICAL_RT, TOKEN_INVALID, CRON_FAILED) | ✅ Done | [syncFbActBalance.ts](../../src/jobs/syncFbActBalance.ts), [realtimeBalanceCheck.ts](../../src/jobs/realtimeBalanceCheck.ts) |
| 7 | Reminder jobs (meeting/todo/ticket/scorecard) | ✅ Done | [notificationReminders.ts](../../src/jobs/notificationReminders.ts) |
| 8 | Summary + anomaly (weekly/monthly/spike/drop/zero/ROAS) | ✅ Done | [notificationSummaries.ts](../../src/jobs/notificationSummaries.ts) |
| 9 | Dokumentasi cron + verifikasi typecheck | ✅ Done | [CRON_JOBS.md](./CRON_JOBS.md) |

**Yang perlu dilakukan untuk go-live**:
1. Jalankan migrasi: `mysql -u <user> -p <db> < drizzle/0025_add_notification_system.sql`
2. Set env vars (lihat [CRON_JOBS.md §Env vars](./CRON_JOBS.md#env-vars-yang-diperlukan))
3. Install 7 entri crontab dari [CRON_JOBS.md](./CRON_JOBS.md)
4. Restart backend untuk pickup route `/api/notifications/*`

---

## 1. Tujuan

1. Memetakan **seluruh jenis notifikasi Telegram** yang masuk akal untuk advertiser di stack v-auto (bukan hanya daily report yang sudah jalan).
2. Mendukung **3 mode utama**: real-time alert (urgent), reminder terjadwal, dan summary periodik.
3. Mendesain **sistem pengaturan (preferences)** agar advertiser nyaman: bisa pilih notif mana yang aktif, jam berapa diterima, ke siapa dikirim, dengan **quick toggle** untuk pause cepat.
4. Memberi **halaman history** agar advertiser tahu apa saja yang sudah dikirim ke mereka.
5. Memberi roadmap implementasi yang inkremental — tidak menyentuh job harian yang sudah stabil di production.

Prinsip yang dipegang:

- **Opt-in by default untuk notif non-kritikal**, opt-out untuk yang kritikal (saldo habis, token expired).
- **Tidak spam**: tiap jenis punya rate-limit / dedupe key supaya tidak kirim berulang-ulang.
- **Username-based** (bukan chat_id manual) — mengikuti relay API yang sudah dipakai.
- **Per-account override** tetap dimungkinkan (sudah ada di `fb_act.data_json.telegram_username` & `extra_telegram_username`).
- **Quick toggle** harus 1 klik / 1 command — advertiser sering butuh "mute sekarang" tanpa buka pengaturan detail.

---

## 2. Kondisi Saat Ini (Sudah Jalan / Implemented)

Semua notif kini dispatched lewat [`dispatchNotification`](../../src/services/notifyTelegram.ts) yang terpusat dengan rules: resolver recipient → pause check → preference check → quiet hours → dedupe → kirim → log.

Resolver recipient (5-tingkat fallback, di dalam dispatcher):

1. **Override per akun** — `fb_act.data_json.telegram_username` (legacy) atau `notification_preferences` dengan kode sentinel `_recipient_override_`
2. **Global settings user** — `notification_settings_global.telegram_username`
3. **Profile** — `profiles.telegram_username`
4. **Username user** — `users.username`
5. **Env** — `process.env.TELEGRAM_NOTIFY_USERNAME`

Extra recipient: `notification_settings_global.extra_telegram_username` atau `fb_act.data_json.extra_telegram_username` (legacy).

Notif yang sudah aktif (lihat §14 untuk daftar lengkap kode):

- Daily report harian (mode C) + error path (mode A)
- Balance alert level warning/critical/depleted (gabung daily + real-time)
- Token invalid auto-detect dari OAuthException
- Cron failed alert ke admin
- Meeting reminder (24h/1h/15m, baca meeting_members)
- Todo deadline/overdue, ticket follow-up
- Scorecard input due + alert zona merah
- Weekly/monthly summary
- Anomaly: spend spike, result drop, zero spend, ROAS milestone

---

## 3. Arsitektur Tiga Mode

Tiap notifikasi diklasifikasikan ke salah satu mode supaya cara handling-nya konsisten.

```
┌─────────────────────────────────────────────────────────────┐
│ MODE A — REAL-TIME ALERT  (urgent, byp​ass quiet hours)        │
│   Pemicu: event langsung (job sync, webhook, sync balance)    │
│   Contoh: saldo habis, token revoked, ROAS crash, ticket    │
│   urgent dibuat untuk advertiser ini                          │
├─────────────────────────────────────────────────────────────┤
│ MODE B — REMINDER  (terjadwal pendek, dekat dengan event)     │
│   Pemicu: cron tiap jam / 15 menit, hitung jeda waktu ke     │
│   meeting/deadline/follow-up                                  │
│   Contoh: meeting 1 jam lagi, todo deadline besok, scorecard │
│   week ini belum diisi                                        │
├─────────────────────────────────────────────────────────────┤
│ MODE C — SUMMARY  (terjadwal panjang, periodic digest)        │
│   Pemicu: cron harian/mingguan/bulanan                       │
│   Contoh: daily report, weekly performance, monthly recap     │
└─────────────────────────────────────────────────────────────┘
```

| Properti | Mode A | Mode B | Mode C |
|---|---|---|---|
| Bypass quiet hours | Ya (untuk Tier 1) | Tidak | Tidak |
| Dedupe window | Per event | Per slot waktu | Per tanggal |
| Default state | ON utk Tier 1 | OPT-IN | ON utk daily, OPT-IN sisanya |
| Bisa di-snooze quick | Ya | Ya | Ya |

---

## 4. Inventaris Notifikasi

### 4.1 Mode A — Real-Time Alert

| Kode | Notif | Pemicu | Tier | Dedupe key |
|---|---|---|---|---|
| `BALANCE_DEPLETED` | Saldo ≤ 0 di tengah hari | Saat job sync balance (lihat [syncFbActBalance.ts](../../src/jobs/syncFbActBalance.ts)) deteksi state berubah | **Kritikal** | `act_id:date:depleted` |
| `BALANCE_CRITICAL_RT` | Saldo turun di bawah threshold critical di luar jam daily report | sda. | **Kritikal** | `act_id:date:critical_rt` |
| `TOKEN_INVALID` | `fb_token.status` berubah 1→0 | Job manapun yang dapat error OAuth → set status + dispatch | **Kritikal** | `token_id:date` |
| `TOKEN_EXPIRED_GRAPH` | Graph API mengembalikan `OAuthException 190` | Per call Meta API yang fail dengan code itu | **Kritikal** | `token_id:date:oauth` |
| `CRON_FAILED` | Daily report cron error fatal / 0 sukses | Akhir `runMetaAdsDailyReport` | **Kritikal** | `report_run_id` |
| `CAMPAIGN_ANOMALY_RT` | Spend 1 jam terakhir > X% dari biasanya (kalau ada hourly poll) | Job hourly insights (kalau ditambahkan) | Insight | `campaign_id:hour` |
| `TICKET_URGENT_NEW` | `ticket_issues` baru ber-priority urgent untuk customer milik advertiser | DB trigger / saat POST `/api/tickets` | Operasional | `ticket_id:new` |
| `TICKET_STATUS_CHANGED` | Status ticket pindah ke `pending_on=advertiser` | Saat update ticket | Operasional | `ticket_id:status` |
| `MEETING_RESCHEDULED` | `meetings.date` berubah < 24 jam dari sekarang | Saat update meeting | Operasional | `meeting_id:date` |

### 4.2 Mode B — Reminder Terjadwal

| Kode | Notif | Cron | Logika |
|---|---|---|---|
| `MEETING_REMINDER` | Meeting akan dimulai dalam jendela waktu (24h, 1h, 15m) | Cron tiap 15 menit | Query `meetings` di mana `date BETWEEN now+W-Δ AND now+W+Δ`, advertiser jadi `assigned_to` / `meeting_members` |
| `TODO_DEADLINE_REMINDER` | Todo dengan deadline H-1 atau H-0 jam 09:00 | Cron tiap 1 jam | Query `todos.status != done` + `data_json.deadline` ≤ besok |
| `TODO_OVERDUE` | Todo lewat deadline & masih open | Cron pagi 09:00 WIB | Query `todos.status` open + deadline < today |
| `TICKET_FOLLOWUP_DUE` | Ticket `hold_since` lebih dari N hari | Cron pagi 09:00 WIB | Threshold per status |
| `SCORECARD_INPUT_DUE` | Scorecard mingguan belum diisi (`scorecard_data` kosong untuk minggu ini) | Cron Jumat 16:00 / Senin 09:00 WIB | Per scorecard aktif dengan `assigned_to = advertiser_user_id` |
| `SCORECARD_ALERT` | `scorecard_data.status` masuk red (di bawah `yellow_threshold`) saat baru diinput | Webhook setelah POST scorecard data | Bandingkan actualValue vs targetValue + thresholds di `scorecards` |

### 4.3 Mode C — Summary Periodik

| Kode | Notif | Cron | Default |
|---|---|---|---|
| `DAILY_REPORT` | Sudah ada — laporan Meta Ads harian per akun | 05:00 WIB (configurable) | **ON** |
| `BALANCE_WARNING` | Bagian dari daily report, atau standalone kalau warning level tetap | Bareng daily report | **ON** |
| `WEEKLY_SUMMARY` | Ringkasan 7 hari: total spend, total result, trend, top campaign | Senin 08:00 WIB | OPT-IN |
| `MONTHLY_SUMMARY` | Ringkasan bulan kalender lalu + perbandingan vs bulan sebelumnya | Tanggal 1 jam 09:00 WIB | OPT-IN |
| `SPEND_SPIKE` | Spend kemarin > X% rata-rata 7 hari | Setelah daily report | OPT-IN |
| `RESULT_DROP` | Result kemarin < Y% rata-rata 7 hari padahal spend stabil | Setelah daily report | OPT-IN |
| `ZERO_SPEND` | Akun "tidur" — h-1 zero spend padahal h-2 ada | Setelah daily report | OPT-IN |
| `ROAS_MILESTONE` | ROAS harian capai target user | Setelah daily report (akun dengan purchase_metrics) | OPT-IN |
| `MEETING_SUMMARY` | Resume meeting hari ini setelah meeting selesai (pakai `meetings.summary`) | Cron tiap jam, kirim 30 menit setelah `date` lewat | OPT-IN |

### 4.4 Sistem & Akun

| Kode | Notif | Pemicu |
|---|---|---|
| `NOTIF_TEST` | Tes manual dari halaman preferences | On demand |
| `NEW_ACCOUNT_LINKED` | `fb_act` baru ditambahkan | Webhook insert |
| `THRESHOLD_CHANGED` | Override threshold diubah | PUT `/accounts/:id/thresholds` |
| `PREFERENCES_CHANGED` | Konfirmasi 1x setelah user simpan preferences besar | Setelah PUT `/preferences/*` |
| `PAUSE_ACTIVATED` | Konfirmasi "notif dijeda sampai…" | Saat quick toggle pause |
| `PAUSE_DEACTIVATED` | Konfirmasi "notif aktif kembali" | Saat quick toggle resume / TTL habis |

---

## 5. Desain Database

### 5.1 Tabel: `notification_preferences`

Granular: 1 row per (`user_id`, `fb_act_id`, `notif_code`). Menggantikan field ad-hoc di `fb_act.data_json`.

```sql
CREATE TABLE notification_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  fb_act_id INT NULL,                 -- NULL = berlaku global utk user; isi = override per akun
  notif_code VARCHAR(64) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  channel VARCHAR(32) NOT NULL DEFAULT 'telegram',
  data_json JSON NULL,                -- override kecil (mis. spike_threshold_percent, lead_time_minutes)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_act_code (user_id, fb_act_id, notif_code, channel),
  KEY idx_user (user_id),
  KEY idx_act (fb_act_id)
);
```

Resolusi efektif:
1. Row `(user_id, fb_act_id, notif_code)` → pakai itu.
2. Fallback row `(user_id, NULL, notif_code)` global user.
3. Fallback default per `notif_code` (Tier).

### 5.2 Tabel: `notification_settings_global`

```sql
CREATE TABLE notification_settings_global (
  user_id INT PRIMARY KEY,
  telegram_username VARCHAR(64),         -- override profiles.telegram_username
  extra_telegram_username VARCHAR(64),   -- recipient sekunder
  telegram_status TINYINT DEFAULT 0,     -- 0=unknown, 1=verified, 2=failed
  telegram_verified_at TIMESTAMP NULL,   -- terakhir kali "Tes" sukses
  quiet_hours_start TINYINT DEFAULT 22,
  quiet_hours_end TINYINT DEFAULT 6,
  daily_report_time TINYINT DEFAULT 5,
  language VARCHAR(8) DEFAULT 'id',
  paused_until TIMESTAMP NULL,           -- quick-pause
  paused_reason VARCHAR(255) NULL,
  data_json JSON NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

`telegram_status` + `telegram_verified_at` dipakai indikator di UI ("✓ Tersambung" / "⚠ Belum diverifikasi").

### 5.3 Tabel: `notification_log`

```sql
CREATE TABLE notification_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  fb_act_id INT NULL,
  notif_code VARCHAR(64) NOT NULL,
  mode CHAR(1) NOT NULL,              -- A/B/C
  dedupe_key VARCHAR(191) NOT NULL,
  recipient VARCHAR(128) NOT NULL,
  title VARCHAR(255) NULL,            -- judul singkat untuk halaman history
  preview VARCHAR(500) NULL,          -- 1-2 baris preview pesan
  status ENUM('sent','failed','skipped') NOT NULL,
  reason VARCHAR(255) NULL,
  read_at TIMESTAMP NULL,             -- ketika user buka di halaman history
  data_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_dedupe (dedupe_key, recipient, notif_code),
  KEY idx_user_date (user_id, created_at),
  KEY idx_act_code (fb_act_id, notif_code),
  KEY idx_unread (user_id, read_at)
);
```

`read_at` mendukung **unread badge** di halaman history.

`fb_act_notifications_log` lama dipertahankan dengan dual-write selama 1 minggu untuk safety.

---

## 6. Halaman Setting Notifikasi

Lokasi: `Settings → Notifications` di area advertiser. Satu halaman, scroll panjang.

```
┌─────────────────────────────────────────────────────────────┐
│ Notifikasi Telegram                                          │
├─────────────────────────────────────────────────────────────┤
│ [SECTION 1] Quick Setting  ← always visible di atas         │
│                                                              │
│   ⏸  [ Jeda semua selama 1 jam ]  [ 3 jam ]  [ Sampai besok ]│
│      [ Custom… ]                                             │
│   ▶  [ Aktifkan kembali ]   ← muncul kalau sedang pause     │
│                                                              │
│   Status saat ini: 🟢 Aktif                                  │
│      (atau: ⏸ Dijeda sampai 21 Mei 18:00 — Aktifkan kembali)│
├─────────────────────────────────────────────────────────────┤
│ [SECTION 2] Akun Telegram                                    │
│   Username utama:  [ @andi_va        ]  [ Tes ]              │
│   Status: ✓ Tersambung (verifikasi terakhir 20 Mei 14:21)   │
│                                                              │
│   Username tambahan (opsional): [ @asisten   ]  [ Tes ]      │
│                                                              │
│   ▸ Belum punya Telegram? [ Lihat panduan ]                  │
├─────────────────────────────────────────────────────────────┤
│ [SECTION 3] Setting Global                                   │
│   Bahasa: [ Indonesia ▾ ]                                    │
│   Jam Diam: [ 22:00 ▾ ] – [ 06:00 ▾ ] WIB                   │
│     (Notif kritikal tetap dikirim)                           │
│   Jam Daily Report: [ 05:00 ▾ ]                             │
├─────────────────────────────────────────────────────────────┤
│ [SECTION 4] Real-Time Alert                                  │
│   ☑ Saldo habis                ← terkunci ON                │
│   ☑ Saldo di bawah critical    ← terkunci ON                │
│   ☑ Token Meta invalid         ← terkunci ON                │
│   ☑ Cron daily report gagal    ← terkunci ON                │
│   ☐ Anomali campaign realtime                                │
│   ☐ Ticket urgent baru                                       │
│   ☐ Status ticket berubah ke saya                            │
│   ☐ Meeting di-reschedule                                    │
├─────────────────────────────────────────────────────────────┤
│ [SECTION 5] Reminder                                         │
│   ☐ Meeting H-1 jam 09:00                                    │
│   ☐ Meeting 1 jam sebelum                                    │
│   ☐ Meeting 15 menit sebelum                                 │
│   ☐ Resume meeting setelah selesai                           │
│   ☐ Todo deadline besok (H-1, jam 09:00)                     │
│   ☐ Todo lewat deadline (overdue)                            │
│   ☐ Ticket menunggu follow-up > [ 3 ▾ ] hari                │
│   ☐ Scorecard mingguan belum diisi (Jumat 16:00)             │
│   ☐ Scorecard masuk zona merah                               │
├─────────────────────────────────────────────────────────────┤
│ [SECTION 6] Summary Periodik                                 │
│   ☑ Daily Report (Meta Ads harian)                           │
│   ☐ Weekly Summary (Senin pagi)                              │
│   ☐ Monthly Summary (tanggal 1)                              │
│   ☐ Spend spike > [ 50% ▾ ]                                  │
│   ☐ Result drop > [ 50% ▾ ]                                  │
│   ☐ Zero-spend (akun tidur)                                  │
│   ☐ ROAS milestone (target [ 3.0x ▾ ])                       │
├─────────────────────────────────────────────────────────────┤
│ [SECTION 7] Per Akun                                         │
│   Tabel: Akun | Recipient override | Jam DR | Override notif│
│   Klik baris → modal edit per-akun                          │
│   [ Reset semua ke default global ]                          │
├─────────────────────────────────────────────────────────────┤
│ [SECTION 8] Pause Mendalam (jadwalkan jeda panjang)          │
│   ☐ Matikan semua notif sampai [ tanggal ▾ ]                 │
│   (Beda dari Quick Setting di atas — ini untuk cuti panjang)│
└─────────────────────────────────────────────────────────────┘
                                       [ Simpan ] [ Batal ]
```

### UX details

- **Quick Setting (§1)** selalu di puncak halaman dan **juga di pojok kanan atas dashboard** (button kecil dengan bell icon). Pause cepat 1 klik tanpa harus simpan.
- **Tombol Tes** memicu `NOTIF_TEST`. Hasil tampil inline: "Terkirim ke @andi_va" / "Gagal — username tidak ditemukan di Telegram. Pastikan kamu sudah /start ke bot."
- **Toggle Tier 1 yang terkunci** punya tooltip alasan kunci ("Notif ini wajib agar iklan tidak mati tanpa peringatan").
- **Per-akun override** lewat modal — tidak menggembungkan halaman utama.

---

## 7. Halaman History Notifikasi

Lokasi: `Notifications` di sidebar utama advertiser (icon 🔔 dengan badge unread). Bukan tab di Settings.

```
┌─────────────────────────────────────────────────────────────┐
│ 🔔 Notifikasi   [Hari ini ▾] [Semua jenis ▾] [Akun ▾]        │
│                                              [Tandai dibaca]│
├─────────────────────────────────────────────────────────────┤
│ 21 Mei 2026                                                  │
│  • 05:00  📊 Daily Report — akun 10 VA                       │
│           Spend Rp 480.000 · CTR 1.8% · 🟢 saldo aman        │
│  • 11:20  🚨 Saldo critical — akun 10 VA          [unread]   │
│           Saldo Rp 72.500 — segera top up.                   │
│                                                              │
│ 20 Mei 2026                                                  │
│  • 09:00  ⏰ Meeting H-1 — Review Mingguan                   │
│  • 05:00  📊 Daily Report — akun 10 VA                       │
│                                                              │
│ [ Muat lebih banyak ]                                        │
└─────────────────────────────────────────────────────────────┘
```

Detail:

- Klik item → modal/expand menampilkan pesan lengkap (sama dengan yang dikirim ke Telegram).
- Source: `notification_log` (status=`sent` saja). Item `skipped`/`failed` tidak tampil ke advertiser, hanya ke admin.
- Filter: rentang tanggal, kode notif (dropdown nama ramah), akun.
- Badge unread di sidebar = `COUNT(read_at IS NULL)`. Auto-mark-read saat item dilihat / saat tombol "Tandai dibaca" diklik.
- **Tujuan halaman**: advertiser bisa "scroll back" kalau Telegram-nya hilang / dia di-mute saat itu. Telegram tetap channel utama, history web jadi safety net.

---

## 8. Quick Setting (Detail Spec)

Karena diminta eksplisit sebagai feature, dijabarkan terpisah.

### 8.1 UI Quick Toggle

- Lokasi: header app, kanan atas. Icon 🔔 dengan dot status (hijau aktif / abu paused).
- Klik → popover kecil:

```
┌─────────────────────────────┐
│ Status: 🟢 Aktif             │
│                              │
│ ⏸ Jeda notif:               │
│   [ 1 jam   ]               │
│   [ 3 jam   ]               │
│   [ Sampai besok jam 06:00 ]│
│   [ Custom… ]                │
│                              │
│ [ Buka pengaturan ]          │
└─────────────────────────────┘
```

- Setelah klik durasi → `notification_settings_global.paused_until` ditulis, banner kuning muncul di app: "Notif Telegram dijeda sampai 21 Mei 18:00. Aktifkan kembali."
- Saat sedang pause:
  ```
  ┌─────────────────────────────┐
  │ Status: ⏸ Dijeda             │
  │   sampai 21 Mei 18:00        │
  │                              │
  │ [ Aktifkan kembali sekarang ]│
  │ [ Tambah 1 jam ]             │
  │                              │
  │ [ Buka pengaturan ]          │
  └─────────────────────────────┘
  ```

### 8.2 Endpoint

| Method | Path | Body | Efek |
|---|---|---|---|
| POST | `/api/notifications/pause` | `{ duration_minutes: number, reason?: string }` | Set `paused_until = now + duration` |
| POST | `/api/notifications/resume` | — | Set `paused_until = NULL` |

Setelah pause/resume, kirim notif konfirmasi `PAUSE_ACTIVATED` / `PAUSE_DEACTIVATED` (1 pesan singkat ke Telegram juga) supaya advertiser tahu state-nya nyala/mati.

### 8.3 Pause behavior

- Saat `paused_until > now`:
  - **Mode A Kritikal** (`BALANCE_DEPLETED`, `TOKEN_INVALID`, dst.) → **tetap dikirim** (tidak bisa di-mute via quick).
  - Mode A non-kritikal, Mode B, Mode C → **skip**, dicatat `reason = paused` di log.
- Pause TTL otomatis kadaluarsa — tidak perlu cron khusus, cek dilakukan di dispatcher tiap kirim.

---

## 9. Endpoint Backend

Folder: `src/routes/notifications.ts`, prefix `/api/notifications`.

| Method | Path | Fungsi |
|---|---|---|
| GET | `/preferences` | Global settings + list preferences per akun |
| PUT | `/preferences/global` | Update `notification_settings_global` |
| PUT | `/preferences/codes` | Bulk update on/off per `notif_code` |
| PUT | `/preferences/accounts/:fbActId` | Override preferences per akun |
| POST | `/test` | Kirim `NOTIF_TEST` ke username tertentu, update `telegram_status` |
| POST | `/pause` | Quick pause (lihat §8.2) |
| POST | `/resume` | Quick resume |
| GET | `/history?limit&from&to&code&unread` | List untuk halaman history |
| POST | `/history/read` | Mark sebagai dibaca: `{ ids?: number[], all?: boolean }` |
| GET | `/history/unread-count` | Untuk badge sidebar |

Semua endpoint `requireAuth` + scope user (advertiser hanya boleh edit miliknya; admin boleh impersonate via `?userId=`).

---

## 10. Service Dispatcher

Ekstrak ke `src/services/notifyTelegram.ts`:

```ts
export async function dispatchNotification(opts: {
  userId: number;
  fbActId?: number | null;
  notifCode: string;
  mode: 'A' | 'B' | 'C';
  dedupeKey: string;
  title: string;
  preview?: string;
  buildMessage: () => string | Promise<string>;
  forceSend?: boolean;   // Tier 1 byp​ass pause + quiet hours
}): Promise<{ status: 'sent' | 'skipped' | 'failed'; reason?: string }>;
```

Langkah dispatcher:

1. **Resolve recipient** — fallback chain yang sama dengan daily report saat ini.
2. **Cek `paused_until`** — kalau aktif & `forceSend = false`, skip (`reason = paused`).
3. **Cek `notification_preferences`** untuk kode itu — skip kalau OFF (kecuali Tier 1 yang force).
4. **Cek quiet hours** — kalau Mode B/C dan dalam jam diam, skip (`reason = quiet_hours`). Mode A `forceSend` byp​ass.
5. **Cek dedupe** — `INSERT IGNORE` ke `notification_log` dengan `dedupe_key`. Kalau row sudah ada, skip (`reason = dedupe`).
6. **Build pesan** lewat callback.
7. **Kirim ke relay** (`sendTelegram`). Update row log dengan status + `read_at = NULL`.

Daily report yang sudah jalan di-refactor agar memanggil dispatcher di fase belakangan (dual-write 1 minggu untuk safety).

---

## 11. Format Pesan Telegram

Header standar:

```
<emoji> <b>{TITLE}</b>
📅 {tanggal WIB} {jam jika real-time}
━━━━━━━━━━━━━━━━━━
<konteks: akun / meeting / todo / ticket>
<isi spesifik per notif…>
```

Footer (opsional kalau pesan panjang):

```
━━━━━━━━━━━━━━━━━━
⚙️ Atur notif: {link} · 🔕 Jeda 1 jam: {deep link /pause?d=60}
```

Deep-link "Jeda 1 jam" memicu endpoint `/pause` dengan token sesi (atau via redirect ke halaman web yang sudah login).

Emoji per kategori:

| Kategori | Emoji |
|---|---|
| Daily report | 📊 |
| Saldo critical / habis | 🚨 |
| Saldo warning | 💛 |
| Token invalid | 🔒 |
| Cron failed | ⚠️ |
| Weekly / monthly summary | 📈 |
| Spend spike / drop | 🔺 / 🔻 |
| Meeting | 🗓 |
| Todo / deadline | ✅ / ⏰ |
| Ticket | 🎫 |
| Scorecard | 🎯 |
| Test | 🧪 |
| Pause / resume | ⏸ / ▶ |

`parseMode: "HTML"` (relay sudah handle ini).

---

## 12. Fase Pengerjaan

### Fase 0 — Migrasi schema ✅
- [x] Drizzle migration: `notification_preferences`, `notification_settings_global`, `notification_log` → [0025_add_notification_system.sql](../../drizzle/0025_add_notification_system.sql)
- [x] Schema entries di [src/db/schema.ts:1113-1182](../../src/db/schema.ts#L1113-L1182)
- [x] Global settings di-`INSERT … ON DUPLICATE KEY UPDATE` lazily lewat `ensureGlobalRow(userId)` saat user pertama akses (tidak perlu seed batch)

### Fase 1 — Dispatcher + endpoint preferences ✅
- [x] [src/services/notifyTelegram.ts](../../src/services/notifyTelegram.ts) — `dispatchNotification(opts)` + `resolveRecipients` 4-tier + `sendTelegramTest`
- [x] [src/routes/notifications.ts](../../src/routes/notifications.ts) — GET/PUT preferences, POST /test, /pause, /resume, /history*
- [x] Terdaftar di [src/index.ts:36](../../src/index.ts#L36) sebagai `/api/notifications`
- [ ] Unit test dispatcher (opsional — backlog QA)

### Fase 2 — Quick Setting + Pause ✅
- [x] Endpoint `/pause`, `/resume`, `/pause-until`
- [x] [notif-quick-popover.svelte](../../../v-auto-frontend/src/lib/components/notif-quick-popover.svelte) di header app (mounted via [site-header.svelte](../../../v-auto-frontend/src/lib/components/site-header.svelte) + [site-header-action.svelte](../../../v-auto-frontend/src/lib/components/site-header-action.svelte))
- [x] Badge unread + status aktif/dijeda, navigate ke /notifications & /settings/notifications

### Fase 3 — Halaman Setting ✅
- [x] [src/routes/settings/notifications/+page.svelte](../../../v-auto-frontend/src/routes/settings/notifications/+page.svelte) — 8 section sesuai §6 plan
- [x] Tombol Tes wired ke `POST /api/notifications/test`, update status `verified`/`failed`
- [x] Per-akun modal dengan recipient & jam daily report override
- [x] Date-picker shadcn-svelte untuk Pause Mendalam

### Fase 4 — Halaman History ✅
- [x] [src/routes/notifications/+page.svelte](../../../v-auto-frontend/src/routes/notifications/+page.svelte) — DataTable pattern (subscriptions/admin style) + filter jenis + toggle unread-only
- [x] Endpoint `/history`, `/history/read`, `/history/unread-count`
- [x] Badge unread di header popover & header halaman
- [x] Modal detail dengan body lengkap pesan, auto-mark-read on open

### Fase 5 — Migrasi Daily Report ke dispatcher ✅
- [x] `runMetaAdsDailyReport` → `dispatchNotification(mode=C, notif_code=DAILY_REPORT)`
- [x] Status-level alert (`BALANCE_WARNING`/`CRITICAL`) gabung di loop yang sama dengan `forceSend` untuk critical
- [x] Error path → `DAILY_REPORT_ERROR` (mode A, forceSend)
- [x] Dual-write ke `fb_act_notifications_log` lama tetap aktif untuk rollback safety

### Fase 6 — Real-time Tier 1 ✅
- [x] `BALANCE_DEPLETED` & `BALANCE_CRITICAL_RT` di [syncFbActBalance.ts](../../src/jobs/syncFbActBalance.ts) (opsi `sendRealtimeAlerts: true`)
- [x] `TOKEN_INVALID` saat catch detect OAuthException → set `fb_token.status=0` + dispatch
- [x] `CRON_FAILED` ke admin di [realtimeBalanceCheck.ts](../../src/jobs/realtimeBalanceCheck.ts) saat >50% akun gagal
- [x] Runner: [scripts/run-realtime-balance-check.ts](../../scripts/run-realtime-balance-check.ts)

### Fase 7 — Reminder ✅
- [x] [src/jobs/notificationReminders.ts](../../src/jobs/notificationReminders.ts) — 5 fungsi terpisah + `runAllReminders()`
- [x] `MEETING_REMINDER_24H/1H/15M` (baca `meeting_members` untuk multi-recipient)
- [x] `TODO_DEADLINE` (H-1) + `TODO_OVERDUE` (status != done, due < today)
- [x] `TICKET_FOLLOWUP` (default 3 hari, configurable per-user via `data_json.days`)
- [x] `SCORECARD_INPUT_DUE` (ISO week, skip kalau data minggu ini sudah ada) + `SCORECARD_ALERT` (zona merah berdasar yellowThreshold)
- [x] Runner: [scripts/run-notification-reminders.ts](../../scripts/run-notification-reminders.ts) `<meetings|todos|tickets|scorecards|all>`

### Fase 8 — Summary + Anomaly ✅
- [x] `WEEKLY_SUMMARY` — [scripts/run-weekly-summary.ts](../../scripts/run-weekly-summary.ts), cron Senin 08:00
- [x] `MONTHLY_SUMMARY` — [scripts/run-monthly-summary.ts](../../scripts/run-monthly-summary.ts), cron tgl 1 jam 09:00, dengan delta vs bulan lalu
- [x] `detectAndNotifyAnomalies()` di [notificationSummaries.ts](../../src/jobs/notificationSummaries.ts) — dipanggil inline di akhir loop daily report, baca threshold per-user dari `notification_preferences.data_json`
- [x] 4 anomaly: SPEND_SPIKE, RESULT_DROP, ZERO_SPEND, ROAS_MILESTONE

### Fase 9 — Polish & QA ✅
- [x] Dokumentasi cron lengkap di [CRON_JOBS.md](./CRON_JOBS.md) (7 entri + manual test + env vars + verifikasi end-to-end)
- [x] TypeScript backend bersih (`tsc --noEmit --skipLibCheck` hanya pre-existing `baseUrl` deprecation warning)
- [x] Svelte-check bersih untuk 4 file baru frontend
- [ ] Live smoke test dengan akun "akun 10 VA" milik user `andi` (perlu user trigger setelah migrasi)
- [ ] Update [docs/meta-ads-v16/CRON_JOB.md](../meta-ads-v16/CRON_JOB.md) — masih lama, ganti referensi ke [CRON_JOBS.md](./CRON_JOBS.md)

---

## 13. Cron Schedule (lihat [CRON_JOBS.md](./CRON_JOBS.md) untuk entri lengkap)

| Job | Cron WIB | Runner |
|---|---|---|
| Daily Meta Ads Report (+ anomaly inline) | `0 5 * * *` | `scripts/run-meta-ads-report.ts` |
| Realtime balance check (Tier 1 alerts) | `0 */2 * * *` | `scripts/run-realtime-balance-check.ts` |
| Reminder meeting | `*/15 * * * *` | `scripts/run-notification-reminders.ts meetings` |
| Reminder todo | `0 9 * * *` | `scripts/run-notification-reminders.ts todos` |
| Reminder ticket follow-up | `0 9 * * *` | `scripts/run-notification-reminders.ts tickets` |
| Scorecard reminder | `0 16 * * 5` + `0 9 * * 1` | `scripts/run-notification-reminders.ts scorecards` |
| Weekly summary | `0 8 * * 1` | `scripts/run-weekly-summary.ts` |
| Monthly summary | `0 9 1 * *` | `scripts/run-monthly-summary.ts` |

Semua command pakai pola yang sama: `cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/<runner>.ts`.

## 14. Notif Code Reference (final)

Kode persis yang dipakai backend & frontend. Frontend menyimpan label/emoji/color per kode di [helper-and-state.svelte.ts](../../../v-auto-frontend/src/routes/notifications/helper-and-state.svelte.ts):

| Kode | Mode | Default | Dispatch dari | forceSend |
|---|---|---|---|---|
| `DAILY_REPORT` | C | ON | daily report | — |
| `DAILY_REPORT_ERROR` | A | ON | daily report (catch) | ✓ |
| `BALANCE_WARNING` | C | ON | daily report (statusLevel=1) | — |
| `BALANCE_CRITICAL` | C | ON | daily report (statusLevel=2) | ✓ |
| `BALANCE_CRITICAL_RT` | A | ON | realtimeBalanceCheck | ✓ |
| `BALANCE_DEPLETED` | A | ON | realtimeBalanceCheck | ✓ |
| `TOKEN_INVALID` | A | ON | syncFbActBalance (OAuthException) | ✓ |
| `CRON_FAILED` | A | ON | realtimeBalanceCheck (>50% gagal) | ✓ |
| `MEETING_REMINDER_24H` | B | ON | reminders | — |
| `MEETING_REMINDER_1H` | B | ON | reminders | — |
| `MEETING_REMINDER_15M` | B | OFF | reminders | — |
| `MEETING_SUMMARY` | C | OFF | (backlog) | — |
| `MEETING_RESCHEDULED` | A | ON | (backlog — perlu webhook) | — |
| `TODO_DEADLINE` | B | ON | reminders | — |
| `TODO_OVERDUE` | B | ON | reminders | — |
| `TICKET_FOLLOWUP` | B | OFF | reminders | — |
| `TICKET_URGENT_NEW` | A | ON | (backlog — perlu webhook) | — |
| `TICKET_STATUS_CHANGED` | A | ON | (backlog — perlu webhook) | — |
| `SCORECARD_INPUT_DUE` | B | ON | reminders | — |
| `SCORECARD_ALERT` | B | ON | reminders | — |
| `WEEKLY_SUMMARY` | C | OFF | weekly summary cron | — |
| `MONTHLY_SUMMARY` | C | OFF | monthly summary cron | — |
| `SPEND_SPIKE` | C | OFF | anomaly (inline daily) | — |
| `RESULT_DROP` | C | OFF | anomaly (inline daily) | — |
| `ZERO_SPEND` | C | OFF | anomaly (inline daily) | — |
| `ROAS_MILESTONE` | C | OFF | anomaly (inline daily) | — |
| `CAMPAIGN_ANOMALY_RT` | A | OFF | (backlog — perlu hourly poll) | — |
| `_recipient_override_` | — | — | per-akun override recipient (`data_json.username`) | — |
| `_daily_report_time_` | — | — | per-akun override jam (`data_json.hour`) | — |

Catatan:
- "Backlog" = code sudah didefinisi di UI/dispatch path tapi belum ada source pemicu.
- `_recipient_override_` & `_daily_report_time_` adalah sentinel kode yang dipakai untuk menyimpan per-akun override di `notification_preferences.data_json`. Bukan kode notif sungguhan.

---

## 14. Pertanyaan Terbuka

1. `MEETING_REMINDER` — apakah lead time 24h/1h/15m dipilih user atau tetap ketiganya? (Asumsi sekarang: ketiganya dengan toggle masing-masing.)
2. Halaman history apakah perlu **infinite scroll** atau cukup paginasi 50?
3. Quick pause maksimum berapa lama? (Saran: 24 jam untuk quick; lebih dari itu → arahkan ke "Pause Mendalam" di settings).
4. `daily_report_time` per-user worth implementing fase awal? Atau fix 05:00 dulu? (Bisa ditunda — Fase 5).
5. Untuk Tier 1 admin (CRON_FAILED), recipient siapa? Env var `ADMIN_NOTIFY_USERNAME` atau hard-code username admin di settings table?
6. Internationalization: ada user non-Indonesia? Saat ini semua pesan bahasa Indonesia.

---

## 15. Out of Scope

- Channel lain (Email, WhatsApp, in-app web push) — fokus Telegram. Schema sudah menampung `channel` untuk ekstensi.
- Subscribe link otomatis ke bot (obs 3236, di-defer).
- Notifikasi agregat lintas-advertiser untuk admin (admin pakai dashboard monitoring).
- A/B test format pesan.
- Snooze per-notif spesifik (mis. "mute notif spend spike akun X selama 3 hari"); cukup pakai per-akun toggle saat ini.
