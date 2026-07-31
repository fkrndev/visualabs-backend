# Plan — Adopsi Fitur "Google Drive List Directory" ke v-auto

Sumber referensi: `/Users/macbookairm1/project/visualabs-backend/docs/list-dir-gdrive.md`
(implementasi asli: PHP + Google PHP SDK + Svelte legacy `_func.post` + `initTableSimple`).

Target:
- Backend: `v-auto-backend` (Bun + Hono + Drizzle + MySQL)
- Frontend: `v-auto-frontend` (SvelteKit 5 + shadcn-svelte + axios client)

Status: **SELESAI DIKERJAKAN (Fase 0–4)** — 28 Jul 2026.
Migrasi `0040` sudah di-apply ke DB yang ditunjuk `.env`. Fase 5 (mapping folder → client)
baru ada sisi backend-nya (`PATCH /drive-folders/:id/clients` + tabel `drive_folder_client`);
UI dialog-nya belum dibuat.

---

## 1. Ringkasan fitur

Menampilkan struktur folder/file Google Drive (termasuk Shared Drive) di aplikasi, dengan
pola **cache-in-DB + sync on-demand**:

1. User buka folder → backend query Google Drive API untuk isi folder itu saja.
2. Hasilnya di-upsert ke tabel lokal berdasar `google_id`.
3. Item yang hilang dari Drive dihapus dari DB (`cleanFiles` berbasis timestamp sync).
4. Backend balikin isi folder dari DB → frontend render tree/list.

Keuntungan pola ini dipertahankan: cepat (tidak full-sync), tetap konsisten dengan Drive,
dan folder bisa dikaitkan ke Client untuk kebutuhan mapping.

---

## 2. Keputusan teknis (beda dari sumber PHP)

| Aspek | Sumber (PHP) | Di v-auto | Alasan |
|---|---|---|---|
| SDK Google | `google/apiclient` | **`google-auth-library` (sudah jadi dependency di `package.json:61`) + Drive v3 REST via `fetch`** | Tidak perlu tambah paket `googleapis` yang berat — build di server pernah kena OOM. Drive `files.list` cuma 1 endpoint GET. |
| Credentials | file `worker/cdt4.json` di repo | **Env var**, bukan file di repo | `.env` sudah pola standar repo ini; file service-account tidak boleh ke-commit. |
| Routing | `action`-based single endpoint | Hono REST route (`/drive-folders`) | Ikut konvensi semua route lain. |
| Auth | admin-only / public | `requireAuth` saja — **semua staff yang login boleh akses**, tanpa role gate tambahan | Sesuai keputusan; endpoint sisi client (customer JWT) tidak dibuat dulu. |
| Frontend | `initTableSimple` + `_app_data` | SvelteKit route + `src/lib/api/*.ts` + komponen shadcn | Konvensi `v-auto-frontend`. |

---

## 3. Database

Migration baru: **`drizzle/0040_add_drive_folder.sql`** (nomor berikutnya setelah `0039_add_hr_phase8.sql`).

```sql
CREATE TABLE `drive_folder` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `parent_id` INT NOT NULL DEFAULT 0,          -- 0 = root (bukan FK, biar root gampang)
  `name` VARCHAR(512) NOT NULL,
  `drive_id` VARCHAR(128) NULL,                -- shared drive id
  `mime_type` VARCHAR(191) NOT NULL,
  `google_id` VARCHAR(191) NOT NULL,
  `parent_google_id` VARCHAR(191) NOT NULL,
  `web_view_link` VARCHAR(1024) NULL,          -- tambahan: link resmi dari Drive
  `icon_link` VARCHAR(1024) NULL,
  `size_bytes` BIGINT NULL,
  `modified_time` TIMESTAMP NULL,
  `synced_at` TIMESTAMP NOT NULL,              -- pengganti `updated_at` versi PHP (dipakai cleanFiles)
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `drive_folder_google_id_uq` (`google_id`)
);
CREATE INDEX `drive_folder_parent_idx` ON `drive_folder` (`parent_id`);
CREATE INDEX `drive_folder_parent_google_idx` ON `drive_folder` (`parent_google_id`);

CREATE TABLE `drive_folder_client` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `folder_id` INT NOT NULL,
  `customer_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `drive_folder_client_folder_fk` FOREIGN KEY (`folder_id`) REFERENCES `drive_folder`(`id`) ON DELETE CASCADE,
  CONSTRAINT `drive_folder_client_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `drive_folder_client_uq` (`folder_id`, `customer_id`)
);
```

