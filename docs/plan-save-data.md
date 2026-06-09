# Plan — Vault Kredensial Tim (Save Data / Secret Sharing)

> Status: **DRAFT / PROPOSAL** · Dibuat 2026-06-04
> Fitur baru untuk menyimpan data akses (username/password/URL), API key/token, dan
> sejenisnya, lalu membagikannya ke tim dengan kontrol akses per-item.

---

## 1. Tujuan & Ruang Lingkup

Menyediakan "brankas" (vault) terpusat di dalam aplikasi untuk menyimpan **rahasia/secret**:

- **Login aplikasi** → `url`, `username`, `password`
- **API / Token** → `token`, `api_key`, `secret`, opsional `endpoint`
- **Lainnya** → catatan bebas / pasangan field custom (mis. PIN, seed phrase, dsb)

Lalu **dibagikan ke tim** dengan tiga mode akses per-item:

1. **Private** — hanya pembuat (owner) yang bisa lihat.
2. **Semua Tim** — semua user login bisa lihat.
3. **Tertentu (restricted)** — hanya user dan/atau role tertentu yang dibagikan.

Management level (Dev/Admin/Owner/Head Advertiser — lihat `isManagementLevel()`)
selalu punya akses penuh (override) untuk administrasi & pemulihan.

### Non-tujuan (untuk iterasi pertama)

- Bukan pengganti password manager enterprise (tidak ada zero-knowledge E2E,
  tidak ada browser autofill extension).
- Tidak ada rotasi otomatis / integrasi SSO.
- Tidak ada versioning riwayat nilai secret (hanya audit akses). Bisa jadi fase lanjutan.

---

## 2. Keputusan Desain Utama

| Topik | Keputusan | Alasan |
|------|-----------|--------|
| Enkripsi | **Application-level AES-256-GCM**, key dari `CREDENTIAL_ENCRYPTION_KEY` (env) | Dump DB saja tidak membocorkan secret; konsisten dgn pola env-secret (`JWT_SECRET`) |
| Yang dienkripsi | Hanya field **rahasia** (password, token, api_key, secret, extra-fields) | Field non-rahasia (title, url, username) tetap plaintext agar bisa dicari/diurutkan |
| Model akses | **Item-level sharing** via tabel `credential_shares` (principal = user atau role) | Memenuhi "semua bisa / sebagian tidak bisa" tanpa sistem permission-string global |
| Override | Management level lihat semua | Konsisten dgn `requireManagement` yang sudah dipakai di route lain |
| Audit | Tabel `credential_access_logs` mencatat **reveal/create/update/delete/share** | Akuntabilitas siapa membuka secret |
| Routing | Satu halaman `/credentials` (bukan split admin/advertiser/client) | Akses bersifat per-item, bukan per-subjek seperti scorecards |
| Reveal | Secret **tidak ikut** di list; baru di-decrypt saat endpoint `GET /:id/reveal` dipanggil | Minimalkan paparan + tiap reveal teraudit |

---

## 3. Data Model (Drizzle — `src/db/schema.ts`)

Tiga tabel baru. Mengikuti konvensi yang ada (int autoincrement PK, `timestamp` createdAt/updatedAt, `index`/`uniqueIndex`, `references … onDelete`).

