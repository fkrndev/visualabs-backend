# Wireframe: Halaman Monitoring Iklan (Meta Ads)

Status: Draft
Tanggal: 2026-05-13
Companion of: [monitoring-ads.md](./monitoring-ads.md)

Relasi data utama (untuk konteks scoping):
- `users.id` (advertiser) → `subscriptions.advertiser_id`
- `subscriptions.customer_id` → `customers.id`
- `fb_act.subscription_id` → `subscriptions.id`, `fb_act.customer_id` → `customers.id`
- Join path advertiser → akun iklan:
  `users → subscriptions(advertiser_id) → fb_act(subscription_id)`
- Sehingga "advertiser melihat semua fb_act miliknya" = `WHERE subscriptions.advertiser_id = user.id`, dengan breakdown / filter per `customers.id`.

---

## 1. Page List (Advertiser View) — `/monitoring-ads`

Resolusi 1280 desktop. Mobile: stack vertikal, KPI jadi grid 2 kolom.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⭠ Sidebar │ Monitoring Iklan                                       👤 Saiful │
│           ├──────────────────────────────────────────────────────────────────┤
│ • Home    │ 📊 Monitoring Iklan                                              │
│ • Subs    │ Pantau status saldo, performa, dan notifikasi akun Meta Ads.     │
│ • Ads     │                                                                  │
│   └─Mon.* │ ┌──────────────┬──────────────┬───────────────────┬────────────┐ │
│ • …       │ │ Customer:    │ Status:      │ Tipe Akun:        │ Range:     │ │
│           │ │ [Semua ▼]    │ [Semua ▼]    │ [Semua ▼]         │ [7 hari ▼] │ │
│           │ └──────────────┴──────────────┴───────────────────┴────────────┘ │
│           │                                                                  │
│           │ ▰▰▰ KPI ▰▰▰ (snapshot kemarin / today_wib)                       │
│           │ ┌─────────┬─────────┬─────────┬──────────┬─────────┬───────────┐ │
│           │ │ Total   │ 🔴 Crit │ 💛 Warn │ 💸 Spend │ 📣 Notif│ 🔑 Token  │ │
│           │ │ Akun    │ Akun    │ Akun    │ D-1      │ Belum   │ Tidak Vld │ │
│           │ │ 12      │ 2       │ 3       │ Rp 4,2jt │ 1       │ 0         │ │
│           │ └─────────┴─────────┴─────────┴──────────┴─────────┴───────────┘ │
│           │                                                                  │
│           │ ━━━ ⚠️ Akun Butuh Perhatian ━━━                                  │
│           │ ┌──────────────────────────────────────────────────────────────┐ │
│           │ │ 🔴 KANTOR MJO-1641 · Credit Line · Sisa Rp 80.000             │ │
│           │ │    "Saldo di bawah Rp 100.000! Segera top up…" · 11:00 WIB    │ │
│           │ │ 💛 Kuliah Di Jordan · Prepaid · Sisa Rp 850.000               │ │
│           │ │    "Saldo tinggal < Rp 1jt, pertimbangkan top up." · 11:00    │ │
│           │ │ … 3 lainnya  [Lihat semua →]                                  │ │
│           │ └──────────────────────────────────────────────────────────────┘ │
│           │                                                                  │
│           │ ━━━ 🔑 Token Health ━━━                                          │
│           │ ┌──────────────────────────────────────────────────────────────┐ │
│           │ │ Token  │ Pemilik       │ Status   │ Last Update │ Akun (n)   │ │
│           │ │ #18    │ Saiful M.     │ ✅ Valid │ 1 hari lalu │ 5          │ │
│           │ │ #21    │ Saiful M.     │ ❌ Expir.│ 3 jam lalu  │ 2 ⚠️       │ │
│           │ │ #25    │ — (no token)  │ — Tidak  │ —           │ 1 ⚠️       │ │
│           │ │        │               │  diset   │             │            │ │
│           │ └──────────────────────────────────────────────────────────────┘ │
│           │                                                                  │
│           │ ━━━ 🗂️ Tabel Akun ━━━                          [Group by: ▼Cust] │
│           │ ┌──────────────────────────────────────────────────────────────┐ │
│           │ │ ▼ Customer: PT Anu Sentosa  (3 akun · Spend Rp 1.250.000)     │ │
│           │ │ ┌────────────────────────────────────────────────────────┐   │ │
│           │ │ │ Akun           │Tipe │Saldo     │Sts│Spend D-1│CTR │ROAS│CPC│ Hasil Utama │🔑│… │ │ │
│           │ │ ├────────────────┼─────┼──────────┼───┼─────────┼────┼────┼───┼─────────────┼──┼──┤ │ │
│           │ │ │ KANTOR MJO-1641│CL   │Rp 80.000 │🔴 │Rp 540rb │1,2%│2.1x│Rp 730│📝 12 Compl.Reg│✅│⋯│ │ │
│           │ │ │ KANTOR MJO-1416│CL   │Rp 4,5jt  │🟢 │Rp 410rb │0,9%│ —  │Rp 820│📝 8 Compl.Reg │✅│⋯│ │ │
│           │ │ │ KomAds WL 18   │Prep │Rp 2,1jt  │🟢 │Rp 300rb │1,4%│3.2x│Rp 510│🛒 4 Purchase  │✅│⋯│ │ │
│           │ │ └────────────────────────────────────────────────────────┘   │ │
│           │ │                                                              │ │
│           │ │ ▶ Customer: Barilie Batik     (1 akun · Spend Rp 180.000)    │ │
│           │ │ ▶ Customer: Kuliah Di Jordan  (1 akun · Spend Rp 220.000)    │ │
│           │ │ … [Tampilkan semua]                                          │ │
│           │ └──────────────────────────────────────────────────────────────┘ │
│           │                                                                  │
│           │ ━━━ 📈 Tren (30 hari, agregat scope filter) ━━━                  │
│           │ ┌──────────────────────────────────────────────────────────────┐ │
│           │ │ Spend Harian                                                 │ │
│           │ │                                                              │ │
│           │ │       ╱╲    ╱╲       ╱╲                                      │ │
│           │ │  ╱╲  ╱  ╲  ╱  ╲ ╱╲  ╱  ╲      ╱╲                             │ │
│           │ │ ╱  ╲╱    ╲╱    ╲  ╲╱    ╲    ╱  ╲                            │ │
│           │ │ 14   16   18   20   22   24   26   28   30 (Mei)             │ │
│           │ │                                                              │ │
│           │ │ Total Result per Label (stacked: Lead/Purchase/Visit/…)      │ │
│           │ │ Purchase ▓▓▓░░░░░  Lead ▒▒▒░░░░░  Visit ░░░░░░░░             │ │
│           │ │                                                              │ │
│           │ │ ROAS Harian (hanya akun PURCHASE_METRICS)                    │ │
│           │ │   ── 2.4x ── 3.1x ── 2.8x ── …                                │ │
│           │ └──────────────────────────────────────────────────────────────┘ │
│           │                                                                  │
│           │ ━━━ ⏱️ Status Cron & Notifikasi ━━━                              │
│           │ ┌──────────────────────────────────────────────────────────────┐ │
│           │ │ Tanggal      │ Started │ Finished │ Success/Total │ Failed   │ │
│           │ │ 2026-05-13   │ 09:00   │ 09:01    │ 12/12         │ —        │ │
│           │ │ 2026-05-12   │ 09:00   │ 09:02    │ 11/12         │ act_…416 │ │
│           │ │ 2026-05-11   │ 09:00   │ 09:01    │ 12/12         │ —        │ │
│           │ │ … [Lihat semua →]                                            │ │
│           │ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Notes pada page list
- **Group by Customer**: default. Tombol toggle "Group: ▼Customer / ▼Flat" mengubah tampilan tabel.
- **Status badge** di kolom "Sts": 🟢 ok, 💛 warning, 🔴 critical. Tooltip → `warning_message`.
- **Saldo**: label dinamis berdasarkan `balance_type`:
  - Postpaid → "Ruang Tagihan: Rp X" + tooltip "Threshold: Rp Y, Outstanding: Rp Z".
  - Credit Line → "Sisa: Rp X · Limit Rp Y".
  - Prepaid / Kartu Kredit → "Sisa: Rp X".
