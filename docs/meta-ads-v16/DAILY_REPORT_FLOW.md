# Meta Ads Daily Report — Flow

Dokumen ini menjelaskan alur eksekusi job `runMetaAdsDailyReport()` di
[`src/jobs/metaAdsDailyReport.ts`](../../src/jobs/metaAdsDailyReport.ts).

Job ini dijalankan oleh scheduler tiap pagi (default jam 07:00 WIB) lewat
[`scripts/run-meta-ads-report.ts`](../../scripts/run-meta-ads-report.ts), dan
bertugas membaca semua Facebook ad account aktif, mengambil saldo + insights
dari Meta Graph API, menghitung breakdown result per akun, lalu mengirim
laporan ke Telegram advertiser pemiliknya.

---

## 1. Pre-flight check

`runMetaAdsDailyReport()` (L565)

1. Baca env Telegram (opsional — job tetap jalan walau env kosong):
   - `TELEGRAM_NOTIFY_TOKEN` (atau fallback `TELEGRAM_BOT_TOKEN`) — Bearer
     token API relay di `https://mail.dots.my.id/api/notifications/telegram/send`.
     **Hanya dibutuhkan saat akan mengirim notifikasi.** Kalau kosong, job
     log warning dan skip semua pengiriman Telegram; ingest Meta API + DB
     tetap dijalankan.
   - `TELEGRAM_NOTIFY_USERNAME` (atau fallback `TELEGRAM_CHAT_ID`) — username
     fallback terakhir; biasanya kosong karena tiap akun di-resolve dari
     advertiser-nya sendiri.
2. **Tidak ada abort** di pre-flight. Notif Telegram hanya dikirim kalau
   `telegramApiToken` **dan** `mainUsername` (hasil resolution chain)
   sama-sama tersedia.
3. Hitung tanggal: `todayWib` = WIB sekarang, `yesterdayWib` = -24 jam,
   `yesterdayStr` = `YYYY-MM-DD` (basis data report).

## 2. Buat / refresh report run record

`fb_act_report_runs` adalah ledger per hari berisi statistik run
(`accountsTotal/Success/Failed`).

- Cek apakah row `date = yesterdayStr` sudah ada (re-run di hari sama).
- Kalau ada → reset `startedAt` & counter ke 0 (idempotent re-run).
- Kalau belum → insert row baru, simpan `runId` untuk diupdate setelah loop
  selesai.
- Kegagalan di langkah ini di-log tapi tidak menghentikan job (`runId` boleh
  null).

## 3. Ambil daftar fb_act + advertiser

Query gabungan di L613–632:

```
fb_act
  INNER JOIN fb_token   ON fb_act.token_id = fb_token.id
  INNER JOIN users      ON fb_token.user_id = users.id
  LEFT  JOIN profiles   ON profiles.user_id  = users.id
WHERE fb_token.status = 1   -- token aktif
```

Tiap row membawa:

| Field                       | Sumber                       | Dipakai untuk                              |
| --------------------------- | ---------------------------- | ------------------------------------------ |
| `id`, `actId`, `actName`    | `fb_act`                     | Identitas akun + log                       |
| `dataJson`                  | `fb_act.data_json`           | `FbActConfig` (lihat L73)                  |
| `*ThresholdOverride`        | `fb_act.*`                   | Override threshold warning/critical/postpaid |
| `token`                     | `fb_token.token`             | Access token Meta API                      |
| `advertiserUsername`        | `users.username`             | Recipient Telegram primer (fallback ke-2)  |
| `advertiserTelegramUsername`| `profiles.telegram_username` | Recipient Telegram primer (fallback ke-1)  |

## 4. Loop per akun

Untuk tiap `act` di hasil query:

1. Normalisasi `actId` → `act_<id>` (Meta API butuh prefix).
2. Parse `data_json` → `FbActConfig` (toleran object atau string).
3. Masuk `try { … } catch { … }` per akun supaya satu akun gagal tidak
   menghentikan akun lain.

### 4.1 Fetch dari Meta Graph API (paralel)

`Promise.all` di L644-648 memanggil 3 endpoint sekaligus:

| Helper                  | Endpoint Meta             | Yang diambil                                                                                  |
| ----------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `getMetaBalance`        | `GET /<act_id>`           | `balance`, `currency`, `name`, `amount_spent`, `spend_cap`, `funding_source_details`          |
| `getAccountInsights`    | `GET /<act_id>/insights`  | level=account: `spend`, `impressions`, `reach`, `frequency`, `ctr`, `cpm`, `actions`, …       |
| `getCampaignInsights`   | `GET /<act_id>/insights`  | level=campaign: `campaign_id`, `campaign_name`, `spend`, `actions`                            |

Semua memakai `time_range = { since: yesterdayStr, until: yesterdayStr }`.

### 4.2 Hitung effective balance & status

`getEffectiveBalance(config, balanceData)` di L229 memetakan
`config.billing_type` ke nilai yang ditampilkan ke user:

- `postpaid` → balance = `threshold - outstanding`, simpan
  `spendingLimit` & `outstandingBalance`.
- `credit_line` (dengan limit) → `balance = spendingLimit - amountSpent`.
- `credit_line` tanpa limit / `prepaid` dengan funding type kartu →
  `Kartu Kredit`, balance dibagi 100.
- `prepaid` lain → parse `funding_source_details.display_string` untuk angka
  saldo prepaid.

`computeStatusLevel` & `getSaldoStatus` lalu menentukan kategori (0=ok,
1=warning, 2=critical) + emoji + pesan peringatan. Threshold default
(`THRESHOLD_WARNING`, `THRESHOLD_CRITICAL`) bisa di-override per akun lewat
kolom `*_override` di `fb_act`.

### 4.3 Build result breakdown

`buildResultBreakdown(config, campInsights)` (L310) mengelompokkan campaign:

- Campaign yang nama-nya mengandung salah satu `config.keyword_traffic`
  (parsed via `parseKeywordTraffic` — toleran string / array / unknown) →
  dianggap **traffic campaign**, kontribusi `link_click` masuk ke label
  fallback (`instagram_profile_visit`).
- Campaign lain → ambil action type terbanyak yang ada di
  `config.results[].action_type`, tambahkan ke label yang sesuai.

Output: list `BreakdownResult` (`emoji`, `label`, `results`, `spent`, `cpr`)
disortir berdasarkan total spend.

Opsional: `getPurchaseMetrics(acctInsights)` (kalau `config.purchase_metrics`
true) menghitung total purchase, value, cost per purchase, ROAS.

### 4.4 Persist ke DB (3 tabel)

Tiap akun, di hari yang sama, di-upsert ke:

| Tabel                             | Granularity         | Strategy                                                            |
| --------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `fb_act_daily_data`               | 1 row per (act, day)| `INSERT … ON DUPLICATE KEY UPDATE` (re-run hari sama overwrite)     |
| `fb_act_campaign_daily_insights`  | per campaign        | Loop campaign, masing-masing `ON DUPLICATE KEY UPDATE`              |
| `fb_act_result_breakdown_daily`   | per label breakdown | Loop breakdown, masing-masing `ON DUPLICATE KEY UPDATE`             |

Semuanya menyimpan `fbActId` (FK), `actId`, `date = yesterdayStr`, plus
metrik mentahnya. `fb_act_daily_data.statusLevel` & `warningMessage` juga
disimpan supaya UI/laporan tidak perlu menghitung ulang.

### 4.5 Build Telegram message

`buildMessage(...)` (L455) merangkai pesan HTML berisi:

1. Header tanggal data & tanggal report.
2. Nama akun + tipe billing.
3. Saldo / spending limit / outstanding (tergantung billing type).
4. Performa kemarin: spend, impressions, reach, frequency, link clicks,
   CTR, CPM, CPC manual (= spend/link_clicks).
5. Breakdown per label (results, total spent, cost/result).
6. Purchase metrics (opsional).
7. Pesan peringatan (kalau ada).

### 4.6 Kirim Telegram + log

Resolution chain username (success path L800-815):

1. `config.telegram_username` / `config.telegram_chat_id` (override per
   akun).
2. `act.advertiserTelegramUsername` (`profiles.telegram_username`).
3. `act.advertiserUsername` (`users.username`).
4. `defaultTelegramUsername` (env fallback).

`resolveUsername()` membersihkan whitespace + prefix `@`, return `null`
kalau invalid. Kalau hasil chain `null` semua → skip dengan warning
("advertiser tidak punya username"), **tidak crash**.

Kalau berhasil: panggil `sendTelegram(message, username, apiToken)` →
POST ke `TELEGRAM_NOTIFY_URL` (relay) dengan body `{ username, text,
parseMode: "HTML" }`.

