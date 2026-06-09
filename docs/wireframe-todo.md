# Wireframe — Todo Recurring (ASCII)

> Pendamping [`plan-todo.md`](./plan-todo.md). Wireframe low-fidelity (ASCII)
> mengikuti layout nyata di `v-auto-frontend/src/routes/todos/admin/`.
> Legend: `[ ]` checkbox · `( )` radio · `▼` dropdown · `🔁` badge berulang · `▸/▾` expand.

---

## 1. Halaman List Todo  (`/todos/admin` — SUDAH ADA)

> Komponen nyata = `DataTable` (TanStack) gaya spreadsheet dengan **inline-edit**,
> column pinning (`select`+`title` kiri, `actions` kanan), CSV export, search API.
> Kolom **"Recurring" SUDAH ADA** (`columns.ts:254`, render "Ya"/"-"). Fitur ini
> **mengupgrade** kolom itu + menambah akses occurrences, BUKAN halaman baru.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Todos                                                            [ + Tambah Todo ] │
│  ┌ My TODOs │ All TODOs ┐                       🔍 [ Cari todo... ]   ⚙filter ⬇csv │
│  └──────────┴───────────┘                                                          │
│ ┌──┬───────────────────────┬─────────┬────────┬──────┬─────────┬──────┬─────────┬─┐│
│ │☐ │ Task          (pinned) │ Status  │ Prio   │ PIC  │Assignee │ Due  │Recurring│⋯││
│ ├──┼───────────────────────┼─────────┼────────┼──────┼─────────┼──────┼─────────┼─┤│
│ │☐ │ Cek balance akun iklan│In Prog ▼│ High ▼ │Adv ▼ │ Andi  ▼ │06Jun │🔁 Harian│⋯││
│ │☐ │ Laporan mingguan      │Not St. ▼│ Med  ▼ │CSS ▼ │ Sari  ▼ │09Jun │🔁 Mingg │⋯││
│ │☐ │ Invoice klien         │Done    ▼│ Med  ▼ │Clnt▼ │ Budi  ▼ │01Jun │🔁 Bulan │⋯││
│ │☐ │ Revisi materi (sekali)│Not St. ▼│ Low  ▼ │Adv ▼ │ Andi  ▼ │10Jun │    -    │⋯││
│ └──┴───────────────────────┴─────────┴────────┴──────┴─────────┴──────┴─────────┴─┘│
│   (kolom lain via scroll: Customer · Mulai · Platform · Tags · Sub Tasks ·         │
│    Checklist · Tipe)                              [ Muat lebih banyak ]            │
└────────────────────────────────────────────────────────────────────────────────────┘

  ⋯ menu  →  [ Copy Task ] [ Edit ] [ Lihat Occurrences ⟲ ] [ Hapus ]
  Hover sel Task → quick action: [⧉ Copy]  [👁 Open]
