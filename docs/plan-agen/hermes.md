# Plan — Hermes Agent: LLM Terpusat + Relay Multi-Node + Bubble Chat

> Status: DRAFT / plan. Disusun 2026-07-22.
> Tiga project terlibat:
> - **v-auto-backend** (Bun + Hono, port 2024) → host **Relay Hub** + **LLM Gateway**
> - **v-auto-frontend** (SvelteKit + shadcn-svelte) → host **Bubble Chat UI**
> - **hermes-agent / custom-hermes** → agent node (jalan sebagai **client**)

---

## 1. Konteks & tujuan

Kita mau tim bisa ngobrol ke **agent Hermes** lewat **bubble chat di browser**, dengan aturan:

1. **Chat-bubble** ada di tiap anggota tim (browser / SvelteKit app).
2. **Agent Hermes** jalan di **beberapa server**; tiap anggota bisa **pilih** mau kendalikan node yang mana.
3. **Request LLM terpusat** — key DeepSeek cuma ada di **1 server**, semua panggilan model lewat situ.
4. **Hermes tetap CLIENT** — node agent **tidak** menerima koneksi masuk (boleh di balik NAT/firewall, tanpa domain/TLS per node).

Kunci pemenuhan #4: **RELAY** di tengah. Node dan browser sama-sama **dial keluar** ke relay. Hanya relay yang perlu reachable.

---

## 2. Arsitektur target

```
TIER 1 — CLIENT (browser tiap anggota tim)
  v-auto-frontend  ── Bubble Chat ──[ pilih node ]──┐
                                                     │  WSS keluar
TIER 2 — RELAY + GATEWAY (v-auto-backend, SATU-SATUNYA yang reachable + TLS)
  ┌─────────────────────────────────────────────────────────────────┐
  │  Relay Hub (WS)         LLM Gateway (HTTP, OpenAI-compatible)     │
  │   /relay/client  ◀──────── bridge ────────▶  /relay/node         │
  │   /relay/nodes (REST)                         (registry node)     │
  │   /llm/v1/chat/completions ── inject key ──▶ api.deepseek.com     │
  └─────────────────────────────────────────────────────────────────┘
        ▲ WSS keluar                                   ▲ HTTPS keluar
TIER 3 — AGENT NODES (Hermes = CLIENT, boleh di balik NAT)
  Node-A: hermes serve (localhost:9119) + node-agent (dial keluar ke relay)
  Node-B: hermes serve (localhost:9119) + node-agent
  ...     (base_url LLM tiap node → LLM Gateway di Tier 2)
```

**Semua panah keluar dari client → relay.** Node Hermes tidak pernah menerima inbound.

### Kenapa butuh "node-agent"
`hermes serve` secara default **listen** (jadi server). Supaya Hermes tetap client, tiap node menjalankan **node-agent**: proses kecil yang (a) dial keluar ke relay, (b) mem-pipe `/api/ws` lokal Hermes ke relay. Jadi Hermes cukup listen di **localhost** (127.0.0.1), node-agent yang keluar. Protokol chat kaya (streaming `message.delta` / `tool.*`) tetap utuh karena relay & node-agent **hanya meneruskan frame** (transparent passthrough), tidak menerjemahkan.

---

## 3. Protokol yang dipakai (jangan diubah, cuma dibungkus)

- **tui_gateway JSON-RPC** di `/api/ws` (yang sudah dipakai Bubble Chat sekarang):
  `session.create`, `prompt.submit`, event `message.start/delta/interim/complete`,
  `tool.start/complete`, `thinking.delta`, `error`. Ref tipe: `ui-tui/src/gatewayTypes.ts`.
  Dua event **blocking** juga dipakai: `approval.request` → `approval.respond`
  (`{session_id, choice}`) dan `clarify.request` → `clarify.respond`
  (`{request_id, answer}`, jawaban kosong = "lewati"). Node menahan giliran
  sampai dijawab (clarify: 300 detik), jadi keduanya WAJIB punya UI —
  panel-nya ada di `/agent` (`src/routes/agent/+page.svelte`).
