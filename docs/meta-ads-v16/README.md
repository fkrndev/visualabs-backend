# Meta Ads Daily Notification

Script Python untuk mengirim laporan harian performa Meta Ads ke Telegram secara otomatis.

## 📋 Tujuan

Script ini mengambil data performa iklan Meta Ads dari akun-akun yang terdaftar, lalu mengirim laporan harian ke Telegram berupa:
- Status saldo akun (Prepaid/Credit Line/Postpaid)
- Performa kemarin (spend, impressions, clicks, CTR, CPM, CPC)
- Breakdown hasil konversi per jenis (registration, purchase, leads, dll)
- Purchase metrics khusus untuk akun tertentu
- Peringatan otomatis jika saldo hampir habis

## 🔧 Environment Variables

Script ini membutuhkan environment variables berikut:

```bash
META_ACCESS_TOKEN=your_meta_access_token
AD_ACCOUNT_IDS=act_123,act_456,act_789
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

### Penjelasan

- **META_ACCESS_TOKEN**: Token akses Meta Ads API
- **AD_ACCOUNT_IDS**: Daftar ID akun Meta Ads (dipisahkan koma)
- **TELEGRAM_BOT_TOKEN**: Token bot Telegram untuk mengirim pesan
- **TELEGRAM_CHAT_ID**: Chat ID target untuk notifikasi (grup utama)

## ⚙️ Konfigurasi Per Akun

### 1. Grup Telegram Tambahan

Beberapa akun memiliki grup Telegram khusus untuk notifikasi tambahan:

```python
EXTRA_TELEGRAM_TARGETS = {
    "act_535276971962217": "-5177350356",    # akun 10 VA → grup khusus
    "act_507418894944981": "-1003458910888", # Kuliah Di Jordan → grup khusus
}
```

### 2. Akun dengan Purchase Metrics

Akun-akun yang perlu menampilkan Purchase Metrics (Total Purchase, Cost per Purchase, ROAS):

```python
PURCHASE_METRICS_ACCOUNTS = {
    "act_1566552664103924",  # KANTOR MJO-1641
    "act_362462733192838",   # KANTOR MJO-1416
}
```

### 3. Tipe Akun

#### Credit Line Accounts
Akun dengan Credit Line dan spending limit:

```python
CREDIT_LINE_ACCOUNTS = {
    "act_1566552664103924",
    "act_650212397686303",
    "act_1283148329462351",
    "act_907928660840622",
    "act_362462733192838",
    "act_1086862966036083",
}
```

#### Postpaid Accounts
Akun postpaid dengan billing threshold (bayar tagihan otomatis ke kartu):

```python
POSTPAID_ACCOUNTS = {
    "act_535276971962217": 4_527_250,  # akun 10 VA — Visa *2557
}
```

### 4. Hasil Konversi Per Akun

Setiap akun memiliki konfigurasi hasil konversi yang ingin ditampilkan:

```python
ACCOUNT_RESULTS = {
    "act_1566552664103924": [  # KANTOR MJO-1641
        ("offsite_conversion.fb_pixel_complete_registration", "📝", "Website Completed Registration"),
        ("offsite_conversion.fb_pixel_subscribe",             "🔔", "Website Subscribes"),
        ("instagram_profile_visit",                           "📸", "Instagram Profile Visits"),
    ],
    # ... dan seterusnya untuk setiap akun
}
```

Format: `(action_type, emoji, label)`

### 5. Traffic Campaign Keywords

Untuk akun tertentu, campaign dengan kata kunci "Traffic" akan diperlakukan berbeda (link_click = Instagram Profile Visits):

```python
TRAFFIC_KEYWORDS_PER_ACCOUNT = {
    "act_839472674695721": ["Traffic", "traffic", "TRAFFIC"],  # taiba_ads
    "act_507418894944981": ["Traffic", "traffic", "TRAFFIC"],  # Kuliah Di Jordan
}
```

## 🚨 Threshold Peringatan

```python
THRESHOLD_CRITICAL = 100_000   # Rp 100.000 - saldo kritis
THRESHOLD_WARNING  = 1_000_000  # Rp 1.000.000 - saldo perlu perhatian
```

### Warna Status

- 🔴 **Merah**: Saldo ≤ Rp 100.000 atau Rp 0
- 💛 **Kuning**: Saldo < Rp 1.000.000
- 🟢 **Hijau**: Saldo aman

## 🔍 Logika Penentuan Hasil Konversi

Script menggunakan sistem prioritas untuk menentukan hasil konversi yang ditampilkan:

1. **Primary Conversion Types**: Hasil konversi utama (registration, purchase, leads, messaging)
2. **Fallback ke link_click**: Jika tidak ada primary conversion, gunakan link_click sebagai Instagram Profile Visits
3. **Traffic Campaign**: Untuk akun dengan Traffic keywords, link_click selalu dihitung sebagai Instagram Profile Visits

### Action Aliases

Normalisasi action_type yang artinya sama:

```python
ACTION_ALIASES = {
    "complete_registration": "offsite_conversion.fb_pixel_complete_registration",
    "omni_complete_registration": "offsite_conversion.fb_pixel_complete_registration",
    "purchase": "omni_purchase",
    # ... dll
}
```

## 📊 Struktur Laporan

Laporan yang dikirim ke Telegram berisi:

1. **Header**
   - Judul laporan
   - Tanggal data (kemarin)
   - Tanggal report (hari ini)

2. **Info Akun**
   - Nama akun
   - Tipe akun (Prepaid/Credit Line/Postpaid)
   - Saldo tersisa / Spending Limit / Billing Threshold
   - Status saldo dengan emoji

3. **Performa Kemarin**
   - Total Spent
   - Impressions
   - Reach
   - Frequency
   - Link Clicks
   - CTR
   - CPM
   - CPC (Cost per Link Click)

4. **Breakdown Result**
   - Total hasil per jenis konversi
   - Total spent per jenis
   - Cost per Result (CPR)

5. **Purchase Metrics** (khusus akun tertentu)
   - Total Purchase
   - Cost per Purchase
   - Purchase Value
   - ROAS

6. **Peringatan** (jika saldo kritis)

## 🔧 Fungsi Utama

### `get_meta_balance(account_id)`
Mengambil data balance dari Meta Ads API.

### `get_effective_balance(account_id, data)`
Menghitung saldo efektif berdasarkan tipe akun:
- **Postpaid**: Ruang tersisa sebelum ditagih (threshold - outstanding)
- **Credit Line**: Sisa spending limit (spend_cap - amount_spent)
- **Kartu Kredit/Prepaid**: Saldo biasa

### `get_account_insights(account_id, date_str)`
Mengambil insights level akun untuk tanggal tertentu.

### `get_campaign_insights(account_id, date_str)`
Mengambil insights level campaign untuk tanggal tertentu.

### `normalize_actions(actions_raw)`
Normalisasi action_type menggunakan aliases.

### `build_result_breakdown(account_id, campaigns)`
Menghitung breakdown hasil konversi per campaign dengan logika prioritas.

### `get_saldo_status(balance, tipe)`
Menentukan status saldo dan pesan peringatan.

### `send_telegram(message, chat_id)`
Mengirim pesan ke Telegram.

### `get_purchase_metrics(acct_insights)`
Menghitung purchase metrics (count, value, CPP, ROAS).

## 🕐 Waktu Eksekusi

Script dijalankan setiap hari dan mengambil data dari hari sebelumnya (yesterday). Laporan dikirim pada hari ini dengan label "data kemarin".

Contoh:
- Data: 24 April 2026
- Report: 25 April 2026

## 📦 Dependencies

```bash
requests
```

Install dengan:
```bash
pip install requests
```

## 🚀 Cara Menjalankan

```bash
python notify.py
```

Pastikan environment variables sudah di-set sebelum menjalankan script.

## 📝 Contoh Output Telegram

```
📊 Laporan Meta Ads Harian
📅 Senin, 24 April 2026
🗓 Di report pada Selasa, 25 April 2026
━━━━━━━━━━━━━━━━━━
🏢 Akun: KANTOR MJO-1641
💳 Tipe: Credit Line
🎯 Spending Limit: Rp 5.000.000
🟢 Sisa Saldo: Rp 3.500.000

📈 Performa Kemarin:
💸 Total Spent: Rp 500.000
👁 Impressions: 10.000
🎯 Reach: 8.000
🔁 Frequency: 1.25x
🖱 Link Clicks: 500
📈 CTR: 5.00%
📊 CPM: Rp 50.000
💰 CPC (Cost per Link Click): Rp 1.000

🎯 Breakdown Result:
├ 📝 Website Completed Registration
│  ✅ Total Result: 50
│  💸 Total Spent: Rp 300.000
│  💵 Cost/Result: Rp 6.000
│
└ 🔔 Website Subscribes
   ✅ Total Result: 20
   💸 Total Spent: Rp 200.000
   💵 Cost/Result: Rp 10.000
```

## ⚠️ Error Handling

Jika terjadi error saat mengambil data akun, script akan:
1. Mencetak error ke console
2. Mengirim pesan error ke Telegram
3. Lanjut ke akun berikutnya (tidak stop total)
