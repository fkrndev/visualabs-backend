# Rencana: Menyimpan Data Marketplace dari Layar Tim

Status: langkah 1 dan 2 selesai ditulis, migrasi BELUM dijalankan
Tanggal: 28 Agustus 2026 (rancangan), diperbarui hari yang sama

## 1. Tujuan

Tim advertising membuka halaman Shopee Seller Centre dan TikTok Shop Seller Center
setiap hari. Data yang mereka lihat di layar hanya hidup selama halaman terbuka,
lalu hilang.

Yang kita inginkan: setiap data yang tampil di layar tim ikut tersimpan di server,
otomatis, tanpa tim melakukan apa pun. Data itu dipakai untuk tiga hal:

1. Riwayat (history) — melihat pergerakan angka dari hari ke hari
2. Bahan analisa AI
3. Dasar pengambilan keputusan

Proses pengambilan data dilakukan oleh **extension Chrome** (`vbox-controller`),
bukan oleh robot terpisah.

## 2. Yang Sudah Diuji dan Terbukti

Dua pengujian sudah dijalankan lewat CDP pada 28 Agustus 2026. CDP hanya dipakai
sebagai alat uji untuk menemukan endpoint. Pelaksana sebenarnya nanti tetap extension.

### 2.1 Shopee — profil "Barilie Batik - Shopee Ads"

302 response tertangkap dalam satu kali buka halaman, 82 di antaranya API
`seller.shopee.co.id`. Angka dari API cocok persis dengan angka di layar.

Endpoint `GET /api/mydata/v2/homepage/key-metrics/`:

| Di layar                 | Nilai tampil         | Dari API                                                     |
| ------------------------ | -------------------- | ------------------------------------------------------------ |
| Penjualan                | `Rp1.4M` naik 46,82% | `sales: 1366100`, `sales_pct_diff: 0.4682143049062282`       |
| Total Pengunjung         | `167` naik 29,46%    | `hybrid_uv: 167`, `hybrid_uv_pct_diff: 0.29457364`           |
| Jumlah Produk Diklik     | `604` naik 37,90%    | `product_clicks: 604`, `product_clicks_pct_diff: 0.37899543` |
| Pesanan                  | `3` naik 50,00%      | `orders: 3`, `orders_pct_diff: 0.5`                          |
| Tingkat Konversi Pesanan | `0,50%` naik 0,04%   | `product_clicks_to_orders_rate: 0.004966887`                 |

Endpoint `GET /api/pas/v1/sc_pc_homepage/adopter/get_report/`:

| Di layar                              | Dari API                                                      |
| ------------------------------------- | ------------------------------------------------------------- |
| Penjualan iklan `Rp2.3M` naik 199.34% | `broad_gmv: 229655000000`, `ratio.broad_gmv: 1.9934176`       |
| ROAS `26,68` naik 545.60%             | `broad_roi: 26.683892475307733`, `ratio.broad_roi: 5.4560101` |

Identitas toko: `GET /api/framework/selleraccount/shop_info/` berisi
`shop_id: 815627321`, `name: "Barilie Official Store"`.

### 2.2 TikTok Shop — profil "Fefa Style | Shopee | Tiktokshop"

341 response tertangkap, 76 di antaranya API `seller-id.tokopedia.com`,
sekitar 56 path unik. Formatnya JSON biasa lewat fetch/XHR. Tidak ada protobuf.
Hook yang sama bisa dipakai.

Endpoint `POST /api/v2/insights/seller/ttp/seller_center/homepage/stats`:

| Di layar (pilihan "7 hari terakhir") | Dari API (segment `date_range=1`) |
| ------------------------------------ | --------------------------------- |
| GMV `Rp47.523.559`                   | `gmv.amount: "47523559"`          |
| Pembeli `293`                        | `customers_cnt: 293`              |
| Pesanan SKU `329`                    | `orders_cnt: 329`                 |
| Pengunjung `32.335`                  | `visitors_cnt: 32335`             |

Satu response berisi tiga periode sekaligus, padahal di layar hanya satu yang
terlihat:

```
date_range=0  2026-08-28 s/d 2026-08-28   gmv 2.408.186    updated 2026-08-28 10:24:29
date_range=1  2026-08-20 s/d 2026-08-26   gmv 47.523.559   updated 2026-08-27 00:00:00
date_range=2  2026-07-30 s/d 2026-08-26   gmv 170.904.159  updated 2026-08-27 00:00:00
```

