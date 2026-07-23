# Plan — UI ala Manus di atas Hermes (history, sesi, model, dll)

> Status: DRAFT / plan. Disusun 2026-07-22. Lanjutan dari `hermes.md` (relay + bubble chat sudah jalan).
> Target: naik-kelaskan `v-auto-frontend/src/routes/agent` dari bubble-chat polos → UI ala **Manus**
> (sidebar + **history task/percakapan**, landing, follow-up chips, status selesai, pilih model), dengan
> memanfaatkan yang **Hermes memang sudah dukung** lewat **relay yang sudah kita bangun**.

---

## 1. Prinsip: hampir semua sudah didukung Hermes, lewat relay yang ada

Semua fitur di bawah naik di atas **`/api/ws` JSON-RPC** yang **sudah dijembatani relay** (`/api/relay/client`).
Jadi mayoritas = **kerjaan frontend Svelte**, **nyaris tanpa ubah backend/relay**.

Bukti kapabilitas Hermes (dari `ui-tui/src/gatewayTypes.ts`):
- `SessionListItem { id, title, preview, message_count, started_at, source }` + `SessionListResponse` → **list history**.
- `session.create`/resume balikin **`messages[]`** (kebukti di e2e) → **load transcript sesi lama**.
- `SessionDeleteResponse`, `SessionTitleResponse` (title auto-generate), `SessionMostRecentResponse`, `SessionSaveResponse`, `SessionUndoResponse`.
- `model.options` / model set (dipakai ModelPickerDialog) → **pilih model**.
- Event `message.complete` → **status "selesai"**; `voice.transcript` → **input suara**.

**Catatan scoping:** sesi hidup **per node** (tiap Hermes punya SessionDB sendiri). Jadi history = per node terpilih.
History gabungan lintas-node butuh agregasi di relay/DB (lihat §6, opsional).

---

## 2. Peta fitur Manus → Hermes → tempat bangun

| Fitur Manus (screenshot) | Didukung Hermes? | Yang dibangun |
|---|---|---|
| Sidebar **history task** (judul + preview + waktu) | ✅ `session.list` (+ title auto) | FE sidebar; panggil `session.list` via relay |
| Klik history → buka percakapan | ✅ resume → balikin `messages[]` | FE render transcript dari resume |
| **New task / New chat** | ✅ `session.create` (sudah ada) | FE tombol |
| Landing **"What can I do for you?"** + quick chips | statis | FE (chips = prefill prompt) |
| **Task completed** status | ✅ event `message.complete` | FE badge |
| Follow-up **suggestion chips** | ⚠️ tak native | FE: 1 LLM call kecil ke gateway buat generate 3 saran (opsional) |
| **Pilih model** (Manus 1.6 Lite) | ✅ `model.options` / set | FE dropdown model per node |
| Rename / delete sesi | ✅ `session.title` / `session.delete` | FE menu row |
| Composer: attach file | ⚠️ REST `/api/chat/image-upload` (bukan WS) | FE + **relay REST-proxy** (§6) atau upload ke v-auto-backend |
| Composer: **voice** | ✅ event `voice.*` | FE (opsional, fase akhir) |
| **Stop** generasi | ✅ ada RPC interrupt di gateway | FE tombol Stop |
| **Projects** | ✅ Hermes punya konsep project (tools project_*) | FE (opsional, fase akhir) |
| Pilih **node** (multi-server) | ✅ sudah ada (`/api/relay/nodes`) | pindah ke sidebar |

Kesimpulan: **~85% frontend murni** di atas relay yang ada. Yang butuh backend cuma **attachment** (REST-proxy) & **history gabungan lintas-node** — dua-duanya opsional.

---

## 3. Restruktur route (SvelteKit)

Dari satu `+page.svelte` → shell dengan sidebar:

```
src/routes/agent/
  +layout.svelte     ← shell: sidebar (New task · pilih node · history) + <slot/>
  +layout.ts         ← (opsional) load daftar sesi awal
  +page.svelte       ← landing "What can I do for you?" + chips (state kosong)
  [session]/+page.svelte  ← view percakapan aktif (bubble chat + composer)
```
URL: `/agent` (landing) · `/agent/<sessionId>?node=<id>` (percakapan). Ganti node → history & sesi ikut node itu.

Reuse yang sudah jadi: `src/lib/agent/gatewayClient.ts` (RelayGatewayClient), `Markdown.svelte`,
state-machine event di `+page.svelte` sekarang (dipecah jadi store/komponen).

---

## 4. Fase bertahap (frontend-first)

### FASE UI-1 — App shell + sidebar
- `agent/+layout.svelte`: sidebar kiri (logo/app, **New task**, **pilih node**, daftar **history**), area kanan `<slot/>`.
- Pindahkan **node selector** dari header ke sidebar.
- Pakai shadcn: `sidebar`, `button`, `scroll-area`, `dropdown-menu`, `separator`.
- **Verifikasi:** layout render, node selector jalan, `/agent` tampilkan landing.

