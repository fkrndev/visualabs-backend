# Plan — Fitur Onboarding untuk Advertiser

**Tipe pengguna:** Advertiser (role 4 — user yang menjaga ads untuk banyak client/customer)
**Tujuan:** Sekali login pertama (atau on-demand kapan saja), advertiser melihat **panduan visual** berisi (a) ringkasan fitur apa saja yang tersedia untuk mereka, dan (b) **checklist step-by-step** yang harus dilakukan supaya akunnya siap dipakai produksi.

**Frontend target utama:**
- `v-auto-frontend/src/routes/home/advertiser/+page.svelte` (entry point onboarding)
- `v-auto-frontend/src/lib/components/onboarding/` (folder baru — komponen tour & checklist)

**Backend target:**
- `v-auto-backend/src/routes/onboarding.ts` (file baru — progress persistence)
- `v-auto-backend/src/db/schema.ts` (tabel baru `user_onboarding_progress`)

---

## 1. Konteks & Tujuan

### Konteks
Setelah login, advertiser langsung mendarat di [/home/advertiser](v-auto-frontend/src/routes/home/advertiser/+page.svelte) yang menampilkan dashboard penuh data — stat cards, banner butuh perhatian, dan 5 tab. Untuk advertiser baru:
1. Tidak tahu **fitur apa saja** yang tersedia di sidebar (ada 15+ menu lintas 6 grup: Dashboard, Performance, Management, Operations, Chrome Tools, Facebook).
2. Tidak tahu **urutan setup** yang benar. Contoh: jika belum ada subscription dengan `advertiserId` = dirinya, hampir semua halaman akan kosong.
3. Tidak tahu **prasyarat teknis** — install Chrome Extension, hubungkan FB Token, daftarkan FB Ad Account, dll.

### Tujuan
1. **Tour awal** (≤ 60 detik) yang highlight area-area kunci di Home Advertiser sehingga user paham peta dashboard-nya.
2. **Checklist setup** persisten yang menampilkan progress per langkah, dengan deep-link ke halaman/aksi yang relevan + status auto-detected dari database.
3. **Re-runnable**: tombol "Mulai ulang tour" di menu profil / settings, supaya advertiser bisa membuka kembali kapan saja.
4. **Tidak mengganggu**: dapat di-dismiss permanen, dan tidak muncul lagi setelah checklist selesai atau di-skip eksplisit.

### Non-tujuan
- Tidak menulis ulang halaman home — onboarding **overlay** di atas halaman existing.
- Tidak menambahkan tutorial per halaman (mis. tour di halaman Monitoring Ads). Fase ini hanya entry-level onboarding.
- Tidak menyediakan onboarding untuk role lain (HRD / Akuntan / CSS / Admin / Owner) — desain harus extensible (lewat `flow_key`), tapi implementasi sekarang **khusus advertiser**. Role lain akan dibuat di fase berikutnya.
- **Tidak** memasukkan step "Lengkapi profil & foto" dan "Install Chrome Extension" — bukan prioritas saat ini, bisa ditambahkan nanti.

---

## 2. Arsitektur Tinggi

```
┌─────────────────────────────────────────────────────────────┐
│ /home/advertiser/+page.svelte                               │
│                                                             │
│   ┌────────────────────────────────────────────────────┐    │
│   │ <OnboardingGate>                                   │    │
│   │   - fetch /onboarding/state                        │    │
│   │   - if user.firstSeen → show <OnboardingTour>      │    │
│   │   - else if progress < 100% → show <ChecklistCard> │    │
│   │   - else hide                                      │    │
│   └────────────────────────────────────────────────────┘    │
│                                                             │
│   (Konten dashboard advertiser existing — tidak diubah)     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ POST /onboarding/progress
┌─────────────────────────────────────────────────────────────┐
│ Backend: src/routes/onboarding.ts                           │
│   - GET  /onboarding/state    (progress + computed steps)   │
│   - POST /onboarding/progress (mark step done / dismissed)  │
│   - POST /onboarding/reset    (re-trigger from settings)    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Table: user_onboarding_progress                             │
│   user_id, flow_key, step_key, completed_at, dismissed_at   │
└─────────────────────────────────────────────────────────────┘
```

Dua "modul" UI:
- **Tour** (sekali jalan): overlay highlight + tooltip pada elemen DOM. Pakai library **`driver.js`** (~5 kB, no deps, dukung dark mode, mudah di-styled Tailwind). Alternatif: Shepherd.js (lebih berat) atau roll-our-own (lebih banyak kerja, skip).
- **Checklist Card** (persisten sampai 100%): card sticky di pojok kanan-bawah Home Advertiser yang collapsible. Murni Svelte + Tailwind, tidak butuh library.

---

## 3. Konten Onboarding

### 3.1 Tour — 6 Step Pengenalan Halaman Home

Tour hanya berjalan di `/home/advertiser`. Jika user click "Mulai ulang tour" sambil berada di halaman lain, redirect ke `/home/advertiser?startTour=1` dulu.