- **Relay ⇄ node-agent** (baru, kita definisikan): framing tipis buat multiplex banyak sesi browser lewat 1 koneksi node.
- **LLM Gateway**: OpenAI-compatible `/v1/chat/completions` (+ `/v1/models`) passthrough ke DeepSeek dengan key di-inject server-side.

Relay & node-agent **buta** terhadap isi frame tui_gateway — mereka cuma envelope + routing. Ini yang menjaga fidelity Bubble Chat.

---

## 4. Model auth (4 lapis token)

| Lapis | Dari → Ke | Token | Disimpan |
|---|---|---|---|
| User | browser → relay `/relay/client` | JWT user v-auto (reuse yang sudah ada) | localStorage FE |
| Node | node-agent → relay `/relay/node` | `NODE_TOKEN` per node | env node + tabel `agent_nodes` |
| Local | node-agent → `127.0.0.1:9119/api/ws` | session token Hermes lokal (loopback `?token=`) | dibaca lokal oleh node-agent |
| LLM | Hermes node → LLM Gateway | virtual token tim (opsional) | env node |

Key DeepSeek **asli** hanya di env **v-auto-backend** (LLM Gateway). Tidak pernah ada di node maupun browser.

---

## 5. Rencana bertahap (bisa di-ship per fase)

### FASE 1 — LLM Gateway di v-auto-backend  ⏱️ paling cepat, langsung berguna
**Tujuan:** sentralisasi key DeepSeek. Semua node arahkan `base_url` ke sini.

- **Buat** `src/routes/llmGateway.ts` (Hono router):
  - `POST /llm/v1/chat/completions` → forward stream ke `https://api.deepseek.com/v1/chat/completions`, set header `Authorization: Bearer ${DEEPSEEK_API_KEY}` (dari `process.env`), **stream passthrough** (jangan buffer — teruskan `ReadableStream` SSE).
  - `GET /llm/v1/models` → proxy.
  - (Opsional) validasi header `Authorization` = virtual token tim sebelum forward.
  - Log usage ringkas (model, tokens dari response) ke tabel `llm_usage` (Drizzle).
- **Edit** `src/index.ts`: `app.route("/llm", llmGatewayRoutes)` (ikuti pola mount route yang ada).
- **Env** (`.env` backend): `DEEPSEEK_API_KEY=...`, `LLM_TEAM_TOKEN=...` (opsional).
- **Config Hermes node** (di custom-hermes / ~/.hermes): arahkan DeepSeek ke gateway, bukan langsung:
  - `~/.hermes/.env`: `DEEPSEEK_BASE_URL=https://<relay-host>/llm/v1` dan `DEEPSEEK_API_KEY=<LLM_TEAM_TOKEN>` (virtual, bukan key asli).
  - (base_url override didukung Hermes — lihat `.env.example` `*_BASE_URL`, dan `hermes_cli/runtime_provider.py`.)

**Verifikasi Fase 1:**
```bash
curl -sN https://<host>/llm/v1/chat/completions -H "Authorization: Bearer $LLM_TEAM_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-chat","stream":true,"messages":[{"role":"user","content":"hi"}]}'
# → harus stream balasan. Lalu di node: hermes -q "test" → jalan tanpa key asli di node.
```

---

### FASE 2 — Relay Hub di v-auto-backend
**Tujuan:** jembatan browser ⇄ node, tanpa node buka inbound.

- **Buat** `src/relay/hub.ts` — registry in-memory node + router frame.
- **Buat** `src/routes/relay.ts` (Hono + `hono/bun` `upgradeWebSocket` — Bun native WS):
  - `WS /relay/node` — node-agent connect + register `{ node_id, label, node_token }` (validasi vs tabel `agent_nodes`). Simpan koneksi di registry. Heartbeat/ping.
  - `WS /relay/client` — browser connect (validasi JWT user). Query `?node=<id>`. Relay buka **channel** ke node terpilih, lalu **pipe frame dua arah** (tag `channel_id` saat multiplex).
  - `GET /relay/nodes` — daftar node online `{id,label,online}` buat dropdown FE (filter sesuai akses user).
