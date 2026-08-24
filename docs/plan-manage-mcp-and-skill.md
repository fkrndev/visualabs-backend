# Flow Bisnis — Manajemen MCP / Skill / Plugin Agent

> Tujuan: tim bisa mengelola capability agent Hermes (MCP servers, skills,
> plugins) dari dashboard VIMS — tanpa SSH, tanpa CLI, tanpa akses shell
> ke mesin agent.
>
> Dokumen ini menjelaskan **alur bisnis &amp; aturan**, bukan implementasi teknis.
> Tanggal: 2026-08-21.

---

## 1. Siapa melakukan apa (aktor &amp; peran)

| Peran                      | Bisa lihat                  | Bisa toggle | Bisa install/remove | Bisa set credentials |
| -------------------------- | --------------------------- | ----------- | ------------------- | -------------------- |
| Developer                  | ✓                           | ✓           | ✓                   | ✓                    |
| Owner                      | ✓                           | ✓           | ✓                   | ✓                    |
| Admin (bisnis)             | ✓                           | ✓           | ✗                   | ✗                    |
| Advertiser / HRD / Akuntan | ✗ (tidak ada akses halaman) | —           | —                   | —                    |

**Kenapa Admin bisnis tidak bisa install/remove?**
Install plugin = eksekusi kode di mesin agent (`git clone` + build). Remove
plugin = menghapus capability yang mungkin sedang dipakai agent. Ini operasi
infrastruktur, bukan operasi bisnis. Admin bisnis cukup bisa **lihat &amp;
toggle** (nyalakan/matikan yang sudah terinstall), tapi tidak menambah/menghapus.

**Konfirmasi untuk operasi berisiko:**
Install/remove plugin, add/remove MCP server, OAuth auth — operasi ini
mengubah capability atau set credentials. Sebelum dijalankan, user **wajib
konfirmasi ulang** (re-enter password). Ini mencegah:

- Aksi tidak sengaja (klik salah tombol)
- Token JWT yang dicuri digunakan untuk install kode jahat
- Perubahan capability tanpa jejak siapa yang melakukannya

Konfirmasi ulang berlaku 5 menit — kalau user install 3 plugin beruntun
dalam 5 menit, cukup konfirmasi sekali di awal.

---

## 2. Halaman &amp; navigasi

```
Sidebar → "Agent Tools"  (di grup Automation, dekat "Agent Chat" & "Pasang Agent")
  ↓
Halaman /admin/agent-tools
  ├─ Pilih node agent (dropdown: server mana yang dikelola)
  ├─ Tab: Skills  |  MCP Servers  |  Plugins  |  Team Hub
  └─ Status node: online / offline (real-time)
```

**Pilih node dulu, baru kelola.** Satu halaman bisa kelola banyak node —
tinggal pilih di dropdown. Tidak perlu halaman terpisah per node. Kalau
node offline, semua tombol aksi disabled + banner "Node sedang offline".

---

## 3. Alur per kategori

### 3A. Skills

Skill = instruksi/panduan yang agent baca saat melakukan tugas. Contoh:
"vbox-browser" (cara pakai browser anti-detect), "scrape-products" (cara
scrape produk kompetitor).

**Sumber skill:**

- **Built-in** — bawaan Hermes, tidak bisa dihapus
- **Hub** — skill publik dari komunitas Nous Research, bisa install/uninstall
- **Custom** — dibuat tim sendiri, bisa edit bebas

**Alur lihat:**

1. Buka tab Skills → daftar skill muncul (nama, deskripsi, status on/off, sumber, jumlah pemakaian)
2. Filter: All / Enabled / per-sumber (Built-in/Hub/Custom)
3. Search box untuk cari skill spesifik

**Alur toggle on/off:**

1. Klik switch on/off di samping skill
2. Status berubah langsung (optimistic — tidak perlu reload)
3. Agent akan mulai/berhenti pakai skill di percakapan berikutnya

**Alur install dari Hub:**

1. Klik "Cari di Hub" → modal search
2. Ketik query → daftar skill publik muncul (nama, deskripsi, trust level, sudah terinstall?)
3. Klik skill → preview isi (baca dulu sebelum install)
4. Klik "Install" → konfirmasi ulang (operasi berisiko) → skill terinstall
5. Daftar skill refresh, skill baru muncul dengan badge "Hub"

**Alur uninstall:**

1. Klik tombol hapus di skill sumber Hub/Custom (Built-in tidak bisa dihapus)
2. Konfirmasi: "Yakin hapus skill X? Agent tidak akan bisa pakai lagi."
3. Konfirmasi ulang (berisiko) → skill hilang