| # | Anchor element                          | Judul                          | Pesan                                                                                                                  |
|---|-----------------------------------------|--------------------------------|------------------------------------------------------------------------------------------------------------------------|
| 1 | Header greeting                         | "Selamat datang!"              | "Halaman ini adalah hub kerja harian Anda sebagai advertiser. Mari kami tunjukkan apa saja yang bisa Anda lakukan."    |
| 2 | Stat cards row                          | "Ringkasan cepat"              | "Total client, ads aktif, ticket open, todo, dan meeting minggu ini — semuanya per advertiser."                        |
| 3 | Banner 'Butuh Perhatian'                | "Prioritaskan ini dulu"        | "Sistem otomatis flag item yang butuh aksi: ads paused, ticket lama, saldo menipis."                                   |
| 4 | Tab navigation                          | "Selami tiap area"             | "5 tab di bawah untuk dive deeper: Client, KPI, Ads, Aktivitas, Jadwal."                                               |
| 5 | Sidebar (kelompok Facebook/Performance) | "Fitur lain di sidebar"        | "Scorecard KPI, Monitoring Ads, FB Tools, Notifikasi — semua menu yang boleh diakses tampil di sidebar kiri."          |
| 6 | Checklist Card (pojok kanan-bawah)      | "Mulai setup di sini"          | "Ada 5 langkah setup yang membuat dashboard ini hidup. Card ini akan terus muncul sampai selesai. Klik untuk mulai."   |

Tombol: `[Skip]` (dismiss permanen) dan `[Lanjut]` / `[Selesai]`.

Setelah selesai/skip → POST `/onboarding/progress` dengan `flow_key='advertiser_tour'`, `step_key='__done__'`.

### 3.1b Tombol Bantuan `?` di Header
Di kanan greeting (di samping nama user) tambahkan **ikon `?` kecil**. Klik → **buka/expand Checklist Card** (bukan re-trigger tour). Logikanya:
- Jika checklist sedang collapsed → expand.
- Jika checklist sudah ter-dismiss → un-dismiss + expand (POST `/onboarding/reset` body `{flowKey:'advertiser_setup'}` lalu fetch ulang state).
- Jika checklist sudah 100% selesai → tetap expand supaya user bisa review milestone yang sudah done.

Anchor: `[data-onboard="help-button"]`. Ikon: `HelpCircle` dari `@lucide/svelte`.

### 3.2 Checklist Setup — 5 Milestone Berurutan

Checklist disusun sebagai **5 milestone bertahap** dengan dependency yang jelas — user paham apa yang harus dilakukan dulu sebelum lanjut ke yang berikutnya. Setiap milestone diasumsikan sebagai "**accordion item**" — collapsed jika belum diaktifkan/sudah selesai, expanded saat siap dikerjakan.

Card collapsible di pojok kanan-bawah Home Advertiser. Default state:
- Expanded jika progress < 100%.
- Collapsed jika ≥ 100%.

Setiap milestone punya:
- **Judul** + ikon status (todo / locked / done auto / done manual).
- **"Mengapa ini penting"** — 1–2 kalimat menjelaskan manfaat (bukan sekadar instruksi).
- **Sub-steps** (jika ada) — bullet list dengan deep-link ke menu.
- **CTA primer** — tombol "Buka menu →".
- **Tombol "Tandai selesai manual"** (fallback kalau auto-detect meleset).

#### Milestone 1 — **Tambah Client (mulai dari sini)**
- **Key:** `client_added`
- **Prasyarat:** _none_ (selalu unlocked)
- **Mengapa penting:** Hampir semua fitur lain (KPI, monitoring, alert) bekerja **per client**. Tanpa minimal 1 client, dashboard akan kosong dan alert tidak akan jalan.
- **Manfaat setelah ditambahkan:**
  - Mengelola brand/kontrak per client di satu tempat
  - Membaca history aktivitas, ticket, dan meeting
  - Memonitoring performance ads per client
  - Menerima alert otomatis bila ada anomali (saldo habis, ads paused, dsb.)
- **Cara melakukan:**
  1. Buka menu **Management → Client** ([/customers/admin](v-auto-frontend/src/routes/customers/+page.svelte)) → klik **"Tambah Client"**, isi nama brand & info kontak
  2. Lanjut ke menu **Management → Subscription** ([/subscriptions/admin](v-auto-frontend/src/routes/subscriptions/+page.svelte)) → buat subscription baru, **pilih diri Anda sebagai advertiser** di field "Advertiser"
- **Auto-detect:** `EXISTS (SELECT 1 FROM subscriptions WHERE advertiser_id = userId)`
- **CTA:** "Buka menu Client →" `/customers/admin`

#### Milestone 2 — **Hubungkan FB Token**
- **Key:** `fb_token_added`
- **Prasyarat:** _none_ (bisa dikerjakan paralel dengan Milestone 1 & 3)
- **Mengapa penting:** FB Token adalah **kunci akses** sistem kita ke Meta Ads API milik client. Tanpa token yang valid, sistem tidak bisa:
  - Sinkronisasi data spend, CPM, CPL, hasil iklan
  - Memantau saldo ad account real-time
  - Mengirim alert bila saldo menipis atau token expired
- **Cara melakukan:** Buka menu **Facebook → FB Token** ([/fb-token/admin](v-auto-frontend/src/routes/fb-token/+page.svelte)) → klik **"Tambah Token"** → ikuti instruksi Meta login & paste token long-lived.
- **Auto-detect:** `EXISTS (SELECT 1 FROM fb_tokens WHERE user_id = userId AND status = 'active')`
- **CTA:** "Buka FB Token →" `/fb-token/admin`

