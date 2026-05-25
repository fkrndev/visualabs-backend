# Meta Ads Daily Report — Cron Job (TypeScript)

Implementasi TypeScript dari `notify.py` yang terintegrasi dengan `v-auto-backend`. Dijalankan setiap pagi untuk mengirim laporan harian performa Meta Ads ke Telegram.

---

## Perbedaan dari notify.py

| Aspek | notify.py (lama) | metaAdsDailyReport.ts (baru) |
|-------|-----------------|------------------------------|
| Konfigurasi akun | Hardcode di kode | Dinamis dari `data_json` tiap `fb_act` |
| Daftar akun | Env var `AD_ACCOUNT_IDS` | Otomatis dari tabel `fb_act` (semua yang punya token aktif) |
| Penyimpanan data | Tidak ada | Disimpan ke tabel DB |
| Trigger | Cron OS / manual | HTTP endpoint + cron service eksternal |

---

## File

```
src/jobs/metaAdsDailyReport.ts      — implementasi job
scripts/run-meta-ads-report.ts      — entry point untuk dijalankan langsung
```

---

## Environment Variables

Tambahkan ke `.env`:

```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_main_group_chat_id   # grup Telegram utama (default semua akun)
```

---

## Cara Menjalankan

### Manual / testing

```bash
bun run job:meta-ads
# atau langsung:
bun run scripts/run-meta-ads-report.ts
```

### Crontab (production)

Jalankan `crontab -e` lalu tambahkan:

```cron
# Setiap hari jam 05:00 WIB
0 22 * * * cd /home/visualabs/web/vims.dots.my.id/private/v-auto-backend && bun run scripts/run-meta-ads-report.ts > /dev/null 2>&1
```

> Jam 22:00 UTC = 05:00 WIB. Sesuaikan path ke direktori project.

---

## Konfigurasi Per Akun (via UI fb_act)

Semua konfigurasi disimpan di kolom `data_json` tabel `fb_act`. Dapat diatur via modal **Edit fb_act** di frontend (bagian di atas "Data JSON").

### Struktur `data_json`

```json
{
  "billing_type": "prepaid",
  "spending_limit": 5000000,
  "billing_threshold": 4527250,
  "results": [
    {
      "emoji": "📝",
      "action_type": "offsite_conversion.fb_pixel_complete_registration",
      "label": "Website Completed Registration"
    },
    {
      "emoji": "📸",
      "action_type": "instagram_profile_visit",
      "label": "Instagram Profile Visits"
    }
  ],
  "purchase_metrics": true,
  "extra_telegram_chat_id": "-5177350356",
  "telegram_chat_id": "-1001234567890",
  "keyword_traffic": "Traffic traffic TRAFFIC"
}
```

### Penjelasan Field

#### `billing_type` *(string)*
Tipe billing akun. Menentukan cara menghitung saldo efektif.

| Nilai | Keterangan |
|-------|-----------|
| `prepaid` | Akun prabayar — saldo dari `funding_source_details` |
| `credit_line` | Credit Line dengan spending limit atau Kartu Kredit |
| `postpaid` | Bayar tagihan otomatis ke kartu (punya billing threshold) |

#### `spending_limit` *(number, Rupiah)*
Hanya untuk `billing_type: credit_line`. Batas spending yang dikonfigurasi (override `spend_cap` dari Meta API). Sisa saldo = `spending_limit - amount_spent`.

#### `billing_threshold` *(number, Rupiah)*
Hanya untuk `billing_type: postpaid`. Nilai threshold sebelum kartu ditagih otomatis. Ruang tersisa = `billing_threshold - outstanding_balance`.

#### `results` *(array)*
Daftar konversi yang ingin dilacak dan ditampilkan di laporan. Setiap item:

```json
{
  "emoji": "📝",
  "action_type": "offsite_conversion.fb_pixel_complete_registration",
  "label": "Website Completed Registration"
}
```

- **`emoji`** — emoji yang tampil di laporan (isi satu karakter emoji di input kotak kecil)
- **`action_type`** — action type dari Meta API (pilih dari dropdown combobox)
- **`label`** — nama tampilan di laporan Telegram

> **Special case**: `action_type: instagram_profile_visit` adalah fallback — dihitung dari `link_click` campaign Traffic (bukan dari Meta actions langsung).

#### `purchase_metrics` *(boolean)*
Jika `true`, laporan akan menyertakan seksi **Purchase Metrics** (Total Purchase, Cost per Purchase, Purchase Value, ROAS).

#### `extra_telegram_chat_id` *(string)*
Chat ID grup Telegram tambahan untuk akun ini. Jika diisi, laporan dikirim ke **dua** grup: grup utama (`TELEGRAM_CHAT_ID`) dan grup extra ini.

