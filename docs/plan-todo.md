# Plan — Todo Recurring / Berulang (Recurring Tasks)

> Status: **DRAFT / PROPOSAL** · Dibuat 2026-06-06
> Fitur agar sebuah todo bisa **berulang otomatis**: tiap hari, tiap minggu,
> ataupun tiap awal bulan (dan opsional tiap tahun / interval kustom).
>
> ⚠️ **Ini PENAMBAHAN ke fitur Todo yang sudah jalan, bukan bikin dari nol.**
> Halaman `/todos/admin`, route `/api/todos`, tabel `todos`/`repeatTasks`/
> `todoRepeatHistories`, flag `isRecurring`, dan kolom "Recurring" di tabel **sudah ada**.
> Plan ini hanya menjelaskan **delta** yang perlu ditambah/diubah (lihat §2.5).

---

## 1. Tujuan & Ruang Lingkup

Menyediakan task yang **berulang otomatis** tanpa user harus membuat ulang manual:

- **Harian** — tiap hari (mis. "cek balance akun iklan").
- **Mingguan** — tiap minggu pada hari tertentu (mis. "laporan mingguan tiap Senin").
- **Bulanan** — tiap awal bulan / tanggal tertentu (mis. "invoice tiap tanggal 1").
- **Tahunan** (opsional) — tiap tahun pada tanggal tertentu.

Setiap **kemunculan (occurrence)** menjadi task tersendiri yang bisa diselesaikan
(punya `status` & `dueDate` sendiri), sementara aturan berulangnya tersimpan satu kali.

### Non-tujuan (iterasi pertama)

- Bukan kalender penuh (tidak ada drag-drop, tidak ada view bulanan kompleks).
- Tidak ada RRULE iCal penuh (mis. "hari kerja terakhir tiap kuartal"). Cukup
  pola umum daily / weekly / monthly / yearly + interval.
- Tidak ada reminder baru khusus recurring — manfaatkan `runTodoReminders()` yang sudah ada.

---

## 2. Kondisi Saat Ini (yang sudah ada)

Sudah di-scaffold di `src/db/schema.ts` dan termigrasi (`0013_add_is_recurring`,
`0014_sync_todo_repeat_histories`), tapi **logikanya belum ada**:

| Objek | Status | Catatan |
|------|--------|---------|
| `todos` (+ kolom `isRecurring`) | ✅ ada | Bertindak sebagai **template** task berulang |
| `repeatTasks` | ✅ ada | Hanya `type` (0=daily,1=weekly,2=monthly,3=yearly) + `status` + `todoId`. **Terlalu minim** |
| `todoRepeatHistories` | ✅ ada | Salinan penuh field todo + `repeatTaskId`. Dipakai untuk **occurrence** |
| Route `src/routes/todos.ts` | ⚠️ CRUD biasa | Menyimpan `isRecurring` tapi **tidak** membuat `repeatTask` apa pun |
| Job generator occurrence | ❌ belum ada | Tidak ada cron yang membuat occurrence |
| Endpoint kelola repeat | ❌ belum ada | Tidak ada cara baca/atur jadwal atau occurrence |

**Kesimpulan:** struktur tabel sudah benar arahnya, tapi `repeatTasks` perlu
diperkaya dan seluruh logika (generator + API) harus dibangun.

---

## 2.5 Ringkasan Delta (existing → yang diubah/ditambah)

Mayoritas adalah **edit kecil ke file existing** + **3 file baru** (recurrence util,
job, script). Tidak ada yang dibongkar ulang.

### Backend (`v-auto-backend`)

| File | Status | Delta |
|------|--------|-------|
| `src/db/schema.ts` | ✏️ edit | Tambah kolom di `repeatTasks` (interval, byWeekday, byMonthDay, byMonth, start/end, maxOccurrences, generatedCount, lastRunDate, nextRunDate) + `occurrenceDate`/unique di `todoRepeatHistories` |
| `drizzle/0029_…sql` | ➕ baru | `ALTER TABLE` (kolom sudah ada di DB, jadi cuma ADD COLUMN) |
| `src/utils/recurrence.ts` | ➕ baru | `computeFirstRun` / `computeNextRun` (fungsi murni) |
| `src/jobs/recurringTodos.ts` | ➕ baru | `runRecurringTodoGeneration()` (pola job existing) |
| `scripts/run-recurring-todos.ts` | ➕ baru | Entrypoint cron (pola `run-notification-reminders.ts`) |
| `package.json` | ✏️ edit | Tambah script `job:recurring-todos` |
| `src/routes/todos.ts` | ✏️ edit | Hook repeat di `POST`/`PUT` + endpoint `/:id/repeat` & `/:id/occurrences` |