**Alur edit skill custom/lokal:**

1. Klik tombol edit → modal editor (nama, deskripsi, isi markdown)
2. Edit → Save
3. Validasi: kalau format skill salah (frontmatter invalid), pesan error
dari Hermes ditampilkan apa adanya, bukan "HTTP 400" generik

**Alur buat skill baru:**

1. Klik "+ Buat skill" → form (nama, kategori, isi)
2. Save → skill muncul di daftar sebagai "Custom"

**Alur share ke tim (Team Hub):**

1. Klik "Share ke Team Hub" di skill custom
2. Pilih kategori, isi deskripsi, lampirkan file pendukung kalau ada
3. Skill tersimpan di Team Hub server → anggota tim lain bisa install
4. Skill yang sudah di-share dapat badge "Tim"

**Alur update skill dari Hub:**

1. Skill Hub yang punya versi baru → tombol "Update" muncul
2. Klik update → konfirmasi → skill ter-update ke versi terbaru
3. Edit lokal akan ditimpa (warning sebelum konfirmasi)

---

### 3B. MCP Servers

MCP server = sumber tool tambahan untuk agent. Contoh: Canva (buat desain),
filesystem (akses file), GitHub (kelola repo), VBOX/ShardX (browser anti-detect).

**Alur lihat:**

1. Buka tab MCP Servers → daftar server terinstall (nama, tipe koneksi, status, jumlah tool)
2. Status per server: Connected (hijau, jumlah tool), Idle (abu), Error (merah), Testing (kuning)
3. Auto-test koneksi saat buka tab — agent butuh tahu tool mana yang benar-benar bisa dipakai

**Alur test koneksi:**

1. Klik "Test" di server → agent connect ke MCP server, list tool yang tersedia
2. Hasil: "Connected, 12 tools" atau "Error: connection refused"
3. Bisa berlangsung 5-30 detik (cold start npx) — spinner per-item, tidak block UI lain

**Alur add MCP server manual:**

1. Klik "+ Add manually" → form:
  - Nama server
  - Tipe: stdio (jalankan command lokal) atau http (connect ke URL)
  - stdio: command + args (mis. `npx -y mcp-server-foo`)
  - http: URL + tipe auth (none / bearer token / OAuth)
  - Bearer token: diisi sekali, disimpan terpisah dari config (tidak bocor)
2. Save → konfirmasi ulang (berisiko — bisa eksekusi command) → server terinstall
3. Auto-test berjalan untuk verifikasi

**Alur install dari katalog:**

1. Klik "Browse catalog" → daftar MCP server kurasi Nous Research
2. Setiap entry: nama, deskripsi, tipe koneksi, auth dibutuhkan?, sudah terinstall?
3. Klik entry → detail: command/args yang akan dijalankan, env vars dibutuhkan, post-install notes
4. Klik "Install" → kalau butuh env vars, form input muncul (mis. "Masukkan API key Anda")
5. Konfirmasi ulang (berisiko) → server terinstall dengan env vars
6. Auto-test berjalan

**Kenapa surface command/args di UI?**
Trust model MCP: user harus tahu apa yang akan dijalankan sebelum install.
`npx -y mcp-server-foo` terlihat aman, tapi `npx -y unknown-pkg && curl evil`
tidak. Tampilkan apa adanya, jangan sembunyikan.

**Alur OAuth (untuk MCP server yang butuh login, mis. Canva/Google):**

1. Klik "Connect" di server yang butuh OAuth
2. Popup browser terbuka ke halaman login provider (Google, Canva, dll.)
3. User login &amp; authorize di popup
4. Popup redirect ke callback Hermes → token tersimpan di mesin agent
5. Popup tutup otomatis, status server jadi "Connected"
6. Kalau user belum selesai login, tombol "Sudah login? Test ulang" tersedia

**Alur remove MCP server:**

1. Klik hapus di server
2. Konfirmasi: "Yakin hapus server X? Agent kehilangan akses ke N tools."
3. Konfirmasi ulang (berisiko) → server hilang dari config

**Alur toggle enable/disable:**

1. Klik switch on/off
2. Server tetap terinstall tapi tidak dipakai agent (tool tidak dimuat)
3. Berguna untuk debugging: disable sementara tanpa hapus config

---

### 3C. Plugins

Plugin = capability tambahan untuk agent. Berbeda dari MCP (sumber tool
eksternal), plugin adalah modul yang terintegrasi langsung ke core Hermes.
Contoh: memory provider (honcho, mem0), context engine, image generation,
kanban board, observability/metrics.

