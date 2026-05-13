# Plan: Dashboard Kinerja Tim dari Histori Chrome

Inspirasi: **Gather Insights** (Office + Members tab). Sumber data: tabel `chrome_histories` (+ `chrome_profiles`, `users`, `customers`).

## 1. Tujuan

Memberikan visibilitas kinerja & aktivitas tim berbasis URL yang diakses lewat Chrome extension internal — bukan time tracker, tapi indikator engagement, fokus kerja, dan kolaborasi terhadap customer.

Mengukur:
- Volume & ritme aktivitas browsing kerja per anggota
- Distribusi fokus per customer / domain / kategori URL
- Tren aktivitas tim (harian/mingguan)
- Onboarding anggota baru (kurva aktivitas minggu pertama)
- Peak concurrent activity (kapan tim paling produktif bersamaan)

## 2. Sumber Data

### Tabel utama
- `chrome_histories` — `id, userId, customerId, profileId, url, count, dataJson, createdAt, updatedAt`
- `chrome_profiles` — profil chrome per user (banyak profile per user)
- `users` + `profiles` — identitas anggota tim
- `customers` — relasi customer yang dikerjakan

### Semantik kolom (terkonfirmasi)
- `chrome_histories` = **1 row per URL per user (upsert)**. `count` total kunjungan kumulatif.
- `createdAt` = URL pertama kali dikunjungi user. `updatedAt` = kunjungan terakhir.
- `dataJson` = **title saja**, tidak ada timestamp granular per visit.

### Konsekuensi & rencana penambahan data
Data granular per-visit **belum ada** — perlu dibuat agar dashboard akurat (terutama Hours Active, Peak Activity heatmap, dan daily trend).

**Tambah tabel baru: `chrome_visit_events`** (granular per visit, append-only).

```ts
export const chromeVisitEvents = mysqlTable(
  "chrome_visit_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    historyId: int("history_id")
      .notNull()
      .references(() => chromeHistories.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerId: int("customer_id")
      .references(() => customers.id, { onDelete: "set null" }),
    visitedAt: timestamp("visited_at").notNull(),
    durationMs: int("duration_ms"),       // optional, dari extension (tab active time)
    dataJson: json("data_json").$type<JsonRecord>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chrome_visit_events_user_visited_idx").on(table.userId, table.visitedAt),
    index("chrome_visit_events_history_idx").on(table.historyId),
    index("chrome_visit_events_customer_idx").on(table.customerId),
  ],
);
```

**Migration 0023**: buat tabel di atas.

**Perubahan Chrome extension**:
- Saat user mengunjungi URL: upsert `chrome_histories` (sudah ada) **+** insert `chrome_visit_events` baru dengan `visitedAt = now()`.
- Opsional fase berikutnya: kirim `durationMs` saat tab di-blur/close (waktu fokus per tab).

**Endpoint ingest baru**: `POST /api/chrome/visit-events`
- Payload: `{ profileUuid, url, visitedAt, durationMs?, title? }`
- Server resolve `historyId` (upsert), lalu insert event.

### Konsekuensi metrik
- **Activity trend harian** = `COUNT(*)` di `chrome_visit_events` per `DATE(visitedAt)`.
- **Peak heatmap** = `COUNT(*)` per `DAYOFWEEK(visitedAt) × HOUR(visitedAt)`.
- **Hours Active** = jumlah jam unik berisi ≥1 event per user per hari, di-cap (mis. 10 jam/hari). Kalau `durationMs` terisi: gunakan jumlah `durationMs` (lebih akurat).
- **Onboarding curve**: events per hari ke-N sejak `users.createdAt`.

### Backfill
- Data lama: tidak ada granular timestamp. Backfill 1 event per row `chrome_histories` dengan `visitedAt = updatedAt`, `durationMs = NULL` — ditandai sebagai approximation.
- UI tampilkan badge "data sebelum 2026-05-XX = perkiraan" di tooltip untuk transparansi.

## 3. Bagian Dashboard

### A. Tab "Tim" (overview seperti Office tab Gather)
1. **Activity trend** — line chart total visits per hari (30/90 hari).
2. **Active members** — jumlah user dengan ≥1 history per hari.
3. **Peak concurrent activity** — heatmap hari × jam (butuh timestamp granular; fallback: berdasarkan `updatedAt`).
4. **Onboarding milestones** — untuk user baru (registered <30 hari), tampilkan kurva aktivitas hari ke-1 s/d ke-30.
5. **Top domains/customers** — bar chart customer dengan total visit terbanyak (workload distribution).

### B. Tab "Anggota" (drill-down per user, seperti Members tab Gather)
Daftar user dengan metrik per orang:
1. **Total visits** + delta vs minggu lalu (dari `chrome_visit_events`).
2. **Active days** (hari unik dengan event) dalam periode filter.
3. **Hours active** — jumlah jam unik berisi event per hari, atau sum `durationMs` jika tersedia; di-cap 10 jam/hari.
4. **Top customers** — 3 customer yang paling sering diakses.
5. **Top domains** — domain yang paling sering dibuka (parse dari `url`).
6. **Collaboration proxy** — customer yang juga diakses ≥2 user lain (indikasi kerja bareng).
7. **Last active** — `max(updatedAt)`.