#### Milestone 3 — **Daftarkan FB Ad Account ID**
- **Key:** `fb_act_added`
- **Prasyarat:** _none_ (bisa dikerjakan paralel — tapi membutuhkan token aktif supaya data tersinkron)
- **Mengapa penting:** Ad Account ID memberitahu sistem **akun iklan mana** yang harus dipantau untuk setiap client. Tanpa ini:
  - Dashboard FB tidak menampilkan data per client
  - Monitoring ads tidak tahu ad account mana yang harus di-scan
  - Cron job daily report tidak punya target
- **Cara melakukan:** Buka menu **Facebook → FB Ad Account** ([/fb-act/admin](v-auto-frontend/src/routes/fb-act/+page.svelte)) → klik **"Tambah Ad Account"** → masukkan act_id (dari Meta Ads Manager) → assign ke subscription/client yang sesuai.
- **Auto-detect:** `EXISTS (SELECT 1 FROM fb_act WHERE owner_user_id = userId)` atau via subscription mapping
- **CTA:** "Buka FB Ad Account →" `/fb-act/admin`

#### Milestone 4 — **Pakai KPI untuk Client Anda**
- **Key:** `kpi_ready`
- **Prasyarat:** Milestone 1 (`client_added`) harus done. **Locked dengan pesan** "Tambah client dulu sebelum setup KPI" sampai prasyarat terpenuhi.
- **Mengapa penting:** KPI = ukuran objektif performance Anda dan client. Tanpa KPI, sulit menjustifikasi hasil kerja, dan diskusi dengan client jadi subjektif.
- **Sub-steps (tampilkan semua sebagai bullets — setiap bullet bisa diklik):**
  1. **Setup target KPI** — Buka [/scorecards/advertiser](v-auto-frontend/src/routes/scorecards/+page.svelte) → set target per metrik (mis. CPL ≤ Rp X, CTR ≥ Y%). Ini cuma sekali per periode.
  2. **Input data KPI** — Tiap minggu/bulan, buka [/scorecard-data/advertiser](v-auto-frontend/src/routes/scorecard-data/+page.svelte) untuk catat capaian aktual.
  3. **Baca hasil KPI** — Kembali ke Home Advertiser → tab **KPI** atau buka [/eos-dashboard](v-auto-frontend/src/routes/eos-dashboard/+page.svelte). Lihat indikator hijau/merah, delta vs periode lalu, dan trend.
- **Auto-detect:** `EXISTS (SELECT 1 FROM scorecard_data WHERE created_by = userId)` — milestone dianggap done begitu user input data KPI pertama.
- **CTA:** "Mulai setup KPI →" `/scorecards/advertiser`

#### Milestone 5 — **Aktifkan Dashboard, Monitoring & Alert Ads**
- **Key:** `monitoring_active`
- **Prasyarat:** Milestone 2 (`fb_token_added`) **dan** 3 (`fb_act_added`) harus done. **Locked dengan pesan** "Hubungkan FB Token dan FB Ad Account dulu" sampai keduanya terpenuhi.
- **Mengapa penting:** Setelah token + ad account siap, baru sistem bisa men-**streaming data realtime** dan kirim alert otomatis ke Telegram saat ada masalah (saldo habis, ads paused, anomali spend).
- **Sub-steps:**
  1. **Lihat FB Dashboard** — [/fb-act/dashboard](v-auto-frontend/src/routes/fb-act/+page.svelte) menampilkan ringkasan spend, balance, dan status semua ad account Anda.
  2. **Monitoring Iklan** — [/monitoring-ads](v-auto-frontend/src/routes/monitoring-ads/+page.svelte) menampilkan list iklan aktif/paused + filter by client. Cek di sini bila ada angka mencurigakan.
  3. **Atur preferensi notifikasi** — [/settings/notifications](v-auto-frontend/src/routes/settings/notifications/+page.svelte) — pilih alert mana yang aktif (saldo habis, ads paused, scorecard turun), atur quiet hours, dan pasang Telegram chat ID supaya alert masuk ke HP Anda.
- **Auto-detect:** `EXISTS (SELECT 1 FROM user_notification_preferences WHERE user_id = userId)` — done begitu user buka & simpan preferensi notifikasi (artinya dia sudah review alert mana yang aktif).
- **CTA:** "Atur notifikasi sekarang →" `/settings/notifications`

#### Ringkasan Dependency Graph
```
Milestone 1 (Client) ─────┐
                          ├──→ Milestone 4 (KPI)
                          │
Milestone 2 (FB Token) ───┬──→ Milestone 5 (Monitoring & Alert)
                          │
Milestone 3 (FB Act ID) ──┘
```

#### Catatan
- Auto-detect membuat checklist **tidak perlu diceklist manual** — selesai begitu user benar-benar melakukan aksi. Ini lebih honest daripada checkbox yang bisa dicurangi.
- Setiap milestone punya tombol **"Tandai selesai manual"** sebagai fallback bila auto-detect meleset. Insert row `{flow_key:'advertiser_setup', step_key, completed_at:NOW(), manual:1}`.
- Tombol **"Sembunyikan checklist"** → insert `dismissed_at`, card hilang sampai user reset dari Settings atau klik tombol bantuan `?` di header.
- Milestone yang **locked** (4 & 5) tetap ditampilkan supaya advertiser tahu "ke depan akan ada apa", tapi tombol CTA disabled dan ada pesan prasyarat.