- **Kolom "🔑"** (token): ✅ valid / ❌ tidak valid / — tidak diset. Klik → drawer detail token.
- **Kolom "Hasil Utama"**: ambil label dengan `results` terbesar dari `fb_act_result_breakdown_daily` tanggal D-1.
- **CPC** ditampilkan jika `link_clicks > 0`, kalau tidak `—`.
- **ROAS** hanya untuk akun yang punya `omni_purchase` di `fb_act_result_config`.
- Tombol baris terakhir `⋯` = menu (Detail · Salin Act ID · Buka di Ads Manager).

---

## 2. Page List (Admin View) — perbedaan dari Advertiser

Sama persis dengan §1, dengan tambahan/perubahan:

```
Filter bar (admin):
┌─────────────┬──────────────┬──────────────┬───────────────┬────────────┐
│ Advertiser: │ Customer:    │ Status:      │ Tipe Akun:    │ Range:     │
│ [Semua ▼]   │ [Semua ▼]    │ [Semua ▼]    │ [Semua ▼]     │ [7 hari ▼] │
└─────────────┴──────────────┴──────────────┴───────────────┴────────────┘
```

- Dropdown **Advertiser** tampil (advertiser view tidak punya ini).
- Tabel akun: kolom tambahan **Advertiser** di samping kolom Customer.
- Section "Token Health" menampilkan token semua advertiser, dengan kolom "Pemilik".
- KPI cards tetap sama, tapi angka mencakup seluruh advertiser.

