# Wireframe: Dashboard Kinerja Tim

Layout ASCII untuk halaman `/admin/team-insights`. Mengikuti pola halaman admin existing (sidebar kiri global, header atas, content area).

Legenda: `[ ... ]` = tombol/control · `< >` = input · `▼` = dropdown · `▓` = bar fill · `·` = sparkline dot · `█` = heatmap cell.

---

## 1. Halaman Utama — Header & Filter Bar

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Admin › Team Insights                                                       │
│  Dashboard Kinerja Tim                                  [ Refresh ↻ ]        │
│  Aktivitas tim dari histori Chrome extension · default 90 hari               │
├──────────────────────────────────────────────────────────────────────────────┤
│  Periode: < 2026-02-12  →  2026-05-13 >   ▼ Customer (all)   ▼ User (all)  │
│  Domain: < search...           >                          [ Apply ] [ Reset ]│
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┬──────────┐                                                     │
│  │  TIM     │ ANGGOTA  │                                                     │
│  └──────────┴──────────┘                                                     │
```

Catatan:
- Tab "TIM" aktif (underline). Tab "ANGGOTA" inaktif.
- Filter sticky saat scroll.
- Banner peringatan muncul di atas tab kalau <50% user punya history: `⚠ Data terbatas: hanya 12 dari 30 user memiliki histori.`

---

## 2. Tab TIM — Overview

```
┌── KPI cards (5 kolom) ──────────────────────────────────────────────────────┐
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│ │ Total   │ │ Active  │ │ Hours   │ │ Customer│ │ Top     │                 │
│ │ Visits  │ │ Members │ │ Active  │ │ Touched │ │ Domain  │                 │
│ │ 48,210  │ │ 18 / 30 │ │ 1,240 h │ │   47    │ │ fb.com  │                 │
│ │ ▲ 8.2%  │ │  ▲ 2    │ │  ▲ 6%   │ │  ▲ 5    │ │ 3,210   │                 │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
│ Hours Active = jam unik berisi event (sum across tim). Sumber: visit events │
└─────────────────────────────────────────────────────────────────────────────┘

┌── Activity Trend (full width) ──────────────────────────────────────────────┐
│ URL baru / hari (90 hari)                              [ daily | weekly ]   │
│                                                                             │
│   200 ┤                                       ·                             │
│   150 ┤              ·       ·    ·   ·  ·         ·                        │
│   100 ┤   ·   ·   ·    · ·     ·                ·    ·    ·                 │
│    50 ┤ ·                                                       ·  ·   ·    │
│     0 └──────────────────────────────────────────────────────────────────   │
│       Feb 12              Mar 14            Apr 13            May 13        │
└─────────────────────────────────────────────────────────────────────────────┘

┌── Peak Activity (kiri 50%) ───────┐ ┌── Onboarding (kanan 50%) ────────────┐
│ Heatmap hari × jam (last 30d)     │ │ User baru (<30 hari)                 │
│ * dari `updatedAt` kunjungan akhir│ │                                      │
│                                   │ │ ┌──────────────┬────────┬─────────┐  │
│       0  4  8  12 16 20           │ │ │ User         │ Day 1  │ Day 30  │  │
│  Mon  ░  ░  █  ██ █  ░            │ │ ├──────────────┼────────┼─────────┤  │
│  Tue  ░  ░  ██ ██ █  ░            │ │ │ Rina         │  ▓▓▓░  │ ▓▓▓▓▓▓  │  │
│  Wed  ░  ░  █  █  █  ░            │ │ │ Andi         │  ▓░░░  │ ▓▓░░░░  │  │
│  Thu  ░  ░  █  ██ █  ░            │ │ │ Budi         │  ░░░░  │ ▓░░░░░  │  │
│  Fri  ░  ░  ██ █  ░  ░            │ │ └──────────────┴────────┴─────────┘  │
│  Sat  ░  ░  ░  ░  ░  ░            │ │                                      │
│  Sun  ░  ░  ░  ░  ░  ░            │ │ Tooltip: kurva aktivitas hari ke-1   │
└───────────────────────────────────┘ └──────────────────────────────────────┘

┌── Top Customers (kiri 50%) ───────┐ ┌── Top Domains (kanan 50%) ──────────┐
│ Workload distribusi (visits)      │ │ Domain teratas                       │
│                                   │ │                                      │
│ PT Maju Jaya   ▓▓▓▓▓▓▓▓▓ 3,210    │ │ facebook.com   ▓▓▓▓▓▓▓▓▓▓ 3,210      │
│ CV Sentosa     ▓▓▓▓▓▓   1,890     │ │ ads.google.com ▓▓▓▓▓▓     1,640      │
│ Toko Berkah    ▓▓▓▓▓    1,420     │ │ tokopedia.com  ▓▓▓▓       1,120      │
│ UD Sumber      ▓▓▓        980     │ │ shopee.co.id   ▓▓▓          870      │
│ PT Cahaya      ▓▓         620     │ │ wa.me          ▓▓           540      │
│           [ Lihat semua → ]       │ │             [ Lihat semua → ]        │
└───────────────────────────────────┘ └──────────────────────────────────────┘
```

---

## 3. Tab ANGGOTA — List + Drawer

```
┌── Toolbar ──────────────────────────────────────────────────────────────────┐
│ Sort: ▼ Total visits   View: ▼ Table   < cari user...      >                │
└─────────────────────────────────────────────────────────────────────────────┘