```ts
// ─── Credential Vault ────────────────────────────────────────────────

// type item
export const CREDENTIAL_TYPE = {
  APP_LOGIN: 0, // url + username + password
  API_TOKEN: 1, // token / api_key / secret (+ endpoint)
  OTHER: 2,     // bebas (pakai extra fields)
} as const;

// visibilitas item
export const CREDENTIAL_VISIBILITY = {
  PRIVATE: 0,    // hanya owner
  TEAM: 1,       // semua user login
  RESTRICTED: 2, // sesuai credential_shares
} as const;

export const credentials = mysqlTable(
  "credentials",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 191 }).notNull(),
    type: int("type").default(0).notNull(),             // CREDENTIAL_TYPE
    visibility: int("visibility").default(0).notNull(), // CREDENTIAL_VISIBILITY
    category: varchar("category", { length: 100 }),     // folder/label opsional, mis. "Meta", "Hosting"
    // ── field non-rahasia (plaintext, boleh dicari) ──
    url: varchar("url", { length: 500 }),
    username: varchar("username", { length: 191 }),
    // ── payload rahasia, terenkripsi AES-256-GCM (format: iv.tag.ciphertext base64) ──
    // berisi JSON: { password?, token?, apiKey?, secret?, endpoint?, notes?, extra?: {k:v} }
    secretEnc: text("secret_enc"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("credentials_owner_idx").on(table.ownerId),
    index("credentials_visibility_idx").on(table.visibility),
    index("credentials_type_idx").on(table.type),
  ],
);

// pembagian per-item (hanya relevan saat visibility = RESTRICTED)
export const CREDENTIAL_PRINCIPAL = { USER: 0, ROLE: 1 } as const;
export const CREDENTIAL_PERMISSION = { VIEW: 0, EDIT: 1 } as const;

export const credentialShares = mysqlTable(
  "credential_shares",
  {
    id: int("id").autoincrement().primaryKey(),
    credentialId: int("credential_id")
      .notNull()
      .references(() => credentials.id, { onDelete: "cascade" }),
    principalType: int("principal_type").notNull(),     // USER | ROLE
    principalId: int("principal_id").notNull(),         // users.id ATAU role number (0–7)
    permission: int("permission").default(0).notNull(), // VIEW | EDIT
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cred_share_unique").on(
      table.credentialId, table.principalType, table.principalId,
    ),
    index("cred_share_credential_idx").on(table.credentialId),
  ],
);

// audit (siapa membuka apa)
export const CREDENTIAL_ACTION = {
  REVEAL: 0, CREATE: 1, UPDATE: 2, DELETE: 3, SHARE: 4,
} as const;

export const credentialAccessLogs = mysqlTable(
  "credential_access_logs",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    credentialId: int("credential_id").notNull(), // tanpa FK agar log tetap ada walau item dihapus
    userId: int("user_id").notNull(),
    action: int("action").notNull(),              // CREDENTIAL_ACTION
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cred_log_credential_idx").on(table.credentialId),
    index("cred_log_user_idx").on(table.userId),
  ],
);

export const credentialRelations = relations(credentials, ({ one, many }) => ({
  owner: one(users, { fields: [credentials.ownerId], references: [users.id] }),
  shares: many(credentialShares),
}));

export const credentialShareRelations = relations(credentialShares, ({ one }) => ({
  credential: one(credentials, {
    fields: [credentialShares.credentialId],
    references: [credentials.id],
  }),
}));
```

### Migration — `drizzle/0028_add_credential_vault.sql`

```sql
CREATE TABLE `credentials` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `owner_id` INT NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `type` INT NOT NULL DEFAULT 0,
  `visibility` INT NOT NULL DEFAULT 0,
  `category` VARCHAR(100) NULL,
  `url` VARCHAR(500) NULL,
  `username` VARCHAR(191) NULL,
  `secret_enc` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  KEY `credentials_owner_idx` (`owner_id`),
  KEY `credentials_visibility_idx` (`visibility`),
  KEY `credentials_type_idx` (`type`),
  CONSTRAINT `credentials_owner_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE `credential_shares` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `credential_id` INT NOT NULL,
  `principal_type` INT NOT NULL,
  `principal_id` INT NOT NULL,
  `permission` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `cred_share_unique` (`credential_id`, `principal_type`, `principal_id`),
  KEY `cred_share_credential_idx` (`credential_id`),
  CONSTRAINT `cred_share_credential_fk` FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON DELETE CASCADE
);