Setelah sukses kirim, insert `fb_act_notifications_log` dengan
`type = "main"` dan `dataJson = { username, accountName }`.

### 4.7 Extra recipient

Kalau `config.extra_telegram_username` (atau lama: `extra_telegram_chat_id`)
ter-set, kirim ulang pesan yang sama ke recipient extra dan log dengan
`type = "extra"`.

## 5. Error path per akun

`catch (e)` di L824:

1. Increment counter `failed`.
2. Bangun pesan error ringkas (`📊 Laporan Meta Ads Harian` + actId + alasan).
3. Kirim ke recipient utama (resolution chain sama dengan success path)
   dan ke extra kalau ada.
4. Log `fb_act_notifications_log` dengan `type = "error"` dan `dataJson
   = { error }`. Insert log ini dibungkus `try {} catch {}` supaya gagal
   logging tidak men-double-throw.

## 6. Finalize report run

Setelah loop:

- Update `fb_act_report_runs` row (`runId`) dengan `finishedAt = now`,
  `accountsTotal/Success/Failed`.
- Print ringkasan `[MetaAdsJob] Selesai: <success>/<total> sukses,
  <failed> gagal`.

## Diagram

### A. Flow utama job

Catatan: tidak ada abort di pre-flight. Token Telegram cuma dibaca untuk
dipakai kalau ada notifikasi yang mau dikirim.

```
                ┌──────────────────────────────┐
                │  cron / scheduler 07:00 WIB  │
                └──────────────┬───────────────┘
                               ▼
                ┌──────────────────────────────┐
                │  runMetaAdsDailyReport()     │
                └──────────────┬───────────────┘
                               ▼
                ┌──────────────────────────────┐
                │ baca env (semua opsional):   │
                │   telegramApiToken           │
                │   defaultTelegramUsername    │
                │ token kosong → warn, lanjut  │
                └──────────────┬───────────────┘
                               ▼
                ┌──────────────────────────────┐
                │ hitung todayWib /            │
                │ yesterdayWib / yesterdayStr  │
                └──────────────┬───────────────┘
                               ▼
                ┌──────────────────────────────┐
                │ upsert fb_act_report_runs    │
                │ (insert / reset, simpan runId)│
                └──────────────┬───────────────┘
                               ▼
                ┌──────────────────────────────┐
                │ SELECT fb_act                │
                │   ⨝ fb_token (status = 1)    │
                │   ⨝ users                    │
                │   ⟕ profiles                 │
                └──────────────┬───────────────┘
                               ▼
                ┌──────────────────────────────┐
                ┌──────────────►│   akun masih tersisa?        │
                │               └────┬───────────────────┬─────┘
                │                ya  │                   │ tidak
                │                    ▼                   ▼
                │   ┌──────────────────────────┐  ┌──────────────────────────────┐
                │   │ Proses 1 akun            │  │ UPDATE fb_act_report_runs    │
                │   │ (lihat diagram B)        │  │ (finishedAt, counters)       │
                │   └──────────────┬───────────┘  └──────────────┬───────────────┘
                │                  │                             ▼
                └──────────────────┘                ┌──────────────────────────────┐
                                                   │ console.log ringkasan        │
                                                   │ "X/Y sukses, Z gagal"        │
                                                   └──────────────────────────────┘
```

### B. Pemrosesan per akun