### 3.3 Empty-state nudges (di luar checklist)
Setiap tab Home Advertiser yang kosong (Clients = 0, Ads = 0) menambahkan tombol kecil "**Cara mulai →**" yang scroll ke Checklist Card. Tidak butuh state baru, cuma anchor link.

---

## 4. Database Schema

File: [src/db/schema.ts](src/db/schema.ts).

```ts
// Tabel baru
export const userOnboardingProgress = mysqlTable(
  'user_onboarding_progress',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id').notNull(),
    flowKey: varchar('flow_key', { length: 64 }).notNull(),  // 'advertiser_tour' | 'advertiser_setup'
    stepKey: varchar('step_key', { length: 64 }).notNull(),  // see step keys above, atau '__done__' / '__dismissed__'
    manual: tinyint('manual').default(0).notNull(),          // 1 = ditandai manual oleh user
    completedAt: timestamp('completed_at').defaultNow().notNull(),
    dismissedAt: timestamp('dismissed_at'),
  },
  (table) => ({
    uniqUserFlowStep: uniqueIndex('uniq_user_flow_step').on(table.userId, table.flowKey, table.stepKey),
    userIdx: index('uop_user_idx').on(table.userId),
  })
);
```

Migration: tambah file `drizzle/0026_user_onboarding_progress.sql` (lewat `npx drizzle-kit generate` atau manual). Apply via `scripts/apply-migration.ts` (pola sama dengan migrasi 0025 notifikasi — lihat obs 9768).

**Alasan tabel terpisah** (bukan kolom JSON di `users`):
- Audit per-step (kapan selesai, manual atau auto).
- Mudah extensible untuk flow lain (mis. `onboarding_admin`, `onboarding_css`) tanpa migrasi kolom.
- Bisa di-query agregat ("brp % advertiser yang sudah selesai langkah X") buat product analytics.

---

## 5. Backend — Endpoints Baru

File: `src/routes/onboarding.ts`. Register di [src/index.ts](src/index.ts) dengan prefix `/onboarding`. Semua endpoint lewat `requireAuth`, `userId` dari session.

### 5.1 `GET /onboarding/state`
Return state lengkap untuk user saat ini. Server yang menghitung auto-detect (jangan di frontend — sumbernya DB, dan kita ingin satu sumber kebenaran).

```ts
{
  flows: {
    advertiser_tour: {
      done: boolean,         // ada row step '__done__' atau '__dismissed__'
      dismissed: boolean,
    },
    advertiser_setup: {
      steps: [
        { key: 'client_added',      done: true,  locked: false, source: 'auto', completedAt },
        { key: 'fb_token_added',    done: false, locked: false },
        { key: 'fb_act_added',      done: false, locked: false },
        { key: 'kpi_ready',         done: false, locked: true,  lockedReason: 'Tambah client dulu' },
        { key: 'monitoring_active', done: false, locked: true,  lockedReason: 'Hubungkan FB Token & Ad Account dulu' },
      ],
      completedCount: 1,
      totalCount: 5,
      dismissed: false,
    }
  },
  isAdvertiser: boolean,   // berdasarkan EXISTS subscriptions.advertiser_id = userId
}
```

Implementasi: batch query 5 step auto-detect dalam **satu round-trip** pakai `Promise.all` (atau better: 1 query union-style) supaya endpoint < 50ms. Field `locked` dan `lockedReason` dihitung server berdasarkan dependency graph (lihat 3.2).

### 5.2 `POST /onboarding/progress`
Body: `{ flowKey: string, stepKey: string, action: 'complete' | 'dismiss', manual?: boolean }`.

Insert (atau upsert) row sesuai action:
- `complete` → set `completed_at = NOW()`, `manual = body.manual ?? 0`.
- `dismiss`  → set `dismissed_at = NOW()` (step_key biasanya `'__flow__'` untuk dismiss seluruh checklist).

Validasi `flowKey ∈ {advertiser_tour, advertiser_setup}` dan `stepKey` ada di daftar known steps (whitelist hard-coded di route file).

### 5.3 `POST /onboarding/reset`
Hapus semua row `user_onboarding_progress` untuk `userId` (atau hanya flow tertentu jika body `{flowKey}` ada). Dipakai tombol "Mulai ulang tour" di Settings.

### 5.4 Endpoint analytics (opsional, fase berikutnya — **skip dulu**)
`GET /admin/onboarding/funnel` untuk admin lihat conversion per step. Tidak perlu di MVP.

---

## 6. Frontend — Komponen Baru

Folder: `v-auto-frontend/src/lib/components/onboarding/`.

### 6.1 `onboarding-gate.svelte`
- Mount di top of `/home/advertiser/+page.svelte`.
- `onMount` → fetch `/onboarding/state`.
- Render kondisional: `<OnboardingTour>` kalau `advertiser_tour.done=false`, lalu `<OnboardingChecklist>` kalau `advertiser_setup` belum 100% & belum dismissed.
- URL param `?startTour=1` paksa tour jalan (untuk tombol "Mulai ulang").