CREATE TABLE `credential_access_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `credential_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `action` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  KEY `cred_log_credential_idx` (`credential_id`),
  KEY `cred_log_user_idx` (`user_id`)
);
```

> Diterapkan dengan: `bun scripts/apply-migration.ts drizzle/0028_add_credential_vault.sql`

---

## 4. Enkripsi — `src/utils/crypto/credentialCipher.ts`

```ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// Key 32-byte diturunkan dari env. WAJIB di-set di production.
const KEY = createHash("sha256")
  .update(process.env.CREDENTIAL_ENCRYPTION_KEY ?? "dev-insecure-key-change-me")
  .digest(); // 32 bytes

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12); // GCM standard 96-bit
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: base64(iv).base64(tag).base64(ciphertext)
  return [iv, tag, ct].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, ctB64] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

Tambahkan ke `.env` / `.env.example`:

```
CREDENTIAL_ENCRYPTION_KEY=<random 32+ char string, JANGAN diubah setelah ada data>
```

> ⚠️ Mengubah key setelah ada data = semua secret lama tidak bisa di-decrypt.
> Dokumentasikan ini dan simpan key di secret manager / env server yang aman.

---

## 5. Access Control — helper `src/utils/auth/credentialAccess.ts`

Satu sumber kebenaran dipakai semua endpoint:

```
canView(user, cred, shares):
  - true jika user.id === cred.ownerId
  - true jika isManagementLevel(user.role)            // override
  - true jika cred.visibility === TEAM
  - true jika cred.visibility === RESTRICTED dan ada share cocok:
        (principalType=USER & principalId=user.id)  OR
        (principalType=ROLE & principalId=user.role)
  - selain itu false

canEdit(user, cred, shares):
  - true jika user.id === cred.ownerId
  - true jika isManagementLevel(user.role)
  - true jika ada share cocok dengan permission=EDIT
  - selain itu false

canManageShares(user, cred): owner ATAU management level
```

Semua route pakai `requireAuth` (mengisi `jwtPayload`). Role dibaca dari JWT `rol`
(sama seperti `requireManagement`). Tidak ada `requireManagement` di level route —
gating dilakukan **per-item** lewat helper di atas.

---

## 6. Backend API — `src/routes/credentials.ts`

Didaftarkan di `src/index.ts`:
```ts
import credentialRoutes from "./routes/credentials";
// ...
app.route("/credentials", credentialRoutes);
```

| Method | Path | Akses | Keterangan |
|--------|------|-------|-----------|
| `GET` | `/credentials` | login | List item yang **boleh dilihat** user (owner + team + shared + management=all). **Tanpa** secret. Support `?q=&type=&category=&page=&limit=` |
| `GET` | `/credentials/:id` | canView | Metadata 1 item + daftar share (kalau owner/management). **Tanpa** secret mentah. |
| `GET` | `/credentials/:id/reveal` | canView | Decrypt & kembalikan secret. **Tulis audit `REVEAL`.** Bisa di-rate-limit. |
| `POST` | `/credentials` | login | Buat item. Enkripsi field rahasia. owner = user. audit `CREATE`. |
| `PUT` | `/credentials/:id` | canEdit | Update metadata + (re-)enkripsi secret bila dikirim. audit `UPDATE`. |
| `DELETE` | `/credentials/:id` | owner / management | Hapus item (+ shares cascade). audit `DELETE`. |
| `PUT` | `/credentials/:id/shares` | canManageShares | Set visibility + replace daftar share (users/roles + view/edit). audit `SHARE`. |
| `GET` | `/credentials/:id/logs` | owner / management | Audit log akses item. |

