# Meta Ads Daily Notification — Panduan Pengguna

Sistem notifikasi otomatis yang mengirimkan laporan performa Meta Ads setiap hari ke Telegram. Laporan dikirim pagi hari dan berisi data iklan hari sebelumnya.

---

## Gambaran Umum

Script ini berjalan otomatis (via cron/scheduler) dan melakukan:

1. Mengambil data saldo & balance dari setiap akun Meta Ads
2. Mengambil performa iklan kemarin (spend, impressions, reach, clicks, dll)
3. Menghitung breakdown result per tujuan campaign (leads, purchase, pesan, dll)
4. Mengirim laporan ke grup Telegram — termasuk grup khusus per akun jika ada

---

## Halaman / Laporan yang Dihasilkan

Setiap akun menghasilkan **satu pesan Telegram** dengan struktur berikut:

### 1. Header Laporan
```
📊 Laporan Meta Ads Harian
📅 [Tanggal data kemarin]
🗓 Di report pada [Tanggal hari ini]
━━━━━━━━━━━━━━━━━━
```

### 2. Info Akun & Saldo

Menampilkan nama akun, tipe billing, dan status saldo:

| Tipe Akun | Yang Ditampilkan |
|-----------|-----------------|
| **Prepaid** | Sisa saldo (Rp) |
| **Credit Line** | Spending Limit + Sisa Saldo |
| **Kartu Kredit** | Sisa saldo dari funding source |
| **Postpaid** | Billing Threshold + Outstanding + Ruang sebelum ditagih |

**Indikator status saldo:**
- 🟢 Saldo aman
- 💛 Saldo < Rp 1.000.000 — perlu diperhatikan
- 🔴 Saldo < Rp 100.000 atau habis — iklan akan/sudah berhenti

### 3. Performa Iklan Kemarin

Metrik yang selalu ditampilkan:
- 💸 **Total Spent** — total belanja iklan kemarin
- 👁 **Impressions** — berapa kali iklan ditampilkan
- 🎯 **Reach** — berapa orang unik yang melihat
- 🔁 **Frequency** — rata-rata iklan dilihat per orang
- 🖱 **Link Clicks** — klik ke link (bukan total semua klik)
- 📈 **CTR** — Click-Through Rate
- 📊 **CPM** — Cost per 1000 Impressions
- 💰 **CPC** — Cost per Link Click

### 4. Breakdown Result (per Tujuan Campaign)

Menampilkan hasil konversi per label, misalnya:
```
🎯 Breakdown Result:
├ 📝 Website Completed Registration
│  ✅ Total Result: 25
│  💸 Total Spent: Rp 1.250.000
│  💵 Cost/Result: Rp 50.000
│
└ 📸 Instagram Profile Visits
   ✅ Total Result: 1.200
   💸 Total Spent: Rp 800.000
   💵 Cost/Result: Rp 667
```

Jenis result yang bisa muncul:
- 📝 Website Completed Registration
- 🔔 Website Subscribes
- 📋 Leads
- 💬 Messaging Conversations Started
- 🛒 Purchases
- 📸 Instagram Profile Visits

### 5. Purchase Metrics (khusus akun tertentu)

Untuk akun yang diaktifkan Purchase Metrics:
- ✅ Total Purchase
- 💵 Cost per Purchase
- 💰 Purchase Value (nilai transaksi dari pixel)
- 📈 ROAS (Return on Ad Spend)

---

## Cara Setting & Konfigurasi

### Environment Variables (Wajib)

Sebelum menjalankan, set variabel berikut di environment / `.env`:

```bash
META_ACCESS_TOKEN=your_meta_token_here
META_AD_ACCOUNT_IDS=act_111111,act_222222,act_333333
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=-100xxxxxxxxx   # Chat ID grup Telegram utama
```

| Variable | Keterangan |
|----------|-----------|
| `META_ACCESS_TOKEN` | Token akses Meta API (dari Meta Developer) |
| `META_AD_ACCOUNT_IDS` | Daftar account ID dipisah koma, format `act_xxxxx` |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram dari @BotFather |
| `TELEGRAM_CHAT_ID` | ID grup Telegram tujuan laporan utama |

---

### Setting Per Akun di dalam Script

Beberapa konfigurasi perlu diedit langsung di `notify.py`:

#### A. Grup Telegram Tambahan per Akun

Jika suatu akun punya grup Telegram sendiri selain grup utama:

```python
EXTRA_TELEGRAM_TARGETS = {
    "act_535276971962217": "-5177350356",    # Laporan juga dikirim ke grup ini
    "act_507418894944981": "-1003458910888",
}
```

Cara menambah: tambahkan entry `"act_xxxxx": "chat_id_grup"`.

---

#### B. Tipe Billing Akun

**Credit Line** (bayar pakai spending limit dari Meta):
```python
CREDIT_LINE_ACCOUNTS = {
    "act_1566552664103924",
    "act_650212397686303",
    # tambahkan account ID lain di sini
}
```