### FASE UI-2 — History (inti permintaan) 🎯
- `RelayGatewayClient`: tambah helper `sessions()` → `request('session.list', {...})` (konfirmasi nama method saat implement — lihat §6), map ke `SessionListItem[]`.
- Sidebar: render daftar sesi (title || preview, waktu relatif, jumlah pesan). Klik → `goto('/agent/'+id)`.
- `agent/[session]/+page.svelte`: saat mount, **resume** sesi (`session.create`/resume dgn id) → isi `messages` dari `messages[]` yang dikembalikan → lanjut chat pada sesi itu.
- **New task** → sesi baru (`session.create`) → `goto('/agent/'+newId)`; refresh sidebar.
- Rename (inline / `session.title`) + delete (`session.delete`) per row (menu ⋯).
- **Verifikasi:** kirim beberapa pesan → muncul di history dgn judul; reload → klik history → transcript kebuka; ganti node → history ikut node.

### FASE UI-3 — Landing + quick actions
- `/agent` state kosong: heading "What can I do for you?" + chips (mis. "Ringkas dokumen", "Tulis email", "Cari info", "Bikin todo"). Klik chip = prefill composer / langsung submit ke sesi baru.
- **Verifikasi:** chip → sesi baru + prompt terkirim.

### FASE UI-4 — Status "Task completed" + follow-up chips
- Badge "Selesai" saat `message.complete` (ganti indikator streaming).
- (Opsional) follow-up: setelah complete, panggil gateway sekali dengan prompt "beri 3 pertanyaan lanjutan singkat" → render 3 chip. (Atau skip kalau mau hemat token.)
- **Verifikasi:** badge muncul; chip lanjutan (kalau diaktifkan) klik → lanjut.

### FASE UI-5 — Pilih model per node
- `RelayGatewayClient.modelOptions()` → `request('model.options')`; dropdown model di header sesi.
- Set model: RPC set model (mode chat) atau kirim `/model <slug>` sbg prompt (cara TUI). Konfirmasi jalur saat implement.
- **Verifikasi:** ganti model → sesi berikut pakai model itu.

### FASE UI-6 — Composer lengkap + Stop
- Tombol **Stop** saat `busy` → RPC interrupt sesi.
- Auto-grow textarea, Shift+Enter newline (sudah), tombol lampiran (aktif kalau §6 attachment jadi).
- **Verifikasi:** Stop menghentikan generasi.

### FASE UI-7 (opsional) — Projects + Voice
- Projects: map ke konsep project Hermes (tool `project_*` / RPC bila ada).
- Voice: konsumsi event `voice.transcript` untuk input suara.

---

## 5. Ringkasan file (frontend, v-auto-frontend)
**Buat**
- `src/routes/agent/+layout.svelte` (shell + sidebar history)
- `src/routes/agent/[session]/+page.svelte` (view percakapan)
- `src/lib/agent/sessions.ts` (helper session.list/resume/delete/title via RelayGatewayClient)
- `src/lib/agent/chatState.svelte.ts` (state-machine event dipisah dari +page biar dipakai ulang)

**Edit**
- `src/routes/agent/+page.svelte` → jadi landing (chips)
- `src/lib/agent/gatewayClient.ts` → tambah helper `sessions()/modelOptions()/interrupt()`

**Reuse:** `Markdown.svelte`, `RelayGatewayClient`, auto-reconnect, shadcn ui.

---

## 6. Yang MUNGKIN butuh backend/relay (opsional, per kebutuhan)
1. **Konfirmasi nama RPC**: `session.list` / resume / `session.delete` / `session.title` / `model.options` — verifikasi string method persis dari `ui-tui` (dispatcher) saat implement. Semua sudah lewat `/api/ws`, jadi **relay tak perlu diubah**.
2. **Attachment (upload file)**: Hermes pakai REST `POST /api/chat/image-upload` (bukan WS). Relay kita cuma WS. Pilihan:
   - (a) **Relay REST-proxy**: tambah rute `POST /api/relay/:node/*` yang mem-forward HTTP ke node lewat node-agent (perlu channel HTTP di node-agent). Effort sedang.
   - (b) Upload ke v-auto-backend sendiri (storage sendiri), lalu kirim path ke agent. Lebih simpel kalau file cukup di sisi app.
3. **History gabungan lintas-node**: kalau mau satu daftar history untuk semua node → agregasi di relay/DB (tabel `agent_sessions` yang di-index node-agent). Kalau cukup **per-node**, tidak perlu.
4. **Auth/scoping per user**: sesi di node tidak tahu user v-auto mana. Kalau butuh "history milik user X saja", perlu tag user di `session.create` (params) atau pemetaan di relay. (Lihat isolasi tool di `hermes.md §9`.)

---

## 7. Urutan disarankan (MVP)
1. **UI-1 + UI-2** (shell + history) → ini inti permintaan; langsung terasa "ala Manus".
2. **UI-3** (landing + chips).
3. **UI-4/5** (status + model).
4. Sisanya (attachment/voice/projects) sesuai kebutuhan.

## 8. Keputusan terbuka (tolong konfirmasi)
- **Seberapa mirip Manus** yang dimau (sekadar history + landing, atau full: projects, scheduled, plugins)?
- **History per-node** (default, gratis) **vs gabungan lintas-node** (butuh agregasi backend)?
- **Follow-up chips**: pakai (1 LLM call ekstra/turn) atau skip?
- **Attachment**: perlu sekarang? Kalau ya, jalur (a) relay-proxy atau (b) storage v-auto?
- **Scoping per user**: history harus privat per user, atau shared per node (tim kecil)?
