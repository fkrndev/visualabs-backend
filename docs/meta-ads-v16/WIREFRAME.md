# Meta Ads Notification — Wireframe

---

## Halaman 1 — Dashboard (Daftar Akun)

```
┌─────────────────────────────────────────────────────────────────┐
│  Meta Ads Monitor                              [+ Tambah Akun]  │
├─────────────────────────────────────────────────────────────────┤
│  📅 Data: Sabtu, 3 Mei 2026   🗓 Report: Minggu, 4 Mei 2026    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐      │
│  │ 🟢 KANTOR MJO-1641      │  │ 💛 Akun 10 VA           │      │
│  │ Credit Line             │  │ Postpaid                │      │
│  │ Sisa: Rp 8.500.000      │  │ Ruang: Rp 920.000       │      │
│  │ Spent kemarin: Rp 450k  │  │ Spent kemarin: Rp 210k  │      │
│  │          [Lihat Detail] │  │          [Lihat Detail] │      │
│  └─────────────────────────┘  └─────────────────────────┘      │
│                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐      │
│  │ 🔴 KomAds WL 18         │  │ 🟢 Kuliah Di Jordan     │      │
│  │ Prepaid                 │  │ Credit Line             │      │
│  │ Sisa: Rp 45.000 ⚠️      │  │ Sisa: Rp 3.200.000      │      │
│  │ Spent kemarin: Rp 380k  │  │ Spent kemarin: Rp 175k  │      │
│  │          [Lihat Detail] │  │          [Lihat Detail] │      │
│  └─────────────────────────┘  └─────────────────────────┘      │
│                                                                 │
│  [ ... akun lainnya ... ]                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Elemen:**
- Card per akun: nama, tipe billing, status saldo (🟢💛🔴), spent kemarin
- Badge warna merah jika saldo kritis
- Tombol `+ Tambah Akun` → ke halaman Setting Akun
- Tombol `Lihat Detail` → ke Halaman 2

---

## Halaman 2 — Detail Akun

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Kembali          KANTOR MJO-1641              [⚙ Setting]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─── Info Akun ─────────────────────────────────────────────┐  │
│  │  ID Akun    : act_1566552664103924                        │  │
│  │  Tipe       : Credit Line                                 │  │
│  │  Spending Limit : Rp 20.000.000                           │  │
│  │  Sisa Saldo : 🟢 Rp 8.500.000                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Performa Kemarin ──────────────────────────────────────┐  │
│  │  💸 Total Spent    : Rp 1.450.000                         │  │
│  │  👁 Impressions    : 48.500                               │  │
│  │  🎯 Reach          : 32.100                               │  │
│  │  🔁 Frequency      : 1,51x                               │  │
│  │  🖱 Link Clicks    : 312                                  │  │
│  │  📈 CTR            : 0,64%                               │  │
│  │  📊 CPM            : Rp 29.900                            │  │
│  │  💰 CPC            : Rp 4.647                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Breakdown Result ──────────────────────────────────────┐  │
│  │                                                           │  │
│  │  📝 Website Completed Registration                        │  │
│  │     Total Result : 25                                     │  │
│  │     Total Spent  : Rp 900.000                             │  │
│  │     Cost/Result  : Rp 36.000                              │  │
│  │  ───────────────────────────────                          │  │
│  │  📸 Instagram Profile Visits                              │  │
│  │     Total Result : 1.200                                  │  │
│  │     Total Spent  : Rp 550.000                             │  │
│  │     Cost/Result  : Rp 458                                 │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Purchase Metrics ──────────────────────────────────────┐  │
│  │  ✅ Total Purchase    : 18                                 │  │
│  │  💵 Cost per Purchase : Rp 80.556                         │  │
│  │  💰 Purchase Value    : Rp 3.600.000                      │  │
│  │  📈 ROAS              : 2,48x                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [📤 Kirim Ulang ke Telegram]    [📊 Lihat Histori]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Elemen:**
- Info Akun: ID, tipe, limit, saldo + indikator warna
- Performa kemarin: semua metrik iklan
- Breakdown Result: per label konversi, muncul sesuai konfigurasi akun
- Purchase Metrics: muncul **hanya** jika akun masuk `PURCHASE_METRICS_ACCOUNTS`
- Tombol `Kirim Ulang ke Telegram` — trigger kirim manual
- Tombol `Lihat Histori` → ke Halaman 3

---

## Halaman 3 — Histori Laporan

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Kembali          Histori — KANTOR MJO-1641                   │
├─────────────────────────────────────────────────────────────────┤
│  Filter: [Mei 2026 ▾]                                           │
├──────────────┬────────────┬───────────┬───────────┬────────────┤
│ Tanggal      │ Spent      │ Result    │ Saldo     │ Status     │
├──────────────┼────────────┼───────────┼───────────┼────────────┤
│ 3 Mei 2026   │ Rp 1.450k  │ 25 reg    │ Rp 8.5jt  │ ✅ Terkirim │
│ 2 Mei 2026   │ Rp 1.210k  │ 19 reg    │ Rp 9.9jt  │ ✅ Terkirim │
│ 1 Mei 2026   │ Rp 980k    │ 14 reg    │ Rp 11.1jt │ ✅ Terkirim │
│ 30 Apr 2026  │ Rp 1.600k  │ 31 reg    │ Rp 12.1jt │ ✅ Terkirim │
│ 29 Apr 2026  │ -          │ -         │ -         │ ❌ Gagal    │
│ ...          │ ...        │ ...       │ ...       │ ...        │
└──────────────┴────────────┴───────────┴───────────┴────────────┘
│  Klik baris untuk lihat detail laporan hari itu                 │
└─────────────────────────────────────────────────────────────────┘
```