**Jenis plugin:**

- **Agent plugin** — menambah capability agent (memory, model provider, image gen). Inilah yang utama dikelola.
- **Dashboard plugin** — widget visual untuk dashboard Hermes (kanban board, achievement tracker). Opsional dikelola dari sini.

**Alur lihat:**

1. Buka tab Plugins → daftar plugin (nama, deskripsi, versi, sumber, status, kategori)
2. Kategori: memory / context-engine / model-providers / kanban / image\_gen / observability / lainnya
3. Filter: All / Enabled / per-sumber (User/Bundled) / per-kategori
4. Plugin yang punya update tersedia → badge "Update available"

**Alur install dari Hub:**

1. Klik "+ Install dari Hub" → modal browse
2. Daftar plugin tersedia (nama, deskripsi, versi, sumber, sudah terinstall?)
3. Klik "Install" → konfirmasi ulang (berisiko — eksekusi kode)
4. Status install: "Installing..." (bisa berlangsung menit — git clone + build)
5. Selesai → plugin muncul di daftar, status enabled

**Kenapa install bisa lama?**
Plugin install = `git clone` repo + jalankan bootstrap + `npm install`/`pip install`.
Repo besar + dependency banyak = bisa 1-3 menit. UI menampilkan progress,
tidak block operasi lain. Kalau gagal (network error, build error), pesan
error ditampilkan lengkap (bukan "install failed" generik).

**Alur enable/disable:**

1. Klik switch on/off di plugin
2. Plugin tetap terinstall tapi tidak aktif — agent tidak pakai capability itu
3. Berguna untuk: testing plugin baru (enable, coba, disable kalau tidak cocok)

**Alur update:**

1. Plugin dengan update tersedia → tombol "Update" aktif
2. Klik update → konfirmasi ulang (berisiko) → git pull + rebuild
3. Bisa lama (sama seperti install) → progress ditampilkan
4. Selesai → versi terupdate, badge "Update available" hilang

**Alur remove:**

1. Klik hapus di plugin User (Bundled tidak bisa dihapus, cuma disable)
2. Konfirmasi: "Yakin hapus plugin X? Capability terkait tidak akan tersedia."
3. Konfirmasi ulang (berisiko) → plugin dihapus dari disk

**Alur set memory provider / context engine:**

1. Di bawah daftar plugin, ada section "Active Providers"
2. Dropdown memory provider (hanya plugin memory yang enabled yang muncul)
3. Dropdown context engine (hanya plugin context yang enabled)
4. Pilih → save → agent mulai pakai provider baru di sesi berikutnya
5. Ini operasi berisiko (mengubah cara agent menyimpan/mengambil memori) → konfirmasi ulang

**Dashboard plugin (opsional, bisa di-collapse):**

1. Section terpisah "Dashboard Widgets" — plugin visual untuk dashboard Hermes
2. Toggle visibility (show/hide di sidebar dashboard Hermes)
3. Rescan untuk detect plugin baru yang di-copy manual ke folder

---

### 3D. Team Hub (skill sharing)

Team Hub = tempat tim berbagi skill custom agar anggota lain bisa pakai di
node masing-masing.

**Alur share skill:**

1. Di tab Skills, klik "Share ke Team Hub" di skill custom
2. Form: kategori, deskripsi untuk tim, file pendukung
3. Save → skill tersimpan di server Team Hub

**Alur install skill tim:**

1. Di tab Team Hub → daftar skill tim (nama, siapa yang share, kategori, jumlah install)
2. Klik install → skill terinstall di node yang sedang dipilih
3. Skill muncul di tab Skills dengan badge "Tim"

**Alur lihat pemakaian:**

1. Tab Team Hub menampilkan statistik: skill mana paling sering dipakai, oleh siapa, kapan terakhir
2. Berguna untuk: identifikasi skill yang sudah tidak relevan (bisa di-archive), skill yang worth jadi default

---

## 4. Aturan keputusan bisnis

### 4A. Kapan pakai MCP vs Skill vs Plugin?

| Kebutuhan                                              | Pakai            | Contoh                                         |
| ------------------------------------------------------ | ---------------- | ---------------------------------------------- |
| Agent butuh akses tool eksternal (API, file, browser)  | MCP server       | Canva, GitHub, filesystem, VBOX browser        |
| Agent butuh panduan cara melakukan sesuatu             | Skill            | "Cara scrape produk", "Cara tulis laporan SEO" |
| Agent butuh capability baru (memory, image gen, model) | Plugin           | honcho (memory), DALL-E (image gen)            |
| Agent butuh widget visual di dashboard                 | Dashboard plugin | kanban board, metrics chart                    |

