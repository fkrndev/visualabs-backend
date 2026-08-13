# Tombol "Install Agent" di VBOX → Install `custom-hermes`

**Status:** ✅ Terimplementasi 3 Agustus 2026 · panduan user ditambahkan 5 Agustus 2026 — **belum siap deploy**, lihat [§7 blocker](#blocker-deploy--audit-5-agustus-2026)
**Uji lapangan (Windows):** ke-1 12 Agu → [§10](#10-insiden-lapangan--instrumentasi-diagnostik-12-agustus-2026) · ke-2 13 Agu → [§11](#11-uji-lapangan-kedua--13-agustus-2026-vbox-0180-windows) · **ke-3 13 Agu: akar masalahnya ketemu — jendela VBOX yang beku ("Not Responding"), installernya sendiri tidak pernah macet** → [§12](#12-penyebabnya-ketemu--ui-beku-bukan-installer-macet-13-agustus-2026)
**Keputusan:** distribusi lewat **tarball dari backend**
**Repo terkait:** `v-box` (Tauri v2 + React), `v-auto-backend` (Bun + Hono), `custom-hermes` (fork `visualabs-id/custom-hermes` dari `NousResearch/hermes-agent`), `v-auto-frontend` (SvelteKit)
**Dokumen terkait:** [run.md](run.md) — cara menjalankan Hermes + relay untuk dev local

---

## 1. Tujuan

User buka VBOX → Settings → klik satu tombol **"Install Agent"** → VBOX memasang `custom-hermes` di mesin user (tanpa terminal, tanpa install Python/uv/Node manual) → tombol **Start** di card "Hermes Engine" langsung bisa dipakai.

Target user: tim advertiser yang **bukan** developer. Jadi: nol prompt teknis, progress kelihatan, gagal harus jelas kenapa.

---

## 2. Keputusan arsitektur & kenapa

### Kenapa tarball, bukan `git clone`

Repo `visualabs-id/custom-hermes` **private**, jadi mesin user tidak bisa clone tanpa kredensial. Selain itu `custom-hermes/scripts/install.sh:46-47` meng-hardcode repo upstream:

```bash
REPO_URL_SSH="git@github.com:NousResearch/hermes-agent.git"
REPO_URL_HTTPS="https://github.com/NousResearch/hermes-agent.git"
```

Tidak ada flag `--repo` maupun env override. Jalankan apa adanya → yang terpasang Hermes upstream, tanpa `hermes_cli/relay_node.py` yang dibutuhkan VBOX.

**Tarball menyelesaikan dua-duanya sekaligus.** Backend menyajikan source-nya, VBOX extract sendiri, lalu stage `repository` cukup dilewati. Konsekuensi penting: **`custom-hermes` tidak perlu dipatch sama sekali** — rencana awal (menambah env `HERMES_REPO_URL`) dibatalkan, dan sync dengan upstream tetap bersih.

### Penemuan kunci — installer-nya memang dirancang untuk GUI

`custom-hermes` mewarisi protokol staged JSON dari upstream:

```bash
bash install.sh --manifest
# → {"protocol_version":1,"stages":[{"name":"prerequisites","title":"System prerequisites",...}]}

bash install.sh --stage venv --non-interactive --json --dir D --hermes-home H
# → {"ok":true,"stage":"venv","skipped":false}
```

Log manusia dicetak dulu, **frame JSON satu baris di akhir** — parsernya membaca dari belakang. Windows pakai `install.ps1` dengan flag PascalCase (`-Stage`, `-NonInteractive`, `-Json`, `-InstallDir`, `-HermesHome`).

Installer inilah yang mengurus **uv, Python 3.11, Node.js, ripgrep, ffmpeg, Playwright/Chromium** — kerjaan berat yang tidak ditulis ulang. Reference implementation lengkap ada di `custom-hermes/apps/bootstrap-installer/src-tauri/src/` (kebetulan Tauri juga).

### Kenapa staged, bukan sekali jalan

Install penuh 5–15 menit (download Chromium saja ratusan MB). Tanpa progress per-stage, user mengira app hang lalu force-quit di tengah jalan.

### PyInstaller bundle dibuang

Jalur lama membundel `hermes_engine` (PyInstaller) ke dalam `.app`/`.exe`. Dibuang karena: bikin installer VBOX bengkak (DMG sudah 114 MB *tanpa* Hermes), hanya pernah dibuild untuk Windows, dan mengikat update Hermes ke rilis VBOX.

---

## 3. Arsitektur terpasang

```
┌─ VBOX (React) ─ Settings → Card "Hermes Engine" ────────┐
│   [ Install Agent ]  ← kalau belum terpasang            │
│   [ Start ][ Stop ][ Reload ][ Update ]  ← kalau sudah   │
│   HermesInstallModal: checklist stage + log tail + batal │
└──────────────┬───────────────────────────────────────────┘
               │ invoke + listen("hermes-install:*")
┌──────────────▼─ VBOX (Rust) features/hermes_install.rs ─┐
│ 1. GET /api/hermes/manifest    → commit + sha256 + size  │
│ 2. GET /api/hermes/tarball     → download + verif sha256 │
│ 3. extract → $HERMES_HOME/hermes-agent                   │
│ 4. install.sh --manifest → daftar stage                  │
│ 5. tiap stage: --stage X --non-interactive --json        │
│    (repository/desktop + stage interaktif DILEWATI)      │
│ 6. GET /api/hermes/config → tulis config.yaml + .env     │
└──────────────┬───────────────────────────────────────────┘
               │ bash (Unix) / powershell.exe (Windows)
┌──────────────▼─ scripts/install.sh (dari tarball) ──────┐
│ uv · Python 3.11 · Node · ripgrep · ffmpeg · Playwright │
└──────────────────────────────────────────────────────────┘
```

**Lokasi install** (harus identik dengan yang dipakai Hermes sendiri — kalau drift, VBOX pasang ke A tapi mencarinya di B):

| OS | `HERMES_HOME` | Kode |
|---|---|---|
| macOS / Linux | `~/.hermes` | `~/.hermes/hermes-agent` |
| Windows | `%LOCALAPPDATA%\hermes` | `%LOCALAPPDATA%\hermes\hermes-agent` |

**Stage yang ditampilkan ke user:**
`vbox-download` → `vbox-extract` → `prerequisites` → `venv` → `python-deps` → `node-deps` → `path` → `config` → `vbox-configure` → `complete`

Yang dilewati: `repository` (source dari tarball) dan `desktop` (butuh `--include-desktop`) berdasarkan nama; ditambah **semua stage ber-`needs_user_input: true`** berdasarkan manifest — config-nya ditulis VBOX sendiri di `vbox-configure`. Nama stage interaktif berbeda antar-platform (`setup` di `install.sh`, `configure` di `install.ps1`), jadi jangan pernah menyaringnya lewat daftar nama; lihat [§11](#11-uji-lapangan-kedua--13-agustus-2026-vbox-0180-windows).

---

## 4. Yang sudah dikerjakan

### Backend (`v-auto-backend`)

| Berkas | Isi |
|---|---|
| `scripts/pack-hermes.ts` | baru — `git archive` → tarball + sha256 + `manifest.json` ke `storage/hermes/` |
| `src/routes/hermes.ts` | baru — `GET /manifest`, `/tarball`, `/config`, semua di balik JWT |
| `src/index.ts` | mount `/hermes` **sebelum** route `"/"` |
| `.gitignore` | `storage/hermes/` — tanpa ini tarball 69 MB ikut ter-commit |
| `.env.example` | `HERMES_LLM_PROVIDER` / `HERMES_LLM_MODEL` / `HERMES_LLM_API_KEY` / `HERMES_DIST_DIR` (ditambahkan 5 Agu 2026 — sebelumnya keempatnya tidak terdokumentasi sama sekali) |

Endpoint `/config` menyajikan `config.yaml` + API key dari **env server** (`HERMES_LLM_PROVIDER` / `HERMES_LLM_MODEL` / `HERMES_LLM_API_KEY`), menggantikan key yang ditanam di `install-team.ps1`.

### VBOX Rust (`v-box/src-tauri`)

| Berkas | Isi |
|---|---|
| `src/features/hermes_install.rs` | baru (~700 baris) — download, verifikasi sha256, extract anti path-traversal, stage runner, penulisan config, 4 command, 7 unit test |
| `src/features/mod.rs`, `src/lib.rs` | registrasi modul + command |
| `src/lib.rs` | `which_hermes()` / `kill_hermes_on_port()` / `stop_hermes()` jadi cross-platform |
| `tauri.conf.json` | hapus resource `../../hermes-agent/dist/hermes_engine/` |

Command: `hermes_check_installed`, `hermes_check_update`, `hermes_install_start`, `hermes_install_cancel`, `hermes_install_status`.
Event: `hermes-install:manifest` / `:stage` / `:log` / `:done`.

**`hermes_check_update` (10 Agu 2026)** menutup lubang yang bikin seluruh rantai distribusi ini percuma: VBOX tidak pernah membandingkan commit terpasang dengan yang ada di backend. Badge di Settings hanya menampilkan `.vbox_commit` lokal dan tombol Update selalu muncul tanpa syarat — jadi setiap kali tarball di-pack ulang, **tidak ada seorang pun yang diberi tahu**. Sekarang commit lokal dibandingkan dengan manifest; kalau beda, muncul badge kuning "Update tersedia → `<commit>`" dan tombol Update berubah jadi menonjol.

Command ini sengaja mengembalikan `available: false` + `error` alih-alih gagal keras. Backend mati, belum login, atau tarball belum di-pack (503) bukan alasan untuk merusak kartu Hermes Engine — cukup jangan tampilkan tanda update. Kalau Hermes belum terpasang sama sekali, `available` juga selalu `false` supaya tombol Install dan Update tidak bersaing.

### VBOX Frontend (`v-box/src`)

| Berkas | Isi |
|---|---|
| `components/HermesInstallModal.tsx` | baru — checklist stage, log tail auto-scroll, batal, salin log, coba lagi |
| `pages/Settings.tsx` | `HermesControl` cek `hermes_check_installed()`; tombol Install / Update; badge commit |

### VIMS Frontend (`v-auto-frontend`) — ditambahkan 5 Agustus 2026

| Berkas | Isi |
|---|---|
| `src/routes/agent/install/+page.svelte` | baru — panduan pasang dengan **dua jalur** (tab): lewat VBOX, atau manual lewat Terminal. Menampilkan **status node live** (`GET /api/relay/nodes`, cari `node-{userId}`, polling 10 detik) + FAQ troubleshooting |
| `src/lib/components/app-sidebar.svelte` | entri menu "Agent Chat" + "Pasang Agent" di grup Automation, keduanya masuk `ADVERTISER_ALLOWED_URLS` |
| `src/routes/agent/+page.svelte` | link "Belum ada agent? Pasang di komputermu →" saat daftar node kosong |

**Jalur 1 — VBOX (disarankan).** 5 langkah: unduh VBOX (tab macOS/Windows, link
`v-box-release/releases/latest`), login, Install Agent, tunggu, Start. Halaman ini murni panduan;
instalasinya tetap dikerjakan VBOX.

**Deteksi VBOX otomatis.** Mayoritas tim sudah memasang VBOX, jadi langkah 1 hanya jadi gangguan.
Halaman mem-probe `http://127.0.0.1:40325/health` — VBOX menyalakan Local Automation API tanpa
syarat saat aplikasinya dibuka (`lib.rs`: *"API task … always ON"*, port default 40325), `/health`
bebas auth dan CORS-nya `*`. Kalau terdeteksi, langkah 1 berubah jadi kartu hijau bercentang
"sudah beres" beserta versinya, dan blok unduhan diganti satu tautan kecil.

Tiga hal yang membuat deteksi ini jujur, bukan tebakan:

- Yang terdeteksi adalah VBOX yang **sedang berjalan**, bukan sekadar terpasang — dan justru itu yang relevan, karena agent cuma hidup selama VBOX terbuka.
- Kegagalan probe di halaman **https** dilaporkan sebagai `blocked` ("tidak bisa memeriksa otomatis"), bukan `absent`. Browser memblokir permintaan ke alamat lokal dari halaman https, jadi gagal ≠ tidak terpasang. Di http, gagal memang berarti tidak berjalan.
- Ada tombol **Periksa lagi**, untuk kasus user membuka VBOX setelah halaman ini terbuka.

Timeout probe 2,5 detik lewat `AbortController` supaya halaman tidak menggantung saat tidak ada
yang mendengarkan di port itu.

**Jalur 2 — manual lewat Terminal.** Untuk user yang tidak mau/tidak bisa memakai VBOX. Prinsipnya
sama persis dengan yang dilakukan VBOX, cuma dijalankan tangan:

1. **Source tetap dari backend**, bukan `git clone`. Tombol unduh melakukan `fetch` ber-`Authorization: Bearer <JWT>` ke `/api/hermes/tarball` lalu menyimpannya sebagai blob — endpoint-nya JWT-only, jadi `<a href>` biasa tidak bisa dipakai. Metadata (commit, ukuran, tanggal) diambil dari `/api/hermes/manifest`.
2. **Stage `repository` dilewati**, sama seperti `SKIPPED_STAGES` di `hermes_install.rs`. Ini bukan optimasi — kalau ikut dijalankan, `install.sh`/`install.ps1` meng-clone `NousResearch/hermes-agent` dan menimpa source dari server, sehingga `relay_node.py` hilang dan node tidak akan pernah muncul di relay hub. Alasannya dijelaskan ke user dengan bahasa awam di halamannya. Stage yang dijalankan: `prerequisites venv python-deps node-deps path config`.
3. **`config.yaml` + `.env` di-generate dari halaman.** `config.yaml` apa adanya dari `/api/hermes/config`; `.env` dirakit di browser dengan isi yang identik dengan `write_env_merged()` milik VBOX — API key dari server, `HERMES_RELAY_HUB_URL` diturunkan dari `PUBLIC_API_BASE_URL` (`http→ws`, `https→wss`), `HERMES_RELAY_NODE_ID` = `node-{userId}`, dan `HERMES_RELAY_LOCAL_TOKEN` = `HERMES_DASHBOARD_SESSION_TOKEN` diacak lewat `crypto.randomUUID()`. Berkasnya diarahkan ke `$HERMES_HOME/.env` (bukan root source) karena `env_loader.load_hermes_dotenv()` memuat `~/.hermes/.env` dengan `override=True`.
4. **Node token diminta lewat input**, tidak diambil otomatis. Backend tidak punya endpoint yang membocorkan `RELAY_NODE_TOKEN` ke user, dan sebaiknya tetap begitu — user memintanya ke admin.

Perbedaan yang disebutkan eksplisit ke user: jalur manual tidak punya auto-start, jadi `hermes serve`
harus dijalankan lagi tiap reboot.

### Bug lama yang ikut dibereskan

1. **`tauri.conf.json:67` menunjuk repo yang salah** — `../../hermes-agent/dist/hermes_engine/` (upstream, tidak pernah dibuild). Terkonfirmasi langsung oleh build script: `resource path doesn't exist`. Build selama ini hanya lolos karena flag `--no-hermes` menghapus entri itu — flag tersebut kini vestigial.
2. **`which_hermes()` Windows-only** — pakai `where`, hanya cari `hermes_engine.exe`. Sekarang: hasil install VBOX → `hermes` di PATH → `uv` (dev) → bundle lama.
3. **`kill_hermes_on_port()` / `stop_hermes()` Windows-only** — `netstat`/`taskkill`. Unix sekarang `lsof -ti tcp:9119 -sTCP:LISTEN` + SIGTERM lalu SIGKILL.

---

## 5. Hasil verifikasi

| Uji | Hasil |
|---|---|
| `cargo check` | ✅ bersih, tanpa warning |
| `tsc --noEmit` | ✅ bersih |
| `cargo test --lib hermes_install` | ✅ 7/7 lolos |
| Endpoint tanpa auth | ✅ 401 ketiganya |
| Endpoint dengan JWT | ✅ 200, manifest & config benar |
| Tarball | ✅ 69 MB, 7627 entry, `install.sh` executable, `relay_node.py` ikut |
| `install.sh --manifest` di macOS | ✅ JSON bersih, stderr kosong |
| **Stage `config` di direktori non-git** | ✅ `{"ok":true,"stage":"config","skipped":false}` |
| Stage `setup` non-interactive | ✅ `{"ok":true,"stage":"setup","skipped":true}` |

Baris tebal itu asumsi paling kritis dari seluruh pendekatan ini, dan **diuji langsung, bukan disimpulkan**: `require_install_dir()` (`install.sh:2961`) hanya mengecek direktorinya ada — **tidak butuh `.git`**. Kalau butuh, seluruh jalur tarball gugur.

---

## 6. Gotcha yang sudah kena (jangan diulang)

- **`Bun.write(path, proc.stdout)` tidak nge-drain stream** → gzip kosong 23 byte yang lolos tanpa error. Pakai `git archive -o <file>`, biarkan git yang menulis.
- **Output install.sh penuh ANSI color code** (`\x1b[0;36m→\x1b[0m`). Harus di-strip sebelum masuk UI, dan strip-nya wajib iterasi **char bukan byte** — log-nya memuat `→ ✓ ⚕` multibyte yang rusak kalau byte-nya di-cast ke char.
- **Stage `config` sudah membuat `.env` dari template duluan.** `.env` harus di-**merge** (ganti key kita, pertahankan sisanya + komentar), bukan ditimpa.
- **Route baru wajib di-mount sebelum `app.route("/", ...)`** di `src/index.ts` — ada middleware wildcard yang bocor ke route yang didaftarkan setelahnya.
- **Extract jangan menghapus isi direktori lebih dulu** — `venv/` hasil install sebelumnya harus selamat supaya update tidak perlu build ulang dari nol.
- **Prop callback inline (`onInstalled={() => …}`) jangan jadi dependency `useEffect` yang memasang listener.** Identitasnya berubah tiap parent re-render, listener dipasang ulang terus, dan setiap event tercatat berkali-kali. Lihat [§10](#10-insiden-lapangan--instrumentasi-diagnostik-12-agustus-2026).
- **`listen()` itu async — cleanup bisa jalan sebelum promise-nya resolve.** Tanpa flag `disposed`, unlistener yang datang belakangan tidak pernah dipanggil dan listener-nya hidup selamanya.
- **Event Tauri fire-and-forget.** UI yang murni digerakkan event akan tersangkut permanen kalau satu event hilang. Selalu sediakan polling status sebagai jaring pengaman.

---

## 7. Yang masih perlu dilakukan

### Blocker deploy — audit 5 Agustus 2026

Tidak ada mock/dummy data di jalur ini: `pack-hermes.ts`, `routes/hermes.ts`, `routes/relay.ts`,
dan `relay/hub.ts` semuanya baca sumber nyata (git, disk, env, DB). Yang menghalangi deploy semata
**konfigurasi yang belum diisi**, bukan kode yang belum jadi:

- [x] ~~**`HERMES_LLM_API_KEY` belum ada di `.env` server**~~ **Beres 10 Agu 2026 — lewat jalur berbeda.** Pemeriksaan ulang menunjukkan server ternyata **tidak punya key sama sekali**, termasuk `DEEPSEEK_API_KEY`, jadi LLM Gateway pun mati. Diselesaikan dengan memilih mode gateway (lihat bagian berikutnya): `DEEPSEEK_API_KEY` + `LLM_TEAM_TOKEN` dipasang di server, `HERMES_LLM_PROVIDER=custom`, dan `HERMES_LLM_API_KEY` **sengaja dibiarkan kosong** karena tidak ada key yang perlu mendarat di laptop siapa pun.
- [x] ~~**Tarball di `storage/hermes/` sudah basi.**~~ **Beres 10 Agu 2026** — dan ternyata lebih parah dari dugaan: `storage/hermes/` di **produksi kosong sama sekali**, `pack-hermes.ts` belum pernah dijalankan di sana. `/api/hermes/manifest` membalas 503, artinya tombol "Install Agent" **tidak pernah berfungsi di produksi**; yang basi (commit `45a4396`) itu cuma salinan di mesin dev. Sekarang tarball commit `146b9aaa4a23` sudah terpasang dan manifest membalas 200.

  ✅ **Server sekarang bisa mem-pack sendiri (10 Agu 2026).** Sebelumnya tidak: kunci SSH server tidak punya akses ke repo private `custom-hermes` sehingga tarball harus dibuat di mesin dev lalu di-`scp`. Sudah dibereskan dengan mengikuti pola deploy key per-repo yang memang sudah dipakai server ini:

  - Kunci `~/.ssh/deploy_custom-hermes` (ed25519, tanpa passphrase) + alias SSH `github-custom-hermes` — sama persis polanya dengan `deploy_v-auto-backend` yang sudah ada.
  - Kunci publiknya terdaftar sebagai **deploy key read-only** di `visualabs-id/custom-hermes`. Read-only disengaja: server tidak pernah perlu push.
  - Checkout ada di `~/web/vims.dots.my.id/private/custom-hermes`, sejajar dengan `v-auto-backend`, sehingga `DEFAULT_REPO` (`../custom-hermes`) milik `pack-hermes.ts` langsung menemukannya tanpa `CUSTOM_HERMES_PATH`.

  Rilis versi Hermes baru sekarang cukup:

  ```bash
  ssh Visualabs
  cd ~/web/vims.dots.my.id/private/custom-hermes && git pull
  cd ../v-auto-backend && bun run scripts/pack-hermes.ts
  ```

  Catatan: `git archive` **tidak** byte-identik antar mesin (gzip beda versi), jadi tarball hasil pack di server punya sha256 berbeda dari hasil pack di laptop meski commit-nya sama. Ini tidak merusak apa pun — cache VBOX membandingkan hash terhadap manifest, tidak cocok → unduh ulang.

  Catatan: `storage/hermes/` ada di `.gitignore`, jadi `git reset --hard` milik `deploy.sh` **tidak** menghapusnya — tarball selamat melewati deploy berikutnya.
- [ ] **`RELAY_NODE_TOKEN` di `.env` masih token dev** (`dev-...`). Untuk production ganti nilai acak yang panjang. Perhatikan: VBOX mem-*fallback* ke literal `"rahasia123"` kalau field **Relay Node Token** di Settings kosong (`v-box/src-tauri/src/network/relay.rs:61`) — jadi pilih salah satu: set token beneran di tiap VBOX, atau pakai `RELAY_NODE_TOKENS` per-node. Jangan pernah menyetel token server jadi `rahasia123` supaya default itu "bekerja".
- [ ] **Rotate DeepSeek key** yang masih ter-commit di `custom-hermes/install-team.ps1:114` (nomor barisnya bergeser dari 101; key-nya masih ada dan tetap ada di riwayat git — rotasi, bukan sekadar hapus baris).

  **Satu-satunya blocker yang tersisa, dan sekarang jauh lebih murah diselesaikan.** Key yang dipasang di server 10 Agu 2026 adalah key yang sama dengan yang ter-commit itu — dikonfirmasi identik lewat perbandingan hash. Bedanya: sejak mode gateway aktif, key itu hidup **hanya di satu tempat**. Rotasi sekarang berarti mengganti satu baris di `.env` server lalu `pm2 restart vims` — tidak ada laptop yang perlu disentuh, tidak ada yang perlu install ulang.

### ✅ Inkonsistensi arsitektur LLM — sudah diputuskan (10 Agu 2026)

**Diambil: opsi 1, lewat gateway.** `HERMES_LLM_PROVIDER=custom` di server membuat
`/api/hermes/config` mengirim `base_url: https://vims.dots.my.id/api/llm/v1` + `api_key`
berisi `LLM_TEAM_TOKEN`, dan `env: {}` — **key DeepSeek tidak pernah keluar dari server**.
Provider `custom` di Hermes memang tidak butuh env key (`plugins/model-providers/custom`:
`env_vars=()` — *"No fixed key"*).

Yang terpasang di produksi: `DEEPSEEK_API_KEY`, `LLM_TEAM_TOKEN` (48 hex), `HERMES_LLM_PROVIDER=custom`,
`HERMES_LLM_MODEL=deepseek-chat`, `HERMES_LLM_BASE_URL`. `.env` lama dicadangkan ke `.env.bak-<timestamp>`.

Diverifikasi end-to-end: `/api/llm/health` → `keyConfigured: true`; POST tanpa token → **401**;
POST dengan token → balasan asli dari DeepSeek; `/api/hermes/config` → `mode: "gateway"`, `warning: null`.

⚠️ **`LLM_TEAM_TOKEN` wajib diisi bersamaan dengan `DEEPSEEK_API_KEY`, bukan menyusul.** Gate di
`llmGateway.ts` hanya aktif kalau token itu terisi — tanpa itu `/api/llm/v1` adalah proxy
**terbuka** ke DeepSeek yang bisa dipakai siapa pun di internet dengan tagihan ke kita. Statusnya
di `.env.example` sudah dinaikkan dari "opsional" jadi wajib.

Konsekuensi untuk VBOX: `env` kosong sekarang punya dua arti berlawanan, jadi payload `/config`
menambahkan `mode` (`gateway`/`direct`) dan `warning`. Tanpa itu VBOX memperingatkan user soal API
key hilang padahal semuanya benar. `mode` default `direct` kalau backend belum mengirimnya, supaya
server lama tetap berperilaku persis seperti dulu.

<details>
<summary>Catatan lama sebelum keputusan diambil</summary>

`/api/llm` (LLM Gateway) dibuat supaya key DeepSeek asli **tidak pernah keluar dari server**: node
cukup diarahkan `base_url` ke `<host>/api/llm/v1`. Tapi `config.yaml` yang ditulis `/api/hermes/config`
**tidak menyetel `base_url` sama sekali** dan malah mengirim `DEEPSEEK_API_KEY` mentah ke `.env` di
setiap laptop user. Dua jalur ini saling meniadakan — yang terpasang sekarang adalah jalur yang
justru menyebarkan key.

Pilih satu sebelum dibagikan ke tim:

1. **Lewat gateway** (disarankan): `/config` menulis `base_url: <host>/api/llm/v1` + `LLM_TEAM_TOKEN`, `env` tidak berisi key asli. Key bisa dirotasi tanpa menyentuh laptop siapa pun.
2. **Distribusi key**: pertahankan yang sekarang, tapi sadari tiap laptop memegang key yang bisa dipakai di luar jam kerja dan rotasi berarti semua orang harus re-install/re-configure.

</details>

### Sebelum dipakai tim

- [ ] **Jalankan `bun run scripts/pack-hermes.ts` di server** tiap merilis versi Hermes baru.
- [ ] Sebarkan link panduan `/agent/install` ke tim (bukan dokumen ini — dokumen ini untuk developer).

### Pengujian yang belum dilakukan

- [ ] **Install E2E penuh di macOS ARM mesin bersih** — belum pernah dijalankan sampai tuntas; memasang uv/Python/Node/Chromium sungguhan
- [x] ~~Windows 11 mesin bersih~~ — **dijalankan 12 Agustus 2026, macet di stage `python`.** Lihat [§10](#10-insiden-lapangan--instrumentasi-diagnostik-12-agustus-2026). Perlu diulang setelah perbaikan.
- [ ] Install ulang di atas instalasi yang sudah ada → harus jadi update, bukan error
- [ ] Cancel di tengah stage → retry harus tetap bisa jalan
- [ ] Internet putus di tengah download → pesan jelas, bukan hang
- [ ] End-to-end: Install → Start → node muncul di relay hub VIMS

---

## 8. Risiko tersisa

| Risiko | Dampak | Mitigasi |
|---|---|---|
| `install.sh` belum teruji penuh di macOS ARM | Install gagal di separuh tim | Baru stage `config` + `--manifest` yang diuji; stage berat (`venv`, `python-deps`, `node-deps`) belum |
| Jalur Windows macet di uji pertama | Gagal di mayoritas user | Tiga dugaan penyebab sudah ditutup + log persist ditambahkan (§10). **Penyebab pastinya belum terkonfirmasi** — butuh satu run ulang yang menghasilkan berkas log |
| Antivirus Windows mengarantina `uv.exe` | Install gagal | Terdokumentasi upstream (`README.md:78-100`); pertimbangkan deteksi + instruksi whitelist |
| Tarball 69 MB per download | Boros bandwidth kalau sering update | Sudah di-cache per-commit di `$HERMES_HOME/bootstrap-cache`, dilewati kalau sha256 cocok |
| Backend jadi titik tunggal distribusi | Backend mati = tidak bisa install | Belum ada fallback bundled |

---

## 9. Pertanyaan terbuka

1. Provider LLM final: tetap DeepSeek, atau sudah pindah? (dan lewat gateway atau distribusi key — lihat §7)
2. Perlu tombol **Uninstall**? (`custom-hermes/hermes_cli/uninstall.py` sudah ada)
3. Perlu auto-update Hermes (`hermes update`), atau install manual saja tiap rilis?
4. Kalau user sudah punya Hermes hasil install manual — sekarang `which_hermes()` mendeteksi dan memakainya. Cukup, atau mau dipaksa ke lokasi standar?

---

## 10. Insiden lapangan & instrumentasi diagnostik (12 Agustus 2026)

### Yang terjadi

Uji pertama di mesin tim (**Windows**, jalur `install.ps1`) macet. Modal berhenti di
stage `python` — spinner berputar tanpa akhir, tidak ada pesan error, tidak ada progres
ke stage berikutnya (`git`).

Dua hal terbaca dari tangkapan layarnya:

1. Stage `python` **sudah selesai dengan sukses**. Frame hasilnya sudah tercetak:
   `{"skipped":false,"ok":true,"reason":null,"duration_ms":165,"stage":"python"}`
2. **Setiap baris log muncul dua kali** — persis dua, termasuk frame JSON di atas,
   dengan `duration_ms` yang identik.

Poin 2 memastikan ini bukan dua proses installer yang jalan bersamaan (dua proses
terpisah tidak mungkin menghasilkan `duration_ms` yang sama persis) melainkan **satu
proses dengan dua listener di frontend**.

### Kenapa kita buta

Masalah sebenarnya bukan stage `python`-nya, tapi bahwa **tidak ada satu pun cara untuk
tahu di mana macetnya**:

- Seluruh jejak install hanya hidup di dalam modal. User menutup VBOX → semua hilang.
  Tidak ada yang bisa dikirim ke kita.
- Spinner tidak membedakan "sedang mengunduh Chromium 300 MB" dari "menggantung
  selamanya". Dua keadaan yang sangat berbeda tampil identik.
- Tidak ada timeout. Proses yang menggantung akan menggantung sampai kiamat.
- UI sepenuhnya digerakkan event. Event Tauri fire-and-forget — satu yang hilang,
  checklist tersangkut permanen meski installernya jalan terus.

### Akar masalah yang ditemukan & ditutup

| # | Temuan | Bukti | Perbaikan |
|---|---|---|---|
| 1 | Listener dobel di `HermesInstallModal` | Log muncul 2× dengan `duration_ms` identik | `onInstalled` dipindah ke `useRef` (bukan dependency `useEffect`); flag `disposed` menutup race `listen()` async vs cleanup |
| 2 | `stdin` di-inherit dari proses GUI | Dibaca dari kode — VBOX tidak punya konsol, jadi prompt apa pun menggantung tanpa batas | `Stdio::null()` + PowerShell dijalankan dengan `-NonInteractive -NoProfile` |
| 3 | Menunggu EOF pipe, bukan matinya proses | Dibaca dari kode — proses turunan (`winget`, `npm`, `uv`) mewarisi handle stdout dan menahannya hidup setelah induknya `exit` | Saat sunyi, `try_wait()` dicek; kalau prosesnya sudah keluar, berhenti membaca alih-alih menunggu EOF yang tidak akan datang |

**Penting: mana yang benar-benar menyebabkan macet belum terkonfirmasi.** Temuan 1 pasti
nyata (ada buktinya di tangkapan layar) tapi ia hanya menjelaskan log dobel — bukan
macetnya. Temuan 2 dan 3 murni dari pembacaan kode: dua-duanya *bisa* menghasilkan gejala
persis seperti yang terlihat, dan dua-duanya salah terlepas dari insiden ini, jadi
ditutup. Run ulang yang menghasilkan berkas log-lah yang akan memutuskan.

### Instrumentasi yang ditambahkan

**Berkas log persist** — `$HERMES_HOME/logs/vbox-install-<YYYYMMDD-HHMMSS>.log`, satu per
run. Memuat header lingkungan (versi VBOX, OS/arch, path, interpreter), **perintah persis**
yang dijalankan tiap stage, setiap baris stdout/stderr ber-timestamp, tiap perpindahan
stage, exit code per stage, dan baris penutup `INSTALL SELESAI` / `INSTALL GAGAL`. Inilah
yang diminta dari tim kalau gagal lagi.

**Watchdog + timeout idle** — berbasis diam, bukan durasi total (`node-deps` sah makan 15
menit selama masih mencetak progress):

- tiap 30 detik sunyi → baris "masih menjalankan '<stage>' — N tanpa output baru"
- 10 menit sunyi → proses dibunuh, stage ditandai gagal dengan sebab yang jelas
- bisa disetel lewat `VBOX_HERMES_IDLE_TIMEOUT_SECS`

**Polling status sebagai jaring pengaman** — modal memanggil `hermes_install_status` tiap
2 detik, tidak lagi hanya mengandalkan event. Ini menyembuhkan seluruh kelas bug
"event hilang": stage yang tertinggal di `running` dikoreksi sendiri, dan install yang
berakhir tanpa event `done` tidak lagi menggantungkan UI selamanya.

**Angka umur & diam di UI** — "Stage `python` berjalan 3 menit 12 detik — diam 2 menit 5
detik. Dihentikan otomatis kalau menembus 10 menit." Membuat lambat vs macet bisa
dibedakan tanpa membaca log.

**Tombol "Buka Log"** — jatuh ke log terbaru di disk kalau belum ada run di sesi ini,
karena kegagalan kemarin justru yang paling ingin dilihat.

### Berkas yang berubah

| Berkas | Perubahan |
|---|---|
| `v-box/src-tauri/src/features/hermes_install.rs` | log persist, watchdog, idle timeout, `stdin` null, `-NoProfile -NonInteractive`, deteksi proses-mati-pipe-terbuka, status diperkaya, command `hermes_install_log_path` |
| `v-box/src-tauri/src/lib.rs` | daftarkan `hermes_install_log_path` |
| `v-box/src/components/HermesInstallModal.tsx` | fix listener dobel + race cleanup, polling status, indikator umur/diam, tombol "Buka Log" |

### Verifikasi

| Yang diuji | Cara | Hasil |
|---|---|---|
| Kompilasi Rust | `cargo check` | ✅ bersih, tanpa warning |
| Unit test | `cargo test --lib hermes_install` | ✅ 8/8 lolos (+1 test baru `fmt_dur`) |
| Tipe frontend | `npx tsc --noEmit` | ✅ bersih |
| Perilaku watchdog/timeout/log di Windows | — | ❌ **belum diuji runtime sama sekali** |

Yang di atas hanya membuktikan kodenya benar secara statis. Tidak satu pun jalur baru ini
pernah dieksekusi di Windows.

### Langkah berikutnya

1. Build ulang VBOX, minta satu orang tim mengulang install.
2. Kalau gagal lagi — minta berkas `vbox-install-*.log`-nya. Sekarang isinya cukup untuk
   menunjuk stage, perintah, dan baris terakhir sebelum macet.
3. Kalau ternyata lolos — catat penyebab pastinya di tabel akar masalah di atas, ganti
   "belum terkonfirmasi" dengan temuan sebenarnya.

---

## 11. Uji lapangan kedua — 13 Agustus 2026 (VBOX 0.1.80, Windows)

Run ini menghasilkan berkas log yang lengkap, jadi untuk pertama kalinya kita bisa melihat
apa yang sebenarnya terjadi.

### Kemajuan besar

Macet di stage `python` yang jadi pemicu §10 **tidak terulang**. Seluruh prereq lolos dan
sebagian besar install berhasil:

| Stage | Durasi | Hasil |
|---|---|---|
| `vbox-download` | 2 dtk | ✅ tarball dari cache (sha256 cocok) |
| `vbox-extract` | 84 dtk | ✅ 7630 file |
| `uv` · `python` · `git` · `node` · `system-packages` | 7,9 / 1,3 / 5,7 / 0,2 / 4,4 dtk | ✅ semua |
| `venv` | 17,5 dtk | ✅ Python 3.11.15 |
| `dependencies` | — | ⛔ **berhenti di sini** |

uv sempat menyelesaikan pekerjaannya: `Prepared 99 packages in 2m 16s` → `Installed 99
packages in 20.43s` → daftar 99 paket tercetak pada 14:57:14. Yang seharusnya menyusul
adalah `[OK] Main package installed (hash-verified via uv.lock)` lalu frame JSON —
keduanya instan, bukan pekerjaan berat. Log berhenti tepat di situ.

### Yang justru mencurigakan: watchdog-nya diam

Watchdog terbukti bekerja di run yang sama — ada `… masih menjalankan 'dependencies' — 32
detik tanpa output baru` pada 14:56:23. Tapi setelah 14:57:14 **tidak ada heartbeat sama
sekali**, padahal kalau prosesnya benar-benar menggantung harusnya muncul pada ~14:57:44,
dan setelah 10 menit prosesnya dibunuh dengan pesan yang jelas.

Diamnya watchdog menyisakan tiga kemungkinan:

1. Log disalin kurang dari 30 detik setelah baris terakhir — install sebenarnya masih jalan.
2. VBOX ditutup atau mati di titik itu.
3. Installer terus mengirim **baris kosong**: `emit_log` membuangnya sebelum menulis ke
   berkas, tapi loop pembacanya tetap menganggapnya tanda hidup. Timer watchdog ter-reset
   terus, heartbeat tak pernah berbunyi, idle timeout tak pernah tercapai.

**Nomor 3 adalah cacat di instrumentasi §10 itu sendiri** — persis kelas kegagalan yang
tidak terlihat sama sekali, dan bisa saja ia pula yang menjelaskan §10. Sudah diperbaiki.

> **Menyusul — dugaan di atas keliru.** Run ketiga membuktikan jawabannya nomor 2, dalam
> bentuk yang tidak terpikirkan di sini: jendela VBOX-nya yang membeku, sementara
> installernya jalan terus. Lihat [§12](#12-penyebabnya-ketemu--ui-beku-bukan-installer-macet-13-agustus-2026).
> Perbaikan baris-kosong tetap dipertahankan karena cacatnya nyata, tapi ia **bukan** akar
> masalah yang dicari.

### Perbaikan

| Temuan | Perbaikan |
|---|---|
| Baris kosong me-reset watchdog dan tidak tercatat di mana pun | Hanya baris yang tidak kosong (setelah strip ANSI) yang dihitung sebagai tanda hidup; baris kosong dihitung terpisah |
| Heartbeat tidak bisa membedakan "benar-benar diam" dari "mengeluarkan sampah yang kita buang" | Heartbeat sekarang mencetak jumlah baris + jumlah baris kosong yang diabaikan |
| **`SKIPPED_STAGES` meleset di Windows** — manifest `install.ps1` menamai stage interaktif `configure`, sementara daftarnya menyebut `setup` (nama milik `install.sh`) | Filter pindah ke `needs_user_input` dari manifest; daftar nama tinggal `repository` + `desktop` |

Soal bug Windows itu: akibatnya VBOX menjalankan `Stage-Configure` (wizard API key) di
setiap install Windows. **Tidak menyebabkan hang** — `Invoke-SetupWizard` menghormati
`-NonInteractive` dan keluar lebih awal — tapi user melihat stage yang seolah bekerja
padahal tidak melakukan apa pun, dan itu menutupi kenyataan bahwa konfigurasi sebenarnya
ditulis VBOX di `vbox-configure`. Dua test baru mengunci perilakunya memakai manifest
asli dari kedua platform.

### Verifikasi

| Yang diuji | Hasil |
|---|---|
| `cargo check` | ✅ bersih (2 warning pre-existing di `browser/launch.rs`, bukan dari jalur ini) |
| `cargo test --lib hermes_install` | ✅ 10/10 (2 test baru untuk `filter_stages`) |
| Perilaku baru di Windows | ❌ belum dieksekusi |

### Yang masih menggantung

**Penyebab berhentinya `dependencies` belum terkonfirmasi.** Yang menentukan: apakah log
itu disalin saat modal masih berputar (berarti kemungkinan 1 — install masih jalan dan
mungkin akhirnya selesai), atau setelah ditunggu lama (berarti kemungkinan 3, dan
perbaikan di atas akan membuktikannya di run berikutnya).

Kandidat lain yang belum tersingkir: Windows Defender memindai 99 paket yang baru ditulis
ke disk — bisa memakan menit dan sepenuhnya sunyi. Heartbeat yang sekarang akan
membedakannya dari hang sejati.

---

## 12. Penyebabnya ketemu — UI beku, bukan installer macet (13 Agustus 2026)

Tangkapan layar run ketiga menyelesaikan teka-teki §10 dan §11 sekaligus. Judul jendelanya:

```
VBOX (Not Responding)
```

**Installernya tidak pernah macet. Yang beku jendela VBOX-nya.** Dan begitu UI beku,
spinner berhenti berputar serta checklist berhenti diperbarui — jadi install yang masih
berjalan normal di background terlihat persis seperti hang. Itulah gejala yang tiga kali
dilaporkan sebagai "loading tidak selesai-selesai".

Ini juga menjelaskan kejanggalan §11 (log berhenti tanpa heartbeat sama sekali): berkas
lognya tidak berhenti — yang dikirim ke kita cuma potongan sampai detik user menyalinnya
saat UI membeku. Dugaan "baris kosong me-reset watchdog" ternyata **bukan** penyebabnya.
Perbaikannya tetap dipertahankan karena cacatnya nyata, tapi jangan dicatat sebagai
akar masalah.

Run ini juga membuktikan install berjalan jauh lebih dalam dari yang terlihat: `venv` →
`dependencies` → `node-deps` → `path` semuanya ✅, dan saat tangkapan layar diambil
`config-templates` sedang menyinkronkan skill.

### Dua sumber beban

| # | Sumber | Kenapa berat |
|---|---|---|
| 1 | **Satu event IPC per baris log** | Stage cerewet memuntahkan ratusan baris dalam sekejap (daftar 99 paket uv, sinkronisasi skill). Tiap event memicu `setLogs` → React me-render ulang **seluruh** daftar log. Ratusan render penuh per detik membekukan webview. |
| 2 | **Berkas log dibuka-tutup untuk SETIAP baris** | Di Windows tiap `open` melewati filter antivirus. Ratusan baris berturut-turut = ratusan pemindaian, cukup untuk menyendat task pembaca output. |

Sumber 2 adalah cacat yang **diperkenalkan sendiri oleh instrumentasi §10** — log persist
yang dimaksudkan untuk mendiagnosis kebekuan justru ikut memperparahnya di Windows.

### Perbaikan

| Lapis | Perubahan |
|---|---|
| Rust — pembaca output | Antrean dikosongkan sekaligus (`try_recv` sampai kering, maks 200 baris), bukan diproses satu per satu |
| Rust — event | `emit_logs` mengirim **array** baris dalam satu event; `emit_log` tinggal pembungkus satu elemen |
| Rust — berkas log | Handle dibuka sekali di awal run dan ditahan di `RUN_LOG_FILE`, bukan `OpenOptions::open` per baris |
| Frontend | Baris ditampung di ref, di-flush ke state maksimal sekali per 150 ms |
| Frontend | Buffer DOM 400 → 300 baris (yang lengkap tetap ada di berkas log) |

Watchdog sekarang berpatokan pada baris bermakna yang **terbaca**, bukan yang jadi
ditampilkan — saat mode `quiet` seluruh stdout hanya masuk berkas, dan itu tetap tanda
prosesnya hidup.

### Verifikasi

| Yang diuji | Hasil |
|---|---|
| `cargo test --lib hermes_install` | ✅ 10/10 |
| `npx tsc --noEmit` | ✅ bersih |
| Bebas-beku di Windows saat stage cerewet | ❌ **belum diuji** — ini yang harus dibuktikan run berikutnya |

### Catatan untuk run berikutnya

Yang membuktikan perbaikan ini berhasil bukan "install selesai", melainkan **jendela tetap
responsif selama `dependencies` dan `config-templates`**. Kalau masih membeku, sumber
beban ketiga yang belum tersentuh: `hermes_install_status` di-poll tiap 2 detik dan setiap
balasannya memicu render — jauh lebih ringan dari log, tapi belum diukur.