**Postpaid** (kartu kredit dengan billing threshold otomatis):
```python
POSTPAID_ACCOUNTS = {
    "act_535276971962217": 4_527_250,  # threshold dalam Rupiah
}
```

Akun yang tidak ada di kedua daftar → otomatis dianggap **Prepaid**.

---

#### C. Threshold Alert Saldo

Default threshold untuk notifikasi saldo:
```python
THRESHOLD_CRITICAL = 100_000    # < Rp 100rb → alert merah 🔴
THRESHOLD_WARNING  = 1_000_000  # < Rp 1jt  → warning kuning 💛
```

Ubah nilai ini sesuai kebutuhan.

---

#### D. Konfigurasi Result per Akun

Ini adalah bagian terpenting — menentukan metrik apa yang ditampilkan di **Breakdown Result** per akun:

```python
ACCOUNT_RESULTS = {
    "act_xxxxx": [
        ("offsite_conversion.fb_pixel_complete_registration", "📝", "Website Completed Registration"),
        ("instagram_profile_visit", "📸", "Instagram Profile Visits"),
    ],
}
```

Format: `(action_type_meta, emoji, label_tampilan)`

**Action type yang umum dipakai:**

| Action Type | Artinya |
|-------------|---------|
| `lead` | Lead dari Lead Form |
| `offsite_conversion.fb_pixel_lead` | Lead dari Website |
| `offsite_conversion.fb_pixel_complete_registration` | Registrasi di website |
| `offsite_conversion.fb_pixel_subscribe` | Subscribe di website |
| `offsite_conversion.fb_pixel_purchase` | Pembelian di website |
| `omni_purchase` | Pembelian (semua channel) |
| `onsite_conversion.messaging_conversation_started_7d` | Pesan lewat Messenger/IG DM |
| `instagram_profile_visit` | Kunjungan profil Instagram (via link_click traffic) |

> **Penting:** `instagram_profile_visit` adalah **fallback** — sistem akan memakai `link_click` dari campaign Traffic sebagai proxy kunjungan profil IG.

---

#### E. Campaign Traffic (Instagram Profile Visits)

Jika akun menjalankan campaign Traffic untuk mengarahkan ke profil IG, daftarkan keyword nama campaign-nya:

```python
TRAFFIC_KEYWORDS_PER_ACCOUNT = {
    "act_839472674695721": ["Traffic", "traffic", "TRAFFIC"],
    "act_507418894944981": ["Traffic", "traffic", "TRAFFIC"],
}
```

Campaign yang namanya mengandung kata kunci ini → link_click-nya dihitung sebagai **Instagram Profile Visits**.

---

#### F. Aktifkan Purchase Metrics

Untuk menampilkan section Purchase Metrics (Purchase count, Purchase Value, ROAS):

```python
PURCHASE_METRICS_ACCOUNTS = {
    "act_1566552664103924",
    "act_362462733192838",
}
```

Tambahkan account ID yang memiliki pixel purchase aktif.

---

## Cara Menjalankan

### Manual

```bash
python notify.py
```

### Otomatis via Cron (rekomendasi pagi hari WIB)

```bash
# Jalankan setiap hari jam 07:00 WIB
0 0 * * * META_ACCESS_TOKEN=xxx META_AD_ACCOUNT_IDS=act_xxx TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx python /path/to/notify.py
```

> Script menggunakan waktu WIB (UTC+7) secara internal — data yang dilaporkan adalah data **kemarin WIB**.

---

## Alur Kerja Script

```
Untuk setiap akun:
  1. Ambil data balance & info akun dari Meta API
  2. Hitung effective balance sesuai tipe billing
  3. Ambil insights level akun (spend, impressions, dll)
  4. Ambil insights level campaign
  5. Hitung breakdown result per label
  6. (Opsional) Hitung purchase metrics
  7. Susun pesan Telegram
  8. Kirim ke grup utama
  9. Kirim ke grup tambahan (jika ada)
```

---

## Database (Opsional)

Jika data ingin disimpan untuk analisis historis, tersedia desain tabel di `table.md`:

| Tabel | Isi |
|-------|-----|
| `meta_accounts` | Master data akun Meta |
| `account_daily_data` | Saldo + performa akun per hari |
| `campaign_daily_insights` | Data per campaign per hari |
| `result_breakdown_daily` | Breakdown result per label per hari |
| `purchase_metrics_daily` | Purchase metrics (akun tertentu) |
| `notifications_log` | Log pengiriman Telegram |
| `report_runs` | Log eksekusi harian |

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Pesan tidak terkirim | Cek `TELEGRAM_BOT_TOKEN` dan pastikan bot sudah di-add ke grup |
| Data tidak muncul | Pastikan akun Meta aktif dan ada spend kemarin |
| Saldo salah | Cek tipe akun sudah didaftarkan di `CREDIT_LINE_ACCOUNTS` atau `POSTPAID_ACCOUNTS` |
| Result 0 padahal ada konversi | Pastikan `action_type` di `ACCOUNT_RESULTS` sesuai dengan yang dipakai campaign di Meta |
| Error API Meta | Token mungkin expired — generate ulang di Meta Developer |
