# Database Schema untuk Meta Ads Daily Notification

Desain tabel untuk menyimpan semua data yang dihasilkan/diolah script `notify.py`.

## Tabel Inti

### meta_accounts
- account_id
- name
- currency
- funding_type
- funding_display_string
- spend_cap
- billing_threshold
- account_category
- is_postpaid
- is_credit_line
- extra_telegram_chat_id
- is_purchase_metrics
- traffic_keywords

**Penjelasan**: Master data akun dari Meta. `account_category` bisa simpan label seperti "Prepaid", "Credit Line", "Kartu Kredit", "Postpaid". `extra_telegram_chat_id` diisi jika akun punya grup Telegram tambahan. `is_purchase_metrics` flag untuk akun yang menampilkan Purchase Metrics. `traffic_keywords` JSON array kata kunci nama campaign Traffic (misal `["Traffic","traffic","TRAFFIC"]`), null jika akun tidak pakai.

---

### account_daily_data
- account_id
- date
- -- Balance fields --
- balance
- amount_spent
- spend_cap
- effective_balance
- balance_type
- spending_limit
- outstanding_balance
- status_level
- warning_message
- -- Insights fields --
- spend
- impressions
- reach
- frequency
- link_clicks
- ctr
- cpm
- cpc

**Penjelasan**: Gabungan data saldo dan performa akun harian. `status_level` enum: "ok", "warning", "critical" — menggantikan emoji agar lebih semantik dan bisa dirender UI sesuai desain.

---

## Konfigurasi Result per Akun

### account_result_config
- account_id
- action_type
- result_type
- label
- sort_order
- is_fallback

**Penjelasan**: Konfigurasi result yang dilacak per akun — relasi many-to-many. `action_type` sesuai Meta API (misal `offsite_conversion.fb_pixel_lead`). `result_type` enum: "registration", "lead", "purchase", "message", "profile_visit" — dipakai UI untuk menentukan ikon/warna. `is_fallback` true jika ini adalah `instagram_profile_visit` (dihitung dari link_click campaign Traffic). `sort_order` menentukan urutan tampil di laporan.

---

## Campaign & Breakdown Result

### campaign_daily_insights
- account_id
- date
- campaign_id
- campaign_name
- spend
- link_clicks
- is_traffic_campaign
- resolved_primary_action_type

**Penjelasan**: Ringkasan per campaign. `campaign_id` adalah ID unik dari Meta. `link_clicks` diambil dari `actions["link_click"]` (bukan field langsung API). `resolved_primary_action_type` diisi action utama yang terdeteksi (kalau ada).

---

### result_breakdown_daily
- account_id
- date
- label
- result_type
- results
- spent
- cpr

**Penjelasan**: Agregasi hasil per label seperti "Website Completed Registration", "Leads", "Instagram Profile Visits". `result_type` enum: "primary", "traffic", "fallback" — menentukan bagaimana UI merender ikon dan warna baris.

---

## Purchase Metrics (khusus akun tertentu)

### purchase_metrics_daily
- account_id
- date
- total_purchase
- purchase_value
- cost_per_purchase
- roas

**Penjelasan**: Hanya diisi untuk akun yang `is_purchase_metrics = true` di `meta_accounts`.

---

## Operasional & Notifikasi

### notifications_log
- account_id
- data_date
- chat_id
- sent_at
- status
- error_message
- message_hash

**Penjelasan**: Log pengiriman ke Telegram (grup utama dan grup ekstra). `data_date` adalah tanggal data yang dilaporkan (kemarin), berbeda dengan `sent_at` yang adalah waktu pengiriman aktual. `message_hash` untuk deduplikasi/trace isi tanpa simpan full text.

---

### report_runs
- run_date
- started_at
- finished_at
- accounts_total
- accounts_success
- accounts_failed

**Penjelasan**: Metrik eksekusi harian untuk monitoring proses.

---

## Catatan Desain

- `data_date` di `notifications_log` adalah tanggal data (kemarin), `sent_at` adalah waktu kirim aktual.
- `status_level` dan `result_type` pakai enum string agar UI bisa render ikon/warna secara konsisten tanpa bergantung pada emoji dari DB.
- `account_result_config` adalah sumber kebenaran konfigurasi result — script `notify.py` idealnya membaca dari tabel ini, bukan dari hardcode.
- Dengan kombinasi tabel di atas, kamu bisa rebuild pesan Telegram kapan saja dan analisis historis per akun/campaign/label.
- Jika nanti kamu ingin simpan raw `actions` per campaign, bisa tambah tabel `campaign_actions_daily` (opsional):
  - account_id
  - date
  - campaign_name
  - action_type
  - action_value
