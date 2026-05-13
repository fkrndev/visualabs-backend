# Plan: Halaman Monitoring Iklan (Meta Ads)

Status: Draft
Owner: Saiful
Tanggal: 2026-05-13
Sumber data: Tabel `fb_*` di [src/db/schema.ts:906-1109](../../src/db/schema.ts#L906-L1109) + logika dari [docs/meta-ads-v16/notify.py](../meta-ads-v16/notify.py)

---

## 1. Tujuan

Membuat halaman dashboard "Monitoring Iklan" di v-auto yang dapat dilihat:

- **Per advertiser** — hanya melihat akun iklan miliknya sendiri (filter by `fb_act.customer_id` / `subscription_id`).
- **Admin** — melihat seluruh advertiser & akun iklan dalam satu tampilan agregat + drilldown.

Dashboard menjawab pertanyaan utama:

1. Apakah iklan masih hidup hari ini? (saldo / spending limit cukup, status not critical)
2. Berapa spend dan performa kemarin / range tanggal tertentu?
3. Mana akun yang butuh perhatian segera (warning / critical)?
4. Bagaimana tren spend, result, CPR, dan ROAS dari waktu ke waktu?
5. Apakah notifikasi Telegram harian sudah terkirim? Apakah cron berhasil?

---

## 2. Pengguna & Akses

| Role | Yang dilihat | Endpoint guard |
|---|---|---|
| Advertiser (user) | Semua `fb_act` yang dimiliki (user → banyak customer → banyak fb_act). Bisa breakdown / filter per customer. | resolve daftar `customerId` dari `user_id` di JWT |
| Admin (`ROLE_ADMIN`) | Semua akun semua advertiser, bisa filter | `requireAuth` + role check `payload.rol === 1` |
| Internal viewer (opsional) | Read-only summary tim | permission string khusus, mis. `ads:monitoring:view` |

Keputusan: **satu user = satu advertiser**, tetapi satu advertiser bisa memiliki banyak `customer`. Halaman menampilkan agregat semua customer milik user, dengan opsi breakdown / filter per customer (dropdown "Customer").

Catatan: gunakan pola yang sudah ada — `requireAuth` (JWT) di [src/index.ts](../../src/index.ts) dan helper `requirePermission` dalam handler. Untuk advertiser, resolve daftar `customerId` dari relasi user → customer (atau dari `fb_act.token_id` → `fb_token.user_id`).

---

## 3. Sumber Data (Tabel yang Dipakai)

Sebagian besar sudah ada di schema. Diperlukan **satu kolom override threshold** (lihat catatan migrasi di bawah tabel).

| Tabel | Peran di dashboard |
|---|---|
| `fb_act` | Master akun iklan (akun, customer, subscription, token) |
| `fb_act_daily_data` | Snapshot harian: balance, spend, impressions, reach, freq, CTR, CPM, CPC, `status_level`, `warning_message`, `effective_balance`, `balance_type`, `spending_limit`, `outstanding_balance` |
| `fb_act_campaign_daily_insights` | Spend & link clicks per campaign per hari (untuk breakdown) |
| `fb_act_result_breakdown_daily` | Result per label per hari: results, spent, CPR, purchase value, ROAS |
| `fb_act_result_config` | Konfigurasi label & action_type per akun |
| `fb_act_notifications_log` | Audit kirim notifikasi (main / extra) |
| `fb_act_report_runs` | Status run cron harian: total / success / failed |
| `fb_token` | Status token per user (valid / expired) |

Field penting dari `fb_act_daily_data` untuk warning:
- `status_level`: 0 ok, 1 warning, 2 critical
- `warning_message`: pesan siap tampil
- `balance_type`: Prepaid / Credit Line / Kartu Kredit / Postpaid
- `effective_balance`, `spending_limit`, `outstanding_balance`

### Migrasi tambahan (Threshold override per akun)

Tambah kolom di `fb_act` (atau tabel kecil baru `fb_act_threshold_config` kalau ingin audit-friendly):

| Kolom | Tipe | Catatan |
|---|---|---|
| `threshold_warning_override` | `decimal(20,2) NULL` | default null → pakai `THRESHOLD_WARNING` 1.000.000 |
| `threshold_critical_override` | `decimal(20,2) NULL` | default null → pakai `THRESHOLD_CRITICAL` 100.000 |
| `postpaid_threshold_override` | `decimal(20,2) NULL` | hanya berlaku untuk akun postpaid |

Cron `notify.py` (atau ekuivalennya di v-auto-backend) saat menghitung `status_level` akan membaca override ini terlebih dahulu, fallback ke default. Endpoint backend juga membaca kolom yang sama untuk konsistensi tampilan.

Token health: pakai langsung `fb_token.status` (1 valid, 0 invalid/expired) + `updated_at`. Tidak perlu kolom baru.

---

## 4. Struktur Halaman

```
┌──────────────────────────────────────────────────────────────┐
│ Monitoring Iklan                              [Range: 7 hari ▼]│
│ Filter: [Customer ▼] [Status ▼] [Tipe Akun ▼]                 │
│ (admin extra) [Advertiser ▼]                                  │
├──────────────────────────────────────────────────────────────┤
│ KPI Cards (hari ini / kemarin)                                │
│ ┌────────┬────────┬────────┬────────┬────────┬─────────────┐ │
│ │ Total  │ Akun   │ Akun   │ Spend  │ Notif  │ Token Tidak │ │
│ │ Akun   │ Crit.  │ Warn.  │ D-1    │ Belum  │ Valid       │ │
│ └────────┴────────┴────────┴────────┴────────┴─────────────┘ │
├──────────────────────────────────────────────────────────────┤
│ Section: Akun Butuh Perhatian (status_level >= 1)             │
│ list akun + balance + warning_message + last_update           │
├──────────────────────────────────────────────────────────────┤
│ Section: Token Health                                          │
│ list fb_token per user/customer: status, updated_at, akun     │
│ yang terdampak. Highlight token expired / status=0.           │
├──────────────────────────────────────────────────────────────┤
│ Section: Tabel Akun (group/filter by Customer)                 │
│ kolom: Akun | Customer | (admin: Advertiser) | Tipe | Saldo   │
│        | Status | Spend D-1 | Impr | Clicks | CTR | CPM | CPC │
│        | Hasil Utama | ROAS | Token | Aksi (Detail)            │
├──────────────────────────────────────────────────────────────┤
│ Section: Tren (chart)                                          │
│ - Spend harian (line, 30 hari)                                 │
│ - Total result harian (per label, stacked)                     │
│ - ROAS harian (untuk akun PURCHASE_METRICS_ACCOUNTS)           │
├──────────────────────────────────────────────────────────────┤
│ Section: Status Cron & Notifikasi                              │
│ - tanggal | started | finished | success/total | failed list  │
│ - last notif per akun (main / extra)                          │
└──────────────────────────────────────────────────────────────┘
```

### Halaman Detail Akun (`/monitoring-ads/:fbActId`)

- Header: nama akun, customer, advertiser (admin only), tipe, saldo terkini, status badge, badge token health.
- Card "Threshold Setting": tampil default + nilai override (jika ada). Admin/owner bisa edit (lihat Fase 5).
- Timeline saldo (30 hari) + threshold lines (Rp 100k critical, Rp 1jt warning).
- Tabel daily insights (30 hari): spend, impr, reach, freq, clicks, CTR, CPM, CPC.
- Breakdown result per label per hari (dari `fb_act_result_breakdown_daily`).
- Tabel campaign harian (dari `fb_act_campaign_daily_insights`).
- Log notifikasi 30 hari (`fb_act_notifications_log`).
- Untuk akun di `PURCHASE_METRICS_ACCOUNTS`: section Purchase Metrics (total purchase, value, CPP, ROAS).

---

## 5. Endpoint Backend

Semua dibuat di file baru `src/routes/adsMonitoring.ts`, didaftarkan di `src/index.ts` dengan prefix `/api/ads-monitoring`.

Semua endpoint:
1. `requireAuth`
2. Resolve scope: jika admin → tanpa filter; jika advertiser → paksa `customerId = payload.customerId`.
3. Validasi range tanggal (default 7 hari, max 90 hari).

| Method | Path | Fungsi |
|---|---|---|
| GET | `/summary` | KPI cards: jumlah akun, critical, warning, total spend hari/kemarin, notif belum terkirim |
| GET | `/accounts` | Tabel akun + metric kemarin (join `fb_act` ↔ `fb_act_daily_data` tanggal terbaru) |
| GET | `/accounts/:fbActId` | Detail akun (master + daily terbaru) |
| GET | `/accounts/:fbActId/daily?from&to` | Series harian dari `fb_act_daily_data` |
| GET | `/accounts/:fbActId/campaigns?date` | Campaign harian |
| GET | `/accounts/:fbActId/results?from&to` | Result breakdown harian |
| GET | `/accounts/:fbActId/notifications?limit` | Log notifikasi |
| GET | `/alerts` | List akun dengan `status_level >= 1` pada snapshot terbaru |
| GET | `/report-runs?from&to` | Status cron harian |
| GET | `/advertisers` (admin only) | List advertiser untuk dropdown filter |
| GET | `/customers` | List customer dalam scope user (untuk dropdown filter advertiser) |
| GET | `/tokens` | Health token: `fb_token` rows + akun terdampak |
| GET | `/accounts/:fbActId/thresholds` | Baca threshold (override + default effective) |
| PUT | `/accounts/:fbActId/thresholds` | Update override (admin atau advertiser pemilik) |

Query param umum: `from`, `to` (YYYY-MM-DD), `status` (ok/warning/critical), `balanceType`, `customerId` (filter dalam scope), `advertiserUserId` (admin), `limit`, `page`.

Response shape standar:
```ts
{ success: true, data: ..., meta?: { page, total } }
```

---

## 6. Logika Penting (selaras dengan `notify.py`)

- **Status badge** mengikuti `status_level` di tabel; jika kosong, hitung on-the-fly mengikuti `get_saldo_status` (Postpaid 500k/1jt; non-postpaid 100k/1jt). **Override threshold per akun** (`threshold_warning_override`, `threshold_critical_override`, `postpaid_threshold_override`) diprioritaskan sebelum fallback ke default.
- **Token Health**: akun dianggap "Token Tidak Valid" jika `fb_token.status = 0` atau token tidak ditemukan (`fb_act.token_id IS NULL`). Tampilkan badge merah di tabel akun dan KPI card "Token Tidak Valid".
- **Label kolom "Saldo"** tergantung `balance_type`:
  - Postpaid → "Ruang sebelum ditagih"
  - Credit Line → "Sisa Saldo" + chip "Limit: X"
  - Kartu Kredit / Prepaid → "Sisa Saldo"
- **CPC** dihitung dari `spend / link_clicks` (bukan field `cpc` mentah) — sudah disimpan di `fb_act_daily_data.cpc`, tapi jika 0 dan ada link_clicks, hitung ulang.
- **Result utama** untuk kolom tabel akun diambil dari `fb_act_result_breakdown_daily` baris `result_type = 0` (primary) dengan `results` terbesar; fallback ke `result_type = 1` (traffic) lalu `2` (fallback / link_click).
- **Purchase Metrics** tampil hanya untuk akun yang `fb_act_result_config` mengandung `omni_purchase` / `offsite_conversion.fb_pixel_purchase` (gantikan hardcoded `PURCHASE_METRICS_ACCOUNTS`).
- **Notif belum terkirim**: per akun aktif, cek apakah ada entry `fb_act_notifications_log` dengan `date = today_wib` dan `type = 'main'`.

---

## 7. Frontend (v-auto-frontend)

Folder baru: `src/routes/(app)/monitoring-ads/`.

- `+page.svelte` — halaman list (KPI + alerts + tabel akun + tren).
- `[fbActId]/+page.svelte` — detail akun.
- `_lib/api.ts` — client fetch ke `/api/ads-monitoring/*` (pola sama dgn `team-insights`).
- Komponen reuse: card KPI, status badge, range picker, chart line/stacked (lib chart yang sudah dipakai).
- Untuk admin: tampilkan dropdown advertiser & kolom "Advertiser" di tabel. Tampilan ini disembunyikan untuk role non-admin.

Routing menu:
- Admin: tambahkan menu "Monitoring Iklan" di sidebar admin.
- Advertiser: tambahkan ke menu utama advertiser.

---

## 8. Non-Functional

- **Polling/refresh**: refetch tiap 60 dtk (atau tombol manual). Tidak perlu websocket — data berasal dari cron harian.
- **Timezone**: semua tanggal yang ditampilkan dalam WIB (UTC+7). Tanggal di DB sudah WIB karena cron disimpan dengan key `date` WIB (sesuai `notify.py`).
- **Performance**: query latest snapshot pakai subquery `MAX(date)` per `act_id`, atau materialized view sederhana di endpoint `/summary` & `/accounts`.
- **Empty state**: jika `fb_act_daily_data` untuk akun kosong di tanggal target, tampilkan "Belum ada data".

---

## 9. Fase Pengerjaan

### Fase 0 — Migrasi schema (0.25 hari)
- [ ] Tambah kolom `threshold_warning_override`, `threshold_critical_override`, `postpaid_threshold_override` di `fb_act` (nullable decimal).
- [ ] Generate & apply migrasi (mengikuti pola migrasi 0023 yang dipakai sebelumnya — hand-written kalau perlu).
- [ ] Update cron / notifier untuk membaca override sebelum default `THRESHOLD_WARNING` / `THRESHOLD_CRITICAL`.

### Fase 1 — Backend foundation (1 hari)
- [ ] Buat `src/routes/adsMonitoring.ts` (skeleton + auth guard + scope resolver user→customer[]).
- [ ] Endpoint `/summary`, `/accounts`, `/alerts`, `/customers`, `/tokens`.
- [ ] Daftarkan route di `src/index.ts`.
- [ ] Smoke test via curl dgn user admin & user advertiser.

### Fase 2 — Backend detail & threshold (0.75 hari)
- [ ] Endpoint detail: `/accounts/:id`, `/daily`, `/campaigns`, `/results`, `/notifications`, `/report-runs`, `/advertisers`.
- [ ] Endpoint threshold: `GET` + `PUT /accounts/:id/thresholds` (validasi ownership).
- [ ] Validasi date range & permission per akun (advertiser tidak boleh akses fbAct milik user lain).

### Fase 3 — Frontend list page (1 hari)
- [ ] Page list + KPI (incl. Token Tidak Valid) + tabel + filter (Customer, Status, Tipe, Advertiser-admin).
- [ ] Status badge & saldo label sesuai `balance_type`.
- [ ] Section "Akun Butuh Perhatian" + Section "Token Health".

### Fase 4 — Frontend detail page (1 hari)
- [ ] Timeline saldo + chart spend & result.
- [ ] Tabel campaign & breakdown result.
- [ ] Log notifikasi.
- [ ] Card threshold (read + edit override) — form sederhana 3 input.

### Fase 5 — Polish & deploy (0.5 hari)
- [ ] Empty states, loading skeleton, error toasts.
- [ ] Akses menu (admin vs advertiser).
- [ ] QA dengan akun real, verifikasi angka match dengan pesan Telegram di `notify.py`.

---

## 10. Out of Scope (untuk plan ini)

- Editing `fb_act_result_config` (label / action_type) — readonly dulu. (Threshold override **IN scope**.)
- Export CSV / PDF laporan.
- Mengirim ulang notifikasi dari UI (re-trigger Telegram).
- Realtime fetch langsung dari Graph API saat user buka halaman (saat ini cukup data hasil cron).
- Multi-tenant beyond customer scoping (RBAC granular per akun).

---

## 11. Keputusan (Resolved)

1. **Scoping advertiser**: satu user = satu advertiser, namun satu advertiser dapat memiliki banyak customer. Halaman menampilkan agregat seluruh customer milik user, dengan dropdown filter / breakdown per customer.
2. **Threshold warning/critical**: pakai default `notify.py` (100k / 1jt / postpaid 500k/1jt). Tiap akun dapat meng-override via kolom baru di `fb_act` (lihat §3 Migrasi tambahan). Editable dari halaman detail akun.
3. **Export CSV / PDF**: tidak diperlukan. Dimasukkan ke Out of Scope.
4. **Token health**: ditampilkan. KPI card "Token Tidak Valid", section khusus "Token Health" di halaman list, dan badge token per baris akun. Sumber: `fb_token.status` + `fb_act.token_id`.

## 12. Pertanyaan Terbuka (baru)

- Apakah edit threshold override perlu audit log? (siapa ubah, kapan) -> tidak perlu
- Untuk admin yang ingin override massal beberapa akun sekaligus — perlu bulk update endpoint, atau cukup satu-satu dari detail page? -> cukup satu-satu dari detail page