---

## 3. Page Detail Akun — `/monitoring-ads/:fbActId`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⭠ Kembali                                                          👤 Saiful │
├──────────────────────────────────────────────────────────────────────────────┤
│ 🏢 KANTOR MJO-1641                                  [🟢 Aktif] [✅ Token OK] │
│ Customer: PT Anu Sentosa · Advertiser: Saiful M. · Act ID: act_1566552664…   │
│ Tipe: Credit Line · Last sync: 2026-05-13 09:01 WIB                          │
│                                                                              │
│ ┌────────────────────────────┬─────────────────────────────────────────────┐ │
│ │ 💳 Saldo & Threshold       │ ⚙️ Threshold Override     [Edit ✏️]         │ │
│ │ Spending Limit  Rp 50jt    │ Warning (<):    Rp 1.000.000 (default)      │ │
│ │ Sisa            Rp 80.000  │ Critical (<):   Rp 100.000 (default)        │ │
│ │ Status          🔴 Critical│ Postpaid Thr.:  — (n/a, bukan postpaid)     │ │
│ │ Msg: "Saldo di bawah…"     │ Source: default notify.py                   │ │
│ └────────────────────────────┴─────────────────────────────────────────────┘ │
│                                                                              │
│ ━━━ 📉 Timeline Saldo (30 hari) ━━━                                          │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Rp                                                                       │ │
│ │ 50jt ┤████                                                               │ │
│ │      ┤   ╲╲                                                              │ │
│ │ 10jt ┤     ╲╲╲╲                                                          │ │
│ │  1jt ┤- - - - - ╲╲- - - - - - - - - - - - - - - - - (warning line)       │ │
│ │ 100k ┤- - - - - - - ╲- - - - - - - - - - - - - - - (critical line)       │ │
│ │   0  └────────────────╲─────────────────────────────                     │ │
│ │       14   17   20   23   26   29   01   04   07   10   13 (Mei)         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ━━━ 📊 Daily Insights (30 hari) ━━━                          [⇄ Switch View]│
│ ┌─────────┬─────────┬───────┬──────┬──────┬──────┬──────┬──────┬─────────┐ │
│ │ Tanggal │ Spend   │ Impr  │Reach │ Freq │Click │ CTR  │ CPM  │ CPC     │ │
│ ├─────────┼─────────┼───────┼──────┼──────┼──────┼──────┼──────┼─────────┤ │
│ │ 05-12   │ 540.000 │ 45.2k │ 32k  │ 1.41 │ 412  │ 1.2% │ Rp12k│ Rp 1.3k │ │
│ │ 05-11   │ 510.000 │ 41.8k │ 30k  │ 1.39 │ 380  │ 1.1% │ Rp12k│ Rp 1.3k │ │
│ │ …       │ …       │ …     │ …    │ …    │ …    │ …    │ …    │ …       │ │
│ └─────────┴─────────┴───────┴──────┴──────┴──────┴──────┴──────┴─────────┘ │
│                                                                              │
│ ━━━ 🎯 Breakdown Result (per label, per hari) ━━━                            │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Label                       │ D-1     │ 7 hari   │ 30 hari   │ Trend     │ │
│ │ 📝 Website Completed Reg.   │ 12      │ 78       │ 312       │ ↗ +12%    │ │
│ │ 🔔 Website Subscribes       │ 4       │ 21       │ 88        │ ↘ −3%     │ │
│ │ 📸 Instagram Profile Visits │ 380     │ 2.5k     │ 9.8k      │ → 0%      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ━━━ 📣 Campaign Harian (D-1) ━━━                              [Pilih tgl ▼] │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Campaign Name              │ Spend    │ Link Clicks │ Traffic? │ Result │ │
│ │ MJO-1641 · ColdAud         │ Rp 320rb │ 290         │ —        │ 8 Reg. │ │
│ │ MJO-1641 · Retargeting     │ Rp 150rb │  92         │ —        │ 4 Reg. │ │
│ │ MJO-1641 · IG Profile      │ Rp  70rb │  30         │ ✓        │ 30 IG  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ━━━ 🛒 Purchase Metrics (jika applicable) ━━━                                │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Total Purchase: 4   ·  Value: Rp 1.2jt  ·  CPP: Rp 135k  ·  ROAS: 2.2x   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ━━━ 📜 Log Notifikasi (30 hari) ━━━                                          │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 2026-05-13 09:01  main   · sent OK                                       │ │
│ │ 2026-05-12 09:01  main   · sent OK                                       │ │
│ │ 2026-05-11 09:01  main   · sent OK                                       │ │
│ │ 2026-05-11 09:02  extra  · sent OK (chat -5177350356)                    │ │
│ │ … [Tampilkan semua]                                                       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Modal: Edit Threshold Override