Format: `-1001234567890` (grup/supergroup) atau `@username`.

#### `telegram_chat_id` *(string)*
Override chat ID utama khusus untuk akun ini. Jika diisi, laporan utama dikirim ke chat ID ini (bukan ke `TELEGRAM_CHAT_ID` default).

#### `keyword_traffic` *(string)*
Kata kunci nama campaign yang dianggap sebagai "Traffic campaign". Pisahkan dengan spasi.

Contoh: `"Traffic traffic TRAFFIC"`

Campaign yang namanya mengandung salah satu keyword ini → `link_click` dihitung sebagai **Instagram Profile Visits** (bukan sebagai fallback konversi utama).

---

## Logika Penentuan Hasil Konversi

Untuk setiap campaign:

```
1. Cek apakah nama campaign mengandung keyword_traffic
   → Ya: hitung link_click sebagai label Instagram Profile Visits
   → Tidak: lanjut ke step 2

2. Cek apakah ada primary conversion (dari daftar results) di actions campaign
   → Ya: pakai konversi terbanyak sebagai result
   → Tidak: lanjut ke step 3

3. Fallback
   → Jika akun TIDAK punya keyword_traffic: hitung link_click sebagai Instagram Profile Visits
   → Jika akun PUNYA keyword_traffic: skip (campaign ini tidak masuk ke mana pun)
```

---

## Tabel DB yang Diisi

| Tabel | Isi |
|-------|-----|
| `fb_act_daily_data` | Saldo + insights level akun per hari |
| `fb_act_campaign_daily_insights` | Ringkasan per campaign per hari |
| `fb_act_result_breakdown_daily` | Agregasi result breakdown per label per hari |
| `fb_act_notifications_log` | Log pengiriman Telegram (main/extra/error) |
| `fb_act_report_runs` | Rekap eksekusi job harian |

Semua insert menggunakan `ON DUPLICATE KEY UPDATE` — aman dijalankan ulang untuk hari yang sama.

---

## Threshold Peringatan Saldo

| Kondisi | Status | Pesan |
|---------|--------|-------|
| Saldo ≤ 0 | 🔴 | SALDO HABIS — segera top up |
| Saldo < Rp 100.000 | 🔴 | Saldo kritis — hampir mati |
| Saldo < Rp 1.000.000 | 💛 | Pertimbangkan top up |
| Saldo ≥ Rp 1.000.000 | 🟢 | Aman |

Untuk akun **Postpaid**, threshold berbeda (berdasarkan ruang sebelum kartu ditagih):

| Kondisi | Status |
|---------|--------|
| Ruang ≤ 0 | 🔴 Kartu akan segera ditagih |
| Ruang < Rp 500.000 | 🔴 |
| Ruang < Rp 1.000.000 | 💛 |
| Ruang ≥ Rp 1.000.000 | 🟢 |

---

## Action Types yang Tersedia

Berikut action type yang umum digunakan (tersedia di dropdown combobox modal fb_act):

| Action Type | Keterangan |
|-------------|-----------|
| `offsite_conversion.fb_pixel_complete_registration` | Website Completed Registration |
| `offsite_conversion.fb_pixel_subscribe` | Website Subscribes |
| `offsite_conversion.fb_pixel_purchase` | Website Purchase |
| `offsite_conversion.fb_pixel_lead` | Website Lead |
| `onsite_conversion.messaging_conversation_started_7d` | Messaging Conversations Started |
| `lead` | Lead (Instant Form) |
| `omni_purchase` | Purchases (semua platform) |
| `instagram_profile_visit` | Instagram Profile Visits *(special — pakai link_click)* |

---

## Contoh Output Telegram

```
📊 Laporan Meta Ads Harian
📅 Senin, 4 Mei 2026
🗓 Di report pada Selasa, 5 Mei 2026
━━━━━━━━━━━━━━━━━━
🏢 Akun: KANTOR MJO-1641
💳 Tipe: Credit Line
🎯 Spending Limit: Rp 5.000.000
🟢 Sisa Saldo: Rp 3.250.000

📈 Performa Kemarin:
💸 Total Spent: Rp 750.000
👁 Impressions: 12.500
🎯 Reach: 9.800
🔁 Frequency: 1,28x
🖱 Link Clicks: 620
📈 CTR: 4,96%
📊 CPM: Rp 60.000
💰 CPC (Cost per Link Click): Rp 1.210

🎯 Breakdown Result:
├ 📝 Website Completed Registration
│  ✅ Total Result: 45
│  💸 Total Spent: Rp 450.000
│  💵 Cost/Result: Rp 10.000
│
└ 📸 Instagram Profile Visits
   ✅ Total Result: 380
   💸 Total Spent: Rp 300.000
   💵 Cost/Result: Rp 789
```
