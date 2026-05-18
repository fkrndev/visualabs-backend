# Plan — Halaman Home untuk Advertiser

**Tipe pengguna:** Advertiser (user yang menjaga ads untuk banyak client/customer)
**Relasi:** `subscriptions.advertiserId → users.id` (lihat `src/db/schema.ts` L541–548)
**Frontend target:** `v-auto-frontend/src/routes/+page.svelte` (root) atau route baru `v-auto-frontend/src/routes/home/advertiser/+page.svelte`
**Backend target:** `v-auto-backend/src/routes/advertiserHome.ts` (file baru)

---

## 1. Konteks & Tujuan

### Konteks
Saat ini setelah login, semua user diarahkan ke route default (root `+page.svelte`) yang tidak punya konten khusus per peran. Advertiser butuh **landing page yang langsung relevan dengan pekerjaan mereka**: melihat status semua client yang dijaga, ads yang perlu perhatian, todo/ticket yang belum kelar, dan jadwal meeting terdekat — tanpa harus klik-klik ke banyak menu.

### Tujuan
1. Memberi **gambaran cepat (snapshot)** semua client yang advertiser pegang.
2. Menyorot **client yang butuh perhatian** (ads stop, ticket pending, scorecard turun, meeting menjelang).
3. Jadi **hub navigasi**: dari sini advertiser klik ke detail (ads, scorecard, ticket, meeting) untuk client tertentu.

### Definisi "client yang dijaga advertiser"
```ts
const advertiserSubs = await db.select({
    id: subscriptions.id,
    customerId: subscriptions.customerId,
    brand: subscriptions.brand,
    platform: subscriptions.platform,
    status: subscriptions.status,
    dueDate: subscriptions.dueDate,
  })
  .from(subscriptions)
  .where(eq(subscriptions.advertiserId, currentUserId));
```
Daftar `customerId` di atas adalah **scope semua data** halaman home ini.

---

## 2. Penempatan & Routing

**Opsi A (rekomendasi):** route baru `/home/advertiser`
- Pro: terisolasi, gampang tambah role-based home page (admin, manager, dll.) di masa depan.
- Layout `+layout.server.ts` di root dapat redirect: jika `user.role === ROLE_ADVERTISER` dan path `=== '/'` → redirect ke `/home/advertiser`.

**Opsi B:** root `+page.svelte` jadi switcher berdasarkan role.
- Pro: tidak ada redirect.
- Kontra: 1 file berisi banyak cabang UI, lebih sulit maintain.

→ **Pilih Opsi A.** Implementasi:
- File baru: `v-auto-frontend/src/routes/home/advertiser/+page.svelte`
- File baru: `v-auto-frontend/src/routes/home/advertiser/+page.server.ts` (load data SSR)
- Update `v-auto-frontend/src/routes/+layout.server.ts` → setelah `locals.user` tersedia, jika user adalah advertiser dan request path `/`, redirect ke `/home/advertiser`.

**Catatan role:** saat ini di `permissions.ts` hanya ada `ROLE_ADMIN/MANAGER/STAFF/VIEWER`. Belum ada `ROLE_ADVERTISER` eksplisit. Dua pilihan:
1. Tambah konstanta `ROLE_ADVERTISER = 5` di `src/utils/auth/permissions.ts` dan migrasi user yang relevan.
2. Treat "advertiser" sebagai sifat (user yang punya minimal 1 row di `subscriptions.advertiserId`), bukan role.

→ **Rekomendasi:** pilih (2). Cek di server load: `SELECT 1 FROM subscriptions WHERE advertiser_id = ? LIMIT 1`. Kalau ada → user ini "advertiser-mode". Ini lebih fleksibel (admin pun bisa jadi advertiser sekaligus).

---

## 3. Wireframe

