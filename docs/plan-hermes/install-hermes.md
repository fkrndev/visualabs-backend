# Tombol "Install Agent" di VBOX → Install `custom-hermes`

**Status:** ✅ Terimplementasi 3 Agustus 2026 · panduan user ditambahkan 5 Agustus 2026 — **belum siap deploy**, lihat [§7 blocker](#blocker-deploy--audit-5-agustus-2026)
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
│    (repository / setup / gateway / desktop DILEWATI)     │
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

Yang dilewati: `repository` (source dari tarball), `setup`/`gateway` (butuh input interaktif — config ditulis VBOX sendiri), `desktop` (butuh `--include-desktop`).

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

Command: `hermes_check_installed`, `hermes_install_start`, `hermes_install_cancel`, `hermes_install_status`.
Event: `hermes-install:manifest` / `:stage` / `:log` / `:done`.

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

---

## 7. Yang masih perlu dilakukan

### Blocker deploy — audit 5 Agustus 2026

Tidak ada mock/dummy data di jalur ini: `pack-hermes.ts`, `routes/hermes.ts`, `routes/relay.ts`,
dan `relay/hub.ts` semuanya baca sumber nyata (git, disk, env, DB). Yang menghalangi deploy semata
**konfigurasi yang belum diisi**, bukan kode yang belum jadi:

- [ ] **`HERMES_LLM_API_KEY` belum ada di `.env` server** (dicek langsung — yang ada cuma `DEEPSEEK_API_KEY` + `RELAY_NODE_TOKEN`). Akibatnya `/api/hermes/config` mengembalikan `env: {}` → VBOX melewati penulisan `.env` → install sukses tapi Hermes tidak bisa memanggil model. Isi juga `HERMES_LLM_PROVIDER` / `HERMES_LLM_MODEL` bila bukan default DeepSeek.
- [ ] **Tarball di `storage/hermes/` sudah basi.** `manifest.json` menunjuk `45a4396ad0cf` (31 Jul), sedangkan `custom-hermes` HEAD sudah `49dcabed9` (3 Agu) — dan justru commit itu yang mengubah `hermes_cli/relay_node.py` + `stdio.py`. Siapa pun yang install sekarang dapat relay-node versi lama. **Jalankan ulang `bun run scripts/pack-hermes.ts`** sebelum deploy, dan jadikan itu langkah wajib tiap rilis.
- [ ] **`RELAY_NODE_TOKEN` di `.env` masih token dev** (`dev-...`). Untuk production ganti nilai acak yang panjang. Perhatikan: VBOX mem-*fallback* ke literal `"rahasia123"` kalau field **Relay Node Token** di Settings kosong (`v-box/src-tauri/src/network/relay.rs:61`) — jadi pilih salah satu: set token beneran di tiap VBOX, atau pakai `RELAY_NODE_TOKENS` per-node. Jangan pernah menyetel token server jadi `rahasia123` supaya default itu "bekerja".
- [ ] **Rotate DeepSeek key** yang masih ter-commit di `custom-hermes/install-team.ps1:114` (nomor barisnya bergeser dari 101; key-nya masih ada dan tetap ada di riwayat git — rotasi, bukan sekadar hapus baris).

### Inkonsistensi arsitektur LLM — perlu diputuskan sebelum rollout

`/api/llm` (LLM Gateway) dibuat supaya key DeepSeek asli **tidak pernah keluar dari server**: node
cukup diarahkan `base_url` ke `<host>/api/llm/v1`. Tapi `config.yaml` yang ditulis `/api/hermes/config`
**tidak menyetel `base_url` sama sekali** dan malah mengirim `DEEPSEEK_API_KEY` mentah ke `.env` di
setiap laptop user. Dua jalur ini saling meniadakan — yang terpasang sekarang adalah jalur yang
justru menyebarkan key.

Pilih satu sebelum dibagikan ke tim:

1. **Lewat gateway** (disarankan): `/config` menulis `base_url: <host>/api/llm/v1` + `LLM_TEAM_TOKEN`, `env` tidak berisi key asli. Key bisa dirotasi tanpa menyentuh laptop siapa pun.
2. **Distribusi key**: pertahankan yang sekarang, tapi sadari tiap laptop memegang key yang bisa dipakai di luar jam kerja dan rotasi berarti semua orang harus re-install/re-configure.

### Sebelum dipakai tim

- [ ] **Jalankan `bun run scripts/pack-hermes.ts` di server** tiap merilis versi Hermes baru.
- [ ] Sebarkan link panduan `/agent/install` ke tim (bukan dokumen ini — dokumen ini untuk developer).

### Pengujian yang belum dilakukan

- [ ] **Install E2E penuh di macOS ARM mesin bersih** — belum pernah dijalankan sampai tuntas; memasang uv/Python/Node/Chromium sungguhan
- [ ] Windows 11 mesin bersih (jalur `install.ps1` sama sekali belum disentuh runtime-nya)
- [ ] Install ulang di atas instalasi yang sudah ada → harus jadi update, bukan error
- [ ] Cancel di tengah stage → retry harus tetap bisa jalan
- [ ] Internet putus di tengah download → pesan jelas, bukan hang
- [ ] End-to-end: Install → Start → node muncul di relay hub VIMS

---

## 8. Risiko tersisa

| Risiko | Dampak | Mitigasi |
|---|---|---|
| `install.sh` belum teruji penuh di macOS ARM | Install gagal di separuh tim | Baru stage `config` + `--manifest` yang diuji; stage berat (`venv`, `python-deps`, `node-deps`) belum |
| Jalur Windows belum dijalankan sama sekali | Gagal di mayoritas user | Argumen `install.ps1` ditulis dari pembacaan kode, bukan dari eksekusi |
| Antivirus Windows mengarantina `uv.exe` | Install gagal | Terdokumentasi upstream (`README.md:78-100`); pertimbangkan deteksi + instruksi whitelist |
| Tarball 69 MB per download | Boros bandwidth kalau sering update | Sudah di-cache per-commit di `$HERMES_HOME/bootstrap-cache`, dilewati kalau sha256 cocok |
| Backend jadi titik tunggal distribusi | Backend mati = tidak bisa install | Belum ada fallback bundled |

---

## 9. Pertanyaan terbuka

1. Provider LLM final: tetap DeepSeek, atau sudah pindah? (dan lewat gateway atau distribusi key — lihat §7)
2. Perlu tombol **Uninstall**? (`custom-hermes/hermes_cli/uninstall.py` sudah ada)
3. Perlu auto-update Hermes (`hermes update`), atau install manual saja tiap rilis?
4. Kalau user sudah punya Hermes hasil install manual — sekarang `which_hermes()` mendeteksi dan memakainya. Cukup, atau mau dipaksa ke lokasi standar?