```
                  ┌──────────────────────────────┐
                  │ next act (dari hasil query)  │
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │ normalize actId → act_<id>   │
                  │ parse data_json → FbActConfig│
                  └──────────────┬───────────────┘
                                 ▼
                  ┌──────────────────────────────┐
                  │ Promise.all([                │
                  │   getMetaBalance,            │
                  │   getAccountInsights,        │
                  │   getCampaignInsights        │
                  │ ])                           │
                  └────┬───────────────────┬─────┘
                  error│                   │ok
                       ▼                   ▼
              ┌──────────────────┐   ┌──────────────────────────────┐
              │ CATCH PATH       │   │ getEffectiveBalance          │
              │ (diagram D)      │   │ (prepaid / credit_line /     │
              └──────────────────┘   │  postpaid / kartu kredit)    │
                                     └──────────────┬───────────────┘
                                                    ▼
                                     ┌──────────────────────────────┐
                                     │ computeStatusLevel +         │
                                     │ getSaldoStatus (emoji + msg) │
                                     └──────────────┬───────────────┘
                                                    ▼
                                     ┌──────────────────────────────┐
                                     │ buildResultBreakdown         │
                                     │ (traffic kw vs primary)      │
                                     └──────────────┬───────────────┘
                                                    ▼
                                     ┌──────────────────────────────┐
                                     │ config.purchase_metrics?     │
                                     └────┬───────────────────┬─────┘
                                       ya │                   │ tidak
                                          ▼                   │
                                ┌──────────────────┐          │
                                │ getPurchaseMetrics│         │
                                └────────┬─────────┘          │
                                         ▼                    ▼
                                     ┌──────────────────────────────┐
                                     │ UPSERT fb_act_daily_data     │
                                     │ UPSERT fb_act_campaign_      │
                                     │        daily_insights (loop) │
                                     │ UPSERT fb_act_result_        │
                                     │        breakdown_daily (loop)│
                                     └──────────────┬───────────────┘
                                                    ▼
                                     ┌──────────────────────────────┐
                                     │ buildMessage (HTML Telegram) │
                                     └──────────────┬───────────────┘
                                                    ▼
                                     ┌──────────────────────────────┐
                                     │ kirim Telegram               │
                                     │ (diagram C)                  │
                                     └──────────────┬───────────────┘
                                                    ▼
                                     ┌──────────────────────────────┐
                                     │ success++, log OK            │
                                     └──────────────────────────────┘
```

### C. Resolve username + kirim Telegram (success path)

Pengiriman butuh **dua** prasyarat: `telegramApiToken` (env) **dan**
`mainUsername` (hasil resolution chain). Kalau salah satu kosong, skip
pengiriman tapi data ingest sudah selesai tersimpan.

```
              ┌──────────────────────────────┐
              │ telegramApiToken ada?        │
              └────┬───────────────────┬─────┘
              tidak│                   │ya
                   ▼                   ▼
        ┌──────────────────┐  ┌──────────────────────────────────────┐
        │ skip semua kirim │  │ Resolve username (urut prioritas):   │
        │ Telegram         │  │                                      │
        │ (tidak insert    │  │  1. config.telegram_username         │
        │  log apa-apa)    │  │     │ ada? ──► gunakan               │
        │ selesai untuk    │  │     ▼ tidak                          │
        │ akun ini         │  │  2. config.telegram_chat_id (deprec) │
        └──────────────────┘  │     │ ada? ──► gunakan               │
                              │     ▼ tidak                          │
                              │  3. profiles.telegram_username       │
                              │     │ ada? ──► gunakan               │
                              │     ▼ tidak                          │
                              │  4. users.username                   │
                              │     │ ada? ──► gunakan               │
                              │     ▼ tidak                          │
                              │  5. env TELEGRAM_NOTIFY_USERNAME     │
                              │     │ ada? ──► gunakan               │
                              │     ▼ tidak ──► null                 │
                              └──────────────┬───────────────────────┘
                                             ▼
                              ┌──────────────────────────────┐
                              │ mainUsername == null?        │
                              └────┬───────────────────┬─────┘
                              ya  │                   │ tidak
                                  ▼                   ▼
                        ┌─────────────────┐  ┌──────────────────────────────────────┐
                        │ warn: skip kirim│  │ POST TELEGRAM_NOTIFY_URL             │
                        │ utk akun ini    │  │   Authorization: Bearer <apiToken>   │
                        └────────┬────────┘  │   body: { username, text,            │
                                 │           │           parseMode: "HTML" }        │
                                 │           └──────────────┬───────────────────────┘
                                 │                          ▼
                                 │           ┌──────────────────────────────────────┐
                                 │           │ INSERT fb_act_notifications_log      │
                                 │           │   type = "main"                      │
                                 │           │   dataJson = { username, accountName}│
                                 │           └──────────────┬───────────────────────┘
                                 │                          ▼
                                 │           ┌──────────────────────────────────────┐
                                 │           │ ada extra_telegram_username /        │
                                 │           │     extra_telegram_chat_id?          │
                                 │           └────┬───────────────────┬─────────────┘
                                 │             ya │                   │ tidak
                                 │                ▼                   │
                                 │   ┌──────────────────────────────┐ │
                                 │   │ POST relay API (extra)       │ │
                                 │   │ INSERT log type = "extra"    │ │
                                 │   └──────────────┬───────────────┘ │
                                 │                  ▼                 ▼
                                 └─────────────────►┌─────────────────────────────┐
                                                    │ selesai untuk akun ini      │
                                                    └─────────────────────────────┘
```