Artinya capture memberi **lebih banyak** daripada yang dilihat tim.

Identitas toko: `oec_seller_id=7494083445777663262` ada di query setiap request.
Ada juga `shop_binded_toko_shop_id: "7834926"` di dalam
`POST /api/v2/insights/seller/shop/info`.

## 3. Rancangan Inti: Dua Lapis

Masalah utamanya sederhana:

> Kita tidak bisa memilih endpoint yang belum pernah kita lihat.

Kalau daftar endpoint ditulis keras di dalam kode extension, setiap kali tim
membuka halaman baru harus ada orang yang membuka DevTools, mencatat endpoint,
ubah kode, build, deploy, tunggu 30 menit. Tiap kali Shopee atau TikTok menambah
fitur, ulang lagi.

Karena itu rancangannya dipisah dua lapis.

### Lapis 1 — Katalog (selalu menyala, tanpa isi)

Setiap response JSON dari host marketplace yang lewat, extension mengirim
**metadata saja**: host, path, method, status, ukuran. Backend melakukan *upsert*
ke satu baris per endpoint (`hit_count` bertambah, `last_seen_at` diperbarui).

Ini bukan log per kejadian. Jadi 80 endpoint dikali ratusan pembukaan halaman per
hari tetap menjadi sekitar 200 baris saja, bukan puluhan ribu.

Hasilnya: dalam seminggu tersedia daftar lengkap endpoint yang benar-benar dipakai
tim, terurut dari yang paling sering muncul. Tanpa membuka DevTools sama sekali.

### Lapis 2 — Penyimpanan (dinyalakan per endpoint)

Isi response hanya disimpan untuk endpoint yang ditandai `capture_body = true`.
Extension menarik daftar tanda ini secara berkala.

Akibatnya: menambah sumber data cukup mengubah satu penanda, bukan mengubah kode.
Saat giliran TikTok, tidak ada baris kode yang berubah — hanya baris baru di tabel
yang sama.

## 4. Jebakan yang Sudah Ditemukan

Enam hal ini ditemukan saat pengujian. Semuanya harus ditangani sejak awal.

### 4.1 Satuan berbeda antar platform

Shopee iklan: `broad_gmv: 229655000000` berarti Rp 2.296.550. Dibagi 100.000.
Pemeriksaan silang: `cost 8606502976` dibagi 100.000 sama dengan 86.065, lalu
2.296.550 dibagi 86.065 sama dengan 26,68 — cocok dengan `broad_roi`.

TikTok: `{"amount":"2408186","currency_code":"IDR"}` berarti Rp 2.408.186. Tanpa
pembagi.

Kesimpulan: catatan satuan disimpan **per endpoint**, bukan per platform.

### 4.2 Identitas endpoint hanya host + path

URL kedua platform penuh parameter yang berubah-ubah setiap request:

- Shopee: `SPC_CDS=203e9f78-...`, `SPC_CDS_VER`, `timestamp=1787886345510`, `requestId`
- TikTok: `X-Bogus`, `X-Gnarly`, `X-Tts-Oec-Bsid`, `msToken`, `fp=verify_...`

Kalau identitas endpoint memakai URL penuh, setiap request menjadi endpoint baru
dan katalognya langsung tidak terpakai.

Aturan: `endpoint_key` = host + pathname saja. Query disimpan terpisah pada baris
payload.

### 4.3 Parameter rahasia tidak boleh ikut tersimpan

Query TikTok berisi token semi-rahasia (`msToken`, `X-Tts-Oec-Bsid`) dan sidik
jari perangkat staff (`screen_width`, `browser_version`, `device_platform`).

Sebelum disimpan, query harus disaring dengan daftar tolak:

```
X-*, msToken, fp, browser_*, screen_*, device_platform, cookie_enabled,
timezone_name, SPC_CDS, SPC_CDS_VER, timestamp, requestId, _cache_*
```

Yang disimpan hanya yang bermakna: `oec_seller_id`, `locale`, `language`,
`group`, `offset`, `order_type`, `type`.

### 4.4 Data harian berbentuk potret, bukan satu baris per hari

Angka "penjualan hari ini" pukul 10:00 berbeda dengan pukul 16:00. Jadi bentuknya
deret potret waktu, bukan satu baris per hari.

Penyimpanan bersifat *append-only* dengan dedup memakai `payload_hash`. Kalau tim
menyegarkan halaman 20 kali dan datanya sama, tetap satu baris. Kalau berubah,
pergerakan dalam satu hari ikut terekam tanpa usaha tambahan.