### Frontend (`v-auto-frontend`)

| File | Status | Delta |
|------|--------|-------|
| `src/lib/api/todos.ts` | ✏️ edit | Tambah tipe + fungsi `getTodoRepeat`/`setTodoRepeat`/`getOccurrences`/`updateOccurrence` (field `isRecurring` SUDAH ada) |
| `…/todos/admin/todo-form-dialog.svelte` | ✏️ edit | Tambah blok "🔁 Berulang" (UI recurring belum ada) |
| `…/todos/admin/todo-edit-dialog.svelte` | ✏️ edit | Baca/ubah aturan repeat |
| `…/todos/admin/columns.ts` | ✏️ edit | Upgrade kolom **Recurring** (existing "Ya"/"-") → badge cadence + aksi "Lihat Occurrences" di menu `⋯` |
| `…/todos/admin/helper-and-state.svelte.ts` | ✏️ edit | State/handler occurrences (reuse `debouncedInlineUpdate`) |

> **Tidak perlu**: bikin route/halaman baru, ganti komponen tabel, atau ubah skema auth.

---

## 3. Keputusan Desain Utama

| Topik | Keputusan | Alasan |
|------|-----------|--------|
| Model | **Template + Schedule + Occurrences** → `todos` (template) → `repeatTasks` (aturan) → `todoRepeatHistories` (occurrence) | Mengikuti arah schema yang sudah ada; aturan berulang tersimpan sekali |
| Occurrence | Setiap kemunculan = 1 row `todoRepeatHistories` dengan `status`/`dueDate` sendiri | Tiap hari/minggu diselesaikan independen, riwayat lengkap terjaga |
| Generasi | **Cron harian** materialisasi occurrence yang jatuh tempo (pola `src/jobs/*` + `scripts/run-*`) | Konsisten dgn `notificationReminders`, `metaAdsDailyReport` |
| Cursor | `repeatTasks.nextRunDate` sebagai penanda occurrence berikutnya | Query cron murah: `WHERE status=0 AND nextRunDate <= today` |
| Idempotensi | Tambah `occurrenceDate` + **unique(`repeatTaskId`,`occurrenceDate`)** di histories | Cron yang jalan dobel tidak membuat duplikat |
| "Awal bulan" | `type=monthly` + `byMonthDay=1` (dukung `-1` = hari terakhir bulan) | Memenuhi "tiap awal bulan" tanpa pola RRULE penuh |
| Timezone | Semua perhitungan pakai `Asia/Jakarta` (sudah default di `src/index.ts`) | Konsisten, hindari geser tanggal UTC |
| Config rekurensi | **Kolom terstruktur** di `repeatTasks` (bukan JSON bebas) | Bisa di-query/index, validasi jelas |

---

## 4. Perubahan Data Model (`src/db/schema.ts`)

### 4.1 Perkaya `repeatTasks` (tambah kolom)

```ts
// repeatTasks — tambahkan kolom-kolom ini:
interval: int("interval").default(1).notNull(),        // tiap N hari/minggu/bulan/tahun
byWeekday: int("by_weekday"),                            // weekly: 0=Min..6=Sab (null = ikut startDate)
byMonthDay: int("by_month_day"),                         // monthly/yearly: 1..31, atau -1 = hari terakhir bulan
byMonth: int("by_month"),                                // yearly: 1..12
excludeWeekdays: json("exclude_weekdays").$type<number[]>(), // daily: hari yang dilewati (0=Min..6=Sab) — migrasi 0030
startDate: date("start_date"),                           // mulai berlaku
endDate: date("end_date"),                               // berhenti (null = selamanya)
maxOccurrences: int("max_occurrences"),                  // alternatif stop (null = tak terbatas)
generatedCount: int("generated_count").default(0).notNull(),
lastRunDate: date("last_run_date"),                      // occurrence terakhir yang dibuat
nextRunDate: date("next_run_date"),                      // occurrence berikutnya (cursor cron)
```

> `type` & `status` tetap dipakai apa adanya (0=daily,1=weekly,2=monthly,3=yearly; 0=active,1=inactive).

### 4.2 `todoRepeatHistories` (tambah anchor + idempotensi)