- **Framing node** (contoh): `{t:"open", ch}` / `{t:"frame", ch, data}` / `{t:"close", ch}`. `data` = frame tui_gateway apa adanya (opaque).
- **Edit** `src/index.ts`: mount `app.route("/relay", relayRoutes)`; pastikan `Bun.serve` meng-handle upgrade WS (Hono/Bun `websocket` export).
- **Drizzle** (`src/db/schema` + `drizzle/`): tabel
  - `agent_nodes(id, label, node_token_hash, created_at, last_seen_at)`
  - `agent_node_access(user_id, node_id)` (siapa boleh lihat/kontrol node mana)
  - `llm_usage(id, user_id, node_id, model, prompt_tokens, completion_tokens, at)`

**Verifikasi Fase 2:** unit test hub (register → list → bridge echo) pakai vitest; manual: 1 node dummy + 1 client dummy saling echo lewat relay.

---

### FASE 3 — Node-agent (jalan di tiap host Hermes)
**Tujuan:** Hermes tetap client; pipe `/api/ws` lokal ke relay.

- **Buat** `src/relay/node-agent.ts` (skrip Bun standalone, distribusikan ke node):
  1. Baca session token Hermes lokal (loopback) — dari proses `hermes serve`/dashboard di `127.0.0.1:9119`.
  2. Dial keluar `WSS /relay/node`, register `{node_id,label,node_token}` (dari env node).
  3. Untuk tiap `{t:"open",ch}` dari relay → buka WS lokal baru `ws://127.0.0.1:9119/api/ws?token=<local>` dan pipe frame ↔ channel.
  4. Auto-reconnect + backoff; heartbeat.
- **Cara jalan di node:**
  ```bash
  # Terminal 1: Hermes agent (client, listen localhost saja)
  cd ~/project/custom-hermes && uv run hermes serve --host 127.0.0.1 --port 9119
  # Terminal 2: node-agent (dial keluar ke relay) — atau PM2
  NODE_ID=node-a NODE_TOKEN=... RELAY_URL=wss://<host>/relay/node bun run src/relay/node-agent.ts
  ```
- (Distribusi: node-agent bisa di-package terpisah / disalin; tidak perlu seluruh v-auto-backend di node.)

**Verifikasi Fase 3:** node-agent connect → muncul di `GET /relay/nodes` sebagai online. Bridge 1 sesi WS end-to-end (belum perlu UI): pakai `websocat` ke `/relay/client?node=node-a`, kirim `session.create` → dapat `session_id`.

---

### FASE 4 — Bubble Chat UI di v-auto-frontend (Svelte)
**Tujuan:** port Bubble Chat ke SvelteKit + selector node. (React → Svelte 5 runes.)

- **Buat** `src/lib/agent/gatewayClient.ts` — port `GatewayClient` (framework-agnostic; logika JSON-RPC WS sama persis dgn versi React). Arahkan ke **relay** `/relay/client`, bukan `/api/ws`:
  - `connect({ node, userToken })` → `new WebSocket(\`${RELAY_WS}/relay/client?node=${node}\`)` + auth (JWT via query/subprotocol).
  - `request(method, params)`, `on(type, handler)`, `onState`, `close` — sama seperti sebelumnya.
- **Buat** `src/routes/agent/+page.svelte` — halaman bubble chat (rune `$state`):
  - Selector node: `GET /relay/nodes` → dropdown "pilih Hermes server".
  - State pesan: `messages = $state<ChatMessage[]>([])`; handler event (`message.delta`/`tool.*`/`thinking.delta`/`message.complete`/`error`) mengisi bubble — port 1:1 dari `ChatBubblePage.tsx` yang sudah kita buat.
  - Composer (`<textarea>` + tombol kirim), streaming markdown, tool chips, reasoning collapsible.
  - Pakai shadcn-svelte: `$lib/components/ui/{button,card,badge}`, layout `AppSidebar` + `SiteHeader` (ikut pola route lain). Markdown: pakai lib Svelte (mis. `marked` + sanitize) atau komponen markdown yang ada.