```
╭────────── Edit Threshold — KANTOR MJO-1641 ──────────╮
│                                                       │
│ Kosongkan untuk pakai default sistem.                 │
│                                                       │
│ Warning (<)    [ 1.000.000          ] IDR             │
│                 default: Rp 1.000.000                 │
│                                                       │
│ Critical (<)   [ 100.000            ] IDR             │
│                 default: Rp 100.000                   │
│                                                       │
│ Postpaid Thr.  [ —                  ] IDR             │
│                 hanya berlaku jika tipe = Postpaid    │
│                                                       │
│ ⓘ Perubahan langsung dipakai cron berikutnya.         │
│                                                       │
│             [ Batal ]   [ Reset ]   [ Simpan ]        │
╰───────────────────────────────────────────────────────╯
```

Validasi:
- Angka harus ≥ 0.
- `critical_override` ≤ `warning_override` (kalau dua-duanya diisi).
- `postpaid_threshold_override` hanya bisa disimpan jika daily snapshot terakhir punya `balance_type = "Postpaid"` (warning lunak, bukan blocking).

---

## 5. Empty States

| Konteks | Tampilan |
|---|---|
| Belum punya `fb_act` | Card besar "Belum ada akun Meta Ads terhubung. Hubungkan token di /settings/integrations." |
| Tidak ada warning hari ini | Section "Akun Butuh Perhatian" diganti "✅ Semua akun dalam kondisi aman." |
| Tidak ada notifikasi log | "Belum ada notifikasi terkirim untuk akun ini." |
| Cron belum jalan hari ini | KPI Spend D-1 menampilkan "—" + tooltip "Cron belum berjalan, snapshot terakhir: <date>". |

---

## 6. Loading & Error

- **Skeleton** per section (KPI cards, table, chart) saat fetch awal.
- **Error inline** per section: "Gagal memuat data ini. [Coba lagi]" — section lain tetap render normal.
- **Stale data badge**: jika `last sync > 24 jam`, tampil chip "⚠️ Data mungkin basi (last sync: …)".

---

## 7. Responsive (mobile)

- Filter bar collapse jadi tombol "Filter" → bottom sheet.
- KPI cards: grid 2×3.
- Tabel akun: setiap baris jadi card dengan info utama (Akun, Saldo, Status, Spend D-1) + tombol "Detail".
- Chart pakai horizontal scroll untuk 30-hari range.

---

## 8. Komponen yang Direuse

| Komponen | Sumber |
|---|---|
| KPI Card | sudah dipakai di Team Performance Dashboard |
| Range Picker | komponen umum filter |
| Status Badge (🟢/💛/🔴) | komponen kecil baru, juga reuse di list & detail |
| Line / Stacked Chart | lib chart yang sudah dipakai (recharts / chart.js — ikut existing) |
| Drawer / Modal | shadcn dialog component |