### 6.2 `onboarding-tour.svelte`
- Pakai `driver.js`. Install: `bun add driver.js`.
- Pass array step config (lihat tabel 3.1) — masing-masing punya `element` (CSS selector), `popover: { title, description, side }`.
- `onDestroyed` callback → POST `/onboarding/progress` `{flowKey:'advertiser_tour', stepKey:'__done__', action:'complete'}`.
- Jika user click "Skip" → POST dengan `action:'dismiss'`, `stepKey:'__flow__'`.

CSS selector untuk anchor:
- `[data-onboard="header-greeting"]`
- `[data-onboard="stat-cards"]`
- `[data-onboard="attention-banner"]`
- `[data-onboard="tabs-nav"]`
- `[data-onboard="sidebar-performance"]` (di app-sidebar.svelte)

Wajib tambahkan attribut `data-onboard="..."` di tiap elemen target di home + sidebar.

### 6.3 `onboarding-checklist.svelte`
- Floating card di pojok kanan-bawah (`fixed bottom-4 right-4 z-40`), max-width 380px.
- **Anchor:** `[data-onboard="checklist-card"]` (dipakai tour step 6).
- Header: "Setup akun Anda · X/5", tombol collapse, tombol X (dismiss).
- Body: **accordion** 5 milestone (gunakan `Accordion` component dari `$lib/components/ui/accordion` jika ada). Setiap item:
  - Ikon status: ✓ hijau (done auto), ✓ abu (done manual), ⭕ outline (todo), 🔒 (locked).
  - Judul + 1-baris ringkasan saat collapsed.
  - **Saat expanded:** tampilkan blok "Mengapa penting" + sub-steps (bullet list) + tombol CTA + tombol "Tandai selesai manual".
  - Jika `locked: true` — accordion item disabled, tampilkan `lockedReason` sebagai tooltip.
- Footer: progress bar (`completedCount / totalCount`) + tombol kecil "Sembunyikan dulu" (= dismiss flow).
- Default expanded milestone: milestone pertama yang belum done dan tidak locked.

Reaktif via Svelte 5 runes (`$state`, `$derived`). Tidak butuh global store; lift state lewat props dari `onboarding-gate.svelte`.

### 6.4 Tombol re-trigger di Settings & Header
**Di Settings** — File: `v-auto-frontend/src/routes/settings/+page.svelte`. Section baru "Bantuan & Tour":
- Tombol **"Mulai ulang tour onboarding"** → POST `/onboarding/reset` body `{flowKey:'advertiser_tour'}`, lalu `goto('/home/advertiser?startTour=1')`.
- Tombol **"Tampilkan checklist setup lagi"** → POST `/onboarding/reset` body `{flowKey:'advertiser_setup'}`, lalu `goto('/home/advertiser')`.

**Di Header Home Advertiser** — tombol bantuan `?` (lihat 3.1b):
- Render di kanan greeting di [+page.svelte](v-auto-frontend/src/routes/home/advertiser/+page.svelte).
- Tooltip on hover: "Lihat panduan setup".
- Klik → emit event ke `onboarding-gate.svelte` → `onboarding-checklist.svelte` expand. Jika sudah dismissed, panggil `resetOnboarding('advertiser_setup')` dulu lalu re-fetch state.

### 6.5 API client
File baru: `v-auto-frontend/src/lib/api/onboarding.ts`. Ikuti pola `$lib/api/notifications.ts` (obs 9715–9716).

```ts
export async function fetchOnboardingState(): Promise<OnboardingState> { ... }
export async function markOnboardingProgress(input: { flowKey; stepKey; action; manual? }): Promise<void> { ... }
export async function resetOnboarding(flowKey?: string): Promise<void> { ... }
```

---

## 7. Fase Implementasi

| Fase | Deliverable                                                                                       | Estimasi |
|------|---------------------------------------------------------------------------------------------------|----------|
| 0    | Schema + migrasi `user_onboarding_progress`, apply ke DB lokal                                    | 0.5j     |
| 1    | Backend endpoints: `state`, `progress`, `reset`. Unit-test happy path tiap endpoint               | 1.5j     |
| 2    | Auto-detect query untuk 5 milestone (Promise.all batch) + logika `locked` (dependency graph)      | 1j       |
| 3    | Frontend: `api/onboarding.ts` + `onboarding-gate.svelte` + integrasi di home/advertiser           | 1j       |
| 4    | Frontend: `onboarding-checklist.svelte` (accordion 5 milestone, lock state, manual mark, dismiss) | 2.5j     |
| 5    | Frontend: `onboarding-tour.svelte` (install driver.js, 6-step config, anchor data attributes)     | 1.5j     |
| 6    | Frontend: tombol bantuan `?` di header home + handler expand-checklist                            | 0.5j     |
| 7    | Settings page: section "Bantuan & Tour" dengan 2 tombol reset                                     | 0.5j     |
| 8    | QA end-to-end: advertiser baru → tour → 5 milestone berurutan, lock/unlock, dismiss/reset         | 1j       |
| 9    | (Opsional) Telemetry log step completion → notif Telegram ke channel internal untuk pantau funnel | 0.5j     |

Total ≈ **9–10 jam** (tanpa fase 9 opsional).

---

## 8. Edge Cases & Risiko

