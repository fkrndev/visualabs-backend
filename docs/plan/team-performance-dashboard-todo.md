# TODO: Implementasi Dashboard Kinerja Tim

Checklist eksekusi untuk dashboard kinerja tim berbasis histori Chrome.
Referensi: [team-performance-dashboard.md](./team-performance-dashboard.md) · [team-performance-dashboard-wireframe.md](./team-performance-dashboard-wireframe.md)

Legenda: `[ ]` belum · `[x]` selesai · `[~]` in-progress · `[!]` blocked

---

## Fase 0 — Schema `chrome_visit_events` (½ hari) ✅

### Backend (v-auto-backend)
- [x] Tambah definisi `chromeVisitEvents` di `src/db/schema.ts`
- [x] Tulis migration manual: `drizzle/0023_add_chrome_visit_events.sql`
- [x] Apply ke DB lokal via `scripts/apply-migration.ts`
- [x] Smoke test: backfill berhasil insert 1836 rows

### Backfill data lama
- [x] Buat script `scripts/backfill-visit-events.ts` (batch 1000)
- [x] Jalankan: 1836 events terbentuk dari 1836 history rows
- [x] Marker `data_json.backfilled: true` ditambahkan untuk identifikasi

---

## Fase 1 — Ingest Endpoint + Chrome Extension (½ hari) ✅

### Backend
- [x] Integrasikan ke endpoint existing `POST /chrome-histories/track`
  - Schema payload diperluas dengan `durationMs?`
  - Setiap kunjungan (baik increment maupun create) sekarang insert ke `chrome_visit_events`
  - Tidak buat route terpisah agar tidak memecah API surface untuk extension
- [x] Typecheck clean

### Chrome Extension (chrome-extensions repo) — opsional follow-up
- [ ] (Opsional) track `durationMs` saat tab `onBlur` / `onRemoved` dan kirim di payload track
- [ ] Test end-to-end: buka URL → cek row baru di `chrome_visit_events`

---

## Fase 2 — Backend Overview Endpoints (1 hari) ✅

### Routes baru di `src/routes/teamInsights.ts`
- [x] Setup file + register di `src/index.ts` di path `/api/team-insights`
- [x] Role guard **admin only** via inline middleware `adminOnly` (ROLE_ADMIN=1)
- [x] `GET /api/team-insights/overview?from&to&customerId` → totalVisits, activeMembers, hoursActive, customersTouched, trend harian
- [x] `GET /api/team-insights/top-customers?from&to&limit`
- [x] `GET /api/team-insights/top-domains?from&to&limit` (domain extraction via SUBSTRING_INDEX)
- [x] Typecheck clean

### Quality
- [ ] (Belum) Unit test query agregat
- [ ] (Belum) Verifikasi performa EXPLAIN — bisa dilakukan setelah produksi punya volume

---

## Fase 3 — Backend Members Endpoints (1 hari) ✅

- [x] `GET /api/team-insights/members?from&to&customerId` — LEFT JOIN users sehingga user 0-visit tetap muncul
- [x] `GET /api/team-insights/members/:userId?from&to` — daily, hoursPerDay, topCustomers, topDomains, recentUrls, collaboration
- [x] `GET /api/team-insights/peak-activity?from&to` — matriks DAYOFWEEK × HOUR
- [x] Hours-active digabung ke `/overview` dan `/members` (tidak perlu endpoint terpisah)
- [ ] (Belum) Unit test endpoint

---

## Fase 4 — Frontend Tim Tab (1 hari) ✅

### Setup (v-auto-frontend)
- [x] Route baru: `src/routes/team-insights/admin/+page.svelte` (ikuti convention admin per-entity)
- [x] API client: `src/lib/api/team-insights.ts` membungkus 6 endpoint
- [x] Role guard sisi server (admin only) — sisi client cukup redirect default
- [x] Sidebar entry "Team Insights" ditambahkan di `app-sidebar.svelte`

### Komponen
- [x] Filter bar (RangeCalendar + customer combobox + Refresh)
- [x] 5 KPI cards via `Card` shadcn
- [x] Activity trend reuse `LineChart` dari `marketing/line-chart.svelte`
- [x] `PeakHeatmap.svelte` (7×24 grid) di `$lib/components/team-insights/`
- [x] `BarList.svelte` reusable (Top Customers + Top Domains)
- [x] `Sparkline.svelte` untuk drawer detail

### States
- [x] Skeleton loading saat fetch
- [x] Empty state ketika totalVisits=0
- [x] Error toast via svelte-sonner

---

## Fase 5 — Frontend Anggota Tab (1 hari) ✅

- [x] Members table dengan kolom: Anggota, Visits, Active Days, Hours Active, Customers Touched, Last Active
- [x] Status dot (hijau ≤24h, kuning ≤7d, abu no-data) via util `statusColor`
- [x] Search + sortable kolom
- [x] `MemberDetailSheet.svelte` (sheet/drawer kanan)
  - 3 KPI cards
  - Daily activity sparkline + Hours per day sparkline
  - Top Customers + Top Domains
  - Collaboration list
  - Recent URLs (10 latest)
- [x] Row click → buka sheet untuk userId terpilih
- [x] Loading & error states drawer

---

## Fase 6 — Polish, Permission, Test (½ hari) ✅ (mostly)

### Permission & Privacy
- [x] Role guard backend `adminOnly` di `teamInsights.ts` (ROLE_ADMIN=1)
- [x] Tidak ada URL mentah di tab Tim — verified via grep, hanya `member-detail-sheet.svelte` yang menampilkan `r.url`
- [x] Backend typecheck clean
- [x] Frontend API client typecheck clean (skip pre-existing SvelteKit alias errors)

### Responsif
- [x] Layout Tailwind responsif via grid utilities (md/lg breakpoints sudah dipakai agent)

### UX detail
- [x] Disclaimer "Bukan time tracker" sebagai footer tab Tim (dimasukkan agent)
- [ ] (Opsional) Badge "perkiraan" pada data backfill — bisa ditambah nanti jika diperlukan

### Smoke test end-to-end
- [ ] **Manual** — perlu dev server jalan (tidak diizinkan auto-mode). Saran user:
  - Login admin → buka `/team-insights/admin`
  - Test filter date range & customer
  - Klik row anggota → buka sheet detail
  - Test non-admin → harus kena 403

---

## Deployment

- [ ] Migration 0023 dijalankan di server prod via `bun scripts/apply-migration.ts drizzle/0023_add_chrome_visit_events.sql`
- [ ] Backfill script dijalankan di prod (off-hours): `bun scripts/backfill-visit-events.ts`
- [ ] Restart systemd service v-auto-backend setelah deploy
- [ ] (Opsional) Update Chrome extension untuk kirim `durationMs`
- [ ] Setelah commit: `npx gitnexus analyze --embeddings` untuk refresh index

---

## Deployment

- [ ] Migration 0023 dijalankan di server prod via `bunx drizzle-kit migrate`
- [ ] Backfill script dijalankan di prod (off-hours, monitor load)
- [ ] Update Chrome extension di store / deploy versi baru ke tim
- [ ] Update CHANGELOG / release note internal
- [ ] Setelah commit: `npx gitnexus analyze --embeddings` untuk refresh index

---

## Risiko terbuka (re-check sebelum start)

- [ ] Konfirmasi chart lib yang dipakai di frontend (cek `package.json`)
- [ ] Konfirmasi auth pattern extension → backend (token / session)
- [ ] Estimasi volume `chrome_visit_events` per hari (kalau >1M/hari, perlu plan agregasi terjadwal)
