# Plan — Halaman Overview Client untuk Advertiser

**Tipe pengguna:** Advertiser (user yang menjaga ads untuk banyak client/customer)
**Sumber drilldown:** dari `/home/advertiser` (tab Client / KPI / Ads) klik salah satu client → buka halaman ini.
**Frontend target:** `v-auto-frontend/src/routes/home/advertiser/client/+page.svelte` (route baru)
**Backend target:** endpoint baru di `v-auto-backend/src/routes/advertiserHome.ts` → `/client/:customerId`
**Tanggal plan:** 2026-05-19

---

## 1. Konteks & Tujuan

### Konteks
Saat ini di halaman home advertiser (`/home/advertiser`), ketika advertiser klik salah satu client di tab Client / Ads / KPI, mereka diarahkan ke `/customers/admin?id=...` — halaman admin generik yang **tidak fokus** pada kebutuhan advertiser (banyak info operasional, billing, dan sisi internal yang tidak relevan).

Advertiser butuh halaman drilldown yang **satu-layar menjawab pertanyaan: "Apa status client X sekarang dan apa yang harus saya kerjakan untuk mereka?"** — tanpa harus loncat ke 5 menu berbeda.

### Tujuan
1. **Snapshot lengkap satu client** dalam 1 scroll: ads, KPI, ticket, todo, meeting, subscription.
2. **Surface item butuh perhatian** spesifik untuk client ini (ads paused, KPI merah, ticket stale, todo overdue).
3. Jadi **hub navigasi sekunder**: link cepat ke detail (ads/edit, scorecard-data, ticket detail, todo detail, meeting detail) **dengan filter customer sudah preset**.
4. Konsisten dengan style `/home/advertiser` (Indonesian, ringkas, card-based, Svelte 5 runes).

### Definisi scope
- Input URL: `?customerId=<id>` (atau `?subscriptionId=<id>` jika lebih akurat).
- Backend validasi: `subscription.advertiserId === currentUserId` (atau `?asUser` override untuk admin).
- Jika customer punya >1 subscription dan advertiser hanya pegang sebagian, halaman scope-nya **hanya subscription yang dia pegang** (tidak bocor ke subscription advertiser lain).

---

## 2. Penempatan & Routing

**Opsi A (rekomendasi):** route baru `/home/advertiser/client?customerId=<id>`
- Konsisten dengan namespace `/home/advertiser/*` (sub-route home).
- Query string `customerId` (bukan path param) untuk fleksibilitas filter tambahan di masa depan (mis. `&subscriptionId=`).

**Opsi B:** `/home/advertiser/client/[customerId]/+page.svelte` (path param SvelteKit).
- Pro: URL bersih.
- Kontra: butuh `+page.ts` load function — saat ini halaman lain di sini CSR-only.

→ **Pilih Opsi A.** File baru:
- `v-auto-frontend/src/routes/home/advertiser/client/+page.svelte`
- Reuse `utils.ts` dari folder advertiser home.
- Update navigasi di `/home/advertiser/+page.svelte`: row klik → `/home/advertiser/client?customerId=${row.customerId}` (bukan `/customers/admin`).

---

## 3. Wireframe