Catatan penting:
- `client` di v-auto = tabel **`customers`**, jadi kolomnya `customer_id` (bukan `client_id`).
  Tabel `clients` yang ada sekarang milik modul HR — **jangan dipakai**.
- Beda dari sumber: `updated_at` versi PHP dipecah jadi `synced_at` (marker sync) + `updated_at`
  (audit standar), supaya tidak bentrok dengan konvensi kolom repo ini.
- `UNIQUE(google_id)` bikin upsert bisa pakai `ON DUPLICATE KEY UPDATE` — satu query, bukan
  select-lalu-insert seperti `saveItem()` di PHP.

Schema Drizzle ditambahkan di `src/db/schema.ts` mengikuti gaya `videoRequests`
(`mysqlTable` + `index()` di callback + blok `relations`).

⚠️ Migrasi **tidak** auto-apply saat deploy. Setelah merge harus manual:
`bun scripts/apply-migration.ts drizzle/0040_add_drive_folder.sql`
(dan `.env` lokal nunjuk DB production — hati-hati).

---

## 4. Backend — file yang dibuat/diubah

### 4.1 `src/utils/google/driveClient.ts` (baru)

Pengganti `UtilCurlGDrive::buildDriveService()`.

- Baca service account dari env:
  - `GOOGLE_DRIVE_SA_JSON` (isi JSON base64/raw), atau
  - `GOOGLE_DRIVE_SA_KEY_FILE` (path file di server, di luar repo).
- Sumber credential: **`/Users/macbookairm1/project/visualabs-backend/worker/cdt4.json`**
  (service account `dev-goolge-drive@advance-casing-230107.iam.gserviceaccount.com`,
  project `advance-casing-230107`). File ini disalin ke lokasi gitignored
  (`secrets/drive-sa.json` lokal, `/home/vlabs/secrets/drive-sa.json` di server) —
  **tidak di-commit**. Tiga file `cdt*.json` lain di repo itu bukan untuk Drive, abaikan.
- Pakai `GoogleAuth` / `JWT` dari `google-auth-library`, scope:
  **`https://www.googleapis.com/auth/drive`** (full — karena upload dipakai, lihat Fase 4).
- Cache access token di memori sampai mendekati expiry.
- Export: `getDriveAccessToken(): Promise<string>`, `driveEnabled(): boolean`.

### 4.2 `src/services/driveFolder.ts` (baru)

Port dari `syncDriveServiceFetchByFolderId` / `saveItem` / `cleanFiles`:

- `listDriveChildren(googleFolderId)` — GET `https://www.googleapis.com/drive/v3/files` dengan
  query persis seperti sumber:
  `supportsAllDrives=true`, `includeItemsFromAllDrives=true`, `corpora=allDrives`,
  `pageSize=200`, `q="'<id>' in parents and trashed = false"`,
  `fields=nextPageToken,files(id,name,mimeType,driveId,webViewLink,iconLink,size,modifiedTime)`.
  **Perbaikan dari sumber**: loop `pageToken` sampai habis (sumber menandai pagination sebagai TODO).
- `syncFolder(googleFolderId, parentDbId)` — loop hasil → upsert by `google_id` dengan
  `synced_at = <timestamp run ini>` → lalu `DELETE FROM drive_folder WHERE parent_google_id = ? AND synced_at <> ?`.
- Root: `parentDbId = 0`, `googleFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID`.
- Sync di-guard supaya tidak dobel: kalau folder yang sama baru saja disync < N detik lalu
  (default 30s, env `DRIVE_SYNC_TTL_SECONDS`), langsung balikin dari DB. Sumber selalu hit
  Drive API tiap klik — boros kuota.
- `uploadToDrive(file, parentGoogleId)` — multipart upload ke
  `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`,
  lalu `syncFolder()` ulang. (Fase 4, opsional.)

### 4.3 `src/routes/driveFolders.ts` (baru)