Untuk angka harian yang sudah final, capture paling akurat justru terjadi
**keesokan harinya**.

Dedup ini terbukti perlu. Dalam satu kali buka halaman TikTok,
`libraweb.tiktok.com/service/2/abtest_config/` dipanggil 10 kali dengan isi
identik 24 KB.

### 4.5 Identitas akun mengikuti profil Chrome

**Aturan kerja tim: satu profil Chrome dipakai untuk satu akun klien.** Identitas
diambil dari profil, bukan dari isi response.

Ini penting karena isi response tidak bisa diandalkan. Diukur dari data uji:

| Platform | Total response API | Memuat identitas toko | Tidak memuat |
|---|---|---|---|
| Shopee | 80 | 8 (1 di query, 7 di body) | **72 (90%)** |
| TikTok | 76 | 54 (`oec_seller_id` di query) | 22 (29%) |

Kalau identitas dicari dari tiap response, 90% data Shopee menjadi yatim. Dengan
mengikuti profil, cakupannya 100% tanpa syarat apa pun.

Jalannya:

1. Extension mengirim `browserUuid` bersama setiap capture
2. Backend mencocokkan ke `chrome_profiles` lewat `uuid`
3. Dari baris itu didapat `customer_id` (klien) dan `user_id` (staff)

Tidak ada pekerjaan baru di sisi extension. `browserUuid` sudah tersimpan di
`chrome.storage`, ditulis oleh Tauri ke `injected-config.json` setiap kali profil
dijalankan, dan `background.ts` sudah rutin memanggil
`GET /chrome-profiles/by-uuid/:uuid`.

**Satu profil bisa memegang dua platform.** Contoh dari data nyata:
"Fefa Style | Shopee | Tiktokshop", "Twelve Tactical | Shopee Tiktok". Jadi satu
profil sama dengan satu klien, tetapi bisa dua toko — satu di Shopee, satu di
TikTok. Karena itu kolom `platform` tetap diperlukan untuk memisahkannya.

**`shop_id` turun pangkat menjadi pemeriksa silang.** Tetap disimpan kalau ada di
response, tetapi bukan lagi identitas utama. Gunanya: kalau `shop_id` berubah
untuk pasangan profil + platform yang sama, berarti ada yang login ke toko lain
di profil itu. Kejadian seperti itu perlu ditandai, jangan didiamkan.

### 4.6 Masalah data: 17 profil belum punya klien

Dari 71 profil di `chrome_profiles`, 17 profil `customer_id`-nya masih kosong.
Enam di antaranya tidak perlu diisi: empat profil uji (`win-amd-000015e7`, `wwww`,
`test`, `test`) dan dua profil bukan marketplace (`Beautydlash - CTWA`,
`Al Mashaell - Meta Ads`).

**Sisa 11 profil yang benar-benar perlu diisi:**

| id | nama |
|---|---|
| 110 | Sanggar Asi Shopee |
| 109 | Lunaci \| Shopee |
| 108 | Aura Secret \| Shopee |
| 107 | Hypeaf ID \| Shopee |
| 102 | Watch Original Indo \| Shopee |
| 101 | Almonesia \| Tiktok |
| 95 | Handduk by today \| Tiktok |
| 69 | Nafizana Sportwear - Tiktok |
| 68 | Nafizana Sportwear - Shopee |
| 67 | Winolla Collection - Shopee |
| 63 | Hazpira Collection - Shopee |

Data dari profil-profil ini akan masuk tanpa klien, jadi tidak muncul di laporan
per klien. Ini pekerjaan mengisi data, bukan pekerjaan kode, dan harus selesai
sebelum langkah 4 (menjalankan Lapis 1 selama seminggu) supaya hasil katalognya
langsung terpakai.

Catatan: kebiasaan penamaan profil belum seragam. Sebagian klien memakai satu
profil untuk dua platform ("Fefa Style | Shopee | Tiktokshop"), sebagian memakai
dua profil terpisah ("Nafizana Sportwear - Shopee" dan
"Nafizana Sportwear - Tiktok"). Rancangan ini menampung keduanya: pengelompokan
memakai `customer_id`, pemisahan memakai `platform`. Tidak perlu menyeragamkan
kebiasaan tim.

## 5. Keterbatasan yang Harus Disadari