```

Kolom **Recurring** (existing "Ya"/"-") di-upgrade jadi badge cadence:
`🔁 Harian / Mingguan / Bulanan / Tahunan` (atau `-` bila bukan berulang).
Aksi **"Lihat Occurrences"** ditambahkan ke menu `⋯` → buka panel §4.

---

## 2. Dialog "Tambah Todo"  —  blok Berulang BARU

```
┌─ Tambah Todo ───────────────────────────────────────────────────  [ ✕ ] ─┐
│  Tambah satu atau beberapa todo sekaligus.                                 │
│                                                                            │
│  Customer ▼            Platform ▼          Assignee ▼                       │
│  [ Pilih...        ]   [ Pilih...      ]   [ Andi          ]                │
│                                                                            │
│  Tasks                                              0 / 1   [ + ]           │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ ○  [ Cek balance akun iklan________________________ ]        🗑    │    │
│  │ + Add task                                                         │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│  Status ▼          Prioritas ▼       Tanggal Mulai      Deadline           │
│  [ Not Started ]   [ Medium    ]     [ 06 Jun 2026 ]    [ Pilih tgl ]      │
│                                                                            │
│  ┌─ 🔁 Berulang ─────────────────────────────────────────────────────┐    │
│  │  [x] Jadikan task berulang                                         │    │
│  │                                                                    │    │
│  │  Ulangi ▼            Tiap                                          │    │
│  │  [ Harian      ]     [ 1 ] hari                                    │    │
│  │                                                                    │    │
│  │  ── jika "Mingguan" ───────────────────────────────────────────   │    │
│  │  Pada hari:  (S) (M) (T) (W) (T) (F) (S)                           │    │
│  │                                                                    │    │
│  │  ── jika "Bulanan" ────────────────────────────────────────────   │    │
│  │  Tanggal [ 1 ]   [ Awal bulan ] [ Akhir bulan ]                    │    │
│  │                                                                    │    │
│  │  Mulai [ 06 Jun 2026 ]      Selesai [ — opsional — ]               │    │
│  │                                                                    │    │
│  │  ⓘ Berikutnya: 07 Jun, 08 Jun, 09 Jun ...                          │    │
│  │  ⚠ Saat berulang aktif, hanya 1 task yang dibuat.                  │    │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  Deskripsi                                                                 │
│  [ rich editor ............................................. ]             │
│                                                                            │
│  Tags  [ ketik lalu Enter ] [ Tambah ]    #urgent ✕  #iklan ✕              │
│                                                                            │
│  1 task akan dibuat        [ Batal ]            [ Tambah 1 Task ]           │
└────────────────────────────────────────────────────────────────────────────┘
```

**Perilaku conditional** (di-render reaktif sesuai pilihan "Ulangi"):

```
Harian   →  [ Tiap N hari ]
Mingguan →  [ Tiap N minggu ] + pilih hari (S M T W T F S)
Bulanan  →  [ Tiap N bulan ] + Tanggal (1..31 / Awal / Akhir bulan)
Tahunan  →  [ Tiap N tahun ] + Bulan ▼ + Tanggal
```

---

## 3. Dialog "Edit Todo"  —  aturan repeat existing

```
┌─ Edit Todo ─────────────────────────────────────────────────────  [ ✕ ] ─┐
│                                                                            │
│  Title    [ Laporan mingguan_________________________________ ]            │
│  Status ▼ [ In Progress ]   Prioritas ▼ [ Medium ]                         │
│  ... (field lain sama seperti Tambah) ...                                  │
│                                                                            │
│  ┌─ 🔁 Berulang ─────────────────────────────────────────────────────┐    │
│  │  [x] Task berulang AKTIF                                           │    │
│  │  Ulangi ▼ [ Mingguan ]   Tiap [ 1 ] minggu                         │    │
│  │  Pada hari:  ( ) (M●) ( ) ( ) ( ) ( ) ( )   ← Senin                │    │
│  │  Mulai 12 Mei 2026   ·  Selesai —                                  │    │
│  │  Sudah dibuat: 4 occurrence  ·  Berikutnya: 09 Jun 2026            │    │
│  │                                                                    │    │
│  │  [ Hentikan Pengulangan ]   ← occurrence lama tetap ada            │    │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│                              [ Batal ]            [ Simpan Perubahan ]      │
└────────────────────────────────────────────────────────────────────────────┘
```

> Mengubah aturan hanya memengaruhi occurrence **baru**; occurrence lama = snapshot.

---

## 4. Panel "Occurrences"  (riwayat kemunculan task berulang)

```
┌─ 🔁 Laporan mingguan — Occurrences ──────────────────────────────  [ ✕ ] ─┐
│  Mingguan · tiap Senin · Berikutnya: 09 Jun 2026                           │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  ✓ / ○   Tanggal        Due         Status            Aksi         │    │
│  ├──────────────────────────────────────────────────────────────────┤    │
│  │  ○       09 Jun 2026    09 Jun      Not Started ▼     [ buka ]     │    │
│  │  ✓       02 Jun 2026    02 Jun      Done        ▼     [ buka ]     │    │
│  │  ✓       26 Mei 2026    26 Mei      Done        ▼     [ buka ]     │    │
│  │  ○       19 Mei 2026    19 Mei      In Progress ▼     [ buka ]     │    │
│  │  ✓       12 Mei 2026    12 Mei      Done        ▼     [ buka ]     │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                            [ Muat lebih banyak ]           │
└────────────────────────────────────────────────────────────────────────────┘
```

Centang `○ → ✓` atau ubah Status ▼ → panggil `updateOccurrence()`
(pakai pola `debouncedInlineUpdate` yang sudah ada).

---

## 5. Tampilan Mobile (Drawer) — pilih opsi "Ulangi"

```
┌─────────────────────────────┐
│  Ulangi                 [✕] │
├─────────────────────────────┤
│  ○  Harian                  │
│  ●  Mingguan                │
│  ○  Bulanan                 │
│  ○  Tahunan                 │
├─────────────────────────────┤
│         [   Batal   ]       │
└─────────────────────────────┘
```

> Konsisten dengan pola `Drawer` mobile yang sudah dipakai untuk Customer/Platform/Assignee
> di `todo-form-dialog.svelte`.

---

## 6. Peta state → payload

```
UI control                     payload field (repeat)
─────────────────────────────  ─────────────────────────────
[x] Jadikan task berulang   →  todo.isRecurring = 1
Ulangi ▼ Harian/.../Tahunan →  repeat.type      = 0/1/2/3
Tiap [N]                    →  repeat.interval  = N
Hari (mingguan)             →  repeat.byWeekday = 0..6
Tanggal / Awal / Akhir      →  repeat.byMonthDay = 1..31 / 1 / -1
Bulan ▼ (tahunan)           →  repeat.byMonth   = 1..12
Mulai                       →  repeat.startDate
Selesai (opsional)          →  repeat.endDate
```