**Elemen:**
- Filter bulan/range tanggal
- Tabel ringkasan per hari: spent, result utama, saldo, status kirim
- Baris diklik → muncul detail seperti Halaman 2 tapi data historis
- Status ❌ Gagal → tampilkan pesan error

---

## Halaman 4 — Setting Akun

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Kembali          Setting Akun                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─── Identitas Akun ────────────────────────────────────────┐  │
│  │  Account ID   : [ act_1566552664103924         ]          │  │
│  │  Nama Akun    : [ KANTOR MJO-1641              ]  (auto)  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Tipe Billing ──────────────────────────────────────────┐  │
│  │  (●) Prepaid                                              │  │
│  │  ( ) Credit Line                                          │  │
│  │      └ Spending Limit : [ Rp ____________ ]               │  │
│  │  ( ) Postpaid                                             │  │
│  │      └ Billing Threshold : [ Rp _________ ]               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                                                                 │
│  ┌─── Konfigurasi Result ────────────────────────────────────┐  │
│  │  Tambah result yang ingin dilacak:                        │  │
│  │                                                           │  │
│  │  [Emoji] [Action Type ▾────────────────] [Label] [🗑]    │  │
│  │   📝     offsite_conversion.fb_pixel_c…   Reg Web         │  │
│  │   📸     instagram_profile_visit          IG Visit         │  │
│  │                                                           │  │
│  │  [+ Tambah Result]                                        │  │
│  │                                                           │  │
│  │  Keyword Campaign Traffic (opsional):                     │  │
│  │  [ Traffic, traffic, TRAFFIC              ]               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Purchase Metrics ──────────────────────────────────────┐  │
│  │  [ ] Aktifkan Purchase Metrics untuk akun ini             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                   [Batal]    [💾 Simpan Setting]                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Elemen:**
- Input Account ID → nama diambil otomatis dari Meta API
- Pilihan tipe billing dengan field kondisional (limit/threshold)
- Grup Telegram tambahan (opsional)
- Daftar result yang bisa ditambah/hapus, action type pakai dropdown
- Keyword Traffic — dipisah koma
- Toggle Purchase Metrics

---

## Halaman 5 — Setting Global

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚙ Setting Global                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─── Meta API ──────────────────────────────────────────────┐  │
│  │  Access Token : [ ••••••••••••••••••••• ]  [👁] [Test]   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Telegram ──────────────────────────────────────────────┐  │
│  │  Bot Token    : [ ••••••••••••••••••••• ]  [👁] [Test]   │  │
│  │  Grup Utama   : [ -100xxxxxxxxx         ]  [Test]         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Alert Threshold Saldo ─────────────────────────────────┐  │
│  │  🔴 Kritis (merah) : Rp [ 100.000    ]                    │  │
│  │  💛 Peringatan     : Rp [ 1.000.000  ]                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─── Jadwal Otomatis ───────────────────────────────────────┐  │
│  │  Jam Kirim Laporan : [ 07 ▾ ] : [ 00 ▾ ]  WIB            │  │
│  │  Status Cron       : 🟢 Aktif                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                          [💾 Simpan]                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Elemen:**
- Meta Access Token (masked, bisa reveal, ada tombol Test)
- Telegram Bot Token + Grup Utama (ada tombol Test kirim pesan)
- Threshold saldo — bisa diubah sesuai kebutuhan
- Jadwal cron: pilih jam WIB

