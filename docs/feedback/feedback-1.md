# Feedback 18/05/2026 — Restrukturisasi Menu Client

## Ringkasan Feedback

Reviewer merasa **flow menu Client saat ini kurang simpel**. Banyak fungsi yang seharusnya jadi satu kesatuan justru terpisah-pisah di menu yang berbeda. Solusinya: **semua urusan management client digabung jadi satu, dibuka lewat halaman Detail Client**.

Selain itu ada **pertanyaan**: apakah menu **FB Dashboard** dan **Monitoring Iklan** sebenarnya menampilkan informasi yang sama? Kalau iya, kenapa dipisah?

---

## Struktur Menu yang Diminta

```
Menu: Client
│
├── Submenu 1: Overview
│   └── Ringkasan semua client + Monitoring Iklan digabung di sini
│
└── Submenu 2: Management Client
    └── List client → klik salah satu → masuk ke Detail Client
        │
        └── Di dalam Detail Client ada:
            ├── Overview         (ringkasan data client tsb)
            ├── Management Brand
            ├── Management Target / KPI   (mungkin nested di bawah Brand?)
            ├── Management Kebutuhan Iklan (FB Ad Account, dll.)
            └── Marketing Dashboard
```

---

## Yang Harus Dilakukan (Poin per Poin)

### 1. Sederhanakan Menu Client jadi 2 Submenu
- **Overview** — halaman ringkasan global semua client.
- **Management Client** — list client yang bisa di-klik ke detail.

### 2. Pindahkan "Monitoring Iklan" ke Overview Client
- Menu Monitoring Iklan yang sekarang berdiri sendiri **dilebur ke submenu Overview**.
- Pengguna tidak perlu pindah menu lagi untuk lihat status iklan secara global.

### 3. Jadikan "Detail Client" sebagai pusat semua pengelolaan
Semua fitur per-client dikumpulkan di sini, dalam bentuk tab/section:
- **Overview** — ringkasan data client tersebut.
- **Management Brand** — kelola brand-brand milik client.
- **Management Target / KPI** — kelola target & KPI.
  - ⚠️ **Pertanyaan terbuka:** apakah KPI sebaiknya nested di bawah Brand (karena tiap brand punya KPI sendiri), atau berdiri sejajar? **Perlu klarifikasi.**
- **Management Kebutuhan Iklan** — pengelolaan FB Ad Account, akun-akun ads, dsb.
- **Marketing Dashboard** — dashboard performa marketing client tsb.

### 4. Klarifikasi: FB Dashboard vs Monitoring Iklan
- Reviewer merasa **dua menu ini menampilkan informasi yang mirip / sama**.
- Yang perlu dijawab:
  - Apa beda fungsi keduanya?
  - Kalau memang sama → **gabungkan jadi satu** (selaras dengan poin no. 2).
  - Kalau beda → perjelas pembedanya supaya tidak membingungkan user.

---

## Pertanyaan yang Belum Terjawab (Perlu Diskusi)

1. **Posisi KPI**: nested di dalam Brand, atau sejajar dengan Brand?
2. **FB Dashboard vs Monitoring Iklan**: dipisah atau digabung? Apa beda fungsinya kalau dipisah?
3. **Marketing Dashboard di Detail Client**: apakah ini sama dengan FB Dashboard yang sekarang, atau dashboard baru yang lebih luas (multi-platform)?

---

## Dampak ke Implementasi (gambaran kasar)

- **Navigasi / Sidebar**: kurangi item top-level, restrukturisasi jadi pola "Client → submenu → detail tab".
- **Routing**: kemungkinan butuh route baru seperti `/client/[id]/overview`, `/client/[id]/brand`, `/client/[id]/kpi`, `/client/[id]/ad-needs`, `/client/[id]/dashboard`.
- **Halaman lama** (Monitoring Iklan standalone, FB Dashboard standalone) — perlu diputuskan: di-redirect, dihapus, atau dijadikan view internal di dalam tab baru.
- **Tidak ada perubahan data/skema** yang terlihat dari feedback ini — murni restrukturisasi navigasi & halaman.


Notulensi 18/05/2026:
Peserta: Giri, Saiful, Naufal

Hasil:
Ekspektiasi user flow dari Mas Naufal:
1. Buka VIMS
2. Masuk Dashboard All Client (lihat kondisi semua client yang dia handle hari ini)
3. Masuk List Client (lihat Ada penanda untuk saldo dan kpi yang perlu penanganan)
4. Masuk ke Deatil Client
		-Lihat overview kondisi hari ini
		-Lihat ada alert apa saja (saldo dan kpi tidak tercapai)
		-Lihat Suggestion untuk next step penanganan client
7. Masuk ke Fitur Alert All Client (semua alert dari client yang dihandle ada disini. ketika client di klik redirect ke detail client)
6. Data client diinputkan dan diassign oleh team marketing

Ekspektiasi Fitur dari Mas Naufal:
1. Reminder Saldo
2. Reminder KPI
3. Alert
4. Suggestion