**Aturan praktis untuk tim:**

- Skill = **tahu cara** (knowledge)
- MCP = **bisa akses** (tool/external service)
- Plugin = **bisa lakukan** (capability/integration)

### 4B. Kapan install vs toggle?

| Situasi                                        | Aksi                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Mau coba plugin/MCP baru                       | Install → enable → test → kalau tidak cocok disable (jangan remove dulu) |
| Plugin tidak dipakai tapi mungkin dipakai lagi | Disable (bukan remove — config tetap ada, tinggal enable)                |
| Plugin sudah pasti tidak dipakai               | Remove (hemat disk, hilangkan dari daftar)                               |
| Skill tidak relevan lagi                       | Disable dulu, kalau 30 hari tidak di-enable → pertimbangkan uninstall    |

### 4C. Kapan update?

- **Plugin**: update kalau ada badge "Update available" DAN sedang tidak ada
percakapan agent yang aktif pakai plugin itu (update = restart capability,
bisa ganggu sesi berjalan)
- **Skill dari Hub**: update kalau ada versi baru DAN tidak ada edit lokal
yang akan ditimpa. Kalau ada edit lokal, warning dulu — user pilih: timpa
atau skip update
- **MCP server**: tidak ada konsep update (config statis). Kalau MCP server
punya versi baru (mis. `mcp-foo@2.0`), user edit args manual di "Edit server"

### 4D. Kapan node offline?

- Semua operasi blocked — agent tidak bisa dikelola kalau mesinnya mati
- Banner jelas: "Node X offline. Nyalakan Hermes di mesin tersebut."
- Link ke halaman "Pasang Agent" kalau user tidak tahu cara nyalakan
- Status auto-refresh (tidak perlu reload halaman untuk tahu node online lagi)

---

## 5. Audit &amp; telusur

**Setiap operasi berisiko wajib tercatat:**

| Operasi                          | Dicatat  | Isi log                                                 |
| -------------------------------- | -------- | ------------------------------------------------------- |
| Install plugin                   | ✓        | siapa, node mana, plugin apa, kapan                     |
| Remove plugin                    | ✓        | siapa, node mana, plugin apa, kapan                     |
| Install/uninstall MCP            | ✓        | siapa, node mana, server apa, kapan                     |
| OAuth auth MCP                   | ✓        | siapa, node mana, server apa, kapan (TIDAK catat token) |
| Install/uninstall skill dari Hub | ✓        | siapa, node mana, skill apa, kapan                      |
| Set memory/context provider      | ✓        | siapa, node mana, provider lama → baru, kapan           |
| Toggle enable/disable            | opsional | bisa dicatat tapi tidak wajib (operasi reversible)      |
| Edit skill content               | opsional | bisa dicatat tapi tidak wajib                           |

**Kenapa wajib dari hari-1?**
Operasi install/remove mengubah capability agent. Kalau besok ada insiden
"agent mulai berperilaku anjak setelah tanggal X" atau "siapa install
plugin yang bocor kredensial?", tanpa audit log tidak bisa telusur. Ini
bukan "fitur masa depan" — ini syarat dasar untuk operasi yang mengubah
infrastruktur.

**Akses audit log:**

- Halaman "Audit Log" yang sudah ada di VIMS (`/audit-log`) — tambah kategori
"agent\_tools" agar operasi MCP/skill/plugin bisa difilter
- Hanya Dev/Owner yang bisa lihat detail audit (Admin bisa lihat tapi tidak
bisa filter per-user untuk hindari snooping)

---

## 6. Edge case bisnis

### 6A. Dua orang kelola node yang sama bersamaan

- Toggle: aman — operasi idempotent, last-write-wins, tidak ada data hilang
- Install: aman — install plugin yang sama 2x = no-op (sudah terinstall)
- Remove + install bersamaan: bisa konflik — A remove plugin X, B install
plugin X bersamaan. Hasil akhir tergantung urutan. **Tidak perlu lock**
untuk MVP, tapi tampilkan toast "plugin X baru saja diubah oleh \[user\]"
kalau state berubah di belakang (polling deteksi perubahan)

### 6B. Plugin yang sedang dipakai agent di-remove

- Agent sedang pakai plugin memory (honcho) → user remove honcho
- Agent akan error di sesi berjalan ("memory provider not found")
- **Warning sebelum remove**: "Plugin X sedang aktif di N sesi. Remove akan
mengganggu percakapan yang berjalan. Lanjutkan?"
- Idealnya: disable dulu (agent fallback ke default), tunggu sesi selesai,
baru remove. Tapi untuk MVP, warning cukup.