---

## Halaman 6 — Log Notifikasi

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Log Notifikasi                                [🔄 Refresh]  │
├─────────────────────────────────────────────────────────────────┤
│  Filter: [Semua Akun ▾]  [4 Mei 2026]                          │
├────────────────────┬──────────────┬────────────┬───────────────┤
│ Waktu Kirim        │ Akun         │ Grup       │ Status        │
├────────────────────┼──────────────┼────────────┼───────────────┤
│ 04/05 07:02:14     │ MJO-1641     │ Utama      │ ✅ OK         │
│ 04/05 07:02:18     │ Akun 10 VA   │ Utama      │ ✅ OK         │
│ 04/05 07:02:18     │ Akun 10 VA   │ Grup VA    │ ✅ OK         │
│ 04/05 07:02:22     │ KomAds WL 18 │ Utama      │ ❌ Gagal      │
│ 04/05 07:02:25     │ Kuliah Jordan│ Utama      │ ✅ OK         │
│ 04/05 07:02:25     │ Kuliah Jordan│ Grup Jordan│ ✅ OK         │
└────────────────────┴──────────────┴────────────┴───────────────┘
│  Klik baris ❌ untuk lihat pesan error                          │
│                                                                 │
│  ┌─ Error Detail (saat baris gagal diklik) ─────────────────┐  │
│  │  ❌ KomAds WL 18 — 04/05 07:02:22                        │  │
│  │  Error: HTTPError 400 — chat not found                   │  │
│  │  Chat ID: -100999999                                     │  │
│  │  [Kirim Ulang]                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Elemen:**
- Tabel log pengiriman: waktu, akun, grup mana (utama/tambahan), status
- Akun dengan grup tambahan → muncul 2 baris
- Klik baris gagal → expand error detail + tombol kirim ulang

---

## Navigasi Antar Halaman

```
┌──────────────────────────────────────────┐
│  Sidebar / Bottom Nav                    │
│                                          │
│  📊  Dashboard (Daftar Akun)   ← Hal. 1 │
│  📋  Log Notifikasi            ← Hal. 6 │
│  ⚙   Setting Global            ← Hal. 5 │
│                                          │
│  (Per akun — dari card di Dashboard)     │
│  🔍  Detail Akun               ← Hal. 2 │
│  🕐  Histori Laporan           ← Hal. 3 │
│  ⚙   Setting Akun              ← Hal. 4 │
└──────────────────────────────────────────┘
```

---

## Catatan untuk Dev

| # | Halaman | Sumber Data |
|---|---------|-------------|
| 1 | Dashboard | `meta_accounts` + `account_daily_data` (hari ini) |
| 2 | Detail Akun | `account_daily_data` + `result_breakdown_daily` + `purchase_metrics_daily` |
| 3 | Histori | `account_daily_data` + `result_breakdown_daily` (per tanggal) |
| 4 | Setting Akun | `meta_accounts` + config mapping (ACCOUNT_RESULTS, dll) |
| 5 | Setting Global | Environment config / app settings table |
| 6 | Log Notifikasi | `notifications_log` |

**API yang dipakai script:**
- `GET /{account_id}` → balance, tipe, nama akun
- `GET /{account_id}/insights?level=account` → metrik performa
- `GET /{account_id}/insights?level=campaign` → per-campaign untuk breakdown result

**Aturan tampilan:**
- Purchase Metrics hanya muncul jika `is_purchase_metrics_enabled = true` di config akun
- Grup Telegram tambahan hanya muncul di log jika akun punya `extra_chat_id`
- Tipe billing menentukan rumus kalkulasi saldo (lihat `get_effective_balance` di `notify.py`)
