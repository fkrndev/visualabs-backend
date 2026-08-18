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

Konvensi `node_id`: **`node-{userId}`** — angkanya = id user di tabel `users` v-auto-backend.
Hub pakai regex `^node-(\d+)$` buat nge-resolve nama user di `GET /api/relay/nodes`
(lihat [src/relay/hub.ts:71](../../src/relay/hub.ts#L71)). Kalau kamu pakai id ngasal
(`node-a`), node tetap konek tapi labelnya gak keresolve jadi nama orang.

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
| Node connect lalu langsung disconnect, loop backoff | token gak cocok → hub `ws.close(1008, "unauthorized")` | samakan `HERMES_RELAY_NODE_TOKEN` ↔ `RELAY_NODE_TOKEN`; kalau pakai `RELAY_NODE_TOKENS`, entry per-node yang menang. Alasan persisnya ada di log server: `[relay] node 'node-N' ditolak: ...` |
| Semua node ditolak, padahal token di VBOX udah bener | `RELAY_NODE_TOKEN` kosong di server → `nodeTokenValid()` selalu `false`, token apa pun ditolak | set `RELAY_NODE_TOKEN` di env server relay. Node cuma nerima `1008 unauthorized` tanpa alasan, jadi ini cuma kelihatan dari log server |
| FE dapat `node 'node-5' tidak online` | node belum register di hub | cek `GET /api/relay/nodes`, cek log Terminal 2 |
| Chat nyambung tapi langsung ketutup | channel ke `/api/ws` lokal ditolak 4401 | `HERMES_RELAY_LOCAL_TOKEN` harus == `HERMES_DASHBOARD_SESSION_TOKEN` |
| `Address already in use :9119` | ada Hermes lama nyangkut | `hermes serve --status` lalu `hermes serve --stop`, atau `lsof -ti tcp:9119 \| xargs kill -9` |
| `channel ... connect failed` di log node | Hermes lokal belum siap / port beda | pastikan `HERMES_RELAY_LOCAL_WS` nunjuk port yang sama dengan `--port` |
| Label node muncul sebagai hostname, bukan nama user | `node_id` gak match `node-{angka}` | pakai id user beneran |
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
- `node_id` = `node-{backend_user_id}` (dari hasil login VBOX).
- `node_token` dari field **Relay Node Token** di Settings (default `rahasia123`)
  — samakan dengan `RELAY_NODE_TOKEN` di `.env` backend dev kamu.
- `local_token` default `rahasia123` juga, jadi kalau nge-tes VBOX + backend dev,
  set `RELAY_NODE_TOKEN=rahasia123` di backend biar gak usah ngutak-ngatik Settings.

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

Buat instalasi Hermes-nya sendiri lewat tombol "Install Agent", lihat
[install-hermes.md](install-hermes.md).

---

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
