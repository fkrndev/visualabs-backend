# Manage Skill — Lokal + Team Skill Hub

**Status:** ✅ Fase 0–2 terimplementasi 5 Agustus 2026 · belum di-deploy · Fase 3 belum · lihat [§11](#11-hasil-implementasi)
**Tujuan:** tim bisa **berbagi skill antar orang**, **mengedit skill di komputernya sendiri**, dan tahu **skill mana yang paling berguna** lewat rating + angka pemakaian nyata.
**Repo terkait:** `v-auto-backend` (registry + API), `v-auto-frontend` (UI di modal Agent Tools), `custom-hermes` (dua tambahan kecil — lihat §3.1 dan §11.2)
**Dokumen terkait:** [run.md](run.md) (alur relay), [install-hermes.md](install-hermes.md) (distribusi agent)

---

## 1. Bentuk akhir yang dituju

Di modal **Agent Tools** (`/agent` → Tools) muncul tab ketiga **Team Hub**, berdampingan dengan Skills dan MCP Servers:

```
┌ Agent Tools ─────────────────────────────────────────────────┐
│  Skills          │  Team Hub                    ⌕ cari  ⇅ urut │
│  MCP Servers     │  ┌────────────────────────────────────────┐ │
│  Team Hub  ←baru │  │ scrape-marketplace      ★4.6 (12)      │ │
│                  │  │ oleh Budi · 34× dipakai · 8 terpasang  │ │
│                  │  │ [ Pasang ]  [ Lihat ]  [ Beri rating ] │ │
│                  │  ├────────────────────────────────────────┤ │
│                  │  │ laporan-harian-fb       ★4.1 (7)       │ │
│                  │  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Tiga alur inti:

1. **Bagikan** — pilih skill di komputer sendiri → unggah ke Team Hub → rekan bisa pasang.
2. **Pasang** — ambil skill orang lain dari Team Hub → tertulis ke `~/.hermes/skills/` sendiri.
3. **Edit** — ubah SKILL.md milik sendiri langsung dari VIMS, tanpa buka Terminal.

Plus dua sinyal kualitas: **rating** (dinilai manusia) dan **usage** (angka pemakaian nyata dari mesin masing-masing).

---

## 2. Kondisi sekarang — separuh jalan sudah ada

Penting dibaca dulu supaya tidak membangun ulang yang sudah jalan.

### Sudah ada dan terpakai

| Lapisan | Yang tersedia |
|---|---|
| Hermes (lokal) | `GET /api/skills` · `PUT /api/skills/toggle` · `GET /api/skills/content` · `POST /api/skills` · `PUT /api/skills/content` |
| Relay (backend) | Semua endpoint di atas sudah diproksi: `/api/relay/skills/:nodeId[/content\|/toggle]` — lihat [src/routes/relay.ts:233-290](../../src/routes/relay.ts#L233-L290) |
| VIMS (UI) | `SkillsPanel.svelte`: daftar, toggle on/off, cari di Hub publik, install, uninstall, **buat skill baru** |

### Belum ada

| Kebutuhan | Kondisi |
|---|---|
| **Edit skill lokal dari UI** | Endpoint `GET`/`PUT /api/skills/content` **sudah ada dan sudah diproksi**, tapi `SkillsPanel` tidak pernah memanggilnya. Ini murni pekerjaan UI. |
| Registry skill milik tim | Belum ada sama sekali |
| Rating | Belum ada |
| Usage lintas anggota | Angkanya **sudah dihitung Hermes** per mesin (lihat §2.1), tapi tidak pernah dikumpulkan |

### 2.1 Usage sudah dihitung, tinggal dikumpulkan

Hermes menyimpan `~/.hermes/skills/.usage.json`, satu record per skill:

```json
{ "scrape-marketplace": { "use_count": 34, "view_count": 12, "patch_count": 2,
                          "last_used_at": "2026-08-04T09:12:00Z" } }
```

`GET /api/skills` sudah mengembalikan field `usage` = `activity_count()` = **jumlah** `use_count + view_count + patch_count`. Jadi angka pemakaian tidak perlu dibuat dari nol — cukup dilaporkan ke server.

⚠️ Karena penjumlahan itu, `usage` yang sekarang **bukan** "berapa kali dipakai" murni; sekadar membuka skill ikut menaikkannya. Untuk ranking "skill terbaik" sebaiknya kirim ketiga angka mentahnya, bukan totalnya, lalu server yang memutuskan bobot.

### 2.2 Anatomi skill di disk

```
~/.hermes/skills/<kategori>/<nama>/SKILL.md      # berkategori
~/.hermes/skills/<nama>/SKILL.md                 # datar, tanpa kategori
```

`SKILL.md` diawali frontmatter YAML:

```yaml
---
name: yuanbao
description: "Yuanbao (元宝) groups: @mention users, query info/members."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [yuanbao, mention, at, group]
    related_skills: []
---
```

Batas keras dari `tools/skill_manager_tool.py`: **`MAX_SKILL_CONTENT_CHARS = 100_000`**. Ini menentukan tipe kolom database (§4).

Provenance ditentukan `GET /api/skills` dengan urutan `hub` > `bundled` > `agent`; `hub` dibaca dari `~/.hermes/skills/.hub/lock.json`, `bundled` dari manifest skill bawaan. Konsekuensinya ada di §8.2.

---

## 3. Keputusan arsitektur

### 3.1 `custom-hermes` tidak dipatch

Godaan yang wajar: `tools/skills_hub.py` punya abstraksi `SkillSource` dan `create_source_router()`, jadi Team Hub bisa dijadikan sumber ke-11 supaya muncul di UI Hub bawaan. **Ditolak.**

- `create_source_router()` mengembalikan **list yang di-hardcode**, bukan dibaca dari config. Menambah sumber = mengubah kode fork, dan setiap sinkronisasi dengan upstream harus mempertahankan perubahan itu.
- Keuntungannya semu: UI Hub bawaan tetap perlu diubah agar tahu soal rating dan uploader.
- Semua yang dibutuhkan **sudah tersedia sebagai HTTP endpoint** (`GET /api/skills/content` untuk mengambil, `POST /api/skills` untuk memasang). Fitur ini bisa jadi utuh tanpa satu baris pun di `custom-hermes`.

Ini melanjutkan keputusan yang sama di [install-hermes.md](install-hermes.md): fork tetap bersih supaya sinkronisasi upstream tidak menyakitkan.

> **Catatan setelah implementasi.** Keputusan "tidak menambah sumber ke `skills_hub.py`" tetap
> berlaku dan tidak dilanggar. Tapi klaim "nol baris di `custom-hermes`" **tidak bertahan**: §8.1
> dan §8.4 masing-masing membutuhkan satu field tambahan di respons yang sudah ada. Dua-duanya
> aditif dan tidak mengubah perilaku apa pun — rinciannya di §11.2.

### 3.2 Konten skill disimpan di database, bukan sebagai berkas

SKILL.md adalah teks ≤100.000 karakter. Menyimpannya di kolom menghindari seluruh urusan penyimpanan berkas, backup terpisah, dan `HERMES_DIST_DIR` kedua. Pencarian judul/deskripsi juga jadi query biasa.

Kolomnya **wajib `mediumtext`**, bukan `text` — `text` di MySQL hanya 65.535 byte, sedangkan batas Hermes 100.000 karakter (bisa >65 KB pada teks non-ASCII). Salah pilih tipe = skill panjang terpotong diam-diam.

### 3.3 Usage dilaporkan node, tidak dihitung server

Server tidak pernah melihat agent bekerja — pemakaian skill hanya terjadi di mesin user. Jadi angkanya harus dikirim dari sana. Pelaporan menumpang momen yang sudah ada: **saat user membuka modal Agent Tools**, frontend sudah memanggil `GET /api/relay/skills/{node}` yang balasannya memuat `usage`. Kirim ulang itu ke backend dalam satu request bulk.

Tidak perlu daemon, tidak perlu polling ke setiap node, tidak perlu endpoint baru di Hermes. Konsekuensinya angka bersifat *eventually consistent* — orang yang tidak pernah membuka modal tidak menyumbang data. Untuk keperluan "skill mana yang berguna", itu cukup.

### 3.4 Install = tulis ulang, bukan symlink atau sync

Memasang skill dari Team Hub = `POST /api/skills` dengan konten dari registry. Setelah itu **salinan lokal berdiri sendiri**: user bebas mengeditnya, dan perubahan di registry tidak menimpanya diam-diam. Pembaruan ditangani eksplisit (§7 Fase 3), bukan otomatis — skill adalah instruksi yang dieksekusi agent, menimpanya tanpa sepengetahuan user adalah cara cepat merusak alur kerja orang.

---

## 4. Model data

Migrasi berikutnya: **`drizzle/0043_add_team_skills.sql`** (terakhir `0042`). Ikuti konvensi `src/db/schema.ts`: `int` autoincrement PK, `snake_case` nama kolom, `created_at`/`updated_at` dengan `defaultNow()`/`onUpdateNow()`.

`decimal` dan `uniqueIndex` sudah ada di blok import `src/db/schema.ts`; **`mediumtext` belum** — perlu ditambahkan (yang terpakai sekarang `longtext` dan `text`). Ketiganya tersedia di `drizzle-orm/mysql-core` versi yang terpasang.

```ts
// src/db/schema.ts

export const teamSkills = mysqlTable('team_skills', {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),          // = frontmatter `name`
    category: varchar('category', { length: 100 }),            // null = datar
    description: varchar('description', { length: 500 }),      // dari frontmatter
    version: varchar('version', { length: 32 }),
    tags: json('tags').$type<string[]>(),
    content: mediumtext('content').notNull(),                  // SKILL.md utuh — lihat §3.2
    contentHash: varchar('content_hash', { length: 64 }).notNull(), // sha256, deteksi perubahan
    authorUserId: int('author_user_id').notNull().references(() => users.id),
    status: varchar('status', { length: 20 }).default('published').notNull(), // draft|published|archived
    installCount: int('install_count').default(0).notNull(),
    ratingAvg: decimal('rating_avg', { precision: 3, scale: 2 }).default('0'),
    ratingCount: int('rating_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (t) => ({ nameIdx: uniqueIndex('team_skills_name_unique').on(t.name) }));

export const teamSkillRatings = mysqlTable('team_skill_ratings', {
    id: int('id').autoincrement().primaryKey(),
    skillId: int('skill_id').notNull().references(() => teamSkills.id, { onDelete: 'cascade' }),
    userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    rating: int('rating').notNull(),                           // 1..5, divalidasi zod
    comment: varchar('comment', { length: 1000 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (t) => ({ oneEach: uniqueIndex('team_skill_ratings_unique').on(t.skillId, t.userId) }));

export const teamSkillUsage = mysqlTable('team_skill_usage', {
    id: int('id').autoincrement().primaryKey(),
    skillId: int('skill_id').notNull().references(() => teamSkills.id, { onDelete: 'cascade' }),
    userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    useCount: int('use_count').default(0).notNull(),           // angka MENTAH dari .usage.json
    viewCount: int('view_count').default(0).notNull(),
    patchCount: int('patch_count').default(0).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    reportedAt: timestamp('reported_at').defaultNow().onUpdateNow().notNull(),
}, (t) => ({ oneEach: uniqueIndex('team_skill_usage_unique').on(t.skillId, t.userId) }));
```

Catatan desain:

- **`unique(name)`** karena `POST /api/skills` di Hermes menolak nama yang bentrok lintas direktori. Dua skill senama di registry = jebakan yang pasti gagal saat dipasang.
- **`rating_avg`/`rating_count` didenormalisasi** supaya pengurutan "paling bagus" tidak butuh agregasi tiap request; dihitung ulang di dalam transaksi setiap rating masuk/berubah.
- **`unique(skill_id, user_id)`** di dua tabel: satu orang satu rating (boleh diubah), dan usage di-*upsert* per orang — bukan ditambahkan — karena `.usage.json` menyimpan **total kumulatif**, bukan delta. Salah pakai `+=` di sini menggandakan angka setiap kali modal dibuka.
- **`content_hash`** membuat "apakah salinan lokal masih sama dengan registry?" jadi perbandingan murah, tanpa mengirim konten.

---

## 5. API backend

Berkas baru `src/routes/teamSkills.ts`, di-mount di [src/index.ts](../../src/index.ts) sebagai `app.route("/team-skills", teamSkillRoutes)` — **wajib sebelum `app.route("/", ...)`**, mengikuti jebakan middleware wildcard yang sudah terdokumentasi di [install-hermes.md](install-hermes.md).

Semua di balik `requireAuthWithFallback`.

| Method | Path | Guna |
|---|---|---|
| `GET` | `/api/team-skills` | Daftar + cari (`q`) + urut (`sort=rating\|usage\|installs\|recent`) + `category`. Tanpa `content` supaya ringan. |
| `GET` | `/api/team-skills/:id` | Detail + `content` + apakah user sudah memberi rating |
| `POST` | `/api/team-skills` | Unggah skill baru. Body `{ name, category, content }`; server mem-parse frontmatter untuk `description`/`version`/`tags`. |
| `PUT` | `/api/team-skills/:id` | Perbarui (author atau admin). Menaikkan `version`, memperbarui `content_hash`. |
| `DELETE` | `/api/team-skills/:id` | `status = archived` (soft) — jangan hard-delete, riwayat rating/usage ikut hilang. |
| `POST` | `/api/team-skills/:id/rating` | Upsert rating user, hitung ulang `rating_avg`/`rating_count` dalam satu transaksi |
| `GET` | `/api/team-skills/:id/ratings` | Daftar rating + komentar + nama pemberi |
| `POST` | `/api/team-skills/:id/installed` | Tanda "sudah terpasang di mesin saya" → `install_count++` |
| `POST` | `/api/team-skills/usage/report` | Bulk upsert usage: `[{ name, useCount, viewCount, patchCount, lastUsedAt }]` |

**Validasi di sisi server yang tidak boleh dilewat** (jangan hanya andalkan validasi Hermes — request bisa datang dari mana saja):

1. `content.length <= 100_000` — cocokkan dengan `MAX_SKILL_CONTENT_CHARS`, supaya skill tidak lolos ke registry lalu ditolak saat dipasang.
2. Frontmatter wajib ada dan memuat `name`; `name` di frontmatter **harus** sama dengan `name` di body.
3. `name` cocok `^[a-z0-9][a-z0-9-]{1,63}$` — nama ini jadi nama direktori di mesin orang lain.
4. `rating` integer 1–5.

---

## 6. Alur

### 6.1 Bagikan skill lokal → Team Hub

```
FE  GET  /api/relay/skills/{node}                → daftar skill lokal, user pilih satu
FE  GET  /api/relay/skills/{node}/content?name=X → SKILL.md mentah
FE  POST /api/team-skills { name, category, content }
BE       parse frontmatter → simpan + sha256
```

Frontend menyaring pilihan: skill ber-provenance `bundled` tidak perlu dibagikan (semua orang sudah punya dari tarball), jadi tawarkan hanya `agent` dan `hub`.

### 6.2 Pasang skill dari Team Hub

```
FE  GET  /api/team-skills/:id                    → content
FE  POST /api/relay/skills/{node} { name, content, category }
         → Hermes _create_skill(): validasi frontmatter, cek tabrakan nama, tulis SKILL.md
FE  POST /api/team-skills/:id/installed          → install_count++
```

Kalau Hermes membalas 400 karena nama bentrok, tampilkan pilihan **Timpa** (`PUT /api/skills/content`) atau **Batal** — jangan diam-diam menimpa.

### 6.3 Edit skill lokal (bisa dikerjakan lebih dulu, berdiri sendiri)

```
FE  GET /api/relay/skills/{node}/content?name=X  → isi editor
FE  PUT /api/relay/skills/{node}/content { name, content }
```

Kalau skill itu berasal dari Team Hub dan `content_hash` lokal ≠ registry, tawarkan **"Kirim perubahan ke Team Hub"** → `PUT /api/team-skills/:id`.

### 6.4 Rating

`POST /api/team-skills/:id/rating { rating: 1..5, comment? }`. Upsert; `rating_avg` dan `rating_count` dihitung ulang dalam transaksi yang sama supaya tidak melenceng saat dua orang menilai bersamaan.

Pertimbangan: **hanya izinkan menilai skill yang sudah pernah dipasang** oleh user itu (ada barisnya di `team_skill_usage`). Tanpa ini rating jadi opini tanpa pengalaman, dan sinyal "skill terbaik" jadi tidak berarti.

### 6.5 Laporan usage

Saat `SkillsPanel` selesai memuat daftar (`GET /api/relay/skills/{node}`), kirim satu request:

```
POST /api/team-skills/usage/report
[{ name: "scrape-marketplace", useCount: 34, viewCount: 12, patchCount: 2, lastUsedAt: "..." }]
```

Server mencocokkan `name` ke `team_skills`, mengabaikan yang tidak dikenal, lalu **upsert** (ganti nilai, bukan tambah — lihat §4).

⚠️ Prasyarat: `GET /api/skills` sekarang hanya mengembalikan `usage` sebagai satu angka gabungan. Untuk mengirim tiga angka mentah, frontend perlu ketiganya. **Ini satu-satunya titik yang mungkin memaksa menyentuh `custom-hermes`** (menambahkan `usage_detail` di respons). Alternatif tanpa patch: kirim angka gabungan saja dan terima ranking yang lebih kasar. Keputusan ini ditunda ke Fase 2 — lihat §8.1.

---

## 7. Fase

### Fase 0 — Edit skill lokal (½ hari)

Paling murah dan langsung terasa: endpoint dan proksinya **sudah ada**, tinggal UI.

- Tombol **Edit** per skill di `SkillsPanel` → dialog dengan textarea + tombol Simpan.
- Muat via `GET /api/relay/skills/{node}/content`, simpan via `PUT`.
- Tampilkan error validasi frontmatter dari Hermes apa adanya — pesannya sudah jelas.

Tidak bergantung pada fase lain. Bisa langsung dirilis.

### Fase 1 — Registry (2–3 hari)

- Migrasi `0043` + `teamSkills` di schema.
- `src/routes/teamSkills.ts`: list, detail, create, update, archive.
- Tab **Team Hub** di modal: daftar, cari, tombol Pasang.
- Tombol **Bagikan** di tab Skills.
- Belum ada rating/usage; urut berdasarkan `install_count` dan tanggal.

### Fase 2 — Rating + usage (1–2 hari)

- Tabel `teamSkillRatings` + `teamSkillUsage`, endpoint rating dan report.
- Bintang + jumlah penilai di kartu; urut `sort=rating|usage`.
- Pelaporan usage menumpang pemuatan daftar skill.
- Putuskan dulu soal `usage_detail` di §6.5.

### Fase 3 — Pembaruan & moderasi (menyusul)

- Bandingkan `content_hash` lokal vs registry → tanda "ada versi baru".
- Riwayat versi (`team_skill_versions`) supaya bisa dikembalikan.
- Alur tinjauan sebelum `status = published` — lihat §8.3.

---

## 8. Risiko & keputusan yang masih terbuka

### 8.1 `usage` yang dikembalikan Hermes sudah tergabung

`GET /api/skills` mengembalikan `activity_count()` = `use_count + view_count + patch_count`. Sekadar **membuka** skill menaikkannya, jadi ranking "paling berguna" akan mengangkat skill yang sering dilihat, bukan yang sering dipakai.

Pilihan:
1. Terima — ranking kasar, nol perubahan di `custom-hermes`.
2. Tambahkan `usage_detail: {use, view, patch}` di respons `GET /api/skills` (≈5 baris di `web_server.py`) — melanggar aturan "jangan patch fork", tapi perubahannya kecil dan aditif.

**Rekomendasi:** ambil opsi 2 saat masuk Fase 2. Perubahannya satu field tambahan, tidak mengubah perilaku apa pun, dan konflik saat merge upstream nyaris nol — jauh lebih murah daripada mengunci ranking pada angka yang salah arti.

### 8.2 Skill dari Team Hub akan berlabel "agent", bukan "Hub"

Provenance `hub` dibaca dari `~/.hermes/skills/.hub/lock.json` yang hanya diisi Skills Hub bawaan. Karena kita memasang lewat `POST /api/skills`, skill tim akan terklasifikasi `agent` dan muncul dengan badge yang keliru di daftar.

Pilihan: (a) terima dan tandai dari sisi VIMS dengan mencocokkan nama ke registry — **cukup, dan tidak menyentuh Hermes**; (b) ikut menulis ke `lock.json` — rapuh, formatnya milik upstream.

**Rekomendasi:** (a).

### 8.3 Skill adalah instruksi yang dieksekusi agent — ini permukaan serangan, bukan sekadar dokumen

Ini risiko paling serius di seluruh rencana, dan gampang terlewat karena SKILL.md "cuma markdown". Isinya masuk ke prompt agent yang punya akses terminal, berkas, dan browser di laptop orang lain. Satu skill keliru — apalagi jahat — menyebar ke seluruh tim lewat tombol Pasang.

Minimal yang harus ada sebelum dibuka ke tim:

- Tampilkan **isi lengkap SKILL.md** sebelum memasang, jangan sekadar deskripsi. User harus bisa membaca apa yang dia pasang.
- Tampilkan **siapa pengunggahnya** dan kapan; jangan pernah anonim.
- Pertimbangkan `status = draft` sebagai default, dan hanya admin/head yang bisa `published`. Untuk tim kecil ini mungkin berlebihan — tapi keputusannya harus diambil sadar, bukan kelewat.

Yang **tidak** boleh: auto-install, auto-update, atau memasang tanpa konfirmasi.

### 8.4 Skill multi-berkas tidak didukung

`_create_skill` hanya menulis `SKILL.md`. Skill yang membawa script atau berkas rujukan akan terpasang **sebagian** — dan gagalnya senyap: skill muncul di daftar, tapi rusak saat dipakai.

Mitigasi Fase 1: saat mengunggah, hitung berkas di direktori skill; kalau lebih dari satu, tolak dengan pesan jelas. Kedua contoh skill yang diperiksa (`computer-use`, `yuanbao`) hanya berisi `SKILL.md`, jadi batasan ini kemungkinan besar tidak mengganggu — tapi jangan sampai ketahuan belakangan.

Catatan: `GET /api/skills/content` **hanya membaca `SKILL.md`**, jadi frontend tidak punya cara melihat berkas lain. Deteksi multi-berkas perlu jalan lain (mis. field `path` yang sudah dikembalikan endpoint itu, lalu tanya Hermes) — atau diterima sebagai batasan yang tidak terverifikasi di Fase 1.

### 8.5 Node harus online

Semua operasi lokal (ambil isi, pasang, edit, laporkan usage) lewat relay. Node offline → relay balas `503 node offline`. UI harus menampilkan itu sebagai keadaan yang wajar ("nyalakan VBOX dulu"), bukan error merah — arahkan ke [/agent/install](../../../v-auto-frontend/src/routes/agent/install/+page.svelte).

Konsekuensi lain: **daftar Team Hub tetap bisa dibuka saat node offline** (datanya di server), hanya tombol Pasang yang dinonaktifkan. Pisahkan dua keadaan ini, jangan mematikan seluruh tab.

---

## 9. Yang sengaja tidak dikerjakan

- **Sinkronisasi otomatis** skill ke semua anggota. Bertentangan dengan §3.4 dan §8.3.
- **Menjadikan Team Hub sumber ke-11 di `skills_hub.py`.** Alasan di §3.1.
- **Berbagi konfigurasi MCP server.** Kebutuhan yang mirip tapi masalahnya beda — MCP membawa kredensial per orang (token OAuth, API key), jadi tidak bisa disalin mentah antar mesin. Butuh rencana sendiri.
- **Fork/turunan skill.** Untuk ukuran tim sekarang, satu skill satu pemilik + riwayat versi sudah cukup.

---

## 10. Berkas yang akan disentuh

| Repo | Berkas | Sifat |
|---|---|---|
| v-auto-backend | `src/db/schema.ts` | +3 tabel |
| v-auto-backend | `drizzle/0043_add_team_skills.sql` | baru |
| v-auto-backend | `src/routes/teamSkills.ts` | baru |
| v-auto-backend | `src/index.ts` | mount `/team-skills` sebelum route `"/"` |
| v-auto-frontend | `src/lib/components/agent/SkillsPanel.svelte` | + Edit, + Bagikan, + lapor usage |
| v-auto-frontend | `src/lib/components/agent/TeamHubPanel.svelte` | baru |
| v-auto-frontend | `src/lib/components/agent/AgentToolsModal.svelte` | + tab Team Hub — perluas union `activeTab: 'skills' \| 'mcp'` dan array `tabs`, lalu satu cabang `{#if}` baru. Perubahan kecil dan terkurung. |
| custom-hermes | `hermes_cli/web_server.py` | **hanya jika** §8.1 opsi 2 diambil |

---

## 11. Hasil implementasi

Dikerjakan 5 Agustus 2026. **Fase 0, 1, dan 2 selesai; Fase 3 belum.**

### 11.1 Keputusan terbuka — yang akhirnya diambil

| Butir | Pilihan yang diambil |
|---|---|
| §8.1 usage tergabung | **Opsi 2** — `GET /api/skills` sekarang juga mengembalikan `usage_detail` berisi angka mentah. Ranking `sort=usage` memakai `use_count` saja, bukan totalan. |
| §8.2 provenance salah label | **Opsi (a)** — VIMS mencocokkan nama skill lokal ke registry dan menampilkan badge **"Tim"**; `.hub/lock.json` tidak disentuh. |
| §8.3 keamanan | Isi penuh SKILL.md ditampilkan sebelum tombol Pasang, nama pengunggah selalu terlihat, tidak ada auto-install/auto-update. **Alur review admin belum dibuat** — `status` default `published`. |
| §8.4 skill berkas jamak | Ditolak di dialog Bagikan, memakai `extra_file_count` yang kini dikembalikan `GET /api/skills/content`. Tombol Unggah mati kalau > 0. |
| §6.4 siapa boleh menilai | Hanya yang punya baris di `team_skill_usage` (yaitu sudah pernah memasang). Kalau belum, API balas 403 dengan pesan yang jelas. |

### 11.2 Perubahan di `custom-hermes`

Dua tambahan aditif di `hermes_cli/web_server.py`, tidak mengubah perilaku yang sudah ada:

1. `GET /api/skills` → field baru `usage_detail: {use, view, patch, last_used_at}` di samping `usage` yang lama. Tanpa ini peringkat "paling sering dipakai" ikut menghitung sekadar-dibuka.
2. `GET /api/skills/content` → field baru `extra_file_count`, jumlah berkas selain `SKILL.md` di direktori skill. Tanpa ini tidak ada cara mendeteksi skill berkas jamak dari sisi VIMS, dan skill akan tersalin dalam keadaan rusak tanpa peringatan.

✅ **Sudah tersalur (10 Agu 2026).** Tarball commit `146b9aaa4a23` terpasang di produksi, `/api/hermes/manifest` membalas 200. Sebelum ini `storage/hermes/` di server kosong — lihat [install-hermes.md §7](install-hermes.md) untuk kenapa tarball harus dibuat di mesin dev dulu, bukan di server.

Sampai seseorang memasang/memperbarui agent-nya, mesin yang masih memakai Hermes lama tetap jalan tapi terdegradasi: peringkat usage memakai angka gabungan, dan penjaga berkas-jamak tidak aktif (`extra_file_count` undefined → dianggap 0). Dua-duanya gagal dengan aman, bukan error.

### 11.3 Yang dibangun

**v-auto-backend**
- `src/db/schema.ts` — `teamSkills`, `teamSkillRatings`, `teamSkillUsage` + relations; `mediumtext` ditambahkan ke blok import.
- `drizzle/0043_add_team_skills.sql` — 13 statement.
- `src/routes/teamSkills.ts` — 9 endpoint, parser frontmatter kecil (tanpa dependensi YAML baru), `recalcRating()` transaksional.
- `src/index.ts` — mount `/team-skills` sebelum route `"/"`.

**v-auto-frontend**
- `SkillsPanel.svelte` — tombol **Edit** (dialog SKILL.md), tombol **Bagikan**, badge "Tim", laporan usage otomatis saat daftar dimuat.
- `TeamHubPanel.svelte` (baru) — daftar + cari + 4 urutan, dialog detail berisi isi penuh, pasang, penanganan tabrakan nama, rating bintang + komentar, arsipkan.
- `AgentToolsModal.svelte` — tab ketiga **Team Hub**.

### 11.4 Verifikasi yang dijalankan

| Uji | Hasil |
|---|---|
| `bun build src/index.ts` | ✅ 876 modul, tanpa error |
| `tsc --noEmit` pada berkas baru | ✅ nol error di `teamSkills.ts` / `schema.ts` / `index.ts` (project punya 1062 error lama di berkas lain — bukan dari perubahan ini) |
| `npm run build` frontend | ✅ Team Hub masuk bundle |
| Migrasi `0043` di DB lokal | ✅ 3 tabel dibuat, `content` benar bertipe `mediumtext` |
| Upload tanpa frontmatter | ✅ 400 |
| Nama frontmatter ≠ nama skill | ✅ 400 |
| Upload valid → frontmatter terparse | ✅ `description`, `version: 1.2.0`, `tags: [uji, coba, demo]` benar |
| Upload nama duplikat | ✅ 409 |
| Rating sebelum pasang | ✅ 403 |
| Rating sesudah pasang | ✅ `rating_avg` jadi `4.00`, `rating_count` 1 |
| Rating di luar 1–5 | ✅ 400 |
| **Laporan usage dikirim dua kali** | ✅ tetap 34 — upsert, tidak berlipat |
| Nama yang bukan skill tim di laporan | ✅ diabaikan (`matched: 1` dari 2 kiriman) |
| `POST /installed` dua kali | ✅ `install_count` tetap 1 |
| Arsipkan | ✅ hilang dari daftar |
| Hapus baris skill | ✅ rating & usage ikut terhapus (cascade) |

Data uji sudah dibersihkan; tabel kembali kosong.

### 11.5 Sisa pekerjaan

- **Fase 3 belum:** perbandingan `content_hash` lokal vs registry ("ada versi baru"), tabel `team_skill_versions`, dan alur tinjauan sebelum `published`. Kolom `content_hash` dan `status` sudah ada, jadi tinggal dipakai.
- **Migrasi belum jalan di server produksi** — baru di DB lokal.
- **Tarball Hermes perlu di-pack ulang** supaya §11.2 sampai ke mesin tim.
- `GET /api/team-skills/:id/ratings` sudah ada di backend tapi belum ditampilkan di UI — daftar komentar per skill belum kelihatan.