### D. Catch path per akun

```
       ┌──────────────────────────────┐
       │ exception (fetch / hitung)   │
       └──────────────┬───────────────┘
                      ▼
       ┌──────────────────────────────┐
       │ failed++                     │
       │ console.error pesan akun     │
       └──────────────┬───────────────┘
                      ▼
       ┌──────────────────────────────┐
       │ bangun errMsg HTML           │
       │ (actId + e.message)          │
       └──────────────┬───────────────┘
                      ▼
       ┌──────────────────────────────┐
       │ telegramApiToken ada?        │
       └────┬───────────────────┬─────┘
        tidak│                  │ ya
             │                  ▼
             │   ┌──────────────────────────────┐
             │   │ resolve mainUsername         │
             │   │ (chain sama dengan diagram C)│
             │   └────┬─────────────────┬───────┘
             │    ada │                 │ null
             │        ▼                 ▼
             │ ┌────────────────┐  ┌────────────────┐
             │ │ POST errMsg    │  │ skip kirim     │
             │ │ ke mainUsername│  │ utama          │
             │ └────────┬───────┘  └────────┬───────┘
             │          └────────┬──────────┘
             │                   ▼
             │     ┌──────────────────────────────┐
             │     │ ada extra username?          │
             │     └────┬───────────────────┬─────┘
             │       ya │                   │ tidak
             │          ▼                   │
             │ ┌────────────────┐           │
             │ │ POST errMsg    │           │
             │ │ ke extra       │           │
             │ └────────┬───────┘           │
             │          └────────┬──────────┘
             │                   ▼
             └─────────►┌──────────────────────────────┐
                       │ try INSERT log type="error"  │
                       │ (dibungkus try/catch sendiri)│
                       └──────────────┬───────────────┘
                                      ▼
                       ┌──────────────────────────────┐
                       │ lanjut akun berikutnya       │
                       └──────────────────────────────┘
```

### E. Resolusi balance (`getEffectiveBalance`)

```
   ┌──────────────────────────────────────┐
   │ Input: balanceData + FbActConfig     │
   │ (raw: balance, amount_spent,         │
   │       spend_cap, funding_source)     │
   └──────────────┬───────────────────────┘
                  ▼
   ┌──────────────────────────────────────┐
   │ config.billing_type ?                │
   └─┬─────────────┬─────────────────┬────┘
     │postpaid     │credit_line      │prepaid / null
     ▼             ▼                 ▼
 ┌───────────┐  ┌────────────────┐  ┌──────────────────────────┐
 │ balance = │  │ ada spending_  │  │ funding.type == 1 ?      │
 │ threshold │  │ limit ?        │  └──┬───────────────┬───────┘
 │ - outstd  │  └─┬───────┬──────┘  ya │               │ tidak
 │ Postpaid  │ ya │    tidak │         ▼               ▼
 └───────────┘    ▼          ▼   ┌───────────┐  ┌────────────────┐
              ┌────────┐ ┌──────────┐ balance│  │display_string  │
              │balance=│ │balance=  │= raw/  │  │punya angka?    │
              │limit - │ │raw/100   │ 100    │  └──┬─────────┬───┘
              │spent   │ │Kartu     │Kartu   │  ya │       tidak │
              │Credit  │ │Kredit    │Kredit  │     ▼             ▼
              │Line    │ └──────────┘────────┘ ┌──────────┐ ┌──────────┐
              └────────┘                       │balance=  │ │balance=  │
                                               │max(angka)│ │raw/100   │
                                               │Prepaid   │ │Prepaid   │
                                               └──────────┘ └──────────┘
                  │
                  ▼
   ┌──────────────────────────────────────┐
   │ Output: EffectiveBalance             │
   │   { balance, balanceType,            │
   │     spendingLimit, outstandingBalance}│
   └──────────────────────────────────────┘
```

### Versi linear (ringkas)