```
┌──────────────────────────────────────────────────────────────────────┐
│  Selamat datang, {nama advertiser}                       [🔔 N]      │
│  Anda menjaga {C} client · {S} subscription aktif                    │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─── Stat cards (4 kolom) ──────────────────────────────────────┐   │
│  │ Client    │ Ads aktif │ Ticket   │ Todo due   │ Meeting       │   │
│  │ Aktif: 12 │ 34 / 40   │ Open: 5  │ hari ini:2 │ minggu ini: 3 │   │
│  └─────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│  ⚠️  Butuh Perhatian                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ ● Brand X (Client A) — 2 ads PAUSED, scorecard turun 18%        │ │
│  │ ● Brand Y (Client B) — 1 ticket PENDING_CLIENT > 48 jam         │ │
│  │ ● Brand Z (Client C) — subscription due dalam 5 hari            │ │
│  └─────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│  Tabs:  [Client]  [Ads]  [Aktivitas]  [Jadwal]                       │
├──────────────────────────────────────────────────────────────────────┤
│  (Konten per tab — lihat Section 4)                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Konten per Section

### 4.1 Header — Greeting & Counter Global
- Nama + role badge.
- Counter: "Anda menjaga **{C}** client · **{S}** subscription aktif".
- Tombol "Refresh" + dropdown filter rentang waktu (default: 30 hari terakhir).

### 4.2 Stat Cards (4–5 kartu)
| Card             | Sumber                                                | Klik ke                            |
|------------------|-------------------------------------------------------|------------------------------------|
| Client Aktif     | `COUNT(DISTINCT customerId)` dari subs aktif          | tab Client                         |
| Ads On/Off       | dari `meta_ads_*` join subs (lihat adsMonitoring)     | `/monitoring-ads`                  |
| Ticket Open      | `ticket_issues` WHERE status≠done & sub di scope      | `/ticket-issues/admin?adv={uid}`   |
| Todo Due ≤ 24h   | `todos` WHERE dueDate ≤ now+1d & sub di scope         | `/todos/admin?adv={uid}`           |
| Meeting Minggu Ini | `meetings` WHERE startTime BETWEEN ... & sub di scope | `/meetings/admin?adv={uid}`        |

Tampilkan delta vs periode sebelumnya (mis. "+2 dari minggu lalu").

### 4.3 Banner "Butuh Perhatian"
List 5–10 item terurut berdasarkan severity. Aturan komputasi:
- **Ads bermasalah**: `meta_ads_*` dengan `status='PAUSED'` atau spend 7d turun > 30% vs 7d sebelumnya.
- **Ticket lama**: status `PENDING_CLIENT/PENDING_INTERNAL` > 48 jam dan belum closed.
- **Scorecard turun**: `scorecard_data` periode terbaru vs sebelumnya, delta negatif > 15%.
- **Subscription due**: `dueDate ≤ now + 7d`.
- **Onboarding stuck**: `onboardingStatus ≠ done` dan `onboardingUpdatedAt > 7 hari lalu`.

Format card: `[icon severity] [brand] ({customer.name}) — [pesan singkat]  [→]`

### 4.4 Tab "Client"
Tabel client yang advertiser pegang, kolom:
- Customer name (link ke `/customers/admin/[id]`)
- Brand / Platform
- Subs status (badge)
- Due date subs (relative time)
- Last activity (max dari ticket/meeting/scorecard updatedAt)
- # Ads aktif
- # Ticket open
- Action: `[Detail]`

Sortable per kolom, default sort: `last_activity DESC`.

### 4.5 Tab "Ads"
Ringkasan ads per subscription/customer (reuse `/monitoring-ads` data):
- Group by customer
- Per customer: total ads, active/paused/archived, spend 7d, spend 30d, CPL/CPM ringkas.
- Tabel ekspandable: klik baris → expand list ads detail.
- CTA: "Buka Monitoring Ads" → `/monitoring-ads?advertiserUserId={uid}`.

### 4.6 Tab "Aktivitas"
2 panel berdampingan:
- **Ticket aktif** (status ≠ done, di scope): list 10 terakhir update.
- **Todo upcoming** (dueDate ≤ now + 7d, di scope): list 10 paling dekat.

CTA: "Lihat semua" → halaman masing-masing dengan filter sudah diterapkan.

### 4.7 Tab "Jadwal"
- **Mini calendar** mingguan dengan dot per meeting.
- Daftar meeting 14 hari ke depan: judul, customer, waktu, link.
- CTA: "Buat meeting" → modal create (reuse component dari `/meetings/admin`).

---

## 5. Backend — Endpoints Baru

File: `src/routes/advertiserHome.ts`. Pasang di router utama (`src/index.ts` / app router file) dengan prefix `/advertiser-home`.

Semua endpoint wajib lewat `requireAuth` dan resolve `userId` dari session. Tidak ada query param `advertiserUserId` — selalu pakai user yang sedang login (kecuali admin override → tambahkan opsional `?asUser=...` dengan permission check).

### 5.1 `GET /advertiser-home/summary`
Return:
```ts
{
  user: { id, name, role },
  scope: { customerCount: number, subscriptionCount: number, activeSubscriptionCount: number },
  cards: {
    clientsActive: { value: number, deltaPct: number },
    adsStatus:     { active: number, paused: number, total: number },
    ticketsOpen:   { value: number, deltaPct: number },
    todosDue24h:   number,
    meetingsThisWeek: number,
  },
}
```
Query param: `?range=7d|30d|90d` untuk delta.

### 5.2 `GET /advertiser-home/attention`
Return:
```ts
{
  items: Array<{
    id: string;                   // composite: "ads:123" / "ticket:45" / "subs:7"
    severity: 'low' | 'med' | 'high';
    kind: 'ads_paused' | 'spend_drop' | 'ticket_stale' | 'scorecard_drop' | 'subs_due' | 'onboarding_stuck';
    brand: string | null;
    customerId: number;
    customerName: string;
    message: string;
    href: string;                 // tujuan klik
    sortKey: number;              // untuk ordering server-side
  }>;
}
```
Limit default 10. Algoritma severity di body Section 4.3.

### 5.3 `GET /advertiser-home/clients`
Tabel tab Client. Param: `?sort=last_activity|due_date|name&dir=asc|desc&page=1&pageSize=20&q=...`.
Response: `{ data: Client[], total: number }`.

### 5.4 `GET /advertiser-home/ads-overview`
Ringkasan ads per customer. Reuse helper `scopeFbActWhere` dari `adsMonitoring.ts` (panggil dengan scope advertiser yang sudah ada — jangan duplikasi resolver).

### 5.5 `GET /advertiser-home/activity`
```ts
{
  tickets: TicketIssue[],     // limit 10, order by updatedAt desc
  todos:   Todo[],            // limit 10, order by dueDate asc (yang due dalam 7 hari)
}
```

### 5.6 `GET /advertiser-home/schedule`
```ts
{
  upcoming: Meeting[],        // 14 hari ke depan, scope advertiser
}
```

### Catatan implementasi backend
- **Reuse existing scope resolver**: `adsMonitoring.ts` punya pola `resolveScope(userId)` yang produce `{ kind:'advertiser', customerIds, fbActIds }`. Ekstrak ke helper di `src/utils/scope/advertiserScope.ts` lalu pakai bersama untuk endpoint baru.
- **Index check**: `subscriptions_advertiser_idx` sudah ada (L566). `ticket_issues_subscription_idx`, `meetings_subscription_idx`, `todos_subscription_idx` juga ada. Aman.
- **N+1 risk**: untuk tab Client, hitung agregat (jumlah ads, ticket open, last activity) dengan 1 query GROUP BY per metrik, lalu merge di JS. Hindari per-row subquery.
- **Caching**: response summary + attention bisa di-cache 60 detik per userId (in-memory LRU) — opsional, baru pasang kalau ada bukti latency.

---

## 6. Frontend — Struktur File

```
src/routes/home/advertiser/
├── +page.server.ts            ← load summary + attention (paralel)
├── +page.svelte               ← shell + tabs
├── components/
│   ├── stat-cards.svelte
│   ├── attention-banner.svelte
│   ├── clients-table.svelte
│   ├── ads-overview.svelte
│   ├── activity-panel.svelte
│   └── schedule-panel.svelte
└── helper-and-state.svelte.ts ← API client + reactive state
```

### Pola data
- `+page.server.ts` SSR fetch `summary` + `attention` saja (above-the-fold) → render cepat.
- Tabs lazy-load sisanya saat tab aktif diklik (pakai pola sama seperti team-insights admin: `if (tab === 'ads' && !adsLoaded) loadAds()`).
- State di `helper-and-state.svelte.ts`: ekspor `$state` per dataset + fungsi `loadX()`.

### Component reuse
- `Tabs` dari shadcn-svelte (sudah dipakai di banyak halaman).
- `Badge`, `Card`, `Table`, `Skeleton` — sudah ada.
- Mini calendar: cek apakah `marketing-dashboard` punya kalender; kalau belum, pakai komponen sederhana berbasis grid 7×N.

---

## 7. Pertimbangan & Edge Cases

| Kasus                                            | Penanganan                                                              |
|--------------------------------------------------|-------------------------------------------------------------------------|
| Advertiser tanpa subscription                    | Halaman tampil empty state: "Belum ada client yang Anda jaga"           |
| User sekaligus admin & advertiser                | Beri toggle "Lihat sebagai Advertiser / Admin" di header                |
| Subscription pindah ke advertiser lain           | Data realtime — refresh button + auto-refresh tiap 5 menit pada tab     |
| Customer di-soft-delete                          | Filter `customers.deletedAt IS NULL` di semua query                     |
| Performance: 100+ subscriptions di 1 advertiser  | Pagination di tab Client, agregasi server-side                          |
| Permission                                       | Endpoint hanya pakai `userId` dari session → tidak mungkin akses lintas |

---

## 8. Rencana Eksekusi (Fase)

**Fase 1 — Backend foundation (skeleton + summary)**
1. Buat `src/utils/scope/advertiserScope.ts` (ekstrak resolver dari `adsMonitoring.ts`).
2. Buat `src/routes/advertiserHome.ts` dengan endpoint `/summary` + `/attention` saja.
3. Daftarkan router di app entry.
4. Test pakai curl + auth token user advertiser.

**Fase 2 — Frontend foundation**
1. Buat route `home/advertiser/` dengan `+page.server.ts` + `+page.svelte`.
2. Render header + 5 stat card + attention banner. Tabs masih placeholder.
3. Tambah redirect logic di root `+layout.server.ts` (cek apakah user punya subs.advertiserId).

**Fase 3 — Tab Client + Aktivitas**
1. Endpoint `/clients`, `/activity`.
2. Komponen tabel + dua panel.

**Fase 4 — Tab Ads + Jadwal**
1. Endpoint `/ads-overview`, `/schedule`.
2. Komponen ads summary + mini calendar.

**Fase 5 — Polish**
1. Empty states, loading skeletons, error boundaries.
2. Caching ringan kalau perlu.
3. QA pakai akun advertiser real (idealnya yang punya >5 client).

---

## 9. Open Questions (perlu konfirmasi user)

1. Apakah halaman ini menggantikan home default semua advertiser, atau jadi opsi yang advertiser bisa pin?
2. Threshold severity (drop 15%, ticket > 48 jam, dll.) — apakah angka ini OK atau perlu disesuaikan?
3. Apakah perlu **notifikasi push / email** untuk item "Butuh Perhatian", atau cukup di-display di halaman?
4. Untuk filter rentang waktu di header, perlu per-tab (seperti team-insights) atau global cukup?
5. Apakah advertiser boleh CREATE ticket/todo/meeting langsung dari home (CTA modal), atau hanya navigate ke halaman aslinya?