```ts
occurrenceDate: date("occurrence_date").notNull(),       // tanggal occurrence ini
// index:
uniqueIndex("todo_repeat_hist_repeat_occurrence_unique").on(table.repeatTaskId, table.occurrenceDate),
```

### 4.3 Migrasi

Buat `drizzle/0029_add_recurring_todo_fields.sql` (ALTER `repeat_tasks` + ALTER
`todo_repeat_histories` + index unik), lalu terapkan:

```bash
bun scripts/apply-migration.ts drizzle/0029_add_recurring_todo_fields.sql
```

> Catatan: `repeat_tasks` & `todo_repeat_histories` sudah ada di DB, jadi ini
> murni `ALTER TABLE ... ADD COLUMN`, bukan create. Beri default agar baris lama aman.

---

## 5. Logika Rekurensi — `src/utils/recurrence.ts` (baru)

Fungsi murni (mudah di-unit-test), semua tanggal di TZ `Asia/Jakarta`:

```ts
type RepeatType = 0 | 1 | 2 | 3; // daily | weekly | monthly | yearly

// Hitung occurrence pertama pada/atau setelah `from` sesuai aturan.
function computeFirstRun(rule, from: Date): Date

// Hitung occurrence berikutnya setelah `current`.
function computeNextRun(rule, current: Date): Date | null  // null = sudah lewat endDate/maxOccurrences
```

Aturan per tipe:

- **daily**: `current + interval hari`.
- **weekly**: maju ke `byWeekday` berikutnya; tiap `interval` minggu.
- **monthly**: tanggal `byMonthDay` tiap `interval` bulan. `byMonthDay=1` → awal bulan;
  `byMonthDay=-1` → hari terakhir bulan; jika tanggal > jumlah hari bulan → clamp ke hari terakhir.
- **yearly**: `byMonth` + `byMonthDay` tiap `interval` tahun (handle 29 Feb → clamp 28).

Berhenti bila `nextRun > endDate` atau `generatedCount >= maxOccurrences`.

---

## 6. Job Generator — `src/jobs/recurringTodos.ts` (baru)

Pola sama dengan `src/jobs/notificationReminders.ts`:

```ts
export async function runRecurringTodoGeneration(): Promise<void>
```

Langkah:
1. Ambil semua `repeatTasks` `status=0 (active)` dgn `nextRunDate <= today` (TZ Jakarta).
2. Untuk tiap repeat task, ambil template `todos` row terkait.
3. **Catch-up loop** (kalau cron sempat mati beberapa hari): selama `nextRunDate <= today`:
   - `INSERT IGNORE`-style ke `todoRepeatHistories` (salin field template; `occurrenceDate=nextRunDate`,
     `status=0`, `dueDate` dihitung dari occurrence). Unique index mencegah duplikat.
   - `generatedCount++`, `lastRunDate=nextRunDate`.
   - `nextRunDate = computeNextRun(rule, nextRunDate)`.
   - Bila `computeNextRun` → null: set `repeatTasks.status=1 (inactive)` dan `nextRunDate=null`, break.
4. Simpan update repeat task dalam satu transaksi per task.

Entrypoint `scripts/run-recurring-todos.ts` (pola `run-notification-reminders.ts`):

```ts
import { runRecurringTodoGeneration } from "../src/jobs/recurringTodos";
// main() → run → process.exit(0)
```

Tambah script di `package.json`:

```json
"job:recurring-todos": "bun run scripts/run-recurring-todos.ts"
```

Cron eksternal (server), jalan tiap hari pagi WIB, mis. **06:00**:

```cron
0 6 * * *  cd /path/v-auto-backend && bun run job:recurring-todos
```

---

## 7. Endpoint API (`src/routes/todos.ts` + tambahan)

| Method | Path | Fungsi |
|--------|------|--------|
| POST | `/todos` | (extend) bila `isRecurring=1` + ada `repeat`, buat `repeatTasks` + langsung generate occurrence pertama |
| PUT | `/todos/:id` | (extend) sync `repeatTasks` bila `repeat` berubah; matikan repeat bila `isRecurring=0` |
| GET | `/todos/:id/repeat` | Lihat aturan berulang sebuah todo |
| PUT | `/todos/:id/repeat` | Atur/ubah aturan (type, interval, byWeekday, byMonthDay, start/end, dst) |
| DELETE | `/todos/:id/repeat` | Hentikan rekurensi (set inactive; occurrence lama tetap) |
| GET | `/todos/:id/occurrences` | List `todoRepeatHistories` untuk todo (paginated) |
| PUT | `/todos/occurrences/:occId` | Update status/checklist 1 occurrence (selesai, dsb) |
| GET | `/todos/feed` | (opsional) Feed gabungan: todos non-recurring + occurrences pada rentang tanggal |