### Header

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Kembali     Toko Sepatu Maju Jaya                          [Aktif]    │
│               PT Maju Jaya Sentosa · brand: SepatuKu                    │
│               Subscription #1245 · due 30 Juni 2026 · 41 hari lagi      │
├─────────────────────────────────────────────────────────────────────────┤
│ [Buka di Admin]  [Lihat Ads]  [Lihat Scorecard]  [Buat Tiket]  [Todo]   │
└─────────────────────────────────────────────────────────────────────────┘
```

- Tombol back → kembali ke `/home/advertiser` (gunakan history.back() dengan fallback).
- Badge status subscription (reuse `subscriptionStatusBadge`).
- Action row = shortcut ke menu lain dengan **filter customer sudah preset** (via query string).

### Stat Cards (4 cards, 2x2 mobile / 4 kolom desktop)

```
┌────────────────────┬────────────────────┬────────────────────┬────────────────────┐
│ Ads Aktif          │ KPI Merah          │ Ticket Open        │ Todo Due 24h       │
│   12 / 15          │   2                │   3                │   1                │
│   3 paused         │   5 hijau, 2 kun.  │   pending: tim     │   prioritas tinggi │
└────────────────────┴────────────────────┴────────────────────┴────────────────────┘
```

### Section "Butuh Perhatian" (client-scoped)

```
┌─ Butuh perhatian untuk client ini ────────────────────────────────────┐
│ ● [HIGH]  Ads "Promo Lebaran" paused 3 hari (Meta)         → buka     │
│ ● [HIGH]  KPI "Conversion Rate" merah, turun -23%          → buka     │
│ ● [MED]   Ticket "Iklan reject Tiktok" pending 52 jam      → buka     │
│ ● [LOW]   Subscription due dalam 5 hari                    → buka     │
└────────────────────────────────────────────────────────────────────────┘
```

- Reuse logic dari `/api/advertiser-home/attention` tapi filter ke 1 customer.
- Empty state: "✓ Semua aman untuk client ini."

### Tabs konten utama

```
┌─[Ads]─[KPI]─[Ticket]─[Todo]─[Jadwal]─[Info]────────────────────────────┐
```

#### Tab Ads

```
┌─ Ads (15 total · 12 aktif · 3 paused) ────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Platform │ Nama Ads        │ Status │ Spend 7d │ Last Active   │   │
│  ├──────────┼─────────────────┼────────┼──────────┼───────────────┤   │
│  │ Meta     │ Promo Lebaran   │ Aktif  │ Rp 1,2 jt│ 2 jam lalu    │   │
│  │ Tiktok   │ Brand Awareness │ Paused │ Rp 0     │ 3 hari lalu ⚠│   │
│  │ Meta     │ Retargeting     │ Aktif  │ Rp 850rb │ 1 jam lalu    │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                            [Buka semua ads di Meta] ▶ │
└────────────────────────────────────────────────────────────────────────┘
```

- Sort default: paused first (yang butuh perhatian di atas), lalu by `spend7d` desc.
- Row klik → ke halaman edit/detail ads (`/ads-data/admin?adsId=...` atau equivalent advertiser route).
- Footer link → buka filtered ads-monitoring page untuk customer ini.

#### Tab KPI

```
┌─ KPI Scorecards ──────────────────────────────────────────────────────┐
│                                                                        │
│  ┌─ Conversion Rate ──────────┐  ┌─ CPL ──────────────────────────┐   │
│  │ Target: ≥ 5% (min)         │  │ Target: ≤ Rp 50.000 (max)      │   │
│  │ Actual: 3.85%      [MERAH] │  │ Actual: Rp 42.000      [HIJAU] │   │
│  │ ▓▓▓▓▓▓▓░░░░░ 77%           │  │ ▓▓▓▓▓▓▓▓▓▓▓▓ 119%              │   │
│  │ Trend: ▼ -23%              │  │ Trend: ▲ +8%                   │   │
│  │ Update: 2 jam lalu         │  │ Update: kemarin                │   │
│  └────────────────────────────┘  └────────────────────────────────┘   │
│                                                                        │
│  ┌─ ROAS ─────────────────────┐  ┌─ Engagement ───────────────────┐   │
│  │ ...                        │  │ ...                            │   │
│  └────────────────────────────┘  └────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

- Card per KPI (responsive grid 1-2-3 kolom seperti tab KPI home advertiser).
- Sort: merah → kuning → hijau → no-data.
- Klik card → ke `/scorecard-data/advertiser?scorecardId=...`.

#### Tab Ticket

```
┌─ Ticket (3 open) ─────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Judul                    │ Status  │ Pending On  │ Update      │   │
│  ├──────────────────────────┼─────────┼─────────────┼─────────────┤   │
│  │ Iklan reject Tiktok      │ Open    │ Tim Ads     │ 52 jam ⚠   │   │
│  │ Update banner Ramadan    │ Reply   │ Customer    │ 4 jam       │   │
│  │ Request KPI baru         │ Open    │ Tim Ops     │ 1 hari      │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                          [+ Buat tiket baru]          │
└────────────────────────────────────────────────────────────────────────┘
```

- Row klik → detail ticket page.
- Button "Buat tiket baru" → `/tickets/new?customerId=...` (atau form modal in-page).
- Sort: pending-on-team first, lalu by `updatedAt` asc (yang paling lama paling atas).

#### Tab Todo