Gaya `videoRequest.ts` (Hono + zod + zValidator), semua di bawah `requireAuth`:

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/drive-folders?parentId=0` | sync folder tsb lalu balikin anak-anaknya (+ mapping client) |
| `GET` | `/drive-folders/:id/breadcrumb` | rantai parent untuk navigasi |
| `POST` | `/drive-folders/:id/sync` | paksa sync (abaikan TTL) |
| `PATCH` | `/drive-folders/:id/clients` | set relasi folder → customer (array `customerIds`) |
| `POST` | `/drive-folders/:id/upload` | upload file ke folder (fase 4) |

Response bentuk `{ success: true, data: [...] }` mengikuti `ApiSuccess<T>` di frontend.

Kalau credential Drive belum diset → balikin 503 dengan pesan jelas, jangan 500.

### 4.4 `src/index.ts`

Tambah `import { driveFolderRoutes } from "./routes/driveFolders";` dan
`app.route("/drive-folders", driveFolderRoutes);`.

### 4.5 `.env.example`

```
GOOGLE_DRIVE_SA_KEY_FILE=/home/vlabs/secrets/drive-sa.json
# atau: GOOGLE_DRIVE_SA_JSON=<base64 json>
GOOGLE_DRIVE_ROOT_FOLDER_ID=1wqxt55REAqsYPzOta7pbow4FrgMv6Y-S
DRIVE_SYNC_TTL_SECONDS=30
```

Root folder ID di atas diambil dari `visualabs-backend/worker/tmp_gir.php` (folder yang dipakai
seed sync di sistem lama) — **perlu diverifikasi** apakah itu memang root yang mau ditampilkan
di v-auto, atau ada folder/Shared Drive lain. Bisa dicek cepat di Fase 2 lewat
`GET /drive-folders?parentId=0`.

### 4.6 `.gitignore` — WAJIB diperbaiki dulu

`.gitignore:16` punya rule `*.sql` yang bikin **seluruh file migrasi ikut ter-ignore**.
Cek: `git ls-files drizzle | rg '\.sql$'` → **kosong**. Artinya migrasi 0010–0039
(termasuk HR 0034–0039 yang dikira sudah ke-commit) tidak pernah masuk repo dan tidak
pernah sampai ke server lewat deploy.

Tambahkan pengecualian sebelum menulis `0040`:

```gitignore
*.sql
!drizzle/**/*.sql
```

lalu `git add -f drizzle/*.sql` untuk menarik masuk migrasi lama yang tertinggal.
Kalau langkah ini dilewat, `0040` juga tidak akan ikut ter-push dan fitur Drive akan
error di production karena tabelnya tidak ada.

---

## 5. Frontend — file yang dibuat/diubah (`v-auto-frontend`)

### 5.1 `src/lib/api/drive-folders.ts` (baru)

Ikut pola `src/lib/api/request-video.ts`: type `DriveItem`, konstanta MIME + label +
icon mapping, dan fungsi `listDriveFolders(parentId)`, `syncDriveFolder(id)`,
`setFolderClients(id, customerIds)`, `uploadToFolder(id, file)` lewat `get`/`patch`/`apiFetch`
dari `./client`.

Helper yang diport apa adanya dari sumber:
- `buildDriveLink(item)` → folder: `https://drive.google.com/drive/u/0/folders/<google_id>`,
  file: `https://drive.google.com/file/d/<google_id>/view` (pakai `webViewLink` dulu kalau ada).
- `isFolder(item)` → `mime_type === 'application/vnd.google-apps.folder'`.
- icon per mime type (folder / doc / sheet / slide / pdf / image / video / lainnya) pakai Lucide.

### 5.2 `src/routes/google-drive/admin/+page.svelte` (baru)

Struktur folder halaman mengikuti `src/routes/request-video/admin/`:

- `+page.svelte` — layout utama: breadcrumb path + list isi folder.
- `helper-and-state.svelte.ts` — state rune: `currentParentId`, `path[]`, `items[]`, `loading`,
  cache `childs` per folder (persis ide `item.childs` di sumber, biar klik ulang tidak refetch).
- `drive-item-row.svelte` — satu baris: icon, nama (klik folder = masuk, klik file = buka tab baru),
  badge client owner, ukuran, tanggal modifikasi.
- `client-mapping-dialog.svelte` — set relasi folder ke customer (fase 5, opsional).

Interaksi:
1. Mount → `listDriveFolders(0)`.
2. Klik folder → push ke breadcrumb, `listDriveFolders(folder.id)` (skip kalau sudah di-cache).
3. Tombol "Sync" di toolbar → `syncDriveFolder(currentId)` + reload.
4. Klik file → buka `buildDriveLink(item)` di tab baru.

### 5.3 `src/lib/components/app-sidebar.svelte`

Tambah entri di grup **Management** (sebelah `Request Video`, sekitar baris 103):
`{ title: 'Google Drive', url: '/google-drive/admin', icon: FolderIcon }`,
dengan role gate yang sama dengan item Management lain.

---

## 6. Fase pengerjaan

| Fase | Isi | Bisa dites |
|---|---|---|
| **0** | Fix `.gitignore` (`!drizzle/**/*.sql`) + `git add -f` migrasi lama | `git ls-files drizzle \| rg '\.sql$'` tidak kosong |
| **1** | Migration `0040` + schema Drizzle + `.env.example` | `bun scripts/apply-migration.ts` jalan, `drizzle` typecheck lolos |
| **2** | `driveClient.ts` + `driveFolder.ts` + `GET /drive-folders` + mount di `index.ts` | `curl` root folder balikin isi Drive |
| **3** | Frontend: api client + halaman list + breadcrumb + sidebar | Klik-klik folder di browser |
| **4** | Upload file ke Drive (backend + tombol upload) | Upload file kecil, muncul di Drive |
| **5** | Mapping folder → customer (`drive_folder_client` + dialog + badge owner) | Assign client, badge muncul |

Fase 0–4 masuk scope (upload dikonfirmasi dipakai). Fase 5 (mapping client) opsional.

---

## 7. Keputusan yang sudah final

1. **Credential** — pakai `visualabs-backend/worker/cdt4.json`, disalin ke lokasi gitignored,
   dirujuk lewat `GOOGLE_DRIVE_SA_KEY_FILE`. Tidak di-commit.
2. **Scope** — `https://www.googleapis.com/auth/drive` (full), karena upload dipakai → Fase 4 masuk scope.
3. **Akses** — semua staff yang login (`requireAuth` saja, tanpa role gate). Endpoint sisi
   customer tidak dibuat.