1. **User bukan advertiser** (no row di `subscriptions.advertiser_id`): `/onboarding/state` return `isAdvertiser=false`, `onboarding-gate.svelte` tidak render apa-apa. Halaman home tetap berfungsi.
2. **User pindah role**: jika advertiser kemudian semua subscription-nya di-revoke, checklist tetap tersimpan tapi card disembunyikan (gate-nya kondisional `isAdvertiser`).
3. **Auto-detect false negative** (mis. user pakai extension dari profil Chrome lain): fallback "Tandai selesai manual" mengatasi ini. UI tetap menampilkan status auto yang teratas, tombol manual sebagai opsi sekunder.
4. **Race condition** saat tour & checklist render bersamaan: gate render tour DULU, checklist hanya muncul setelah `advertiser_tour.done=true`.
5. **driver.js + sidebar**: sidebar di mobile (`md:` breakpoint) tidak terlihat — step 5 harus skip-able atau pakai conditional element berdasarkan window width.
6. **Migrasi schema di production**: gunakan `scripts/apply-migration.ts` (sama dengan pattern migrasi 0025, lihat obs 9768).
7. **Dismissal permanen vs reset**: pastikan tombol reset di settings benar-benar menghapus row dismiss, bukan hanya complete — supaya checklist muncul lagi.

---

## 9. Keputusan yang Sudah Dikonfirmasi

1. **Scope role:** MVP hanya advertiser. HRD/Akuntan/CSS dibuat nanti — arsitektur `flow_key` sudah extensible untuk itu.
2. **Tombol bantuan `?`:** ada di kanan greeting di Home Advertiser, klik → expand Checklist Card (bukan tour). Tour cukup sekali otomatis.
3. **Bahasa:** Indonesia saja.
4. **Step yang difokuskan:** 5 milestone berurutan dengan dependency (lihat Section 3.2). Drop "Lengkapi profil" dan "Install Chrome Extension". Penekanan pada **manfaat** ("kenapa ini penting") di tiap milestone, bukan sekadar instruksi.

---

## 10. Catatan Implementasi Lintas-Repo

- **Backend** (v-auto-backend): tabel + endpoint + auto-detect logic.
- **Frontend** (v-auto-frontend): semua komponen UI + integrasi sidebar/home/settings.
- Tidak ada perubahan di chrome-extensions repo.

Sebelum mulai: jalankan `npx gitnexus analyze` supaya indeks fresh, lalu `gitnexus_impact({target: "advertiserHomeHandler"})` untuk konfirmasi bahwa menambah `onboarding-gate` di home tidak punya blast radius tersembunyi.

---

## 11. QA — Cara Test Manual

Berikut flow test yang harus dijalankan setelah fitur ter-deploy ke lokal. Total ~15 menit untuk path lengkap.

### 11.0 Prasyarat

- [ ] Backend running di `localhost:3000` (atau port yang biasa).
- [ ] Frontend running di `localhost:2026`.
- [ ] Migrasi 0026 sudah ter-apply: `bun scripts/apply-migration.ts drizzle/0026_add_user_onboarding_progress.sql` — verify `DESCRIBE user_onboarding_progress` di MySQL.
- [ ] Punya **2 akun test**:
  - **Akun A** = "advertiser baru" — user yang ada minimal 1 row `subscriptions.advertiser_id = user.id`, tapi belum punya fb_token, fb_act, scorecard_data, notification preference.
  - **Akun B** = "bukan advertiser" — user tanpa row `subscriptions.advertiser_id = user.id`.
  - Optional: **Akun C** = "advertiser senior" — user yang sudah punya semua (fb_token, fb_act, scorecard_data, notif pref) → milestone 1–5 semua auto-done.

> Tip: untuk reset cepat state user X selama test, jalankan di MySQL:
> ```sql
> DELETE FROM user_onboarding_progress WHERE user_id = <USER_ID>;
> ```
> atau pakai endpoint `POST /api/onboarding/reset` (lewat curl + token bearer).

---

### 11.1 Backend Smoke Test (5 menit)

Ambil JWT token dari frontend (DevTools → Application → Local Storage → `accessToken`), lalu:

```bash
TOKEN="<paste-token>"
BASE="http://localhost:3000/api"

# 1. State endpoint
curl -s -H "Authorization: Bearer $TOKEN" $BASE/onboarding/state | jq

# 2. Mark milestone manual complete
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"flowKey":"advertiser_setup","stepKey":"client_added","action":"complete","manual":true}' \
  $BASE/onboarding/progress

# 3. Reset semua
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{}' $BASE/onboarding/reset
```

Expected:
- [ ] `GET /state` return JSON `{success:true, data:{isAdvertiser, flows:{...}}}` dengan 5 step di `advertiser_setup.steps`.
- [ ] Field `locked` dan `lockedReason` benar untuk step 4 (`kpi_ready` locked sebelum step 1 done) dan step 5 (`monitoring_active` locked sebelum step 2+3 done).
- [ ] `POST /progress` return `{success:true}`, lalu `GET /state` berikutnya menunjukkan step yg di-mark sebagai `source:'manual'`, `done:true`.
- [ ] `POST /reset` menghapus semua row → next `GET /state` reset ke auto-detect saja.

---

### 11.2 Frontend — First-Time Tour (Akun A, baru pertama login)

1. Login pakai Akun A (advertiser baru, belum pernah lihat onboarding).
2. Buka `/home/advertiser`.