Capture bersifat pasif. Data masuk **hanya kalau ada orang yang membuka
halamannya**. Ini konsekuensi langsung dari rancangan yang dipilih dan sesuai
rencana kerja tim.

Bahayanya ada di penggunaan untuk analisa AI: kalau akhir pekan tim libur, datanya
kosong. AI yang tidak tahu beda antara **"tidak ada data"** dan **"nilainya nol"**
akan menyimpulkan penjualan anjlok ke nol, lalu keputusan diambil dari kesimpulan
itu.

Katalog di Lapis 1 sudah menjawab sebagian: `last_seen_at` per endpoint per toko
menunjukkan kapan terakhir data masuk. Yang perlu ditambahkan adalah aturan bahwa
setiap query analisa wajib melewati lapisan yang tahu kapan data terakhir segar.

## 6. Skema Basis Data

Dua tabel. Bukan satu tabel per metrik.

```sql
-- Katalog endpoint sekaligus saklar penyimpanan
CREATE TABLE capture_endpoint (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  platform      VARCHAR(32)  NOT NULL,          -- 'shopee' | 'tiktok'
  endpoint_key  VARCHAR(512) NOT NULL,          -- host + pathname
  sample_url    TEXT,
  capture_body  TINYINT(1)   NOT NULL DEFAULT 0,
  unit_note     VARCHAR(255),                   -- contoh: 'broad_gmv dibagi 100000'
  hit_count     INT          NOT NULL DEFAULT 0,
  first_seen_at DATETIME     NOT NULL,
  last_seen_at  DATETIME     NOT NULL,
  note          TEXT,
  UNIQUE KEY uq_endpoint (platform, endpoint_key)
);

-- Isi response
CREATE TABLE capture_payload (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  platform            VARCHAR(32)  NOT NULL,
  endpoint_key        VARCHAR(512) NOT NULL,
  chrome_profile_uuid CHAR(36)     NOT NULL,    -- identitas utama akun
  customer_id         INT,                      -- hasil pencocokan dari chrome_profiles
  user_id             INT,                      -- staff yang membuka, untuk telusur
  shop_id             VARCHAR(64),              -- pemeriksa silang, bukan identitas
  shop_name           VARCHAR(255),             -- untuk dibaca manusia
  method              VARCHAR(8)   NOT NULL,
  query_json          JSON,                     -- sudah disaring daftar tolak
  request_body        LONGTEXT,
  payload_hash        CHAR(64)     NOT NULL,    -- sha-256
  payload             LONGTEXT     NOT NULL,
  captured_at         DATETIME     NOT NULL,
  UNIQUE KEY uq_payload (chrome_profile_uuid, platform, endpoint_key, payload_hash),
  KEY idx_lookup (customer_id, platform, endpoint_key, captured_at)
);
```

Kunci unik memakai `chrome_profile_uuid`, bukan `shop_id`. Alasannya dua:
`chrome_profile_uuid` selalu terisi (`shop_id` tidak, lihat bagian 4.5), dan MySQL
menganggap dua nilai `NULL` sebagai berbeda — kalau kolom kunci boleh kosong,
dedup berhenti bekerja diam-diam dan baris kembar ikut masuk.

**Sumbu analisa adalah `customer_id`, bukan `user_id`.** Satu staff memegang banyak
profil klien. Kolom `user_id` dan `chrome_profile_uuid` dipakai untuk menelusuri
asal data ketika ada yang mencurigakan, bukan untuk mengelompokkan angka penjualan.

Payload disimpan mentah apa adanya. Parsing dilakukan saat data dibaca, mengikuti
pola `fb_act.data_json` yang sudah dipakai.

Alasannya bukan kemalasan: kalau parser salah — dan kasus satuan Shopee di atas
menunjukkan itu mudah terjadi — data mentahnya masih ada untuk diproses ulang.

Tabel metrik ternormalisasi dibuat nanti, saat ada grafik atau prompt AI yang
benar-benar membutuhkan, per metrik, bukan borongan untuk 82 endpoint.

Batas ukuran: payload di atas 256 KB dilewati, dan pelewatannya dicatat. Ini
mencegah berkas konfigurasi besar (`config_center_gw` milik TikTok berukuran
629 KB) masuk ke basis data.

## 7. Kesiapan Extension

`vbox-controller` versi 1.0.16 sudah siap. Tidak ada izin baru yang perlu
ditambahkan:

- `host_permissions` sudah `<all_urls>`
- `permissions` sudah berisi `storage`, `alarms`, `tabs`, `webNavigation`
- Sudah ada satu content script (`contents/widget.tsx`), jadi polanya tinggal diikuti
- Plasmo mendukung `world: "MAIN"` yang dibutuhkan
- Pembaruan otomatis setiap 30 menit sudah berjalan
- Backend sudah punya `/api/extension` untuk distribusi

Cara kerja hook di sisi extension:

```
content script (world: MAIN, run_at: document_start)
  tambal window.fetch dan XMLHttpRequest
    -> window.postMessage
      -> content script (world: ISOLATED)
        -> chrome.runtime.sendMessage
          -> background: antre di chrome.storage, lalu POST ke backend
```

Menambal di `document_start` berarti hook tetap hidup ketika tim berpindah halaman
tanpa memuat ulang. Kedua situs adalah SPA, jadi ini penting: satu tab yang dibuka
seharian tertangkap seluruhnya.

Antrean dengan percobaan ulang wajib ada. Capture hanya lewat sekali; kalau
pengiriman gagal, lubang di riwayat bersifat permanen sampai ada yang membuka
halaman itu lagi.

## 8. Langkah Kerja

### Kerjakan sekarang

1. ~~**Backend: dua tabel + endpoint**~~ — SELESAI, lihat bagian 12
 Migrasi `drizzle/0044_add_capture_tables.sql`, lalu:
  - `POST /api/capture/catalog` — terima metadata batch, upsert `capture_endpoint`
  - `POST /api/capture/payload` — terima isi batch, simpan dengan dedup hash
  - `GET /api/capture/rules` — kembalikan daftar `endpoint_key` yang `capture_body = 1`
2. ~~**Extension: hook MAIN world + antrean**~~ — SELESAI, lihat bagian 12
 Content script baru di `vbox-extensions/vbox-controller/contents/`, ditambah
 penanganan antrean di `background.ts`. Identitas cukup ikut `browserUuid` yang
 sudah tersedia, jadi tidak ada logika pencarian identitas.
3. **Isi `customer_id` untuk 17 profil yang kosong** — sekitar 30 menit
 Pekerjaan mengisi data di halaman `chrome-profiles/admin`. Harus selesai sebelum
 langkah 4, kalau tidak datanya masuk tanpa klien.
4. **Jalankan seminggu dengan Lapis 1 saja** — 7 hari menunggu
 Biarkan katalog terisi dari kebiasaan tim. Setelah itu baru pilih endpoint mana
 yang isinya perlu disimpan.

### Nanti

5. **Halaman pengelola katalog** — sekitar 3 jam
 Hanya kalau langkah 4 menunjukkan penandaan endpoint sering dilakukan. Kalau
 hanya sesekali, cukup ubah baris di basis data.
6. **Normalisasi + akses AI** — belum bisa diperkirakan
 Dikerjakan paling akhir, setelah jelas metrik mana yang benar-benar dipakai
 untuk mengambil keputusan.

## 9. Yang Sengaja Tidak Dikerjakan

| Tidak dikerjakan                   | Ditambahkan saat                                                            |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Tabel metrik ternormalisasi        | Ada grafik atau prompt AI yang membutuhkan metrik tertentu                  |
| Dashboard visualisasi              | Data sudah terkumpul dan bentuknya sudah jelas                              |
| Penjadwal otomatis pembuka halaman | Terbukti ada lubang riwayat yang mengganggu keputusan                       |
| Penyimpanan halaman pesanan        | Ada kebutuhan konkret; perlu keputusan soal data pribadi pembeli lebih dulu |
| Uji dashboard iklan GMV Max TikTok | Katalog akan menemukannya sendiri saat tim membukanya                       |

## 10. Keputusan yang Perlu Diambil

1. **Halaman pesanan.** Kalau tim membuka "Pesanan Saya", isinya memuat nama
 pembeli, alamat, dan nomor telepon. Rancangan dua lapis sudah melindungi secara
 bawaan — Lapis 1 hanya mencatat bahwa endpoint itu ada, isinya tidak tersimpan
 sampai sengaja dinyalakan. Keputusan menyalakannya perlu diambil sadar, karena
 mengubah kebutuhan masa simpan dan kontrol akses.
2. **Masa simpan payload mentah.** Anggapan awal: simpan terus dulu, ukurannya
 kecil (endpoint yang berharga berkisar 0,5 sampai 40 KB per capture). Ditinjau
 ulang setelah tiga bulan.

