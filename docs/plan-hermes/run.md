# Cara Menjalankan Hermes + Relay (Dev Local)

Panduan buat ngejalanin stack Hermes di laptop sendiri: **relay hub** (v-auto-backend),
**node Hermes** (custom-hermes), dan **frontend VIMS** (v-auto-frontend).
Tanpa VBOX — VBOX cuma pembungkus yang nge-spawn `hermes serve` dengan env yang sama.

---

## 1. Arsitektur singkat — siapa dial ke siapa

```
  Browser (VIMS)                Relay Hub                 Hermes lokal
  v-auto-frontend               v-auto-backend            custom-hermes
  :2026                         :2024                     :9119
       │                             │                          │
       │  WS /api/relay/client       │                          │
       │  ?node=node-5&token=<JWT>   │                          │
       ├────────────── dial keluar ──▶                          │
       │                             │   WS /api/relay/node     │
       │                             │   ?token=<NODE_TOKEN>    │
       │                             ◀── dial keluar ───────────┤
       │                             │      (relay-node agent,  │
       │                             │       in-process di      │
       │                             │       Hermes Python)     │
       │                             │                          │
       │                             │        ┌─────────────────┤
       │                             │        │ ws://127.0.0.1:9119/api/ws
       │                             │        │ (loopback, gak keluar mesin)
```

Poin pentingnya:

- **Dua-duanya dial KELUAR** ke relay. Hermes lokal gak perlu buka port inbound / ngrok / port-forward.
- Relay cuma multiplexer bodoh — dia gak ngerti isi frame `tui_gateway`, cuma numpang lewat per-channel.
- Node-agent **sudah pindah ke dalam Hermes** (`hermes_cli/relay_node.py`), dijalanin oleh FastAPI
  lifespan pas `hermes serve` boot. **Gak perlu lagi** nyalain proses Bun `src/relay/node-agent.ts`
  terpisah (itu versi lama, lihat [§6](#6-mode-lama-node-agent-bun-terpisah)).

---

## 2. Port map & konvensi

| Komponen | Port | Catatan |
|---|---|---|
| Relay hub + LLM gateway (v-auto-backend) | `2024` | `PORT` di `.env` |
| Hermes node (custom-hermes) | `9119` | default `hermes serve --port`; VBOX hardcode 9119 |
| Frontend VIMS (v-auto-frontend) | `2026` | `vite.config.ts` |

Konvensi `node_id`: **`node-{userId}-{namaMesin}`** (sejak 19 Agu 2026; bentuk lama
**`node-{userId}`** tetap diterima) — angkanya = id user di tabel `users` v-auto-backend.
Hub pakai regex `NODE_ID_RE` buat nge-resolve nama user di `GET /api/relay/nodes`
(lihat [src/relay/hub.ts](../../src/relay/hub.ts)). Kalau kamu pakai id ngasal
(`node-a`), node tetap konek tapi labelnya gak keresolve jadi nama orang.

**Kenapa ada akhiran nama mesin.** Tanpa itu satu orang cuma bisa pakai satu laptop:
dua mesin dengan akun sama mendaftar dengan id yang sama, dan `registerNode()` nutup
pendaftaran sebelumnya berikut seluruh channel-nya. Hasilnya bukan "salah satu kalah"
tapi saling tendang tanpa henti — chat yang lagi jalan ikut putus tiap pergantian, dan
gak ada pesan apa pun yang jelasin itu. VBOX nge-slug nama mesin dulu (huruf kecil,
angka, hubung, maks 24 char) karena `node_id` masuk query param dan nama komputer
Windows bebas berisi spasi/garis bawah/non-ASCII.

Nama mesin di label diambil `relay_node.py` dari `COMPUTERNAME` → `HOSTNAME` →
`platform.node()`. Dua yang pertama cuma ada di Windows (`HOSTNAME` itu shell var
yang tidak di-export di macOS/Linux), jadi sebelum 24 Agu 2026 semua node non-Windows
mengirim label `Hermes Lokal` yang sama persis.

Label dropdown jadi `Nama · NAMA-MESIN` **cuma** buat id yang bawa akhiran mesin; node
lama tetep tampil `Nama` doang. Dan halaman Agent sekarang milih node sendiri duluan —
sebelumnya `nodes[0]`, yang begitu daftarnya panjang bisa diam-diam nyambungin kamu ke
laptop rekan.

---

## 3. Prasyarat

```bash
# backend + frontend
bun --version          # v-auto-backend jalan di Bun
node --version         # frontend SvelteKit

# hermes
cd ~/project/custom-hermes
uv --version           # kalau belum ada: curl -LsSf https://astral.sh/uv/install.sh | sh
./setup-hermes.sh      # sekali aja: bikin venv 3.11 + install deps + symlink CLI
```

MySQL buat v-auto-backend harus nyala (relay hub baca tabel `users`/`profiles` waktu `listNodes`).

---

## 4. Env yang harus disiapkan

### 4a. v-auto-backend — `.env`

```bash
PORT=2024
JWT_SECRET=your-secret-key          # dipakai buat verifikasi WS /api/relay/client

# Relay hub — token yang harus dibawa node-agent
RELAY_NODE_TOKEN=dev-node-token
# Opsional, lebih aman (bisa revoke per node). Kalau ada entry buat node-nya,
# yang dipakai ini; kalau gak ada, fallback ke RELAY_NODE_TOKEN.
# RELAY_NODE_TOKENS={"node-5":"tok-saiful","node-7":"tok-budi"}

# LLM gateway (kalau Hermes mau lewat backend, bukan langsung ke DeepSeek)
DEEPSEEK_API_KEY=sk-...
```

### 4b. custom-hermes — `relay-dev.env`

`relay_node.py` auto-load dua file di root repo custom-hermes waktu import:
`.env` dulu, lalu `relay-dev.env` (dengan `override=False`, jadi `.env` menang).
Bikin `relay-dev.env` biar gak usah ngetik env panjang tiap kali:

```bash
cd ~/project/custom-hermes
cat > relay-dev.env <<'EOF'
HERMES_RELAY_HUB_URL=ws://localhost:2024/api/relay
HERMES_RELAY_NODE_ID=node-5
HERMES_RELAY_NODE_TOKEN=dev-node-token
HERMES_RELAY_LOCAL_WS=ws://127.0.0.1:9119/api/ws
HERMES_RELAY_LOCAL_TOKEN=local-secret
EOF
```

> `relay-dev.env` isinya secret — jangan di-commit. Pastikan masuk `.gitignore`.

Arti tiap key ([hermes_cli/relay_node.py:7-12](../../../custom-hermes/hermes_cli/relay_node.py#L7-L12)):

| Env | Isi | Catatan |
|---|---|---|
| `HERMES_RELAY_HUB_URL` | base relay | node dial ke `<hub>/node`. Prod: `wss://vims.dots.my.id/api/relay` |
| `HERMES_RELAY_NODE_ID` | `node-{userId}` | harus cocok sama user yang login di FE |
| `HERMES_RELAY_NODE_TOKEN` | = `RELAY_NODE_TOKEN` backend | salah token → WS ditutup 1008 `unauthorized` |
| `HERMES_RELAY_LOCAL_WS` | `ws://127.0.0.1:9119/api/ws` | WS Hermes lokal yang di-bridge |
| `HERMES_RELAY_LOCAL_TOKEN` | = `HERMES_DASHBOARD_SESSION_TOKEN` | **wajib sama**, lihat catatan di bawah |

**Soal `LOCAL_TOKEN`:** `/api/ws` di Hermes digate `_ws_auth_ok()` yang ngecek query
`?token=` lawan `_SESSION_TOKEN`. Session token itu diambil dari
`HERMES_DASHBOARD_SESSION_TOKEN`, dan **kalau env-nya gak diset, Hermes generate random tiap boot**
([web_server.py:286](../../../custom-hermes/hermes_cli/web_server.py#L286)) — akibatnya relay-node
selalu ditolak 4401. Jadi di dev **selalu set env itu** dan samakan dengan `HERMES_RELAY_LOCAL_TOKEN`.

### 4c. v-auto-frontend — `.env`

```bash
PUBLIC_API_BASE_URL=http://localhost:2024
```

---

## 5. Jalanin — 3 terminal

### Terminal 1 — Relay hub + LLM gateway

```bash
cd ~/project/v-auto-backend
bun run dev            # = bun run --hot src/index.ts, listen :2024
```

Cek hidup:

```bash
curl -s localhost:2024/api/relay/nodes -H "Authorization: Bearer <JWT>"
# → {"success":true,"data":[]}   (masih kosong, node belum nyala)
```

### Terminal 2 — Node Hermes (relay ikut nyala in-process)

```bash
cd ~/project/custom-hermes
HERMES_DASHBOARD_SESSION_TOKEN=local-secret \
  uv run hermes serve --host 127.0.0.1 --port 9119 --skip-build
```

Atau pakai pembungkusnya (24 Agu 2026) yang cuma milih hub mana yang dipakai —
env di shell menang atas `relay-dev.env` (`load_dotenv(..., override=False)`):

```bash
./run-hermes.sh        # prod  → hub dari relay-dev.env (wss://vims.dots.my.id/api/relay)
./run-hermes.sh dev    # dev   → ws://localhost:2024/api/relay, token dibaca dari v-auto-backend/.env
```

- `serve` = mode headless: gak build SPA, gak buka browser. Ini yang dipakai VBOX/desktop.
- `--skip-build` biar gak nunggu build web tiap start. Kalau mau UI dashboard lokal,
  pakai `hermes dashboard --port 9119 --no-open` (sama-sama boot gateway yang sama).
- Relay auto-nyala dari FastAPI lifespan ([web_server.py:218](../../../custom-hermes/hermes_cli/web_server.py#L218)).
  ⚠️ Flag `--no-relay` **saat ini no-op** — argparse nerima flag-nya tapi `start_relay_node()`
  dipanggil tanpa syarat; satu-satunya gate adalah env var. Jadi kalau mau Hermes tanpa relay,
  kosongkan/pindahkan `relay-dev.env` (atau `HERMES_RELAY_HUB_URL= uv run hermes serve ...`).
- `--user-id 5` opsional — cuma nge-set `HERMES_VBOX_USER_ID`; `node_id` tetap dari
  `HERMES_RELAY_NODE_ID`.

Log yang harus muncul:

```
[relay-node] background task started for node-5
[relay-node] starting — node_id=node-5 hub=ws://localhost:2024/api/relay
[relay-node node-5] connecting to ws://localhost:2024/api/relay/node?token=...&node_id=node-5&label=...
[relay-node node-5] connected
```

Kalau yang keluar `[relay-node] not configured (missing env vars), skipping`, berarti
`relay-dev.env` gak kebaca atau salah satu dari `HUB_URL` / `NODE_ID` / `NODE_TOKEN` kosong.

Verifikasi dari sisi hub:

```bash
curl -s localhost:2024/api/relay/nodes -H "Authorization: Bearer <JWT>"
# → {"success":true,"data":[{"id":"node-5","label":"Saiful","online":true,"sessions":0}]}
```

### Terminal 3 — Frontend VIMS

```bash
cd ~/project/v-auto-frontend
npm run dev            # :2026
```

Buka `http://localhost:2026/agent` → login → pilih node di dropdown → chat.
Browser bakal dial `ws://localhost:2024/api/relay/client?node=node-5&token=<JWT>`
([gatewayClient.ts:55](../../../v-auto-frontend/src/lib/agent/gatewayClient.ts#L55)).

---

## 6. Mode lama: node-agent Bun terpisah

Masih ada di `src/relay/node-agent.ts` — berguna kalau mau nge-tes hub tanpa Python,
atau nge-bridge Hermes yang dijalanin di mesin/port lain. Nama env-nya beda (tanpa prefix
`HERMES_RELAY_`):

```bash
RELAY_WS_URL=ws://localhost:2024/api/relay \
NODE_ID=node-a \
NODE_TOKEN=dev-node-token \
LOCAL_WS_URL=ws://127.0.0.1:9130/api/ws \
LOCAL_TOKEN=local-secret \
  bun run ~/project/v-auto-backend/src/relay/node-agent.ts
```

Kalau pakai ini, jalanin Hermes-nya **tanpa** env `HERMES_RELAY_*` (ingat: `--no-relay` no-op)
biar gak ada dua node-agent rebutan `node_id` yang sama — hub nendang koneksi lama tiap kali
ada register ulang, jadi dua agent bakal saling nge-kick tanpa henti.

---

## 7. Ganti config relay tanpa restart

Hermes punya endpoint buat nge-swap config relay live — ini yang dipakai VBOX pas user
ganti akun ([lib.rs:2131](../../../v-box/src-tauri/src/lib.rs#L2131)):

```bash
curl -X POST http://127.0.0.1:9119/api/relay/update-user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-secret" \
  -d '{
        "node_id": "node-7",
        "hub_url": "ws://localhost:2024/api/relay",
        "node_token": "dev-node-token",
        "user_id": "7"
      }'
```

WS lama ditutup, semua channel di-cancel, loop reconnect ngambil config baru.

---

## 8. Troubleshooting

| Gejala | Sebabnya | Fix |
|---|---|---|
| `[relay-node] not configured` | env `HUB_URL`/`NODE_ID`/`NODE_TOKEN` ada yang kosong | cek `relay-dev.env` kebaca (harus di root `custom-hermes/`) |
| Node connect lalu langsung disconnect, loop backoff | token gak cocok → hub `ws.close(1008, "unauthorized")` | Sejak 21 Agu 2026 VBOX mengambil tokennya sendiri — klik **Ambil dari Server** di Settings ▸ Agent, lalu **Muat Ulang Hermes**. Kalau masih ditolak, alasan persisnya ada di log server: `[relay] node 'node-N' ditolak: ...` |
| Sudah isi token yang benar, save, sinkron config, restart — masih ditolak | Hermes masih hidup dengan token lama, ATAU token yang di-paste bawa spasi/newline, ATAU `RELAY_NODE_TOKEN` di server memang beda dari yang dikasih ke user | Tiga-tiganya hilang dengan **Ambil dari Server** (§10): nilainya datang dari `tokenForNode()` yang sama persis dipakai gerbang `/relay/node`, dan di-`trim()` di sisi VBOX. Kalau server menjawab `configured: false`, itu salah server dan tidak ada yang bisa diperbaiki dari VBOX |
| Semua node ditolak, padahal token di VBOX udah bener | `RELAY_NODE_TOKEN` kosong di server → `nodeTokenValid()` selalu `false`, token apa pun ditolak | set `RELAY_NODE_TOKEN` di env server relay. Node cuma nerima `1008 unauthorized` tanpa alasan, jadi ini cuma kelihatan dari log server |
| FE dapat `node 'node-5' tidak online` | node belum register di hub | cek `GET /api/relay/nodes`, cek log Terminal 2 |
| Chat nyambung tapi langsung ketutup | channel ke `/api/ws` lokal ditolak 4401 | `HERMES_RELAY_LOCAL_TOKEN` harus == `HERMES_DASHBOARD_SESSION_TOKEN` |
| `Address already in use :9119` | ada Hermes lama nyangkut | `hermes serve --status` lalu `hermes serve --stop`, atau `lsof -ti tcp:9119 \| xargs kill -9` |
| `channel ... connect failed` di log node | Hermes lokal belum siap / port beda | pastikan `HERMES_RELAY_LOCAL_WS` nunjuk port yang sama dengan `--port` |
| Label node muncul sebagai hostname, bukan nama user | `node_id` gak match `node-{angka}` | pakai id user beneran |
| Tombol hapus sesi di `/agent` gak ngefek | Sesi yang pernah dibuka/dibuat di koneksi itu masih hidup di gateway → `session.delete` dibalas `4023 cannot delete an active session`, dan FE dulu menelan galatnya | Sejak 24 Agu 2026 FE menutup dulu sesi live-nya (`session.active_list` → `session.close`) baru `session.delete`; galat lain sekarang muncul di layar |
| MCP panel di FE error 502 | `mcp_req` diproxy ke `http://127.0.0.1:9119` pakai `LOCAL_TOKEN` sebagai Bearer | token sama seperti di atas |

Log berguna:

```bash
# Hermes
tail -f ~/.hermes/logs/*.log

# lihat proses server Hermes yang lagi jalan
uv run hermes serve --status
```

---

## 9. Kalau mau lewat VBOX (bukan manual)

VBOX gak butuh langkah manual di atas — dia nge-spawn `hermes serve --port 9119 --user-id <id>`
sendiri dan nyuntik env `HERMES_RELAY_*` dari Settings
([network/relay.rs](../../../v-box/src-tauri/src/network/relay.rs)):

- `relay_ws_url` diturunkan dari **Backend API URL** di Settings
  (`http://localhost:2024/api` → `ws://localhost:2024/api/relay`).
- `node_id` = `node-{backend_user_id}-{nama-mesin}` (dari hasil login VBOX; jatuh ke
  `node-{backend_user_id}` kalau nama mesin tidak terbaca).
- `node_token` **diambil sendiri dari backend** lewat `GET /api/relay/node-token`
  tiap kali login dan tiap VBOX dibuka — tidak perlu diketik lagi. Field **Relay
  Node Token** di Settings sekarang cuma jalan keluar: begitu diketik tangan ia
  ditandai `relay_node_token_manual: true` dan berhenti disegarkan otomatis.
  Detailnya di §10.
- `local_token` default `rahasia123`, jadi kalau nge-tes VBOX + backend dev, biarkan
  saja apa adanya.

**Catatan 18 Agu 2026 — jalur spawn VBOX sempat pincang.** `start_hermes_with_relay()`
di `v-box/src-tauri/src/lib.rs` nyuntik `HERMES_RELAY_LOCAL_TOKEN` tapi **lupa**
`HERMES_DASHBOARD_SESSION_TOKEN`, padahal jalur "Install Agent"
([hermes_install.rs](../../../v-box/src-tauri/src/features/hermes_install.rs)) nulis
dua-duanya ke `~/.hermes/.env`. Akibatnya, di mesin yang `~/.hermes/.env`-nya belum
punya key itu, Hermes mengarang session token acak tiap start → node-agent 401 di
`/api/ws` → `{t:"c"}` ke relay → **browser lihat "tersambung → terputus" tiap detik
tanpa pesan error apa pun** (relay nutup pakai `client.close()` polos = code 1000,
reason kosong). Sudah ditambal: kedua env sekarang disuntik di jalur spawn juga.
Buat mesin yang terlanjur, samakan manual di `~/.hermes/.env` (Windows:
`%USERPROFILE%\.hermes\.env`) lalu restart Hermes.

**Installer keluar dari VBOX (19 Agu 2026).** VBOX tidak lagi menggendong
install, di platform mana pun. Yang dikerjakannya tinggal tiga langkah dan dua
yang pertama memang tak bisa diserahkan ke siapa pun — hanya VBOX yang punya
token backend:

1. unduh tarball + verifikasi sha256
2. keluarkan **satu berkas** (`scripts/install.ps1`) dari tarball, tanyakan
   daftar stage-nya — membongkar seluruhnya di dalam VBOX itu yang dulu
   membekukan jendela ~52 detik
3. tulis skrip pendorong lalu **lepas installernya sebagai proses sendiri**;
   skrip itu yang menghentikan Hermes, `tar -xzf` seluruh source, lalu
   menjalankan tiap stage

Sesudah langkah 3, install bukan urusan VBOX lagi. Di Windows skripnya jalan di
jendela konsol sendiri (`CREATE_NEW_CONSOLE`), di macOS di Terminal.app, di
Linux tanpa jendela. VBOX tidak membaca outputnya, tidak mengawasinya, dan
**tidak bisa membatalkannya** — yang menghentikan cuma menutup jendela itu.
Menutup VBOX di tengah install tidak membatalkan apa pun.

Alasannya empiris: install lewat terminal mulus, install lewat VBOX membeku
("Not Responding"), padahal perintah dan mesinnya sama. Selama UI dan install
5-15 menit berbagi satu proses, tambalan apa pun cuma mengurangi gejala.
Percobaan sebelumnya — menurunkan prioritas proses, memindahkan I/O ke
`spawn_blocking`, membaca output lewat berkas alih-alih pipe — semuanya
mengurangi kebekuan tanpa menghilangkannya.

**Kabar dari installer.** Setelah lepas, satu-satunya kabar adalah berkas
keadaan `$HERMES_HOME/vbox-install-state.txt` plus berkas log di
`$HERMES_HOME/logs/hermes-install-<waktu>.log`. Keduanya dibaca perintah
`hermes_install_probe` — **hanya** saat user menekan "Cek Status". Tidak ada
polling: beban yang baru dipindahkan keluar jangan diseret balik lewat pintu
belakang.

Formatnya `kunci=nilai` per baris, sengaja bukan JSON: yang menulisnya skrip
shell dan nilainya path Windows penuh backslash — di JSON satu backslash yang
lupa digandakan membuat seluruh berkas tak terbaca. Skripnya menambah baris,
tidak menulis ulang, jadi baris belakangan menang.

```
log=C:\Users\saifu\AppData\Local\hermes\logs\hermes-install-20260819-143000.log
started=2026-08-19T14:30:00
state=starting
state=running
stage=node-deps
updated=2026-08-19T14:31:12
exit=0
state=ok
```

Dua jebakan Windows yang sudah ditutup di generator skripnya, keduanya bikin
gejala yang menyesatkan:

- **Berkas `.ps1` ditulis dengan BOM UTF-8.** Windows PowerShell 5.1 membaca
  `.ps1` tanpa BOM sebagai ANSI code page mesin. Nama user Windows non-ASCII
  bukan hal langka, dan tanpa BOM `$dir` terisi rusak — installer lalu mencari
  direktori yang tidak ada, dengan pesan yang sama sekali tidak menunjuk ke
  penyebabnya.
- **Log ditulis lewat `System.IO.StreamWriter`, bukan `Tee-Object` atau `>>`.**
  Di PowerShell 5.1 keduanya menulis UTF-16LE sementara `Add-Content -Encoding
  UTF8` di baris sebelahnya menulis UTF-8; satu berkas dua encoding, dan ekor
  log yang dibaca VBOX cuma jadi sampah. StreamWriter juga membuka berkasnya
  sekali, bukan sekali per baris — stage yang cerewet tidak lagi melewati
  filter antivirus ratusan kali.

Di sisi Unix, exit code stage diambil dari `${PIPESTATUS[0]}`, bukan `$?`:
outputnya dipipe ke `tee`, jadi `$?` adalah status `tee` yang hampir selalu 0 —
stage yang gagal akan terbaca sukses.

**Config tetap urusan VBOX.** `config.yaml` butuh token backend, jadi installer
di luar sana tidak bisa menulisnya sendiri. "Cek Status" yang melihat
`state=ok` memanggil `hermes_sync_config` sendiri, sekali per install — user
tidak perlu tahu langkah itu ada.

**Tombol "Sinkronkan Config" (18 Agu 2026).** Kalau yang salah cuma config —
model keliru, base URL gateway berubah, atau `config.yaml` memang tidak pernah
ditulis karena install tersendat — jangan suruh siapa pun install ulang. Tombol
itu memanggil `hermes_sync_config`, yang menulis `config.yaml` + `.env` dari
`GET /api/hermes/config` dalam hitungan detik tanpa menyentuh dependency.
Hasilnya identik dengan stage `vbox-configure`. Artinya juga: mengubah
`HERMES_LLM_*` di server cukup diikuti satu klik di tiap laptop, bukan install
ulang 5-15 menit.

Buat instalasi Hermes-nya sendiri lewat tombol "Install Agent", lihat
[install-hermes.md](install-hermes.md).

---

## 10. Node Token diambil otomatis (21 Agustus 2026)

**Masalahnya.** Node Token diketik user di Settings VBOX dan harus sama **persis**
dengan `RELAY_NODE_TOKEN` di server. Kalau tidak sama, hub menutup koneksi dengan
`1008 unauthorized` — tanpa alasan, karena alasan sengaja tidak dikirim ke node
(lihat `rejectReason()` di [src/routes/relay.ts](../../src/routes/relay.ts)). Dari
sisi user, empat keadaan yang sangat berbeda terlihat identik, yaitu "agent Offline":

1. token salah ketik / nilai lama,
2. token benar tapi ikut terbawa spasi atau newline waktu di-paste,
3. token benar tapi Hermes masih hidup dengan nilai sebelumnya,
4. `RELAY_NODE_TOKEN` di server memang belum diset — token apa pun ditolak.

Nomor 4 bukan salah user sama sekali, dan tidak ada yang bisa ia lakukan dari VBOX.
Ini yang membuat siklus "isi → save → sinkron → reload → restart → masih ditolak"
bisa berulang tanpa habis: tidak ada satu pun langkah di dalamnya yang bisa
membedakan keempat kasus itu.

**Yang dilakukan sekarang.** User sudah login ke backend yang sama, jadi tokennya
ditanyakan langsung ke sana.

| Sisi | Yang dibuat |
|---|---|
| Backend | `GET /api/relay/node-token?node_id=…` (JWT). Balasannya `{ configured, node_token, scope }`. Nilainya dari `tokenForNode()` — fungsi yang **sama persis** dipakai `nodeTokenValid()` di gerbang `/relay/node`, jadi selisih antara "yang dibagikan" dan "yang diterima" mustahil secara konstruksi, bukan sekadar dijaga oleh tes. Kalau `RELAY_NODE_TOKENS` diisi, entry milik node yang bertanya yang dibagikan. |
| VBOX | `relay::sync_node_token_from_backend()` dipanggil di `backend_save_token` (tiap login) dan di `setup()` (tiap VBOX dibuka), plus command `relay_sync_node_token` di balik tombol **Ambil dari Server** di Settings ▸ Agent. |

Urutan pemanggilannya menentukan dan gampang salah: `config_from_settings()` membaca
settings **sekali** lalu nilai itu ikut ke env var Hermes. Jadi sinkron token harus
selesai **sebelum** config dibangun — di startup, `config_from_settings()` sengaja
dipanggil dua kali: sekali untuk tahu "sudah login atau belum", sekali lagi sesudah
sinkron untuk mendapat token barunya.

**Kasus 2 ditutup terpisah.** Token sekarang di-`trim()` waktu dipakai, bukan cuma
dipakai `trim()` untuk mengecek kosong. Bug lama: `.filter(|t| !t.trim().is_empty())`
memeriksa versi terpangkasnya tapi meneruskan versi aslinya, jadi `"tok\n"` lolos
apa adanya ke query string. Dijaga tes `token_dipangkas_sebelum_dipakai`.

**Kasus 4 sekarang punya suara.** Kalau server menjawab `configured: false`, VBOX
menampilkan kalimat dari server — "RELAY_NODE_TOKEN belum diset di server relay" —
bukan lagi menyalahkan token user.

**Jalan keluar tetap ada.** Mengetik di field Node Token menandainya
`relay_node_token_manual: true` di settings, dan sejak itu sinkron otomatis berhenti
menimpanya (buat relay sendiri / dev). Statusnya kelihatan di UI, karena token salah
ketik yang diam-diam bertahan selamanya justru masalah yang sedang kita tutup.
`None` — settings dari VBOX versi lama — sengaja **tidak** diperlakukan sebagai
manual: isinya justru token ketikan yang gagal, karena itulah fitur ini ada.

**Soal kerahasiaan.** Endpoint ini membagikan token bersama ke setiap user ber-JWT.
Himpunan orang yang memegangnya tidak bertambah — sebelumnya token yang sama
dikirim ke mereka lewat chat/pesan ke admin. Yang hilang cuma salah ketiknya. Kalau
suatu saat perlu dipersempit per orang, isi `RELAY_NODE_TOKENS` dan endpoint ini
otomatis membagikan entry per-node.

### 10.1 Penyebab sebenarnya di lapangan: `.env` mengalahkan env var (21 Agu 2026)

Log server hari itu menutup tebak-tebakan. `~/web/vims.dots.my.id/private/v-auto-backend/logs/error.log`:

```
[relay] node 'node-3-baguswicaksono' ditolak: token tidak cocok dengan RELAY_NODE_TOKEN
```

…dan di `out.log`, permintaan yang menghasilkannya:

```
GET /api/relay/node?token=rahasia123&node_id=node-3-baguswicaksono&label=BAGUSWICAKSONO
```

`rahasia123` itu **default bawaan VBOX** — nilai yang dipakai kalau Node Token kosong.
Padahal user-nya sudah mengisi token yang benar, menyimpan, menyinkronkan config, dan
me-restart VBOX. Jadi yang ia ketik tidak pernah sampai ke hub.

Sebabnya: `start_hermes_with_relay()` menyuntikkan `HERMES_RELAY_NODE_TOKEN` sebagai env
var, tapi Hermes memuat `$HERMES_HOME/.env` dengan **`override=True`**
([hermes_cli/env_loader.py:314](../../../custom-hermes/hermes_cli/env_loader.py)).
Urutannya:

1. VBOX menyuntik token yang benar → 2. Hermes start → 3. `.env` menimpanya kembali
dengan nilai lama.

Env var yang "menang" menurut kode VBOX ternyata kalah di proses anaknya, dan tidak ada
satu pun log yang menyebutkannya. Ini juga menjelaskan kenapa tiga node berbeda
(`node-2`, `node-2-desktop-fghnl0k`, `node-3-baguswicaksono`) sama-sama ditolak sementara
`node-2-laptop-qj2mjp45` diterima — yang terakhir kebetulan `.env`-nya sudah benar dari
jalur install.

**Perbaikannya**: `sync_relay_env()` di `hermes_install.rs` menulis keenam kunci relay ke
`$HERMES_HOME/.env` **sebelum** Hermes di-spawn, dan juga di jalur update-lewat-API.
Jadi env var dan `.env` tidak lagi berlomba — keduanya dipaksa sama. Jalur API penting
sendiri: tanpa itu relay jalan hari ini lalu mati besok pagi, karena `.env` lama
mengembalikan nilainya di start berikutnya.

Catatan keamanan yang belum ditangani: node token ikut tertulis polos di `out.log` karena
ia dikirim sebagai query param WS. Perlu dipindah ke header, atau disaring dari log.

**Yang belum.** Halaman install manual di VIMS (`/agent/install`) masih meminta token
lewat input — ia bisa memakai endpoint yang sama, tapi belum diubah.

## Referensi kode

| Apa | Di mana |
|---|---|
| Relay hub (registry + routing frame) | [src/relay/hub.ts](../../src/relay/hub.ts) |
| Route WS `/api/relay/node` & `/client` | [src/routes/relay.ts](../../src/routes/relay.ts) |
| Node-agent in-process (Python) | [custom-hermes/hermes_cli/relay_node.py](../../../custom-hermes/hermes_cli/relay_node.py) |
| Node-agent standalone (Bun, legacy) | [src/relay/node-agent.ts](../../src/relay/node-agent.ts) |
| Parser `hermes serve` / `dashboard` | [custom-hermes/hermes_cli/subcommands/dashboard.py](../../../custom-hermes/hermes_cli/subcommands/dashboard.py) |
| Gate auth `/api/ws` + session token | [custom-hermes/hermes_cli/web_server.py](../../../custom-hermes/hermes_cli/web_server.py) |
| Client WS dari FE | [v-auto-frontend/src/lib/agent/gatewayClient.ts](../../../v-auto-frontend/src/lib/agent/gatewayClient.ts) |
| Spawn Hermes dari VBOX | [v-box/src-tauri/src/lib.rs](../../../v-box/src-tauri/src/lib.rs) |
