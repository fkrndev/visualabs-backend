# Wireframe — Team Insights Admin: Access Analytics

**Halaman:** `/team-insights/admin`
**File frontend:** `v-auto-frontend/src/routes/team-insights/admin/+page.svelte`
**Sumber data:** `chrome_histories` + `chrome_visit_events` (schema.ts L232–280)

## Tujuan

Menambahkan **3 list + graph** pada halaman Team Insights Admin untuk menampilkan jumlah akses per entitas dengan granularitas waktu (jam / hari / minggu):

1. **User access** — siapa yang paling aktif
2. **Customer access** — customer mana yang paling sering diakses tim
3. **Profile access** — chrome profile mana yang paling sering dipakai

---

## Penempatan dalam Layout

Halaman saat ini memakai `Tabs.Root` dengan 2 tab: **Tim** dan **Anggota**.
→ Tambahkan **1 tab baru**: **"Akses"** (atau bisa juga dipecah jadi sub-section di tab Tim).

Rekomendasi: **tab baru bernama `Akses`** supaya tidak bikin tab Tim makin panjang.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header: Customer filter | Date range | Reset | Terapkan              │
├──────────────────────────────────────────────────────────────────────┤
│ [Tim]  [Anggota]  [Akses ← NEW]                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Wireframe Tab "Akses"

### Bar Granularitas (shared untuk semua section di tab ini)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Granularitas:  ( ) Jam   (•) Hari   ( ) Minggu     [Top N: 10 ▼]    │
└──────────────────────────────────────────────────────────────────────┘
```

- Granularitas mempengaruhi sumbu X chart trend (bucket waktu).
- Top N membatasi jumlah baris di list (5 / 10 / 20 / 50).

---

### Section 1 — Akses per User

```
┌─ Akses per User (Granularitas: Jam) ──────────────────────────────┐
│ Siapa yang paling aktif menggunakan extension                      │
│                                                                    │
│  ● Budi   ● Sari   ● Andi   ● Dewi   ● Rini    [legend toggle]    │
│                                                                    │
│  jumlah ▲                                                          │
│     15  │           ╱╲                                             │
│         │      ╱╲  ╱  ╲      ╱╲                                    │
│      5  │  ╱╲ ╱  ╲╱    ╲ ╱╲ ╱  ╲                                   │
│      1  │_╱  ╳    ╲     ╳   ╳   ╲___                               │
│         └────────────────────────────►                             │
│          08  09  10  11  12  13  14    jam                         │
│                                                                    │
│  ┌─ Ranking ────────────────────────────────────────────────────┐ │
│  │ # │ User      │ Total │ Peak Hour │ Last Active   │   %      │ │
│  │ 1 │ Budi      │   87  │   10:00   │ 5 mnt lalu    │ ████████ │ │
│  │ 2 │ Sari      │   62  │   09:00   │ 15 mnt lalu   │ ██████   │ │
│  │ 3 │ Andi      │   45  │   11:00   │ 1 jam lalu    │ ████     │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

**Tipe chart:** LineChart multi-series (1 garis per user top N), bukan stacked bar — supaya pola puncak/lembah aktivitas per user kelihatan jelas.

**Behavior chart:**
- Multi-line, warna berbeda tiap series, legend di atas (clickable untuk toggle on/off).
- Data point kosong → Y=0 (garis tetap continuous, bukan terputus).
- Tooltip on hover: `"10:00 — Budi: 15 akses"`.

**Field tabel:** `userId`, `name/email`, `totalAccess`, **`peakBucket`** (sinkron granularitas: `Peak Hour` / `Peak Day` / `Peak Week`), `lastActive`, bar % relatif terhadap top.

**Source query:** `GROUP BY chrome_visit_events.user_id, time_bucket(visited_at, granularity)` lalu agregasi total per user; `peakBucket` = bucket dengan max visits per user.

---

### Section 2 — Akses per Customer

```
┌─ Akses per Customer (Granularitas: Hari) ─────────────────────────┐
│ Customer mana yang paling sering diakses tim                       │
│                                                                    │
│  ● PT ABC  ● PT XYZ  ● PT DEF  ● PT GHI    [legend toggle]        │
│                                                                    │
│  jumlah ▲                                                          │
│     30  │              ╱╲                                          │
│         │         ╱╲  ╱  ╲      ╱╲                                 │
│     10  │    ╱╲  ╱  ╲╱    ╲ ╱╲ ╱  ╲                                │
│      1  │___╱  ╲╱           ╲╱    ╲___                             │
│         └────────────────────────────►                             │
│          Sen Sel Rab Kam Jum Sab Min     hari                      │
│                                                                    │
│  ┌─ Ranking ─────────────────────────────────────────────────────┐│
│  │ # │ Customer  │ Akses │ Unique User │ Peak Day │ Last Active  ││
│  │ 1 │ PT ABC    │  840  │      6      │  Kamis   │ 5 mnt lalu   ││
│  │ 2 │ PT XYZ    │  620  │      4      │  Selasa  │ 1 jam lalu   ││
│  │ 3 │ PT DEF    │  410  │      3      │  Rabu    │ 3 jam lalu   ││
│  └───────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────┘
```

**Tipe chart:** LineChart multi-series — 1 garis per customer top N.

**Field tabel:** `customerId`, `customer.profile.name`, `totalAccess`, `uniqueUsers`, **`peakBucket`**, `lastActive`.

**Source query:** `GROUP BY chrome_visit_events.customer_id, time_bucket(visited_at, granularity)`. Filter `customer_id IS NOT NULL`.

---

### Section 3 — Akses per Profile