- **Env FE** (`.env` / `import.meta.env`): `VITE_RELAY_WS=wss://<host>`, `VITE_RELAY_HTTP=https://<host>`.
- **Auth**: reuse JWT user v-auto (localStorage) sebagai token ke relay.

**Referensi port:** logika lengkap ada di
`custom-hermes/web/src/pages/ChatBubblePage.tsx` (state machine + event handling) dan
`custom-hermes/web/src/lib/gatewayClient.ts` (WS JSON-RPC). Tinggal alih ke Svelte + ganti target ke relay.

**Verifikasi Fase 4:** buka `/agent`, pilih node, kirim "hi" → streaming DeepSeek muncul; ganti node → sesi pindah.

---

### FASE 5 — Hardening & operasional
- **TLS + domain** di depan v-auto-backend (nginx/Caddy) untuk `/relay/*` (WSS) & `/llm/*`.
- **Quota/rate-limit per user** di LLM Gateway (pakai `llm_usage`), tolak kalau lewat budget.
- **Isolasi node** ‼️ — tool `terminal`/`file`/`code_execution` jalan **di node** dan bisa dipakai siapa pun yang boleh kontrol node itu. Untuk multi-user: batasi `agent_node_access`, pertimbangkan **profile per-user** / container per node / pangkas toolset berbahaya (lihat `TEAM_TOOLSETS` di `custom-hermes/hermes_cli/auto_setup.py`).
- **Reconnect** di ketiga hop (browser↔relay, relay↔node, node↔local). Backoff + resume `session_id`.
- **Observability**: log koneksi node, sesi aktif, usage per user; dashboard admin (opsional, reuse admin FE).
- **Secret hygiene**: DeepSeek key **hanya** di env v-auto-backend. (Catatan: `custom-hermes` saat ini masih hardcode key di `hermes_cli/auto_setup.py` — setelah gateway jalan, ganti jadi virtual token + base_url gateway, dan rotate key asli.)

---

## 6. Ringkasan file yang disentuh

**v-auto-backend (Bun+Hono)**
- `src/routes/llmGateway.ts` (baru) — Fase 1
- `src/routes/relay.ts` + `src/relay/hub.ts` (baru) — Fase 2
- `src/relay/node-agent.ts` (baru, dijalankan di node) — Fase 3
- `src/db/schema/*` + `drizzle/` migration (tabel `agent_nodes`, `agent_node_access`, `llm_usage`) — Fase 2
- `src/index.ts` (edit: mount `/llm` & `/relay`, wiring Bun WS)
- `.env`: `DEEPSEEK_API_KEY`, `LLM_TEAM_TOKEN`

**v-auto-frontend (SvelteKit)**
- `src/lib/agent/gatewayClient.ts` (baru, port dari React)
- `src/routes/agent/+page.svelte` (baru — bubble chat + node selector)
- `.env`: `VITE_RELAY_WS`, `VITE_RELAY_HTTP`

**Hermes node (custom-hermes)**
- `~/.hermes/.env`: `DEEPSEEK_BASE_URL=<gateway>/llm/v1`, `DEEPSEEK_API_KEY=<virtual>`
- Jalankan `hermes serve --host 127.0.0.1` + node-agent (PM2/ecosystem).

---

## 7. Urutan eksekusi yang disarankan (MVP dulu)

1. **Fase 1** (LLM Gateway) → langsung dapat "request LLM terpusat". Uji dengan 1 node existing.
2. **Fase 2 + 3** dengan **1 node** dulu (buktikan relay + node-agent + Hermes-as-client jalan end-to-end via `websocat`).
3. **Fase 4** (UI Svelte) → bubble chat + selector, 1 node.
4. Tambah node ke-2, uji "pilih node".
5. **Fase 5** hardening sebelum dibuka ke tim.