```
[cron] → runMetaAdsDailyReport()
  ├─ baca env Telegram (opsional — token kosong = skip kirim, ingest lanjut)
  ├─ upsert fb_act_report_runs (runId)
  ├─ SELECT fb_act ⨝ fb_token ⨝ users ⟕ profiles  WHERE fb_token.status = 1
  └─ FOR EACH act:
       ├─ parse data_json → FbActConfig
       ├─ Promise.all([ getMetaBalance, getAccountInsights, getCampaignInsights ])
       ├─ getEffectiveBalance → balanceInfo
       ├─ computeStatusLevel + getSaldoStatus
       ├─ buildResultBreakdown
       ├─ (opt) getPurchaseMetrics
       ├─ UPSERT fb_act_daily_data
       ├─ UPSERT fb_act_campaign_daily_insights (per campaign)
       ├─ UPSERT fb_act_result_breakdown_daily (per label)
       ├─ buildMessage
       ├─ resolve username (config → profiles → users → env)
       ├─ (token ada + username ada)
       │     ├─ sendTelegram(main) → relay API
       │     ├─ INSERT fb_act_notifications_log type=main
       │     └─ (opt) sendTelegram(extra) + log type=extra
       └─ (token / username kosong) → skip kirim, ingest sudah aman
       ──── catch ────
       ├─ (token ada) sendTelegram(errMsg, main) bila username ada
       ├─ (token ada, opt) sendTelegram(errMsg, extra)
       └─ INSERT fb_act_notifications_log type=error  (selalu, terlepas token)

UPDATE fb_act_report_runs (finishedAt, counters)
console.log ringkasan
```

## Tabel data yang terlibat

| Tabel                              | Peran                                                        |
| ---------------------------------- | ------------------------------------------------------------ |
| `fb_act`                           | Master akun + `data_json` (FbActConfig)                      |
| `fb_token`                         | Access token Meta per advertiser (`user_id`)                 |
| `users`, `profiles`                | Source username Telegram advertiser                          |
| `fb_act_daily_data`                | Snapshot saldo + metrik akun per hari                        |
| `fb_act_campaign_daily_insights`   | Spend/clicks per campaign per hari                           |
| `fb_act_result_breakdown_daily`    | Breakdown result per label per hari                          |
| `fb_act_notifications_log`         | Log tiap pengiriman (main/extra/error)                       |
| `fb_act_report_runs`               | Statistik run harian                                         |

## Konfigurasi per akun (`fb_act.data_json` → `FbActConfig`)

Field yang dipakai job ini (lihat L73-94):

| Field                      | Tipe       | Keterangan                                                                                                |
| -------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| `billing_type`             | enum       | `prepaid` / `credit_line` / `postpaid`                                                                    |
| `spending_limit`           | number     | Credit line: limit dalam Rupiah                                                                           |
| `billing_threshold`        | number     | Postpaid: threshold sebelum ditagih                                                                       |
| `results[]`                | array      | Konfigurasi label result per `action_type` (emoji + label)                                                |
| `purchase_metrics`         | boolean    | Tampilkan blok Purchase Metrics di pesan                                                                  |
| `keyword_traffic`          | string\|[] | Kata kunci nama campaign Traffic (dipisah spasi atau array). Parsed via `parseKeywordTraffic` (tahan null).|
| `telegram_username`        | string     | Override recipient utama (prioritas tertinggi)                                                            |
| `extra_telegram_username`  | string     | Recipient extra                                                                                           |
| `telegram_chat_id`         | string     | Deprecated, fallback dipakai sebagai username                                                             |
| `extra_telegram_chat_id`   | string     | Deprecated, fallback dipakai sebagai username                                                             |

## Catatan operasional

- **Re-run hari yang sama** aman: semua write pakai `ON DUPLICATE KEY
  UPDATE` dan report-run row direset.
- **Kegagalan Meta API** untuk satu akun tidak menghentikan akun lain.
- **Kegagalan Telegram** untuk satu akun di-catch terpisah (logging error
  sendiri tidak akan men-trigger error baru).
- **Akun tanpa username advertiser** tetap dijalankan ingest-nya, hanya
  skip pengiriman Telegram dengan warning log.
- **`TELEGRAM_NOTIFY_TOKEN` tidak wajib** untuk menjalankan job. Token
  hanya dibutuhkan ketika benar-benar akan mengirim notifikasi (mainnya:
  saat ada username yang ter-resolve). Kalau token kosong, job log warning
  dan tetap melakukan ingest Meta API + simpan ke DB; semua pengiriman
  Telegram di-skip.
- **Env override URL**: set `TELEGRAM_NOTIFY_URL` kalau perlu pindah relay
  (default `https://mail.dots.my.id/api/notifications/telegram/send`).