**Zod payload (ringkas):**
```ts
const credentialPayload = z.object({
  title: z.string().min(1),
  type: z.coerce.number().int().min(0).max(2).default(0),
  visibility: z.coerce.number().int().min(0).max(2).default(0),
  category: z.string().optional(),
  url: z.string().optional(),
  username: z.string().optional(),
  // field rahasia (akan digabung → JSON → encryptSecret)
  secret: z.object({
    password: z.string().optional(),
    token: z.string().optional(),
    apiKey: z.string().optional(),
    secret: z.string().optional(),
    endpoint: z.string().optional(),
    notes: z.string().optional(),
    extra: z.record(z.string()).optional(),
  }).optional(),
});

const sharesPayload = z.object({
  visibility: z.coerce.number().int().min(0).max(2),
  shares: z.array(z.object({
    principalType: z.coerce.number().int().min(0).max(1),
    principalId: z.coerce.number().int(),
    permission: z.coerce.number().int().min(0).max(1).default(0),
  })).default([]),
});
```

**Bentuk response list item** (aman, tanpa secret):
```jsonc
{
  "id": 12, "title": "Meta Business Login", "type": 0, "visibility": 2,
  "category": "Meta", "url": "https://business.facebook.com",
  "username": "ops@vims.id",
  "owner": { "id": 3, "name": "Andi" },
  "canEdit": true, "canManageShares": false,
  "sharedCount": 4, "updatedAt": "2026-06-04T..."
}
```

---

## 7. Frontend — SvelteKit (`v-auto-frontend`)

### Struktur file
```
src/routes/credentials/
  +page.svelte                      // halaman utama (list + toolbar)
  helper-and-state.svelte.ts        // $state, load, CRUD handlers (pola subscriptions/admin)
  columns.ts                        // kolom tabel + opsi (TYPE, VISIBILITY)
  credential-form-dialog.svelte     // tambah/edit (field dinamis per type)
  credential-reveal-dialog.svelte   // tampil secret (mask + reveal + copy)
  share-dialog.svelte               // atur visibility + user/role share
src/lib/api/credentials.ts          // tipe + fungsi API (pola lib/api/subscriptions.ts)
```

### API client (`src/lib/api/credentials.ts`) — pakai helper `get/post/put/del`
Fungsi: `getCredentials(params)`, `getCredential(id)`, `revealCredential(id)`,
`createCredential(payload)`, `updateCredential(id, payload)`, `deleteCredential(id)`,
`updateCredentialShares(id, payload)`, `getCredentialLogs(id)`.

### Sidebar (`src/lib/components/app-sidebar.svelte`)
Tambah item di grup **System** (atau grup baru "Tim"):
```ts
{ title: 'Vault Kredensial', url: '/credentials', icon: KeyIcon }
```
Terlihat oleh semua user login (akses tetap difilter per-item oleh backend).

---

## 8. ASCII Wireframes

### 8.1 Halaman Utama — List Vault (`/credentials`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Vault Kredensial                                          [ + Tambah Data ]   │
│  Simpan & bagikan akses aplikasi, API key, token, dll.                         │
├──────────────────────────────────────────────────────────────────────────────┤
│  🔍 [ Cari judul / username / url... ]  Tipe:[ Semua ▾ ]  Kategori:[ Semua ▾ ] │
├──────────────────────────────────────────────────────────────────────────────┤
│  JUDUL                  TIPE        USERNAME / URL        AKSES      OWNER      │
│ ───────────────────────────────────────────────────────────────────────────── │
│  🔑 Meta Business Login [App Login] ops@vims.id          [👥 Tim]   Andi    ⋮  │
│  🔌 OpenAI API Key      [API/Token] sk-•••• (tersembunyi)[🔒 5 org] Saiful  ⋮  │
│  🔑 cPanel Hosting      [App Login] admin · srv12.web    [🔒 Admin] Andi    ⋮  │
│  🗝  Wildcard Cert PIN   [Lainnya]   —                    [🔐 Privat] Saya    ⋮  │
│ ───────────────────────────────────────────────────────────────────────────── │
│  Badge akses:  🔐 Privat  ·  👥 Semua Tim  ·  🔒 Tertentu (user/role)          │
│                                                            [ Muat lebih banyak ]│
└──────────────────────────────────────────────────────────────────────────────┘
   ⋮ menu baris → Lihat & Salin · Edit · Bagikan · Riwayat Akses · Hapus