**Expected:**
- [ ] Setelah halaman load, **overlay gelap** muncul + **spotlight ring** mengelilingi header greeting + popover step 1 ("Selamat datang!").
- [ ] Tombol "Lanjut" memajukan ke step berikutnya. Tombol "Kembali" mundur. Counter "1 / 6" terlihat.
- [ ] Step 2 highlight stat cards row. Step 3 highlight banner "Butuh Perhatian". Step 4 highlight Tabs.List. Step 5 highlight grup Performance di sidebar (kalau sidebar collapsed di mobile, spotlight skip & popover center).
- [ ] Step 6 (terakhir) highlight Checklist Card di pojok kanan-bawah, tombol jadi "Selesai".
- [ ] Klik "Selesai" → tour hilang, checklist tetap visible.
- [ ] Reload halaman → tour **tidak** muncul lagi (cek DB: ada row `flow_key='advertiser_tour', step_key='__done__'`).

**Variasi:**
- [ ] Klik **overlay gelap** (di luar popover) atau tombol "Lewati" → tour hilang, di DB row jadi `step_key='__flow__'` dengan `dismissed_at` set.
- [ ] Setelah skip, reload → tour tetap tidak muncul (sudah dismissed).

---

### 11.3 Frontend — Checklist Card (Akun A, after tour)

1. Setelah tour selesai, perhatikan Checklist Card di pojok kanan-bawah.

**Expected:**
- [ ] Header tampilkan "Setup akun Anda · 1/5" (karena Akun A sudah punya client → milestone 1 auto-done).
- [ ] Progress bar terisi ~20%.
- [ ] Milestone 1 (`client_added`) → ikon ✓ hijau, judul "1. Tambah Client", `source:'auto'`.
- [ ] Milestone 2 (`fb_token_added`) → ikon ⭕ outline, tidak locked, tombol "Buka FB Token" aktif.
- [ ] Milestone 3 (`fb_act_added`) → ikon ⭕ outline, tidak locked, tombol "Buka FB Ad Account" aktif.
- [ ] Milestone 4 (`kpi_ready`) → ikon 🔒, expand-nya show pesan "🔒 Tambah client dulu sebelum setup KPI" — **tunggu**, milestone 1 sudah done, jadi seharusnya milestone 4 **unlocked**. Verify: setelah milestone 1 done, milestone 4 jadi ⭕ outline (tidak locked).
- [ ] Milestone 5 (`monitoring_active`) → ikon 🔒, expand show "🔒 Hubungkan FB Token & FB Ad Account dulu" (karena milestone 2 & 3 belum done).

**Interaksi:**
- [ ] Klik milestone 2 → expand menampilkan "Mengapa penting" + "Cara melakukan" + tombol CTA + tombol "Tandai selesai manual".
- [ ] Klik "Buka FB Token" → navigate ke `/fb-token/admin`.
- [ ] Balik ke `/home/advertiser` → checklist masih ada, milestone 2 status sama (kecuali user benar-benar nambah token di DB).
- [ ] Klik "Tandai selesai manual" di milestone 2 → milestone jadi ✓ abu-abu dengan label "Ditandai manual".
- [ ] Sekarang setelah milestone 2 manual done, milestone 5 masih locked (karena butuh 2 **dan** 3). Add manual lagi untuk milestone 3 → milestone 5 unlock jadi ⭕.

---

### 11.4 Auto-detect End-to-End (penting!)

Test bahwa milestone auto-checked saat user benar-benar melakukan aksi di app, tanpa perlu klik "Tandai selesai manual".

Setup: reset Akun A → `DELETE FROM user_onboarding_progress WHERE user_id = <A>;` lalu reload `/home/advertiser`.

| # | Aksi user di UI                                                                  | Expected setelah refresh state                                  |
|---|----------------------------------------------------------------------------------|------------------------------------------------------------------|
| 1 | Buat customer + subscription dengan advertiser_id = Akun A                       | Milestone 1 jadi ✓ auto, milestone 4 unlock                      |
| 2 | Tambah FB Token via `/fb-token/admin`, status = active                           | Milestone 2 jadi ✓ auto                                          |
| 3 | Tambah FB Ad Account via `/fb-act/admin` dan link ke subscription Akun A         | Milestone 3 jadi ✓ auto; milestone 5 unlock setelah 2 juga done  |
| 4 | Input scorecard data dengan `entered_by` = Akun A via `/scorecard-data/advertiser` | Milestone 4 jadi ✓ auto                                          |
| 5 | Buka `/settings/notifications`, isi `telegram_username`, save                     | Milestone 5 jadi ✓ auto                                          |

- [ ] Setelah semua 5 milestone done → progress 5/5 → Checklist Card collapsed otomatis (atau hidden).

**Refresh strategy:** state hanya re-fetch saat `OnboardingGate` mount (page load) atau saat user `markOnboardingProgress`. Untuk test cepat, lakukan aksi → reload `/home/advertiser`.

---

### 11.5 Tombol Bantuan `?` di Header

1. State: Akun A sudah selesai tour, checklist masih visible.
2. Klik tombol X di Checklist Card → checklist hilang (dismissed).
3. Verify Checklist Card tidak muncul setelah reload.
4. Di header greeting, klik ikon `?` (tooltip "Lihat panduan setup").

