# Flow Agent Tools — kondisi yang sudah berjalan

**Status:** dokumentasi kondisi terpasang per 24 Agustus 2026 (bukan rencana).
**Yang dibahas:** modal **Agent Tools** di `/agent` — tab Skills, MCP Servers, dan Team Hub.
**Dokumen terkait:** [manage-skill.md](manage-skill.md) (rencana + keputusan desain Team Hub), [run.md](run.md) (alur relay & token node), [install-hermes.md](install-hermes.md) (distribusi agent).

---

## 1. Ringkas dalam satu paragraf

Browser tidak pernah menyentuh laptop siapa pun secara langsung. Semua aksi di modal ini
dikirim ke backend VIMS, lalu backend menitipkannya ke **node** (laptop yang menjalankan
Hermes lewat VBOX) melalui koneksi WebSocket yang **node buka sendiri keluar**. Node
menerjemahkan titipan itu menjadi panggilan HTTP ke Hermes lokal di `127.0.0.1:9119`, lalu
mengembalikan jawabannya lewat jalur yang sama. Satu-satunya bagian yang **tidak** lewat
jalur ini adalah Team Hub, yang membaca dan menulis ke database VIMS.

---

## 2. Peta lapisan

```
  Browser (VIMS)                Backend VIMS                Laptop user
┌─────────────────┐        ┌────────────────────┐      ┌──────────────────────┐
│ AgentToolsModal │        │ /api/relay/...     │      │ relay_node.py        │
│  ├ SkillsPanel  │──HTTP─▶│   → hub.sendMcpReq │──WS─▶│   → HTTP 127.0.0.1   │──▶ Hermes
│  ├ McpPanel     │        │                    │◀─WS──│   {t:"mcp_resp"}     │    :9119
│  └ TeamHubPanel │──HTTP─▶│ /api/team-skills   │      └──────────────────────┘
└─────────────────┘        │   → MySQL VIMS     │
                           └────────────────────┘
```

Empat berkas kunci:

| Lapisan | Berkas |
|---|---|
| UI | `v-auto-frontend/src/lib/components/agent/AgentToolsModal.svelte` + 3 panel di folder yang sama |
| Proxy relay | [src/routes/relay.ts](../../src/routes/relay.ts) — `/mcp/*` mulai [baris 217](../../src/routes/relay.ts#L217), `/skills/*` mulai [baris 315](../../src/routes/relay.ts#L315) |
| Registry tim | [src/routes/teamSkills.ts](../../src/routes/teamSkills.ts) + tabel di [src/db/schema.ts](../../src/db/schema.ts) |
| Node agent | `custom-hermes/hermes_cli/relay_node.py` → endpoint di `custom-hermes/hermes_cli/web_server.py` |

---

## 3. Cara modal ini dibuka

1. User membuka `/agent`, memilih node di dropdown "pilih Hermes server"
   (`selectedNode`, isinya dari `GET /api/relay/nodes`).
2. Tombol **Tools** aktif hanya kalau `selectedNode` terisi
   (`src/routes/agent/+page.svelte:729`).
3. `AgentToolsModal` menerima `nodeId={selectedNode}`, lalu meneruskannya ke ketiga panel.

Akibat langsungnya: **modal ini selalu terikat pada satu node.** Ganti node di dropdown,
isi tab Skills dan MCP ikut berganti; tab Team Hub tidak, karena datanya dari database.

---

## 4. Jalur relay — bagaimana satu klik sampai ke laptop

Semua aksi di tab Skills dan MCP Servers melewati enam langkah yang sama:

1. Panel memanggil `/api/relay/...` dengan JWT user biasa.
2. Route memeriksa `hub.hasNode(nodeId)`. Kalau node tidak online → **503 `node offline`**,
   berhenti di sini.
3. `hub.sendMcpRequest(nodeId, method, path, body)` membuat `reqId` unik, menyimpan promise-nya
   di `pendingMcp`, lalu mengirim `{t:"mcp_req", reqId, method, path, body}` lewat WebSocket node.
4. `relay_node.py` menerima frame itu, memanggil `http://127.0.0.1:9119{path}` dengan header
   `Authorization: Bearer <token sesi Hermes lokal>`.
5. Jawaban Hermes dibungkus `{t:"mcp_resp", reqId, status, data}` dan dikirim balik.
6. `hub.onNodeMessage` mencocokkan `reqId`, promise resolve, route mengembalikan `data` apa adanya
   berikut status aslinya.

**Batas waktu:** 30 detik untuk semua path, 120 detik kalau path mengandung `/test`
(uji MCP perlu menyalakan proses `npx`). Lewat dari itu → **502** dengan pesan timeout.

**Catatan penamaan:** namanya `mcp_req` karena dulu hanya dipakai MCP, tetapi sekarang
seluruh aksi Skills juga memakai kanal yang sama. Jangan tertipu namanya.

---

## 5. Tab Skills

Sumber data: **laptop user**, lewat relay. Tidak ada satu pun angka di tab ini yang disimpan
di server.

### 5.1 Aksi dan rantai endpoint-nya

| Aksi di UI | Frontend | Relay | Hermes lokal |
|---|---|---|---|
| Muat daftar | `loadSkills()` | `GET /api/relay/skills/:nodeId` | `GET /api/skills` |
| Nyalakan/matikan | tombol Power | `PUT /api/relay/skills/:nodeId/toggle` | `PUT /api/skills/toggle` |
| Cari di Hub publik | tombol **Hub** | `GET /api/relay/skills/:nodeId/hub/search?q=` | `GET /api/skills/hub/search` |
| Pasang dari Hub | tombol unduh | `POST /api/relay/skills/:nodeId/hub/install` | `POST /api/skills/hub/install` |
| Copot | ikon tong sampah | `POST /api/relay/skills/:nodeId/hub/uninstall` | `POST /api/skills/hub/uninstall` |
| Buat skill baru | tombol **New** | `POST /api/relay/skills/:nodeId` | `POST /api/skills` |
| Buka editor | ikon pensil | `GET /api/relay/skills/:nodeId/content?name=` | `GET /api/skills/content` |
| Simpan editor | tombol Simpan | `PUT /api/relay/skills/:nodeId/content` | `PUT /api/skills/content` |
| Bagikan ke tim | ikon unggah | baca isi lewat relay, lalu `POST /api/team-skills` | — |

### 5.2 Hal yang mudah salah dibaca

- **Enable/disable tidak menghapus apa pun.** Hermes hanya menambah/menghapus nama skill di
  daftar `disabled` dalam config-nya (`skills_config.py`). Berkasnya tetap di tempat.
- **Badge asal-usul (`provenance`) dihitung Hermes**, bukan disimpan: `hub` kalau nama skill
  ada di manifest Skills Hub bawaan, `bundled` kalau ikut paket instalasi, sisanya `agent`.
- **Badge "Tim" tidak datang dari Hermes.** Hermes melabeli skill hasil pasang dari Team Hub
  sebagai `agent`. Panel memanggil `GET /api/team-skills` sekali, menyimpan daftar namanya,
  lalu mencocokkan nama untuk memasang badge itu.
- **Skill bawaan (`bundled`) tidak punya tombol Bagikan dan tidak punya tombol Copot** — semua
  orang sudah menerimanya dari paket instalasi.
- **Pesan galat Hermes ditampilkan apa adanya.** Helper `errText()` membaca `details.detail`
  lebih dulu, karena tanpa itu pesan validasi frontmatter dari Hermes hilang dan user hanya
  melihat "HTTP 400".

---

## 6. Tab MCP Servers

Sumber data: laptop user, lewat relay yang sama.

### 6.1 Urutan yang berjalan otomatis saat tab dibuka

1. `GET /api/relay/mcp/:nodeId/servers` → daftar server dari `~/.hermes/` di laptop user.
2. Kalau daftar tidak memuat Canva, panel **memasangnya sendiri** satu kali:
   `POST /api/relay/mcp/:nodeId/servers` dengan `npx -y mcp-remote@latest https://mcp.canva.com/mcp`.
   Balasan 409 (sudah ada) diperlakukan sebagai sukses.
3. `GET /api/relay/mcp/:nodeId/canva-token-check` memeriksa apakah token `mcp-remote` sudah ada
   di disk. Ini **satu-satunya path yang tidak diteruskan ke Hermes** — `relay_node.py`
   menjawabnya langsung dengan membaca berkas, supaya tidak perlu menyalakan proses.
4. Setiap server yang belum diuji dijalankan `POST .../servers/:name/test` → connect, ambil daftar
   tools, putus. Jumlah tools inilah yang jadi badge "Connected · N tools".
   Canva dilewati kalau tokennya belum ada, supaya tidak menggantung 120 detik lalu gagal.
5. Tombol **Connect** pada Canva memanggil `test` (proses `mcp-remote` yang membuka jendela OAuth
   sendiri). Untuk server HTTP lain, tombolnya memanggil `POST .../servers/:name/auth` dan
   membuka `auth_url` di jendela popup.

### 6.2 Arti badge

| Badge | Artinya |
|---|---|
| `Connected · N tools` | uji berhasil, `tools.length > 0` |
| `Testing` | uji sedang berjalan |
| `Error` | uji gagal atau balasan bukan daftar tools (`toolCounts = -1`) |
| `Idle` | belum diuji, atau diuji tapi hasilnya nol tools |

---

## 7. Tab Team Hub

Sumber data: **database VIMS**, bukan relay. Ini pembeda utamanya.

Pemisahan itu disengaja: daftar skill tim tetap bisa dibuka walau node sedang offline —
yang mati hanya tombol **Pasang**, karena memasang berarti menulis berkas ke laptop.

### 7.1 Tiga alur inti

**Bagikan** (dimulai dari tab Skills)
1. `GET /api/relay/skills/:nodeId/content?name=` → isi SKILL.md + `extra_file_count`.
2. Kalau `extra_file_count > 0`, tombol Unggah dikunci. Alasannya: yang bisa dipindahkan ke mesin
   lain hanya SKILL.md, jadi skill berkas jamak akan tiba dalam keadaan rusak. Ditolak di sini,
   bukan setelah rekan tim memasangnya.
3. `POST /api/team-skills` → backend memvalidasi nama (`^[a-z0-9][a-z0-9-]{1,63}$`), batas
   100.000 karakter (disamakan dengan batas Hermes), mengurai frontmatter untuk mengisi
   `description`/`version`/`tags`, menghitung `contentHash` (sha256), lalu menyimpan.

**Pasang**
1. `GET /api/team-skills/:id` → detail + isi SKILL.md.
2. `POST /api/relay/skills/:nodeId` → Hermes menulis `~/.hermes/skills/<nama>/SKILL.md`.
3. `POST /api/team-skills/:id/installed` → `install_count++`.
4. Kalau Hermes menolak karena nama sudah dipakai, UI **tidak menimpa diam-diam**. Muncul
   konfirmasi terpisah yang memanggil `PUT /api/relay/skills/:nodeId/content` — salinan lokal
   bisa saja sudah diedit user.

**Nilai & pakai**
- `POST /api/team-skills/:id/rating` — satu orang satu rating per skill, boleh diubah.
  `rating_avg` dan `rating_count` dihitung ulang di dalam transaksi, bukan diagregasi saat dibaca.
- `POST /api/team-skills/usage/report` — dikirim **menumpang** pemuatan tab Skills, karena
  `GET /api/skills` sudah membawa angkanya. Gagal di sini sengaja ditelan diam-diam.

### 7.2 Tabel database

| Tabel | Isi |
|---|---|
| `team_skills` | isi SKILL.md (`mediumtext`), hash, penulis, `install_count`, rating terdenormalisasi |
| `team_skill_ratings` | 1–5 + komentar, unik per (skill, user) |
| `team_skill_usage` | angka mentah dari `.usage.json` per mesin, unik per (skill, user) |

**Penting:** baris `team_skill_usage` di-**upsert** (nilai diganti), bukan ditambahkan.
Angka dari `.usage.json` sudah kumulatif — kalau ditambahkan, angkanya berlipat setiap kali
modal Agent Tools dibuka.

### 7.3 Pengurutan dan hak akses

- Urutan: `recent`, `rating`, `usage`, `installs`.
- Penulis skill boleh mengubah dan mengarsipkan miliknya. Role Dev/Admin/Owner (1/2/3) boleh
  mengubah milik siapa pun.
- Hapus = arsip (soft delete lewat kolom `status`), bukan hilang dari database.

---

## 8. Yang perlu diingat saat menambah fitur di modal ini

1. **Node offline = 503 di semua endpoint relay.** Tab Skills dan MCP kosong total; ini normal,
   bukan bug. Hanya Team Hub yang tetap terisi.
2. **Menambah aksi baru berarti menyentuh tiga repo**: endpoint di `custom-hermes/web_server.py`,
   proxy tipis di `relay.ts`, pemanggil di panel. Proxy-nya seragam — salin pola yang ada.
3. **Batas 100.000 karakter harus tetap sama** di `teamSkills.ts` dan
   `custom-hermes/tools/skill_manager_tool.py`. Kalau backend lebih longgar, skill lolos ke
   registry lalu ditolak saat dipasang — gagalnya baru ketahuan di mesin orang lain.
4. **Timeout 120 detik hanya untuk path `/test`.** Aksi baru yang lambat perlu penyesuaian di
   `hub.sendMcpRequest` dan di `relay_node.py` sekaligus.
5. **Angka `usage` yang tampil di daftar skill adalah `use+view+patch` dijumlah**, jadi sekadar
   membuka skill menaikkannya. Untuk memeringkat, pakai `usage_detail.use`.

## 9. Yang belum ada

- Sinkronisasi versi: kalau skill di Team Hub diperbarui, salinan yang sudah terpasang di laptop
  tidak tahu. `content_hash` sudah disimpan untuk keperluan ini, tetapi belum dipakai
  membandingkan.
- Berbagi skill berkas jamak — masih ditolak di UI, belum ada jalur pengganti.
- Katalog MCP: `GET /api/mcp/catalog` sudah ada di Hermes tetapi belum diproksi relay, jadi
  penambahan server MCP dari UI masih terbatas pada Canva yang dipasang otomatis.