## 11. Berkas Uji

Hasil pengujian tersimpan sementara di:

- `/tmp/shopee-cap/captured.json` — 302 response Shopee
- `/tmp/shopee-cap/page.png` — tangkapan layar dashboard Shopee
- `/tmp/tiktok-cap/captured.json` — 341 response TikTok
- `/tmp/tiktok-cap/page.png` — tangkapan layar dashboard TikTok

Skrip pengujian: `/tmp/tiktok-cap/run.ts` (menerima `PROFILE`, `URL`, `WAIT`, `OUT`).
Berkas di `/tmp` akan hilang saat komputer dimulai ulang. Salin dulu kalau masih
dibutuhkan.

## 12. Status Pengerjaan

### Sudah ditulis

**Backend (`v-auto-backend`)**

| Berkas | Isi |
|---|---|
| `drizzle/0044_add_capture_tables.sql` | Migrasi dua tabel. **Belum dijalankan.** |
| `src/db/schema.ts` | `captureEndpoints`, `capturePayloads`, relasinya |
| `src/utils/capture.ts` | Fungsi murni: penentuan platform, pembersihan URL, daftar tolak parameter, penjaga penyimpanan isi |
| `src/routes/capture.ts` | Empat route |
| `src/index.ts` | Pemasangan `/api/capture` |
| `tests/capture/capture-normalize.test.ts` | 16 pengujian, semuanya lulus |

**Extension (`v-box/vbox-extensions/vbox-controller`)**

| Berkas | Isi |
|---|---|
| `contents/capture-hook.ts` | Dunia MAIN, menambal `fetch` dan `XMLHttpRequest` |
| `contents/capture-relay.ts` | Dunia ISOLATED, jembatan ke background, membaca `shop_id` Shopee |
| `background.ts` | Antrean di `chrome.storage` + pengiriman berkelompok tiap menit |

### Tiga hal yang berbeda dari rancangan awal

**1. Empat route, bukan tiga.** Katalog dan penyimpanan isi digabung ke satu
`POST /api/capture`, karena keduanya berasal dari response yang sama — memisahkannya
berarti extension mengirim dua kali untuk data yang sama. Sebagai gantinya
ditambahkan dua route pengelola:

```
POST  /api/capture              ← extension, batch hasil sadapan
GET   /api/capture/rules        ← extension, host + endpoint yang isinya disimpan
GET   /api/capture/endpoints    ← katalog, urut dari yang paling sering muncul
PATCH /api/capture/endpoints/:id ← menyalakan penyimpanan isi
```

Tanpa dua route terakhir, hasil langkah 4 hanya bisa dilihat dengan membuka basis
data production secara manual.

**2. Daftar host ditetapkan di extension, bukan dari server.** `matches` sebuah
content script bersifat statis di manifest. Membuatnya dinamis berarti menambal
`fetch` di **semua** situs yang dibuka staff, termasuk yang tidak ada
hubungannya dengan pekerjaan. Itu terlalu jauh untuk keuntungan yang kecil:
daftar host praktis tidak pernah berubah, sedangkan daftar endpoint — yang memang
sering berubah — tetap diatur dari server. Menambah marketplace baru sekarang
berarti sekali build dan tunggu 30 menit auto-update.

**3. Izin `scripting` ikut bertambah.** Plasmo tidak menaruh script dunia MAIN di
`content_scripts` manifest; ia mendaftarkannya saat jalan lewat
`chrome.scripting.registerContentScripts` dari background, dan karena itu
menambahkan izin `scripting` secara otomatis. Perlu diperhatikan saat rilis:
penambahan izin ikut tersebar lewat auto-update yang berjalan tanpa konfirmasi.

### Yang belum dikerjakan

1. **Menjalankan migrasi.** `.env` menunjuk basis data production
   (`51.79.222.48`), jadi `drizzle/0044_add_capture_tables.sql` sengaja tidak
   dijalankan sendiri. Kedua tabelnya baru, tidak menyentuh data yang ada.
2. **Menyebarkan extension.** `bun extension:build` lalu
   `scripts/deploy-extension.js` di repo `v-box`. Versi masih 1.0.16 — perlu
   dinaikkan supaya VBOX menganggapnya pembaruan.
3. **Mengisi `customer_id` untuk 11 profil** (bagian 4.6).
4. **Uji ujung ke ujung.** Belum pernah dijalankan terhadap basis data sungguhan,
   karena bergantung pada nomor 1.