```
┌─ Todo (1 due 24h · 5 open) ───────────────────────────────────────────┐
│  ┌─ Hari ini ─────────────────────────────────────────────────────┐   │
│  │ [HIGH] ☐ Approve creative banner Lebaran    due hari ini       │   │
│  └────────────────────────────────────────────────────────────────┘   │
│  ┌─ Minggu ini ───────────────────────────────────────────────────┐   │
│  │ [MED]  ☐ Review report Q1                  due 22 Mei          │   │
│  │ [LOW]  ☐ Cek invoice                       due 24 Mei          │   │
│  └────────────────────────────────────────────────────────────────┘   │
│  ┌─ Tanpa deadline ───────────────────────────────────────────────┐   │
│  │ [LOW]  ☐ Backup creative ke drive                              │   │
│  └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

- Group by due date bucket (hari ini / minggu ini / nanti / tanpa deadline).
- Klik row → halaman detail todo / inline toggle status.

#### Tab Jadwal

```
┌─ Jadwal Meeting ──────────────────────────────────────────────────────┐
│  ▶ Senin, 24 Mei 14:00 · Review mingguan       [Google Meet]          │
│  ▶ Kamis, 28 Mei 10:00 · Brief campaign Juni   [Onsite — kantor]      │
│  ▶ Selasa, 2 Jun 13:00 · QBR Q2                [Zoom]                 │
└────────────────────────────────────────────────────────────────────────┘
```

- Show 5 upcoming. Empty state: "Belum ada meeting terjadwal."

#### Tab Info (subscription & customer)

```
┌─ Info Subscription ───────────────────────────────────────────────────┐
│  Brand: SepatuKu                                                       │
│  Platform: Meta, Tiktok                                                │
│  Status: Aktif                                                         │
│  Mulai: 1 Jan 2026     Due: 30 Juni 2026  (41 hari lagi)               │
│  Advertiser PIC: Budi (kamu)                                           │
│  Account Manager: Sari                                                 │
├─ Info Customer ───────────────────────────────────────────────────────┤
│  PT Maju Jaya Sentosa                                                  │
│  📞 +62 812-xxxx-xxxx · ✉ ops@majujaya.id                              │
│  📍 Jl. Sudirman 88, Jakarta Pusat                                     │
│  Catatan: customer baru, perlu hands-on 3 bulan pertama.               │
└────────────────────────────────────────────────────────────────────────┘
```

- Read-only di halaman ini. Tombol "Edit di admin" → buka admin page di tab baru.

---

## 4. Backend — Endpoint Baru

### `GET /api/advertiser-home/client/:customerId`

**Query:** `?asUser=<userId>` (admin only).
**Auth:** `requireAuth`.
**Validasi:** customer punya minimal 1 subscription dimana `advertiserId === effectiveUserId`. Kalau tidak → 404 `{error: "Client tidak ditemukan dalam scope kamu"}`.

**Response shape:**
```ts
{
  customer: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
  };
  subscriptions: Array<{
    id: number;
    brand: string | null;
    platform: string | null;
    status: number;
    startDate: string | null;
    dueDate: string | null;
    advertiserName: string | null;
    accountManagerName: string | null;
  }>;
  cards: {
    ads: { total: number; active: number; paused: number };
    kpi: { red: number; yellow: number; green: number; noData: number };
    ticketsOpen: number;
    todosDue24h: number;
    todosOpen: number;
  };
  attention: AttentionItem[]; // reuse type — sudah filtered ke 1 customer
}
```

### Endpoint pelengkap (reuse + filter)

Daripada bikin endpoint baru per tab, **reuse endpoint home advertiser yang sudah ada** dengan tambahan filter `customerId`:

- `GET /api/advertiser-home/ads-overview?customerId=<id>` → tab Ads (rincian per-ads, bukan agregat).
- `GET /api/advertiser-home/scorecards-summary?customerId=<id>` → tab KPI.
- `GET /api/advertiser-home/activity?customerId=<id>` → tab Ticket + Todo.
- `GET /api/advertiser-home/schedule?customerId=<id>` → tab Jadwal.

**Catatan:** kalau endpoint existing belum support filter `customerId`, tambahkan param opsional (default = semua scope). Ini lebih hemat dari bikin 5 endpoint baru dan konsisten dengan pola yang sudah ada.

**Untuk tab Ads detail** (per-ads, bukan agregat per-customer): butuh endpoint baru atau extend `ads-overview` dengan mode `detail`. Decision: bikin endpoint baru `GET /api/advertiser-home/client/:customerId/ads` yang return list raw ads (id, platform, name, status, spend7d, lastActiveAt).

---

## 5. Frontend — Struktur

### File baru
- `v-auto-frontend/src/routes/home/advertiser/client/+page.svelte` — page.
- (opsional) `v-auto-frontend/src/routes/home/advertiser/client/ads-table.svelte` — extract jika +page.svelte mulai panjang.

### Reuse
- `../utils.ts` — semua formatter (`formatRupiah`, `relativeTime`, `formatDateID`, `subscriptionStatusBadge`, `thresholdBadge`, `severityTone`, `severityDot`, `formatKpiValue`, `kpiProgressPct`).
- `$lib/api/advertiser-home.ts` — extend dengan `fetchAdvertiserClientDetail(customerId, params)` dan `fetchAdvertiserClientAds(customerId)`.

### State pattern (sama dengan home page)
```ts
let summary = $state<ClientDetail | null>(null);
let summaryLoading = $state(true);
let tab = $state<'ads' | 'kpi' | 'ticket' | 'todo' | 'jadwal' | 'info'>('ads');
// per-tab lazy load: ads/kpi/activity/schedule sama seperti home advertiser
```

### Data fetching
- On mount: parallel fetch `client/:customerId` (summary + cards + attention) + tab default (`ads`).
- Tab switch: lazy load via `handleTabChange(value)` — pattern persis seperti `/home/advertiser/+page.svelte`.

### Loading & empty states
- Skeleton untuk header, stat cards (4), attention list (3 baris), dan tabel tab.
- Empty state: setiap section punya pesan ID ramah ("Belum ada ticket open." dst).

---

## 6. Edge Cases

1. **Customer punya >1 subscription, advertiser cuma pegang sebagian** → halaman hanya tampilkan subscription yang dia pegang. Tab Info list semua subscription dia + tag "kamu sebagai advertiser" di yang relevan.
2. **Advertiser bukan PIC subscription tersebut** → 404, redirect ke `/home/advertiser` dengan toast "Client tidak dalam scope kamu."
3. **Subscription status Draft / Cancelled** → tetap tampil, badge sesuai, tapi tab Ads & KPI mungkin kosong.
4. **Customer dihapus (`deletedAt` set)** → 404 (sama dengan tidak ada).
5. **Admin akses via `?asUser=<id>`** → resolveAdvertiserScope(c) sama dengan endpoint lain.
6. **Customer dengan banyak ads (>500)** → pagination di tab Ads (page=, pageSize=20).
7. **URL tanpa `customerId`** → redirect ke `/home/advertiser`.

---

## 7. Fase Eksekusi

**Fase 1 — Backend foundation**
1. Tambahkan param `customerId` ke endpoint existing (`attention`, `ads-overview`, `scorecards-summary`, `activity`, `schedule`) dengan default = semua scope. Pastikan tidak breaking.
2. Buat endpoint baru `GET /api/advertiser-home/client/:customerId` (summary + cards + attention).
3. Buat endpoint baru `GET /api/advertiser-home/client/:customerId/ads` (list ads detail).
4. Test: scope leak (advertiser A coba akses customer advertiser B → 404), admin override (`?asUser`), edge case multi-subscription.

**Fase 2 — Frontend page**
1. Tambah type & API function di `$lib/api/advertiser-home.ts`.
2. Buat `+page.svelte` dengan header + 4 stat cards + attention.
3. Implement tab Ads, KPI, Ticket, Todo, Jadwal, Info satu per satu (commit per tab supaya reviewable).
4. Update sidebar — **tidak perlu**, halaman ini diakses via drilldown, bukan menu sidebar.

**Fase 3 — Wiring & polish**
1. Update `/home/advertiser/+page.svelte`: semua tempat yang link ke `/customers/admin?id=` → ganti ke `/home/advertiser/client?customerId=`. Lokasi: tab Client (row click), tab Ads (link "Detail"), attention banner items, KPI cards.
2. Tambah breadcrumb / back button di header.
3. Manual test: navigasi end-to-end, error states, mobile responsive.
4. `pnpm svelte-check` & `bun typecheck` di backend.

---

## 8. Open Questions

1. **Apakah perlu inline edit untuk todo (toggle done) dan ticket (reply) di halaman ini, atau cukup link ke detail?**
   → Rekomendasi: untuk MVP, cukup link. Inline action di fase 2.
2. **Apakah tab Ads butuh chart trend spend 7d / 30d?**
   → Bisa ditambah card kecil di atas tabel. Untuk MVP skip dulu, lihat kebutuhan.
3. **Apakah halaman ini juga relevan untuk role Account Manager?**
   → Kalau ya, generalisasi route ke `/home/client/:customerId` dan resolve PIC via union (advertiser OR account manager). Tapi scope plan ini hanya advertiser.
4. **Subscription multi-platform: tampilkan satu kartu gabungan atau pisah per platform?**
   → Pisah di tab Ads (group by platform), gabung di header (Meta, Tiktok comma-separated).
5. **Apakah perlu activity timeline (gabungan ads change, ticket update, todo close, dll.) di halaman ini?**
   → Useful tapi mahal. Tunda sampai fase 2 setelah lihat feedback advertiser.