4. **Lokasi kode** — backend di `v-auto-backend`, UI di `v-auto-frontend`. Permintaan awal
   menyebut frontend saja, tapi credential Drive tidak boleh ada di browser.

Sisa yang belum pasti: **root folder ID** (`1wqxt55REAqsYPzOta7pbow4FrgMv6Y-S` = tebakan dari
kode lama) dan apakah service account itu masih punya akses ke drive tsb — dua-duanya
kelihatan begitu Fase 2 dites.

---

## 8. Risiko / catatan

- Migrasi tidak auto-apply saat deploy → fitur akan error 500 sampai `0040` dijalankan manual.
  Dan sebelum itu, `.gitignore` harus diperbaiki dulu (lihat 4.6) supaya file `.sql`-nya
  benar-benar ikut ke repo.
- Kredensial Drive **jangan** masuk repo. Simpan sebagai file di server + path lewat env.
  Service account `cdt4.json` ini punya scope drive penuh — kalau bocor, seluruh Drive yang
  di-share ke akun itu bisa dibaca/ditulis. Pastikan `secrets/` masuk `.gitignore`.
- Scope full `drive` dipilih demi upload; kalau nanti upload dibatalkan, turunkan ke
  `drive.readonly` supaya blast radius kecil.
- Nama file/folder Drive bisa panjang & mengandung karakter aneh → `VARCHAR(512)` + escape saat
  membangun query `q` ke Drive API (hindari injeksi lewat folder id).
- `cleanFiles` menghapus baris berdasar `synced_at` — kalau sync gagal separuh jalan, jangan
  jalankan delete (bungkus dalam try/catch, delete hanya kalau fetch sukses penuh termasuk semua page).
- Kuota Drive API: TTL cache 30 detik dipakai supaya klik bolak-balik tidak spam API.