Skema validasi `repeatPayload` (Zod) — selaras dgn pola `todoPayload` yang ada:

```ts
const repeatPayload = z.object({
  type: z.coerce.number().int().min(0).max(3),
  interval: z.coerce.number().int().min(1).default(1),
  byWeekday: z.coerce.number().int().min(0).max(6).optional(),
  byMonthDay: z.coerce.number().int().min(-1).max(31).optional(),
  byMonth: z.coerce.number().int().min(1).max(12).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  maxOccurrences: z.coerce.number().int().min(1).optional(),
});
```

---

## 8. Integrasi dengan Route Todos yang Ada

Di `src/routes/todos.ts`:

- **POST `/`**: setelah insert todo, jika `isRecurring=1` dan body memuat `repeat`,
  insert `repeatTasks` (hitung `startDate`/`nextRunDate` via `computeFirstRun`) lalu
  generate occurrence pertama agar langsung muncul.
- **PUT `/:id`**: jika `isRecurring` toggled / `repeat` berubah → upsert atau
  non-aktifkan `repeatTasks` yang sesuai.
- **DELETE `/:id`**: cascade sudah menghapus `repeatTasks` & `todoRepeatHistories`
  (FK `onDelete: cascade`), jadi aman.
- `formatRow()`: sertakan ringkasan `repeat` (next run, type) bila ada.

> ⚠️ Sebelum mengubah `formatRow`, `buildSelectQuery`, `POST /`, `PUT /:id`,
> jalankan `gitnexus_impact({target:"<symbol>", direction:"upstream"})` (sesuai
> aturan repo) dan laporkan blast radius.

---

## 9. Frontend (repo `/Users/macbookairm1/project/v-auto-frontend`)

### Kondisi saat ini
- `src/lib/api/todos.ts` — sudah punya field `isRecurring` di `Todo`/`TodoCreatePayload`/
  `TodoUpdatePayload`, **tapi belum ada fungsi repeat/occurrence**.
- `src/routes/todos/admin/todo-form-dialog.svelte` — **belum ada UI recurring**;
  `handleSave()` hardcode `type: 3` dan tidak pernah mengirim `isRecurring`.
- `src/routes/todos/admin/helper-and-state.svelte.ts` — state pakai rune `$state`,
  ada pola **debounced inline update** (`debouncedInlineUpdate`) dan tab `'mine' | 'all'`.
- `src/routes/todos/admin/columns.ts` + `+page.svelte` — tempat render badge/cell.

### Yang perlu ditambah
1. **`src/lib/api/todos.ts`**: tambah interface `TodoRepeat`, `TodoOccurrence`, dan fungsi
   `getTodoRepeat(id)`, `setTodoRepeat(id, payload)`, `deleteTodoRepeat(id)`,
   `getOccurrences(id, params)`, `updateOccurrence(occId, payload)`. Ikuti pola `apiFetch`/`post`/`put`/`del` yang sudah ada.
2. **`todo-form-dialog.svelte`**: tambah blok **"Berulang"** (mengikuti pola `Select`/`Popover`
   + responsive Drawer mobile yang sudah dipakai komponen lain di file ini):
   - Toggle/Switch "Berulang" → set `isRecurring`.
   - `Select` tipe: **Harian / Mingguan / Bulanan / Tahunan**.
   - Input `interval` (tiap N …).
   - Mingguan → pilih hari (Min–Sab). Bulanan → input tanggal + preset **"Awal bulan"** (=1) & **"Akhir bulan"** (=−1).
   - Tanggal mulai (reuse `Calendar` `fStartDate`) & tanggal selesai opsional.
   - Di `handleSave()`: bila berulang, sertakan `isRecurring: 1` + objek `repeat` di payload create
     (atau panggil `setTodoRepeat` setelah create bila pakai endpoint terpisah).
   > Catatan: dialog ini membuat **beberapa task sekaligus** — putuskan apakah repeat
   > berlaku per-task atau hanya saat 1 task (rekomendasi: nonaktifkan multi-task saat "Berulang" aktif).