Hover/expand per user → breakdown harian + daftar URL terbaru.

### C. Filter global
- Rentang tanggal (default 30 hari)
- Customer (multi-select)
- User/role (multi-select)
- Domain (search)

## 4. Backend (v-auto-backend)

### Endpoint baru — `src/routes/team-insights.ts`
- `GET /api/team-insights/overview?from&to&customerId` → metrik tab Tim
- `GET /api/team-insights/members?from&to&customerId` → list user + metrik agregat
- `GET /api/team-insights/members/:userId?from&to` → detail per user (daily breakdown, top domains)
- `GET /api/team-insights/peak-activity?from&to` → heatmap hari×jam
- `GET /api/team-insights/top-customers?from&to&limit`
- `GET /api/team-insights/top-domains?from&to&limit`

### Query patterns
- Group-by `userId, DATE(createdAt)` → activity trend & active days.
- Group-by `userId, customerId`, sum `count` → top customers per user.
- Domain extraction: `SUBSTRING_INDEX(SUBSTRING_INDEX(url,'/',3),'/',-1)` di MySQL.
- Onboarding: join `users.createdAt` untuk kurva hari ke-N.

### Auth
- Hanya `admin` / `manager` role (lihat pola `users.ts`). Ikuti pola middleware yang sudah ada.

### Performance
- Index sudah ada: `user_idx`, `customer_idx`, `profile_idx`. Tambahkan composite `(userId, createdAt)` jika query daily grouping lambat.
- Cache hasil overview per (from,to,customerId) 5 menit di memory (pola sederhana, opsional).

## 5. Frontend (v-auto-frontend)

### Route baru
- `/admin/team-insights/+page.svelte` — halaman utama, 2 tab (Tim / Anggota)
- Reuse pola dari halaman admin `users` (form filter, table, chart wrappers)
- Chart: pakai library yang sudah dipakai di repo (cek `package.json`); kalau belum ada, evaluasi `layerchart` / `chart.js`.

### Komponen
- `TeamOverview.svelte` (line + bar + heatmap)
- `MembersTable.svelte` (data-table reuse pola users admin)
- `MemberDetailDrawer.svelte` (drill-down)
- `FilterBar.svelte`

### API client
- `src/lib/api/team-insights.ts` — wrap fetch ke endpoint di atas.

## 6. Fase Eksekusi

**Fase 0 — Schema baru `chrome_visit_events` (½ hari)**
- Tambah tabel + migration 0023.
- Endpoint ingest `POST /api/chrome/visit-events`.
- Backfill script dari `chrome_histories.updatedAt` (1 event per row).

**Fase 1 — Chrome extension instrumentasi (½ hari)**
- Tambah call ke endpoint ingest saat URL diakses.
- (Opsional) kirim `durationMs` saat tab di-blur/close.

**Fase 2 — Backend overview (1 hari)**
- Endpoint `overview` + `top-customers` + `top-domains` (pakai `chrome_visit_events`).
- Unit test query agregat dengan sample data.

**Fase 3 — Backend members (1 hari)**
- Endpoint `members` + `members/:userId` + `peak-activity` + `hours-active`.

**Fase 4 — Frontend Tim tab (1 hari)**
- Halaman, filter, chart trend + bar top customers + heatmap.

**Fase 5 — Frontend Anggota tab (1 hari)**
- Table members + drawer detail + Hours Active card.

**Fase 6 — Polish & permission (½ hari)**
- Role guard, empty states, loading, error.
- Smoke test end-to-end.

## 7. Risiko & Catatan

- **Privasi**: tampilkan URL mentah hanya ke admin; di tab Tim cukup domain/customer aggregate. Pertimbangkan redaksi query string sensitif.
- **Bukan time tracker**: ikuti framing Gather — hindari metrik yang menekan (mis. "jam idle"). Fokus ke distribusi & kolaborasi.
- **Data sparse**: jika extension belum dipakai semua user, kasih banner "data terbatas" + jumlah user yang punya histori.
- **Domain parsing** di MySQL kadang noisy; pertimbangkan kolom `domain` ter-derive di histori (denormalisasi) jika query top-domains jadi bottleneck.

## 8. Open Questions

1. Apakah `chrome_histories.count` di-upsert (1 row per URL) atau insert baru tiap visit? -> 1 row per URL
2. Apakah `dataJson` menyimpan `visitedAt` granular atau title saja? -> title saja
3. Role mana saja yang boleh akses (admin only? manager? customer-scope?)? -> admin only
4. Apakah perlu export CSV/PDF seperti laporan lain di repo? -> tidak perlu
5. Periode default & retensi data (apakah perlu purging history >N hari)? -> default 90 hari, tidak perlu purging