### 6C. MCP server OAuth token expired

- Token OAuth punya expiry (Google: 1 jam refresh, Canva: bervariasi)
- Saat token expired, MCP test akan gagal dengan "auth error"
- **UI**: badge "Re-auth needed" di server yang gagal test karena auth
- Tombol "Connect" muncul lagi → user re-login → token baru
- Tidak ada auto-refresh token di relay (token refresh adalah urusan Hermes
lokal, relay hanya teruskan status)

### 6D. Skill tim di-uninstall dari Team Hub

- A share skill "scrape-foo" ke Team Hub → B install di node-nya
- A hapus skill dari Team Hub
- Skill B tetap terinstall (sudah ada di disk B) — tidak hilang otomatis
- Tapi B tidak akan dapat update lagi
- **Notifikasi ke B** (opsional, future): "Skill 'scrape-foo' telah dihapus
dari Team Hub oleh A. Skill Anda tetap terinstall tapi tidak akan ter-update."

### 6E. Node berganti nama / di-reinstall

- Node lama: `node-laptop-andi` → reinstall Hermes → daftar sebagai `node-laptop-andi-2`
- Skill/plugin yang terinstall di node lama tidak otomatis pindah
- **Tidak ada sync antar node** by design — tiap node independen
- Kalau mau pindah config: export dari node lama (future feature), import ke node baru
- Untuk MVP: install ulang manual di node baru

---

## 7. Metric &amp; observability (nice-to-have, tidak block MVP)

Halaman admin sebaiknya menampilkan ringkasan yang berguna untuk keputusan:

| Metric                                       | Manfaat                                          |
| -------------------------------------------- | ------------------------------------------------ |
| Jumlah skill enabled per node                | tahu node mana yang "paling pintar"              |
| Top 5 skill paling sering dipakai            | tahu skill mana yang worth jadi default/built-in |
| Plugin yang enabled tapi 0 pemakaian 30 hari | kandidat disable (hemat resource)                |
| MCP server yang sering error                 | kandidat remove atau fix config                  |
| Node paling aktif (paling banyak sesi)       | pertimbangan untuk upgrade resource              |

Ini tidak block MVP — bisa ditambah setelah halaman dasar jalan.

---

## 8. Urutan peluncuran (prioritas bisnis, bukan teknis)

### Peluncuran 1 — Dasar: lihat &amp; toggle

- Halaman admin + pilih node + 4 tab
- Skills: list + toggle (yang sudah ada, tinggal pindah ke halaman)
- MCP: list + test (yang sudah ada)
- Plugins: list saja (read-only dulu)
- Value: admin bisa **lihat** apa yang terinstall di tiap node tanpa SSH

### Peluncuran 2 — Kelola penuh: install &amp; remove

- Skills: install dari Hub + uninstall + edit + create (sudah ada, pindah)
- MCP: add manual + remove + OAuth (sebagian sudah ada, lengkapi)
- Plugins: install + enable/disable + remove + update
- Konfirmasi ulang untuk operasi berisiko
- Audit log untuk install/remove
- Value: admin bisa **kelola lengkap** tanpa SSH

### Peluncuran 3 — Tim &amp; katalog

- MCP: browse catalog + install dari catalog
- Team Hub: share + install skill tim (sudah ada, pindah)
- Skill update dari Hub
- Value: tim **berbagi knowledge** dan **temukan MCP baru** dari satu tempat

### Peluncuran 4 — Polish

- Metric &amp; observability (§7)
- Notifikasi perubahan real-time
- Providers config (memory/context engine)
- Dashboard plugin management
- Value: **insight** untuk keputusan kelola agent

---

## 9. Yang TIDAK masuk scope (eksplisit)

- **Multi-node bulk operation** — install plugin ke 5 node sekaligus. MVP:
satu node per operasi. Bulk bisa ditambah kalau tim sudah pakai dan merasa
repetitif.
- **Version pinning plugin** — lock plugin ke versi tertentu. Hermes tidak
support ini secara native, terlalu kompleks untuk MVP.
- **Plugin marketplace sendiri** — Team Hub sekarang cuma untuk skill.
Plugin marketplace (tim publish plugin sendiri) = proyek terpisah.
- **Rollback plugin** — kalau update rusak, uninstall + install versi lama
manual. Tidak ada snapshot otomatis.
- **Permission per-plugin** — "user A bisa pakai plugin X, user B tidak".
Sekarang: kalau plugin enabled, semua user yang akses node itu bisa pakai.
Granular per-user = proyek terpisah.