┌── Members Table ────────────────────────────────────────────────────────────┐
│ Anggota         │ Visits  │ Active │ Hours   │ Cust. │ Top Domain  │ Last    │
│                 │  (90d)  │ Days   │ Active  │ Touch │             │ Active  │
├─────────────────┼─────────┼────────┼─────────┼───────┼─────────────┼─────────┤
│ 🟢 Rina S.      │ 8,420 ▲ │ 72     │ 312 h ▲ │ 12    │ facebook    │ 2j lalu │
│ 🟢 Andi P.      │ 7,180 ▲ │ 68     │ 289 h ▲ │  9    │ tokopedia   │ 10m     │
│ 🟡 Budi H.      │ 3,210 ▼ │ 41     │ 142 h ▼ │  5    │ shopee      │ kemarin │
│ 🟢 Citra W.     │ 6,540 ▲ │ 70     │ 268 h ▲ │ 11    │ ads.google  │ 1j      │
│ ⚪ Dewi L.      │     0   │  0     │   0 h   │  0    │ —           │ never   │
│ ...             │         │        │           │              │             │
│                 │         │        │           │  [ ‹ 1 2 3 › Per page 20 ▼]│
└─────────────────────────────────────────────────────────────────────────────┘

Legend: 🟢 active ≤24h  ·  🟡 active ≤7d  ·  ⚪ no data
Row click → buka drawer kanan ↓
```

### 3a. Member Detail Drawer (slide-in dari kanan)

```
                                        ┌──────────────────────────────────┐
                                        │ Rina Sukmawati             [ × ] │
                                        │ rina@visualabs.id · Sales        │
                                        ├──────────────────────────────────┤
                                        │ ┌────────┬────────┬────────────┐ │
                                        │ │ Visits │ Active │ Hours      │ │
                                        │ │ 8,420  │ 72 d   │  312 h     │ │
                                        │ └────────┴────────┴────────────┘ │
                                        │ Avg 4.3 h/active day · 12 cust.  │
                                        │                                  │
                                        │ Daily activity (90d)             │
                                        │  ▁▂▃▅▂▁▃▅▆▇▆▅▃▂▁▃▅▆▇▆▅▃▂▁▃▅▆▇▆ │
                                        │                                  │
                                        │ Hours per day (90d)              │
                                        │  ▂▂▃▄▂▁▂▄▅▆▅▄▃▂▁▂▄▅▆▅▄▃▂▁▂▄▅▆▅ │
                                        │                                  │
                                        │ ── Top Customers ─────────────── │
                                        │ PT Maju Jaya     ▓▓▓▓▓▓ 780     │
                                        │ CV Sentosa       ▓▓▓▓   520     │
                                        │ Toko Berkah      ▓▓▓    340     │
                                        │                                  │
                                        │ ── Top Domains ───────────────── │
                                        │ facebook.com     ▓▓▓▓▓▓ 920     │
                                        │ ads.google.com   ▓▓▓▓   610     │
                                        │ wa.me            ▓▓     280     │
                                        │                                  │
                                        │ ── Collaboration ──────────────  │
                                        │ Shared customers dgn:            │
                                        │ • Andi P. (4 customer)           │
                                        │ • Citra W. (3 customer)          │
                                        │                                  │
                                        │ ── URL Terbaru (10) ──────────── │
                                        │ • facebook.com/ads/...  2j lalu │
                                        │ • tokopedia.com/...     3j lalu │
                                        │ • ads.google.com/...    5j lalu │
                                        │   [ Lihat semua URL → ]          │
                                        └──────────────────────────────────┘
```

---

## 4. Empty / Loading / Error states

```
┌── Empty (belum ada data) ──────────────────────────┐
│                                                    │
│              [icon]                                │
│        Belum ada histori                           │
│  Chrome extension belum mengirim data untuk        │
│  rentang ini. Coba perluas periode atau cek        │
│  status extension di halaman Chrome Profiles.      │
│                  [ Buka Chrome Profiles → ]        │
└────────────────────────────────────────────────────┘

┌── Loading skeleton ────────────────────────────────┐
│ ░░░░░░░░░░  ░░░░░░░░░░  ░░░░░░░░░░  ░░░░░░░░░░    │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└────────────────────────────────────────────────────┘

┌── Error ───────────────────────────────────────────┐
│ ⚠  Gagal memuat data. [ Coba lagi ]                │
└────────────────────────────────────────────────────┘
```

---

## 5. Responsif

- **Desktop (≥1280px)**: layout 2-kolom seperti di atas.
- **Tablet (768–1279)**: KPI cards 2×2, semua section jadi 1 kolom (stack).
- **Mobile (<768)**: filter bar collapse jadi tombol "Filter (n)" → sheet. Table jadi card list per user.

---

## 6. Catatan UX

- **Tooltip wajib** pada heatmap & onboarding chart (jelaskan sumber data `updatedAt`).
- **Disclaimer kecil** di footer tab Tim: *"Metrik berdasarkan URL unik yang diakses. Bukan time tracker."*
- **Privasi**: di tab Tim, URL mentah tidak ditampilkan — hanya domain & customer. URL detail muncul hanya di drawer per-user.
- **Warna**: ikuti token desain existing (jangan introduce palet baru). Status dot (hijau/kuning/abu) reuse component yang ada.