## 8. Keputusan terbuka (tolong konfirmasi)
- **LLM Gateway**: bikin sendiri (Hono route, ringan) **vs** pakai **LiteLLM Proxy** (fitur virtual-key/budget lengkap). Default plan: bikin sendiri dulu (cepat), migrasi ke LiteLLM kalau butuh quota/multi-provider.
- **Node-agent**: skrip Bun standalone (rekomendasi, fidelity penuh) **vs** native `gateway/relay` Hermes (messaging abstraction, streaming kurang kaya).
- **Auth relay**: reuse JWT user v-auto (rekomendasi) **vs** token khusus.
- **Jumlah node awal & bedanya** (env/project/repo apa) — memengaruhi label & akses.

---

## 9. STATUS IMPLEMENTASI (update 2026-07-22)

### ✅ Selesai & terverifikasi live
- **Fase 1 — LLM Gateway**: `src/routes/llmGateway.ts` (SSE passthrough, key server-side, gate `LLM_TEAM_TOKEN`). Bukti: `hermes -z` pakai key dummy → 200 via gateway.
- **Fase 2 — Relay Hub**: `src/relay/hub.ts` + `src/routes/relay.ts` + `src/lib/relayWs.ts` (Bun WS di `index.ts` `export default { websocket }`). Bukti: bridge test PASS.
- **Fase 3 — node-agent**: `src/relay/node-agent.ts` (dial keluar, pipe `/api/ws` lokal). Bukti: `session.create` nembus client→relay→node-agent→hermes serve asli.
- **Fase 4 — Bubble Chat**: `v-auto-frontend/src/lib/agent/gatewayClient.ts` + `src/routes/agent/+page.svelte` (+ selector node). Bukti: chat penuh live `localhost:2026/agent` → DeepSeek balas.
- **Fase 5 sebagian**:
  - Markdown render: `v-auto-frontend/src/lib/agent/Markdown.svelte` (self-contained, tanpa dep, tahan streaming).
  - Auto-reconnect di UI (backoff, transcript dipertahankan).
  - Per-node token: `RELAY_NODE_TOKENS` (JSON) + fallback `RELAY_NODE_TOKEN`.

**Token lokal Hermes**: set `HERMES_DASHBOARD_SESSION_TOKEN` saat `hermes serve`, dipakai node-agent sbg `LOCAL_TOKEN`.
**Base URL LLM node**: DeepSeek support `DEEPSEEK_BASE_URL` → arahkan ke `<host>/api/llm/v1`.

### ⏳ Belum (butuh keputusan / sentuh infra prod)
- **Persist node ke DB (Drizzle)**: sekarang registry **in-memory** + token via env. Untuk banyak node + revoke dinamis + audit: tabel `agent_nodes` / `agent_node_access` / `llm_usage`. **Ditunda** karena butuh migration ke DB prod (`51.79.222.48`) — jalankan `drizzle-kit generate` lalu apply saat siap.
- **Quota/usage per-user**: log token ke `llm_usage` di `llmGateway.ts`, tolak kalau lewat budget. (Butuh tabel di atas.)
- **TLS + domain** (ops): taruh v-auto-backend di belakang **nginx/Caddy** (WSS untuk `/api/relay/*`, HTTPS untuk `/api/llm/*`). Ini satu-satunya yang perlu reachable publik.
- **Isolasi tool per node** ‼️: tool `terminal`/`file`/`code_execution` jalan di node & dishare semua user yang boleh kontrol node itu. Untuk multi-user: batasi akses per node, pertimbangkan profile per-user / container / pangkas toolset (lihat `TEAM_TOOLSETS` di `custom-hermes/hermes_cli/auto_setup.py`).
- **Session resume saat reconnect**: sekarang reconnect bikin sesi baru (transcript UI tetap). Bisa ditingkatkan pakai `session.resume`.

### Catatan
- Semua perubahan **belum di-commit** (repo pakai GitNexus → `gitnexus_detect_changes` sebelum commit).
- Key DeepSeek masih hardcode di `custom-hermes/hermes_cli/auto_setup.py` — setelah gateway dipakai, ganti jadi virtual token + `DEEPSEEK_BASE_URL` ke gateway, lalu **rotate** key asli.