3. **`todo-edit-dialog.svelte`**: tampilkan & izinkan ubah aturan repeat (panggil `getTodoRepeat`/`setTodoRepeat`).
4. **`columns.ts` / `+page.svelte`**: badge 🔁 untuk row dengan `isRecurring=1`; opsional
   tampilkan "next run". Occurrence dicentang selesai via `updateOccurrence` (pakai pola
   `debouncedInlineUpdate` yang sudah ada di `helper-and-state.svelte.ts`).
5. **`helper-and-state.svelte.ts`**: tambah state/handler untuk occurrences bila board
   menampilkan occurrence (lihat Pertanyaan Terbuka §12.2).

---

## 10. Edge Cases & Risiko

| Kasus | Penanganan |
|------|-----------|
| Cron mati beberapa hari | Catch-up loop generate semua occurrence tertinggal sekaligus |
| Cron jalan dobel | Unique `(repeatTaskId, occurrenceDate)` → duplikat ditolak |
| `byMonthDay=31` di bulan Feb | Clamp ke hari terakhir bulan |
| "Awal bulan" | `byMonthDay=1`; "akhir bulan" → `byMonthDay=-1` |
| DST / geser tanggal | Semua hitung di `Asia/Jakarta` (tanpa DST) — aman |
| Template diubah setelah occurrence lama dibuat | Occurrence lama **tidak** ikut berubah (snapshot); hanya occurrence baru pakai nilai baru |
| Hapus todo template | FK cascade hapus repeat + histories (occurrence ikut hilang) — konfirmasi ke product apakah ini diinginkan vs soft-stop |
| `endDate`/`maxOccurrences` tercapai | Set `repeatTasks.status=1`, `nextRunDate=null` |

---

## 11. Fase Implementasi (checklist)

**Fase 1 — Schema & migrasi** ✅
- [x] Perkaya `repeatTasks` + tambah `occurrenceDate`/unique di `todoRepeatHistories` di `schema.ts`
- [x] Tulis `drizzle/0029_add_recurring_todo_fields.sql` & terapkan (add-nullable→backfill→NOT NULL karena tabel berisi)

**Fase 2 — Logika inti** ✅
- [x] `src/utils/recurrence.ts` (`computeFirstRun`, `computeNextRun`, `todayJakarta`) — terverifikasi via skrip uji

**Fase 3 — Generator** ✅
- [x] `src/jobs/recurringTodos.ts` (`runRecurringTodoGeneration` + `generateOccurrencesForTask`)
- [x] `scripts/run-recurring-todos.ts` + script `job:recurring-todos` di `package.json`
- [x] Cron 06:00 WIB didokumentasikan di README

**Fase 4 — API** ✅
- [x] Endpoint repeat & occurrences di `src/routes/todos.ts`
- [x] Integrasi POST/PUT todo dgn repeatTasks (+ `attachActiveRepeat` di list)
- [x] Kode baru type-clean (sisa error `todos.ts` = pre-existing string→Date)

**Fase 4b — Frontend** ✅
- [x] `lib/api/todos.ts`: tipe + fungsi repeat/occurrence
- [x] `repeat-fields.svelte` + `repeat-helpers.ts` (preview & label)
- [x] Form & edit dialog: blok "Berulang"
- [x] `columns.ts`: badge cadence + aksi "Lihat Occurrences"
- [x] `occurrences-dialog.svelte` + wiring di `+page.svelte`

**Fase 5 — Verifikasi** ✅
- [x] E2E generator: catch-up 6 occurrence + idempotensi (run ulang 0 baru)
- [x] E2E HTTP (`app.request`): POST recurring, GET/PUT/DELETE repeat, GET/PUT occurrences
- [ ] (Opsional) Unit test vitest untuk `recurrence.ts`
- [ ] Uji UI manual di browser + commit

---

## 12. Pertanyaan Terbuka

1. **Hapus template**: occurrence lama ikut terhapus (cascade) — apakah OK, atau
   sebaiknya soft-stop (occurrence tetap ada)?
2. **Tampilan board**: occurrence ditampilkan di list `/todos` utama (perlu union
   query), atau hanya di tab "Berulang" terpisah?
3. **Reminder**: cukup pakai `runTodoReminders()` yang ada untuk occurrence, atau
   perlu reminder khusus per occurrence?
4. **Generate ke depan**: hanya saat jatuh tempo (hemat), atau pre-generate N
   occurrence ke depan supaya kelihatan di kalender?