```

### 8.2 Dialog Tambah / Edit (field dinamis mengikuti Tipe)

```
┌──────────────────────────────────────────────┐
│  Tambah Data Akses                        [✕] │
├──────────────────────────────────────────────┤
│  Judul *      [ Meta Business Login         ] │
│  Tipe         ( ● App Login ) ( ○ API/Token ) │
│               ( ○ Lainnya )                   │
│  Kategori     [ Meta                     ▾ ]  │
│                                                │
│  ── Detail (App Login) ─────────────────────  │
│  URL          [ https://business.facebook..]  │
│  Username     [ ops@vims.id                ]  │
│  Password     [ ••••••••••••          ] [👁]   │
│                                                │
│  Catatan      [ akun utama, 2FA via Authy   ] │
│               [                             ] │
│                                                │
│  Akses        ( ○ Privat ) ( ● Semua Tim )    │
│               ( ○ Tertentu )  → atur di       │
│                 dialog "Bagikan"              │
├──────────────────────────────────────────────┤
│                       [ Batal ]  [ Simpan ]   │
└──────────────────────────────────────────────┘

  Saat Tipe = API/Token, blok "Detail" berubah jadi:
  ┌────────────────────────────────────────────┐
  │  Endpoint    [ https://api.openai.com/v1  ] │
  │  API Key     [ ••••••••••••          ] [👁]  │
  │  Secret      [ ••••••••••••          ] [👁]  │
  └────────────────────────────────────────────┘

  Saat Tipe = Lainnya → daftar pasangan field bebas:
  ┌────────────────────────────────────────────┐
  │  [ Nama field ] : [ Nilai (rahasia) ] [👁][✕]│
  │  [ + Tambah field ]                          │
  └────────────────────────────────────────────┘
```

### 8.3 Dialog Lihat & Salin (Reveal) — tiap reveal teraudit

```
┌──────────────────────────────────────────────┐
│  Meta Business Login            [App Login]   │
│  Kategori: Meta · Owner: Andi                 │
├──────────────────────────────────────────────┤
│  URL        https://business.facebook.com [⧉] │
│  Username   ops@vims.id                   [⧉] │
│  Password   ••••••••••••           [ 👁 Lihat ]│
│             └─ klik → "P@ssw0rd!23"       [⧉] │
│                                                │
│  Catatan    akun utama, 2FA via Authy         │
│                                                │
│  ⓘ Membuka password tercatat di Riwayat Akses │
├──────────────────────────────────────────────┤
│         [ Riwayat Akses ]        [ Tutup ]    │
└──────────────────────────────────────────────┘
   [⧉] = salin ke clipboard
```

### 8.4 Dialog Bagikan (Share / Access Control)

```
┌──────────────────────────────────────────────────────┐
│  Bagikan "Meta Business Login"                    [✕] │
├──────────────────────────────────────────────────────┤
│  Siapa yang bisa akses?                                │
│   ( ○ Privat — hanya saya )                            │
│   ( ○ Semua tim bisa lihat )                           │
│   ( ● Tertentu — pilih di bawah )                      │
│                                                        │
│  ── Berdasarkan Role ────────────────────────────────  │
│   [✓] Admin           ( Lihat ▾ )                      │
│   [✓] Owner           ( Lihat ▾ )                      │
│   [ ] Advertiser      ( Lihat ▾ )                      │
│   [✓] Head Advertiser ( Edit  ▾ )                      │
│                                                        │
│  ── Berdasarkan User ────────────────────────────────  │
│   🔍 [ cari user...                                  ] │
│   • Saiful   ( Edit  ▾ )  [✕]                          │
│   • Budi     ( Lihat ▾ )  [✕]                          │
│                                                        │
│  Perizinan:  Lihat = baca+salin · Edit = ubah data     │
├──────────────────────────────────────────────────────┤
│                          [ Batal ]  [ Simpan Akses ]   │
└──────────────────────────────────────────────────────┘
```

### 8.5 Riwayat Akses (Audit Log)

```
┌──────────────────────────────────────────────┐
│  Riwayat Akses — Meta Business Login      [✕] │
├──────────────────────────────────────────────┤
│  WAKTU              USER      AKSI            │
│ ───────────────────────────────────────────── │
│  04 Jun 12:40       Saiful    🔓 Buka password│
│  04 Jun 11:02       Andi      ✏  Ubah data    │
│  03 Jun 16:20       Andi      🔗 Ubah akses   │
│  03 Jun 16:18       Andi      ➕ Membuat       │
├──────────────────────────────────────────────┤
│                                  [ Tutup ]    │
└──────────────────────────────────────────────┘
```

---

## 9. Tahapan Implementasi (Todo)

**Fase 1 — Backend inti**
1. [ ] Tambah 3 tabel + relations + konstanta enum di `src/db/schema.ts`.
2. [ ] Tulis `drizzle/0028_add_credential_vault.sql` + terapkan migration.
3. [ ] `src/utils/crypto/credentialCipher.ts` (AES-256-GCM) + `CREDENTIAL_ENCRYPTION_KEY` di `.env.example`.
4. [ ] `src/utils/auth/credentialAccess.ts` (canView/canEdit/canManageShares).
5. [ ] `src/routes/credentials.ts` (semua endpoint + audit) & daftar di `index.ts`.
6. [ ] Tes ringkas (vitest) untuk cipher round-trip + matriks akses.

**Fase 2 — Frontend**
7. [ ] `src/lib/api/credentials.ts` (tipe + fungsi).
8. [ ] Route `/credentials`: `+page.svelte`, `helper-and-state.svelte.ts`, `columns.ts`.
9. [ ] `credential-form-dialog.svelte` (field dinamis per tipe).
10. [ ] `credential-reveal-dialog.svelte` (mask/reveal/copy).
11. [ ] `share-dialog.svelte` (visibility + user/role + view/edit).
12. [ ] (opsional) `logs` view.
13. [ ] Tambah menu sidebar.

**Fase 3 — Pengamanan & poles**
14. [ ] Rate-limit endpoint `/reveal` (reuse pola rate-limit yang ada).
15. [ ] Mask default, "Lihat" butuh klik eksplisit, hint clear clipboard.
16. [ ] Dokumentasi singkat + catatan rotasi key di `docs/`.

---

## 10. Pertimbangan Keamanan

- **Secret tidak pernah ada di response list** — hanya via `/reveal` yang teraudit.
- **Enkripsi at-rest** lewat AES-256-GCM (auth tag → tahan tamper).
- **Key management**: `CREDENTIAL_ENCRYPTION_KEY` wajib di env server, jangan commit,
  jangan diubah setelah ada data. Pertimbangkan backup key terenkripsi.
- **Transport**: HTTPS (sudah, domain `vims.dots.my.id`).
- **Least privilege**: default item **Privat**; berbagi adalah tindakan eksplisit.
- **Audit**: setiap reveal/ubah/share tercatat dengan user + waktu.
- **Management override** sengaja ada untuk pemulihan; bisa ditambah audit khusus
  saat management membuka item milik orang lain (fase lanjutan).
- Pertimbangan lanjutan: 2FA sebelum reveal, masa kedaluwarsa share, ekspor terbatas.

---

## 11. Pertanyaan Terbuka (perlu keputusan)

1. **Username/URL plaintext** untuk pencarian — OK, atau ikut dienkripsi juga?
2. **Management override**: boleh lihat semua item privat orang lain? (default plan: ya, demi pemulihan).
3. Perlu **role mana saja** yang boleh *membuat* item, atau semua user login boleh?
4. Perlu **kategori/folder** sebagai entitas tersendiri, atau cukup string bebas? (plan: string bebas).
5. Perlu **versioning** nilai secret (riwayat perubahan), atau cukup audit akses?