```
┌─ Akses per Profile (Granularitas: Minggu) ────────────────────────┐
│ Chrome profile mana yang paling sering dipakai                     │
│                                                                    │
│  ● Profile-AA  ● Profile-BB  ● Profile-CC    [legend toggle]       │
│                                                                    │
│  jumlah ▲                                                          │
│    100  │              ╱╲                                          │
│         │         ╱╲  ╱  ╲                                         │
│     30  │    ╱╲  ╱  ╲╱    ╲                                        │
│      1  │___╱  ╲╱           ╲___                                   │
│         └─────────────────────────►                                │
│          W18  W19  W20  W21  W22    minggu                         │
│                                                                    │
│  ┌─ Ranking ─────────────────────────────────────────────────────┐│
│  │ # │ Profile     │ Owner │ Customer │ Akses │ Peak Week │ Last ││
│  │ 1 │ Profile-AA  │ Budi  │ PT ABC   │  410  │   W20     │ 5m   ││
│  │ 2 │ Profile-BB  │ Sari  │ PT XYZ   │  330  │   W19     │ 12m  ││
│  │ 3 │ Profile-CC  │ Andi  │ PT DEF   │  220  │   W21     │ 1h   ││
│  └───────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────┘
```

**Tipe chart:** LineChart multi-series — 1 garis per profile top N.

**Catatan:** `chrome_visit_events` **tidak punya** kolom `profile_id` langsung — perlu **JOIN ke `chrome_histories` via `history_id`** untuk mendapatkan `profile_id`. Atau pertimbangkan tambah index/kolom denormalized nanti.

**Source query (sketch):**
```sql
SELECT h.profile_id, time_bucket(v.visited_at, :grain) AS bucket, COUNT(*) AS visits
FROM chrome_visit_events v
JOIN chrome_histories h ON h.id = v.history_id
WHERE v.visited_at BETWEEN :from AND :to
GROUP BY h.profile_id, bucket
ORDER BY visits DESC
```

---

## Backend — Endpoint Baru

Tambahkan di `team-insights` route group:

| Endpoint                                    | Output                                       |
| ------------------------------------------- | -------------------------------------------- |
| `GET /api/team-insights/access/users`       | `{ trend: [...], ranking: [...] }`           |
| `GET /api/team-insights/access/customers`   | `{ trend: [...], ranking: [...] }`           |
| `GET /api/team-insights/access/profiles`    | `{ trend: [...], ranking: [...] }`           |

**Query params (shared):**
- `from`, `to` — ISO date (sudah dipakai endpoint lain)
- `customerId?` — filter optional
- `granularity` — `hour` | `day` | `week` (default `day`)
- `limit` — top N (default 10)

**Response shape:**
```ts
{
  trend: Array<{
    bucket: string;        // ISO timestamp at start of bucket
    seriesId: number;      // userId | customerId | profileId
    seriesLabel: string;
    visits: number;
  }>;
  ranking: Array<{
    id: number;
    label: string;
    visits: number;
    uniqueUsers?: number;     // only for customers/profiles
    peakBucket: string | null; // ISO bucket dengan visits terbanyak (sinkron granularity)
    peakBucketVisits: number;
    lastActive: string | null;
  }>;
}
```

**Time bucketing (MySQL):**
- `hour` → `DATE_FORMAT(visited_at, '%Y-%m-%d %H:00:00')`
- `day`  → `DATE(visited_at)`
- `week` → `YEARWEEK(visited_at, 3)` atau `DATE(DATE_SUB(visited_at, INTERVAL WEEKDAY(visited_at) DAY))`

Pakai TZ `Asia/Jakarta` (sudah diset di `src/index.ts` & PM2 — lihat obs 6917/6918).

---

## Frontend — Komponen

Bisa pakai komponen yang sudah ada:
- `LineChart` dari `$lib/components/marketing/line-chart.svelte` (sudah dipakai untuk trend)
- `BarList` dari `$lib/components/team-insights/bar-list.svelte` (untuk ranking sederhana)
- Atau bikin komponen baru `AccessSection.svelte` yang menggabungkan **chart + tabel** + props `kind: 'user' | 'customer' | 'profile'`

**State frontend:**
```ts
let granularity = $state<'hour' | 'day' | 'week'>('day');
let topN = $state(10);
let userAccess = $state<AccessData | null>(null);
let customerAccess = $state<AccessData | null>(null);
let profileAccess = $state<AccessData | null>(null);
```

`loadAll()` dipanggil ulang ketika `granularity` / `topN` berubah (atau hanya saat tab `Akses` aktif untuk hemat request).

---

## Catatan Implementasi

1. **Performance:** untuk granularity `hour` di range 90 hari → bisa sampai 2160 bucket × N series. Pertimbangkan batas range untuk `hour` (mis. maks 14 hari).
2. **Indexing:** sudah ada `chrome_visit_events_visited_at_idx` & `chrome_visit_events_user_visited_idx`. Untuk customer/profile ranking, index existing cukup. Profile butuh JOIN — pastikan `chrome_histories_profile_idx` ada (sudah ada di L253).
3. **Auth:** endpoint harus admin-only (sesuaikan dengan auth guard team-insights existing).
4. **Empty state:** tiap section punya empty state sendiri jika ranking kosong.

---

## Urutan Kerja yang Disarankan

1. Backend: bikin helper time-bucket + 3 endpoint
2. Frontend: tambah tipe API client di `$lib/api/team-insights`
3. Frontend: tambah tab `Akses` + komponen `AccessSection`
4. Test manual di staging dengan data nyata
5. Polish: loading skeleton, error toast, empty state