**Expected:**
- [ ] Checklist Card muncul lagi (un-dismissed via `resetOnboarding('advertiser_setup')` + reload state).
- [ ] Checklist auto-scroll into view jika tidak terlihat.
- [ ] State milestone tetap sesuai DB (yang sudah done tetap done).

---

### 11.6 Settings — Reset Tour & Checklist

1. Buka `/settings` → scroll ke section "Bantuan & Tour".

**Expected:**
- [ ] Section tampil dengan judul + 2 tombol: "Mulai ulang tour onboarding" dan "Tampilkan checklist setup lagi".

**Test tombol 1 — restart tour:**
- [ ] Klik "Mulai ulang tour onboarding" → redirect ke `/home/advertiser?startTour=1`.
- [ ] Tour overlay muncul lagi dari step 1.
- [ ] Setelah halaman load, query param `?startTour=1` hilang dari URL (replaceState).
- [ ] Reload halaman → tour TIDAK muncul lagi (karena belum selesai/skip tour yang baru → masih ada di DB sebagai dismissed? Verify: reset tour = `DELETE WHERE flow_key='advertiser_tour'`, jadi tour fresh → muncul satu kali sampai user finish/skip lagi).

**Test tombol 2 — show checklist again:**
- [ ] Setelah checklist di-dismiss (klik X), klik "Tampilkan checklist setup lagi".
- [ ] Toast "Checklist setup ditampilkan lagi" muncul.
- [ ] Redirect ke `/home/advertiser`, Checklist Card muncul (un-dismissed).

---

### 11.7 Non-Advertiser User (Akun B)

1. Login pakai Akun B (user tanpa row `subscriptions.advertiser_id`).
2. Buka `/home/advertiser`.

**Expected:**
- [ ] Halaman load normal, **TIDAK ada** overlay tour, **TIDAK ada** Checklist Card.
- [ ] Tombol `?` di header **masih tampil** (komponen-nya unconditional), tapi klik → tidak ada efek (gate hide karena `isAdvertiser:false`). **Verify**: idealnya tombol `?` juga di-hide kalau `isAdvertiser:false`. Kalau belum, masuk ke daftar follow-up.
- [ ] `GET /api/onboarding/state` return `isAdvertiser:false`.

---

### 11.8 Advertiser Senior (Akun C) — Happy Path Selesai

1. Login pakai Akun C (sudah punya semua: client, fb_token, fb_act, scorecard_data, notif pref).
2. Buka `/home/advertiser`.

**Expected:**
- [ ] Tour pertama kali masih muncul (tour state independent dari setup state).
- [ ] Setelah skip/selesai tour → Checklist Card **tidak muncul** karena 5/5 sudah done (gate kondisi: `completedCount < totalCount && !dismissed`).
- [ ] Klik `?` di header → Checklist Card tetap di-expand (un-dismiss + reload state). Saat di-expand, semua milestone ✓ hijau.

---

### 11.9 Edge Cases

- [ ] **Mobile width (<768px)**: Checklist Card responsive, max-width = `calc(100vw - 2rem)`, tidak menutupi mayoritas layar.
- [ ] **Tour saat sidebar collapsed (mobile)**: step 5 (sidebar-performance) — target tidak visible, popover tetap render di tengah (fallback).
- [ ] **Window resize saat tour aktif**: spotlight + popover re-measure (event listener `resize` dan `scroll`).
- [ ] **Network error saat fetch state**: gate log error ke console, tidak crash halaman. Tour & checklist tidak muncul.
- [ ] **POST progress gagal** (mis. backend down): log error, UI tidak break.
- [ ] **Multiple klik cepat** tombol "Tandai selesai manual": idempotent karena `onDuplicateKeyUpdate` di backend.

---

### 11.10 Cek di DB setelah Selesai Test

```sql
SELECT user_id, flow_key, step_key, manual,
       completed_at, dismissed_at, created_at, updated_at
FROM user_onboarding_progress
WHERE user_id = <USER_ID>
ORDER BY updated_at DESC;
```

Expected rows untuk Akun A yang sudah complete semua:
- 1 row `flow_key='advertiser_tour', step_key='__done__'` (atau `__flow__` kalau di-skip).
- Beberapa row `flow_key='advertiser_setup', step_key='<milestone>'` hanya untuk yang **manually marked** (auto-done tidak insert row — dihitung on-the-fly dari DB lain).
- Optional 1 row `flow_key='advertiser_setup', step_key='__flow__', dismissed_at IS NOT NULL` kalau pernah di-dismiss.

---

### 11.11 Sign-off

Setelah semua section 11.1–11.10 hijau:

- [ ] Tour visual smooth (no flash, spotlight rapi mengelilingi target).
- [ ] Checklist konten meaningful (advertiser baru paham apa yang harus dilakukan dan kenapa).
- [ ] Auto-detect bekerja realtime — user tidak perlu klik manual untuk hal yang sudah dia lakukan di app.
- [ ] Dismiss + reset round-trip works tanpa state leak.
- [ ] Tidak ada regression di Home Advertiser dashboard existing (stat cards, banner, tabs masih jalan normal).

Bila ada bug, catat di issue dengan:
- Akun test yang dipakai.
- Step reproduksi.
- Hasil `GET /api/onboarding/state` saat bug terjadi.
- Hasil query SQL `SELECT * FROM user_onboarding_progress WHERE user_id = ?`.


