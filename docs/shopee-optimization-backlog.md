# Product Backlog — Shopee Store Optimization System

**Product Goal**: Sistem yang scrape semua aset toko Shopee (text + image), analisis dengan AI, tentukan apakah butuh optimasi (skor per aset + threshold), lalu jika ya — generate draft optimasi (text + image), user review & edit, export siap upload. Semua aktivitas tersimpan per session dengan full history.

**Flow** (revised Sprint 2 — public shop URL input, no seller center):
```
Mode Switcher → "Optimization" → sidebar item "Shopee" → List sessions (global)
  → click "New Analysis"
    1. Check/create scrap profile (local, persist cookies, not in Profiles list, not synced to server)
    2. Launch scrap profile via Rust command (CDP enabled, headed)
    3. Connect CDP → check login shopee.co.id (public, not seller center)
       → jika belum login → alert "Login Shopee di browser yang terbuka, lalu klik Next" (user login manual)
       → jika sudah login → lanjut
    4. Modal input shop URL (shopee.co.id/{shop-slug})
    5. POST /sessions {cdp_ws_url, shop_url} → BE create session + auto-run
       → scrape public shop page + 10 product unggulan → analyze → drafts
    6. FE redirect ke detail (status="scraping", polling progress)
  → detail page: progress → done → tabs (Overview, Products, Scores, Drafts)
  → "Re-run Analysis" → launch scrap profile lagi → POST /sessions/:id/run {cdp_ws_url, shop_url}
```

**Old flow** (Sprint 1 — deprecated, seller center approach):
```
Staff Profiles → More Actions → "Optimization (Shopee)" → List session (per profile)
  → New Analysis → VBOX launch staff profile → check login seller center → POST /sessions {cdp_ws_url}
```
Alasan revisi: Seller Center butuh password kedua untuk akses shop settings, tidak praktis. Public shop page tidak butuh login seller center, cukup login shopee.co.id biasa.

**1 Session = 1 full workflow** (scrape → analyze → optimize → export). Scrape ulang toko yang sama = session baru. Bisa compare antar session.

**Architecture** (revised Sprint 2):
```
VBOX Desktop App (Tauri + React)
  ├─ Mode Switcher: tambah mode "Optimization" (sejajar Chrome Profile, Dashboard ADV, Agent, PPT Builder)
  ├─ Sidebar mode "Optimization": item "Shopee" (section: shopee-optimization)
  ├─ Page: ShopeeOptimization.tsx (list sessions GLOBAL + "New Analysis" flow baru)
  ├─ Page: ShopeeSessionDetail.tsx (detail dengan tabs: Overview, Products, Scores, Drafts)
  ├─ Rust command: launch_scrap_profile (UDD khusus scrap, persist cookies, CDP enabled, tidak fetch dari backend)
  │   │ HTTP (fetch ke v-auto-backend LOCAL)
  │   ▼
v-auto-backend (Hono + Bun + Drizzle)
  ├─ /routes/shopeeOptimization.ts (session CRUD, auto-run, re-run, optimize, export)
  ├─ /lib/scraperBridge.ts (spawn Node child process untuk scraping — Bun WebSocket incompatible dengan patchright)
  ├─ /scraper-worker.mjs (Node script: connectOverCDP, scrapeShop, scrapeProducts — run via `node`)
  ├─ /routes/shopeeScraper.ts (LEGACY — direct patchright, tidak dipakai karena Bun WebSocket issue)
  ├─ /routes/llmGateway.ts (Gemini 3.5 Flash Lite text + vision)
  ├─ /lib/gemini.ts (shared lib — internal callers, no HTTP/auth)
  ├─ /lib/shopeeAnalyzer.ts (scoring logic)
  ├─ /routes/uploads.ts (REUSE: serve images)
  └─ Drizzle schema: shopeeScrapeSessions, shopeeShops, shopeeProducts, shopeeScores, shopeeDrafts, shopeeImages
      │ node src/scraper-worker.mjs <cdp_ws_url> <command> [args]
      ▼
Node child process (patchright connectOverCDP — works in Node, NOT in Bun)
  ├─ chromium.connectOverCDP(cdpWsUrl) — connect ke browser VBOX
  ├─ scrapePublicShop(shopUrl) — scrape shopee.co.id/{slug} (shop info + 10 product unggulan)
  ├─ scrapeProductDetails(productUrls) — scrape product detail pages
  └─ Return JSON via stdout
      │ CDP WebSocket
      ▼
ShardX Engine (anti-detect browser — launched by VBOX Rust command)
  ├─ Chromium 149 patched (fingerprint, WebRTC, QUIC)
  ├─ Scrap profile: UDD khusus (vbox-scrap-profile), persist cookies, TIDAK sync ke server, TIDAK muncul di Profiles list
  └─ User login shopee.co.id sekali di scrap profile ini (manual)
```

**Scraper Strategy** (revised Sprint 2):
- **Bun WebSocket incompatible dengan patchright** — `chromium.connectOverCDP()` timeout di Bun tapi sukses di Node.
- Solusi: BE (Bun) spawn Node child process (`node src/scraper-worker.mjs`) untuk scraping. Pass CDP ws URL via argv, return JSON via stdout.
- `scraperBridge.ts` — helper di BE untuk spawn & parse output Node worker.
- `scraper-worker.mjs` — plain JS (no TypeScript), run with `node`, import patchright, connectOverCDP, scrape, return JSON.

**Profile & Login Strategy** (revised Sprint 2):
- **Scrap profile**: auto-create jika belum ada, pakai jika sudah ada. UDD khusus (`vbox-scrap-profile`), persist cookies. TIDAK sync ke server, TIDAK muncul di Profiles list.
- **Rust command `launch_scrap_profile`**: launch browser dengan UDD khusus scrap, CDP enabled, headed. Tidak fetch profile data dari backend (local only).
- **Login check**: connect CDP → navigate ke shopee.co.id → detect login redirect. Kalau belum login → user login manual di browser yang terbuka.
- **Shop URL input**: user input public shop URL (shopee.co.id/{slug}). Tidak butuh seller center access.
- **Scrape target**: public shop page (shop info, stats, logo, banner) + 10 product unggulan (title, price, thumbnail, detail).

**Image Storage Strategy**: Scraped images & uploaded templates disimpan di folder `uploads/` BE. FE akses via `/api/uploads/:filename` (reuse existing uploads route). Filename = UUID (ikut pattern existing).

**Project**: Integrasi ke VBOX (FE) + v-auto-backend (BE + scraper). v-auto-scraper (Python) di-archive.
**Scrum Team**: PO+SM (Devin), Dev Team (User)
**Sprint Duration**: 1 minggu
**Tech Stack**:
- FE: VBOX (React + Tauri), shadcn/ui (existing VBOX components), TanStack Table
- BE: Hono, Bun, Drizzle ORM (MySQL), Zod (existing v-auto-backend)
- Scraper: patchright Node (connect_over_cdp ke VBOX shardX engine)
- LLM: Gemini 3.5 Flash Lite (text + vision, dev mode — free tier 15 RPM / 500 RPD). Production: upgrade ke Gemini 3.7 Flash (Tier 1, lebih akurat). Model configurable via env.
- Image generation: Sprint 1 = manual (system generate prompt, user copy-paste ke Gemini web). Sprint 2 = auto (setelah konfirmasi model/API)
- Browser engine: VBOX shardXbrowser (Chromium 149 patched, anti-detect)

**Definition of Done (DoD) — Sprint 1 (POC mode)**:
- Code berjalan tanpa error pada happy path
- Bisa di-demo end-to-end dengan 1 toko sample
- Tidak ada test formal (POC)
- Type hints pada public functions (TS)
- Error handling dasar
- Ikut pattern existing codebase (VBOX FE + v-auto-backend)

---

## Epics

### Epic 1: VBOX FE — Staff Profiles Optimization Integration (Browser Manager)
Tambah menu "Optimization (Shopee)" di More Actions Staff Profiles → VBOX app handle launch/stop profile (reuse launchProfile) → pass CDP URL to v-auto-backend → list session per profile → detail session dengan tabs.

### Epic 2: Backend — Scraper via CDP (no VBOX API client)
v-auto-backend terima CDP ws URL dari VBOX app, connect_over_cdp via patchright Node, scrape Shopee Seller Center + shop page + product pages. Tidak handle start/stop profile (VBOX app yang handle).

### Epic 3: Backend — Gemini Gateway Extension
Extend llmGateway.ts supaya support Gemini untuk vision analysis & image generation.

### Epic 4: Backend — Shopee Optimization API + Session Management
Route baru `shopeeOptimization.ts` + Drizzle schema dengan konsep session untuk orchestrate: scrape → analyze → score → optimize → export.

---

## Product Backlog Items (User Stories)

### Epic 1: VBOX FE — Staff Profiles Optimization Integration

#### PBI-1.1: Staff Profiles — tambah "Optimization (Shopee)" di More Actions
**As a** admin
**I want** menu "Optimization (Shopee)" di More Actions Staff Profiles
**So that** bisa mulai optimasi toko Shopee dari profile staff yang sudah login seller center

**Acceptance Criteria**:
- Edit `src/lib/types.ts`: tambah `"shopee-optimization"` & `"shopee-session-detail"` ke `Section` type
- Edit `src/pages/StaffProfiles.tsx`:
  - Tambah DropdownMenuItem "Optimization (Shopee)" di More Actions (icon: ShoppingBag atau Sparkles)
  - onClick: set section ke "shopee-optimization" + pass profile_id & profile_name ke state (untuk list session per profile)
- Edit `src/App.tsx`: tambah render untuk section "shopee-optimization" & "shopee-session-detail"
- Buat `src/pages/ShopeeOptimization.tsx` (placeholder, terima props: profile_id, profile_name)
- Build VBOX tidak error
- Menu "Optimization (Shopee)" muncul di More Actions setiap profile di Staff Profiles

**Story Points**: 2

---

#### PBI-1.2: VBOX FE — List sessions per profile + New Analysis (VBOX launch + check login + scrape)
**As a** admin
**I want** lihat list session optimasi per staff profile + button "New Analysis" yang launch profile, cek login, & trigger scrape
**So that** bisa mulai analisa baru hanya kalau profile sudah login seller center

**Acceptance Criteria**:
- Page `ShopeeOptimization.tsx`: header dengan profile name + button "New Analysis" + button "Back" (return ke Staff Profiles)
- TanStack Table: columns = shop_name, status, created_at, actions (view/delete)
- Fetch sessions dari `GET /api/shopee-optimization/sessions?profile_id=...` (v-auto-backend local) — **per profile, bukan global**
- Empty state: "Belum ada session untuk profile ini. Klik 'New Analysis' untuk mulai."
- **"New Analysis" button flow** (VBOX app handle browser lifecycle):
  1. Click "New Analysis" → FE disable button (loading state "Launching browser...")
  2. **VBOX app launch profile** via Tauri invoke (`launch_temporary_profile` — reuse dari StaffProfiles, pass fingerprint, cookies, proxy dari profile data). Browser terbuka (headed).
  3. **Get CDP ws URL** dari launch result (atau dari VBOX Local API `GET /running`)
  4. **Call v-auto-backend check-login**: `POST /api/shopee-optimization/check-login` body: `{cdp_ws_url}` → v-auto-backend connect CDP, navigate ke seller center, detect login, disconnect → return `{logged_in: boolean}`
  5. **Kalau belum login** → tampilkan alert "Akun Shopee seller belum login. Browser sudah terbuka, silakan login manual di Seller Center, lalu klik 'New Analysis' lagi." Browser tetap terbuka (user login manual). FE re-enable "New Analysis" button. **Tidak create session.**
  6. **Kalau sudah login** → call `POST /api/shopee-optimization/sessions` body: `{profile_id, cdp_ws_url}` → BE create session + **auto-trigger run** (scrape + analyze in background via CDP) → return `{id, profile_id, status: "scraping"}` → FE **langsung redirect ke detail page** (status sudah "scraping", progress langsung jalan). Browser tetap terbuka (dipakai untuk scrape).
- Delete session (confirm dialog) → `DELETE /api/shopee-optimization/sessions/:id`
- Click row → navigate ke detail (section: "shopee-session-detail")
- Loading & error states
- **Concurrency control**: disable "New Analysis" button kalau ada session lain dengan profile_id sama sedang status="scraping" atau "analyzing". Tampilkan tooltip "Tunggu session lain selesai."
- **Note**: VBOX app butuh profile data (fingerprint, cookies) dari prod v-auto-backend. VBOX app sudah fetch ini via `chromeProfilesApi.getByUuid(p.id)`. Reuse code dari `launchProfile` di StaffProfiles. No proxy (dev VBOX tidak pakai proxy, cookies Shopee tetap valid).
- **Note**: Buat `src/lib/shopeeApi.ts` — API client terpisah dengan base URL `VITE_SHOPEE_API_BASE_URL` (local v-auto-backend, http://localhost:2024/api). Auth: reuse `backend_auth_token` (same JWT secret → token valid untuk local). Tambah `VITE_SHOPEE_API_BASE_URL` ke `.env.development` & `.env.production`.

**Story Points**: 5

---

#### PBI-1.3: VBOX FE — Detail session + tabs (progress + results)
**As a** admin
**I want** detail session yang menampilkan progress scraping/analyzing & tabs hasil setelah done
**So that** bisa monitor proses & review hasil optimasi

**Acceptance Criteria**:
- Page `ShopeeSessionDetail.tsx` (section: "shopee-session-detail")
- **Header**:
  - Shop name (kalau sudah di-scrape), session date, status badge, verdict badge (kalau done), overall score (kalau done)
  - **"Re-run Analysis" button**: tampil kalau status="done" atau "failed" → **confirm dialog** "Re-run akan menghapus semua data & drafts yang sudah ada untuk session ini. Lanjutkan?" (warning kalau ada drafts status="approved") → **VBOX app launch profile lagi** (reuse launchProfile) → get CDP ws URL → call `POST /api/shopee-optimization/sessions/:id/run` body: `{cdp_ws_url}` (re-scrape + re-analyze, hapus data lama)
  - **"Back" button** → return ke list session
- **Progress state** (kalau status="scraping" atau "analyzing"):
  - Spinner + status text ("Scraping Seller Center...", "Scraping shop page...", "Scraping products...", "Analyzing shop...", "Analyzing products...")
  - Polling `GET /sessions/:id` setiap 3s untuk update status
  - Timeout 15 menit → tampilkan "Timeout, coba re-run"
  - **"Cancel" button**: tampil selama progress → confirm dialog "Batalkan & hapus session ini?" → call `DELETE /api/shopee-optimization/sessions/:id` (hapus session) → **VBOX app stop profile** (reuse `process_kill` Tauri invoke dari StaffProfiles) → redirect ke list session
  - **Setelah done/failed** → VBOX app **stop profile** (reuse `process_kill` — browser tidak perlu terbuka setelah selesai)
- **Failed state** (kalau status="failed"):
  - Tampilkan error reason (login_required, captcha_required, scrape_timeout, cdp_disconnected, analyze_error)
  - Kalau reason="login_required" → tampilkan alert "Akun Shopee seller belum login. Klik 'Re-run Analysis' untuk coba lagi (browser akan terbuka, login manual jika perlu)."
  - Kalau reason="captcha_required" → tampilkan alert "Captcha muncul di browser. Klik 'Re-run Analysis', browser akan terbuka, solve captcha manual, lalu re-run lagi."
  - "Re-run Analysis" button untuk coba lagi
- **Tabs** (muncul setelah status="done"):
  - Overview: shop info + product list + scraped images + summary cards + verdict banner
  - Scores: skor per aset (title, description, photo) dengan threshold indicator
  - Recommendations: saran optimasi per aset
  - Image Prompts: prompt text untuk template & compositing (copy button) + upload template
  - Editor: edit title/description drafts (textarea)
  - Export: download semua drafts + prompts sebagai JSON/CSV
- Fetch data dari `GET /api/shopee-optimization/sessions/:id` (full data, include error_reason kalau failed)
- Responsive layout

**Story Points**: 7

---

### Epic 2: Backend — Scraper via CDP (no VBOX API client)

#### PBI-2.1: Install patchright Node + scraper scaffold
**As a** developer
**I want** patchright Node terinstall di v-auto-backend
**So that** BE bisa connect_over_cdp ke browser yang di-launch VBOX app

**Acceptance Criteria**:
- `cd v-auto-backend && bun add patchright` (drop-in replacement Playwright, source-level stealth untuk driver)
- Buat `src/routes/shopeeScraper.ts` (scaffold — function signatures):
  - `checkLogin(cdpWsUrl)` — connect CDP, navigate seller center, detect login, disconnect
  - `scrapeShop(cdpWsUrl)` — connect CDP, scrape seller center + shop page, disconnect
  - `scrapeProduct(cdpWsUrl, productUrl)` — connect CDP, scrape product page, disconnect
  - `scrapeAllProducts(cdpWsUrl)` — scrape shop dulu, lalu loop products
- **No vboxClient.ts** — v-auto-backend TIDAK handle start/stop profile. VBOX app yang handle.
- **No VBOX_API_URL, VBOX_API_TOKEN env** — tidak perlu
- Helper: `connectCdp(cdpWsUrl)` → return browser, context, page (reuse di semua scraper function)
- Helper: `downloadImage(url, uploadsDir)` → download ke `uploads/` (UUID filename)

**Story Points**: 2

---

#### PBI-2.2: Scraper — Seller Center + Shop page (text + image) via CDP
**As a** seller
**I want** scrape Shopee Seller Center & shop page untuk dapat profil toko + produk
**So that** sistem punya data lengkap untuk analisis

**Acceptance Criteria**:
- Implement `scrapeShop(cdpWsUrl)` di `src/routes/shopeeScraper.ts`:
  - Pakai patchright Node `chromium.connectOverCDP(cdpWsUrl)`
  - Pakai context & page yang ada di browser (jangan new_context — spoof tetap utuh)
  - **Step 1 — Seller Center**: navigate ke https://seller.shopee.co.id/ (domcontentloaded)
    - Extract: shop name, shop URL/slug (dari seller center), shop stats, performance
    - Dapatkan shop_url untuk Step 2
  - **Step 2 — Public shop page**: navigate ke https://shopee.co.id/{shop-slug} (domcontentloaded)
    - Wait for: `.section-seller-overview-horizontal__portrait-name`
    - Extract TEXT: shop name, bio, koleksi list, rating, follower, response rate/time
    - Extract IMAGE: logo, banner, hero URLs
    - Extract produk unggulan: product_id, title, price, thumbnail URL, product URL
  - Download images ke `uploads/` folder (UUID filename — reuse uploads route pattern)
  - Return JSON: shop metadata (dari seller center + public page) + list produk + image URLs
  - **Disconnect CDP setelah selesai** (jangan close browser — VBOX app yang handle stop)
- Rate limit: 1 action / 3s, random delay 2-5s
- Retry 3x exponential backoff
- Login detection: kalau redirect ke /buyer/login atau seller center redirect ke login → return error "login_required"
- Captcha detection: kalau redirect ke /verify/captcha → return error "captcha_required"

**Story Points**: 5

---

#### PBI-2.3: Scraper — Product page per SKU (text + image) via CDP
**As a** seller
**I want** scrape halaman detail tiap produk
**So that** dapat judul, deskripsi, varian, harga, foto, video

**Acceptance Criteria**:
- Implement `scrapeProduct(cdpWsUrl, productUrl)` & `scrapeAllProducts(cdpWsUrl)` di `src/routes/shopeeScraper.ts`:
  - `scrapeAllProducts(cdpWsUrl)` — scrape shop dulu (PBI-2.2), lalu loop semua featured products
- Extract TEXT: product_id, title, description, category, attributes, variants, price, stock, rating, sold, specifications
- Extract IMAGE: semua foto URL (hingga 8), video URL
- Download foto ke `uploads/` folder (UUID filename — 01_{uuid}.jpg, 02_{uuid}.jpg, ...)
- Return JSON: product details + image URLs
- **Disconnect CDP setelah selesai** (jangan close browser)
- Rate limit sama dengan PBI-2.2
- Batch: `scrapeAllProducts` loop dengan delay 3-5s antar product

**Story Points**: 5

---

#### PBI-2.4: Login check (Shopee Seller Center)
**As a** admin
**I want** sistem cek apakah staff profile sudah login Shopee Seller Center
**So that** scraper bisa jalan tanpa error login

**Acceptance Criteria**:
- Implement `checkLogin(cdpWsUrl)` di `src/routes/shopeeScraper.ts`:
  - Connect CDP, navigate ke https://seller.shopee.co.id/ (domcontentloaded)
  - Detect login redirect (URL contains "login" or "signin")
  - **Disconnect CDP** (jangan close browser — VBOX app yang handle)
  - Return `{logged_in: boolean}`
- Route: `POST /api/shopee-optimization/check-login` body: `{cdp_ws_url}` → check login → return `{logged_in: boolean}`
- **Login detection**: kalau URL redirect ke login page → logged_in=false. Kalau tetap di seller center dashboard → logged_in=true.
- **VBOX app handle launch profile** — v-auto-backend hanya connect CDP yang sudah di-launch oleh VBOX app. Tidak perlu start/stop profile.

**Story Points**: 2

---

#### PBI-2.5: Compositor — Composite product photo ke template
**DEFERRED TO SPRINT 2** — Auto compositing setelah konfirmasi model image gen.

Sprint 1: compositing dilakukan manual oleh user via Gemini web (system generate prompt only).

---

### Epic 3: Backend — Gemini Gateway Extension

#### PBI-3.1: Extend llmGateway untuk Gemini (text + vision)
**As a** developer
**I want** llmGateway support Gemini 3.5 Flash Lite untuk text & vision
**So that** scoring (text + photo) terpusat di gateway

**Acceptance Criteria**:
- Tambah env: `GEMINI_API_KEY`, `GEMINI_MODEL` (default gemini-3.5-flash-lite, configurable ke gemini-3.7-flash untuk prod)
- Route: `POST /api/llm/gemini/text` — body: `{prompt, system_prompt?}` → Gemini text API (JSON mode optional) → return text
- Route: `POST /api/llm/gemini/vision` — body: `{image_url or image_path, prompt, system_prompt?}` → Gemini vision API (JSON mode) → return analysis text
- Rate limit: queue + retry backoff (free tier 15 RPM, 500 RPD)
- Error handling: quota (429), invalid image, network, safety filter
- JSON mode: `generationConfig.responseMimeType = "application/json"` untuk scoring
- **No image generation route** — Sprint 1 pakai manual prompt (user copy-paste ke Gemini web). Image gen API defer ke Sprint 2.
- **Configurable model**: tinggal ganti `GEMINI_MODEL` env untuk switch dev ↔ prod (gemini-3.5-flash-lite ↔ gemini-3.7-flash)

**Story Points**: 3

---

### Epic 4: Backend — Shopee Optimization API + Session Management

#### PBI-4.1: Drizzle schema dengan session management
**As a** developer
**I want** schema DB dengan konsep session
**So that** setiap workflow scrape→analyze→optimize terisolasi & bisa di-history

**Acceptance Criteria**:
- Tambah ke `src/db/schema.ts`:
  - `shopeeScrapeSessions`: id, user_id (FK), **profile_id** (varchar — VBOX Staff Profile UUID), shop_url (nullable — di-discover saat scrape), shop_name (nullable), status (enum: pending/scraping/analyzing/optimizing/done/failed), **error_reason** (varchar nullable — login_required/captcha_required/scrape_timeout/vbox_api_down/analyze_error), overall_score (int nullable), verdict (enum: optimal/needs_optimization nullable), text_optimized (boolean default false), template_selected (boolean default false), composite_done (boolean default false), started_at, completed_at (nullable), created_at, updated_at
  - `shopeeShops`: id, session_id (FK), shop_url, shop_name, bio, rating, follower_count, response_rate, scraped_at, created_at
  - `shopeeProducts`: id, session_id (FK), shop_id (FK), product_id (shopee), title, description, category, price, stock, rating, sold_count, variants (json), attributes (json), scraped_at, created_at
  - `shopeeImages`: id, session_id (FK), product_id (FK nullable), shop_id (FK nullable), type (enum: shop_logo/shop_banner/shop_hero/product_photo/template/composite), file_path, url, dimensions (json), is_selected_template (boolean default false), created_at
  - `shopeeScores`: id, session_id (FK), product_id (FK nullable), shop_id (FK nullable), asset_type (enum: title/description/photos/shop_banner/shop_bio/shop_logo), score (int), breakdown (json), suggestion (text), created_at
  - `shopeeDrafts`: id, session_id (FK), product_id (FK nullable), shop_id (FK nullable), asset_type (enum: title/description/photos), original_content (text), draft_content (text), draft_variants (json nullable — untuk 3 variants title), draft_image_path (varchar nullable), selected_variant (int nullable — index variant yang dipilih user), status (enum: pending/approved/rejected), created_at, updated_at
- Generate migration: `drizzle-kit generate`
- Run migration: `drizzle-kit push`
- Indexes: session_id di semua tabel, user_id & profile_id di sessions
- Relations: ikut pattern existing (relations() dari drizzle-orm)

**Story Points**: 5

---

#### PBI-4.2: Route — Session CRUD + auto-run on create
**As a** admin
**I want** buat session baru per staff profile yang langsung auto-run (scrape + analyze)
**So that** satu API call create session + trigger scrape + analyze, FE tinggal polling status

**Acceptance Criteria**:
- `GET /api/shopee-optimization/sessions?profile_id=...` — list session per profile (pagination, sort by created_at desc)
- `GET /api/shopee-optimization/sessions/:id` — detail session (shop info, product count, status, verdict, progress flags, **error_reason** kalau failed, full data untuk tabs)
- `POST /api/shopee-optimization/sessions` body: `{"profile_id": "...", "cdp_ws_url": "..."}` — **create + auto-run** (login check & profile launch dilakukan di VBOX app sebelum call ini):
  - Buat session dengan status="scraping" (langsung, bukan pending)
  - **Background**: trigger scrape + analyze asynchronously (jangan block response)
  - Return immediately: `{id, profile_id, status: "scraping"}`
  - FE redirect ke detail page, polling `GET /sessions/:id` untuk progress
  - **Flow background** (wrap dengan try-catch):
    - Step 1: `scrapeShop(cdpWsUrl)` → save ke DB (shopeeShops, shopeeProducts, shopeeImages) → status="scraped"
    - Step 2: `analyzeSession(sessionId)` (PBI-4.3) → save scores → status="done"
    - **Error handling**: kalau gagal di step manapun → set status="failed" + error_reason (login_required, captcha_required, scrape_timeout, cdp_disconnected, analyze_error)
    - **Disconnect CDP**: setelah selesai (success atau failed), disconnect dari CDP (jangan close browser — VBOX app yang handle stop)
  - Scraper save images langsung ke `uploads/` BE (filename UUID)
- `POST /api/shopee-optimization/sessions/:id/run` body: `{"cdp_ws_url": "..."}` — **re-run** (untuk re-scrape + re-analyze session yang sudah done/failed):
  - Set status="scraping", hapus data lama (cascade shopeeShops, shopeeProducts, shopeeImages, shopeeScores, shopeeDrafts untuk session ini), re-scrape + re-analyze dengan CDP baru
  - Dipanggil dari "Re-run Analysis" button di detail page (VBOX app launch profile lagi, pass new cdp_ws_url)
- `DELETE /api/shopee-optimization/sessions/:id` — hapus session + semua data terkait (cascade) + hapus file di uploads/ (VBOX app handle stop profile terpisah)
- **Auth**: `requireAuth` + `requireManagement` (staff/admin only)
- **Audit log**: semua action (create+run, re-run, delete) log ke auditTrail table (reuse existing pattern)
- Ikut pattern `products.ts` (Hono router, Zod validation, auth middleware)
- **Note**: Login check & profile launch dilakukan di VBOX app (PBI-1.2) sebelum call POST /sessions. BE tidak perlu cek login lagi (VBOX app sudah pastikan sudah login). Tapi BE tetap handle login_required kalau session expire saat scrape (set status="failed" dengan error_reason="login_required").

**Story Points**: 5

---

#### PBI-4.3: Logic — Score & verdict (called by run endpoint, no separate route)
**As a** seller
**I want** sistem analisis & beri skor per aset dalam session
**So that** tahu apa yang butuh optimasi

**Acceptance Criteria**:
- **No separate route** — analyze logic dipanggil dari `POST /sessions/:id/run` (PBI-4.2 Step 3). Re-analyze selalu pakai run (re-scrape + re-analyze, data selalu fresh).
- Buat `src/lib/shopeeAnalyzer.ts` dengan function `analyzeSession(sessionId)`:
  - **Phase 1 — Shop-level analysis (DILAKUKAN DULU)**:
    - Score shop banner: call Gemini vision dengan shop context (shop name, category, rating) → save shopeeScores (shop_id, product_id=null, asset_type=banner)
    - Score shop logo: same → save shopeeScores (asset_type=logo)
    - Score shop bio: call Gemini 3.5 Flash Lite dengan shop context → save shopeeScores (asset_type=bio)
    - Aggregate product photo styles: analisa semua foto produk (color scheme, background consistency, lighting style) → save shop style profile ke session (shop_style_profile JSON)
    - Output Phase 1: shop style profile (color scheme, aesthetic, consistency issues, style suggestions) — jadi input untuk template prompt (PBI-4.5)
  - **Phase 2 — Product-level analysis (setelah Phase 1 done)**:
    - Score title: call Gemini 3.5 Flash Lite via llmGateway dengan **JSON mode** + **product context** (title, category, price, variants, shop name) → parse JSON {score, breakdown, suggestion} → save shopeeScores (session_id, product_id)
    - Score description: same dengan description context
    - Score photos: call Gemini 3.5 Flash Lite vision per foto dengan **JSON mode** + **full context** (product title, category, price, variants, description highlights, shop category, **shop style profile dari Phase 1**) → aggregate → save shopeeScores
      - **Context penting**: Gemini perlu tahu ini foto sepatu/makanan/elektronik untuk suggestion yang relevan. Shop style profile bantu assess konsistensi foto dengan style toko.
      - Prompt structure: system role (Shopee photo expert) + product context + shop context + shop style profile + photo + scoring criteria + JSON schema
  - Aggregate → verdict (threshold 70, configurable) → save ke session (overall_score, verdict)
  - **Robust JSON parsing**: kalau LLM return text bukan JSON, extract dengan regex (find first `{...}`) + fallback score 50
- `GET /api/shopee-optimization/sessions/:id/scores` — return semua skor + verdict (shop-level + product-level) + shop style profile
- Rate limit: queue Gemini (15 RPM, 500 RPD)

**Story Points**: 6

---

#### PBI-4.4: Route — Generate text drafts (title & description)
**As a** seller
**I want** sistem generate draft judul & deskripsi baru
**So that** bisa review sebelum apply

**Acceptance Criteria**:
- `POST /api/shopee-optimization/sessions/:id/optimize-text` body: `{"asset_types": ["title", "description"]}`:
  - Set status=optimizing
  - Untuk aset text yang score < threshold:
    - Title: call Gemini 3.5 Flash Lite → generate 3 draft variants → save shopeeDrafts (session_id, asset_type=title, draft_variants=[{variant:1, content:"..."}, {variant:2, ...}, {variant:3, ...}], draft_content=null, selected_variant=null)
    - Description: call Gemini 3.5 Flash Lite → generate draft (struktur: intro, features, specs, shipping, warranty, CTA) → save (asset_type=description, draft_content="...", draft_variants=null)
  - Set text_optimized=true, status=done
  - **Audit log**: log optimize-text action
- `GET /api/shopee-optimization/sessions/:id/drafts` — return semua draft (text + image)
- `PUT /api/shopee-optimization/draft/:id` — update draft content (user edit) — untuk title: update selected_variant + draft_content
- `PUT /api/shopee-optimization/draft/:id/select-variant` body: `{variant: 1|2|3}` — user pilih variant title → set selected_variant + copy ke draft_content
- `PUT /api/shopee-optimization/draft/:id/approve` — set status approved

**Story Points**: 5

---

#### PBI-4.5: Route — Generate template prompt (manual image gen)
**As a** seller
**I want** sistem generate prompt untuk template design
**So that** bisa copy-paste ke Gemini web untuk generate template manual

**Acceptance Criteria**:
- `POST /api/shopee-optimization/sessions/:id/generate-template-prompt`:
  - Generate prompt text dari **PBI-4.3 Phase 1 shop style profile** (color scheme, aesthetic, consistency issues) + **scoring aggregate** + design spec (1:1, e-commerce catalog template, slot for product photo, text area, badge area)
  - Konteks penting: template harus match shop identity. Template untuk toko sepatu mahal berbeda dengan toko aksesoris murah. Style, color scheme, badge type dari shop style profile.
  - Pakai Gemini 3.5 Flash Lite untuk generate prompt text
  - Return: prompt text (string) + instructions (step-by-step cara pakai di Gemini web)
  - **No image generation** — user copy-paste prompt ke Gemini web manual
- `POST /api/shopee-optimization/sessions/:id/regenerate-template-prompt` body: `{"custom_input": "..."}`:
  - User kasih input tambahan (misal: "warna lebih cerah", "font lebih besar")
  - Re-generate prompt dengan input tambahan + shop style profile yang sama
  - Return: new prompt text
- `POST /api/shopee-optimization/sessions/:id/upload-template` (multipart/form-data):
  - User upload template hasil generate dari Gemini web
  - Save ke `uploads/` (UUID filename)
  - Save ke shopeeImages (type=template, session_id, file_path, url=`/api/uploads/{filename}`)
  - Set template_selected=true di session
  - Return: template URL + metadata
  - **Audit log**: log upload-template action
- **Audit log**: log generate-template-prompt action

**Story Points**: 4

---

#### PBI-4.6: Route — Generate composite prompts per SKU (manual)
**As a** seller
**I want** sistem generate prompt per SKU untuk compositing
**So that** bisa copy-paste ke Gemini web untuk composite product photo ke template manual

**Acceptance Criteria**:
- `POST /api/shopee-optimization/sessions/:id/generate-composite-prompts` body: `{"product_ids": [...]}`:
  - **Validasi: template sudah di-upload** (template_selected=true, ada shopeeImages type=template)
  - Untuk tiap product_id di list:
    - Generate prompt text dengan **full product context** (title, category, price, variants, key features dari description) + **template reference** (template URL dari PBI-4.5 upload, template design spec) + compositing instructions
    - Konteks penting: prompt composite untuk sepatu (perlu show sole, angle 3/4) berbeda dengan makanan (perlu show packaging, appetizing angle). Template reference bantu prompt lebih spesifik (slot position, text area, badge area).
    - Pakai Gemini 3.5 Flash Lite
    - Save ke shopeeDrafts (asset_type=photos, draft_content=prompt text, status=pending)
  - Return: list prompts (product_id, product_name, prompt text, template_url, instructions)
  - Instructions: "Upload template (link provided) + product photo ke Gemini web, copy prompt, generate composite."
  - **No actual compositing** — user copy-paste prompt + upload template + product photo ke Gemini web manual
- **Audit log**: log generate-composite-prompts action

**Story Points**: 3

---

#### PBI-4.7: Route — Export (per session)
**As a** seller
**I want** export hasil optimasi yang approved dari session
**So that** bisa upload ke Shopee Seller Center

**Acceptance Criteria**:
- `GET /api/shopee-optimization/sessions/:id/export` — CSV text (title + description drafts + photo prompts)
- `GET /api/shopee-optimization/sessions/:id/export/text` — CSV only (same as above)
- CSV format: product_id, asset_type, original, optimized/prompt, status
- **No image export** — Sprint 1 tidak ada composite images di system (manual via Gemini web). Image export defer ke Sprint 2.
- **Audit log**: log export action

**Story Points**: 2

---

## Backlog Summary

| PBI | Epic | Story Points |
|-----|------|--------------|
| 1.1 Staff Profiles — tambah "Optimization (Shopee)" di More Actions | VBOX-FE | 2 |
| 1.2 VBOX FE — List sessions + New Analysis (VBOX launch + check login + scrape) | VBOX-FE | 5 |
| 1.3 VBOX FE — Detail session + tabs (progress + cancel + re-run) | VBOX-FE | 7 |
| 2.1 Install patchright Node + scraper scaffold | BE-Scraper | 2 |
| 2.2 Scraper Seller Center + shop page via CDP | BE-Scraper | 5 |
| 2.3 Scraper product page via CDP | BE-Scraper | 5 |
| 2.4 Login check via CDP | BE-Scraper | 2 |
| 2.5 Compositor (automated) | BE-Scraper | **DEFERRED Sprint 2** |
| 3.1 Extend llmGateway (Gemini 3.5 Flash Lite vision) | BE-Gateway | 3 |
| 4.1 Drizzle schema + session (with profile_id) | BE-API | 5 |
| 4.2 Route session CRUD + auto-run on create | BE-API | 5 |
| 4.3 Logic — Score & verdict (called by run) | BE-API | 6 |
| 4.4 Route generate text drafts | BE-API | 5 |
| 4.5 Route generate template prompt + upload | BE-API | 4 |
| 4.6 Route generate composite prompts | BE-API | 3 |
| 4.7 Route export (text only) | BE-API | 2 |
| **TOTAL** | | **57** |

---

## Sprint Planning Notes

**Constraint**: 1 minggu, DoD POC.

**Total backlog**: 57 SP (turun dari 58 karena hapus vboxClient.ts — VBOX app handle browser lifecycle, v-auto-backend hanya connect CDP).

**Rekomendasi PO untuk Sprint 1** (full end-to-end slice):

| PBI | Description | SP | Priority |
|-----|-------------|----|----------|
| 1.1 | Staff Profiles — tambah "Optimization (Shopee)" di More Actions | 2 | Must |
| 1.2 | VBOX FE — List sessions + New Analysis (VBOX launch + check login + scrape) | 5 | Must |
| 1.3 | VBOX FE — Detail session + tabs (progress + cancel + re-run) | 7 | Must |
| 2.1 | Install patchright Node + scraper scaffold | 2 | Must |
| 2.2 | Scraper Seller Center + shop page via CDP | 5 | Must |
| 2.3 | Scraper product page via CDP | 5 | Must |
| 2.4 | Login check via CDP | 2 | Must |
| 2.5 | Compositor (automated) | DEFERRED | Sprint 2 |
| 3.1 | Extend llmGateway (Gemini 3.5 Flash Lite vision) | 3 | Must |
| 4.1 | Drizzle schema + session (with profile_id) | 5 | Must |
| 4.2 | Route session CRUD + auto-run (terima cdp_ws_url) | 5 | Must |
| 4.3 | Logic — Score & verdict (called by run) | 6 | Must |
| 4.4 | Route generate text drafts | 5 | Must |
| 4.5 | Route generate template prompt + upload | 4 | Must |
| 4.6 | Route generate composite prompts | 3 | Must |
| 4.7 | Route export (text only) | 2 | Must |
| **Total** | | **57** | |

**Drop candidates** (urut prioritas drop kalau tertinggal):
1. PBI-1.3 Tab editor (bagian dari 7 SP) → auto-approve text drafts, skip edit
2. PBI-4.5 + 4.6 + 1.3 Image prompts (14) → text optimization dulu, image prompts ke Sprint 2
3. PBI-4.7 Route export (2) → CLI export dulu

---

## Sprint History

### Sprint 1
- **Sprint Goal**: End-to-end POC — dari Staff Profiles (sudah login Shopee seller) → klik "Optimization (Shopee)" → list session per profile → New Analysis → Run Analysis (scrape Seller Center + shop page + products via VBOX CDP) → AI analisis & scoring (Gemini 3.5 Flash Lite) → decision gate → jika butuh optimasi: (1) generate text drafts (judul/deskripsi) → user review & edit, (2) generate prompt untuk template & composite per SKU → user copy-paste ke Gemini web untuk generate image manual. Semua tersimpan per session per profile dengan history.
- **Duration**: 1 minggu
- **Story Points**: 58 (POC mode, reuse Staff Profiles + v-auto-backend, image gen manual)
- **DoD**: POC (happy path, demo-able, no formal test, ikut pattern existing)
- **Status**: Planned — ready to start

**Architecture**:
- FE: VBOX Desktop App (React + Tauri) — reuse Staff Profiles page, tambah "Optimization (Shopee)" di More Actions → list session per profile → detail dengan tabs
- BE: v-auto-backend (Hono) — session-based API (per profile_id) + extend llmGateway (vision only) + Drizzle schema + scraper (patchright Node connect_over_cdp ke VBOX shardX engine via Staff Profile)
- Browser: VBOX shardXbrowser (Chromium 149 patched, anti-detect) — Staff Profile (sudah login Shopee seller, akun asli client agency, teruji tidak kena captcha)
- v-auto-scraper (Python): DI-ARCHIVE — tidak dipakai

**UX Flow**:
```
Staff Profiles → profile → More Actions → "Optimization (Shopee)" → List session (per profile)
  → click "New Analysis" → cek login (FE call check-login)
    → jika belum login → alert "Akun Shopee seller belum login" + "Open Profile" button (tidak create session)
    → jika sudah login → POST /sessions (create + auto-run) → redirect ke detail (status="scraping")
  → detail page: progress (scraping → analyzing → done) → tabs muncul: Overview, Scores, Recommendations, Image Prompts, Editor, Export
  → "Re-run Analysis" button (kalau done/failed) → re-scrape + re-analyze

Image optimization flow (MANUAL):
  System generate template prompt → User copy-paste ke Gemini web → Generate template manual
  → User upload template hasil ke system → System generate composite prompts per SKU
  → User copy-paste + upload template + product photo ke Gemini web → Generate composite manual
  No composite image storage di system (Sprint 1). Auto image gen defer ke Sprint 2.
```

**Key decisions**:
- VBOX app = browser manager (launch/stop profile), v-auto-backend = scraper + AI (connect CDP, scrape, analyze) — separation of concerns, no vboxClient.ts
- Hybrid dev: VBOX app fetch profiles dari PROD v-auto-backend, Shopee optimization API call ke LOCAL v-auto-backend
- 2 Vite env variables: VITE_API_BASE_URL (prod) + VITE_SHOPEE_API_BASE_URL (local) — shopeeApi client terpisah
- Same JWT secret untuk local v-auto-backend — token dari prod login valid untuk local
- No proxy — dev VBOX tidak pakai proxy, cookies Shopee tetap valid (teruji aman)
- Pakai Staff Profiles (sudah login seller center) — tidak perlu auto-create profile, tidak perlu login flow complex
- Session per profile (profile_id + error_reason di schema) — tiap staff profile punya history session sendiri
- No URL input — seller center URL always same (https://seller.shopee.co.id/), shop_url di-discover saat scrape
- Login check di depan (di "New Analysis" click) — VBOX app launch profile → get CDP → check-login → kalau belum login, tidak create session
- POST /sessions = create + auto-run (async, terima cdp_ws_url) — satu API call, FE langsung redirect ke detail dengan status="scraping"
- Cancel = delete session + VBOX stop profile (reuse process_kill)
- Re-run dengan confirm dialog (destructive — hapus data lama, VBOX launch profile lagi)
- error_reason di schema untuk failed state (login_required, captcha_required, cdp_disconnected, dll)
- Browser tetap terbuka selama scrape (5-15 menit) — FE warning "Jangan tutup browser"
- Disconnect CDP setelah selesai, jangan close browser — VBOX app yang handle stop profile
- No separate analyze endpoint — run = scrape + analyze, data selalu fresh
- No "Run Analysis" button di detail page — hanya "Re-run" untuk done/failed

**Deferred to Sprint 2**:
- Auto image generation (template + composite) — Sprint 1 manual via Gemini web
- Compositor (automated) — Sprint 1 manual, Sprint 2 automated
- Image storage & export — Sprint 1 text only, Sprint 2 include images
- Scraper diskusi & review
- Scraper promosi & voucher
- Scraper all products (scroll simulation / tab All Products) — Sprint 1 cuma produk unggulan
- Scraper search result & kompetitor
- Shop visuals/profile scoring & optimization
- Banner & hero regeneration
- Compare antar session (UI)
- Test coverage & production hardening
- Async job queue untuk long-running operations (Sprint 1 pakai polling)
- Multi-profile concurrent scraping (Sprint 1: 1 profile aktif per run)

---

## Known Issues & Mitigations (Sprint 1)

| Issue | Impact | Mitigation |
|-------|--------|------------|
| **Long-running operations** (scrape 5-10 min, analyze 10+ min) | FE timeout | Set timeout 10-15 menit, FE polling `GET /sessions/:id` untuk cek status |
| **LLM JSON parsing** | Score tidak tersimpan | JSON mode (Gemini), fallback regex extract `{...}`, fallback score 50 |
| **Shopee login expired** | Scraper gagal | Scraper detect redirect ke login → return error "session expired" → FE tampilkan banner "Please re-login di Chrome profile" |
| **Nano Banana 2 safety filter** | Template tidak ter-generate | Retry dengan prompt modified, fallback ke simpler prompt |
| **Cost estimation** | Budget overrun | Vision (Gemini 3.7 Flash): $0.75/1M input tokens. Image gen (Nano Banana 2): ~1120 tokens for 1K image. Gemini 3.5 Flash Lite text. Estimasi per session sangat rendah (<$1). Cek pricing resmi di https://ai.google.dev/gemini-api/docs/pricing |
| **Rate limit** | Development lambat | Cek rate limit resmi di Google AI Studio (Day 1 pre-task). Implement queue + retry backoff. Upgrade ke Tier 1 (link billing, no upfront) kalau perlu |
| **Audit trail** | Compliance | Semua action (create, analyze, optimize, composite, export) log ke auditTrail table |

---

## Sprint 2 — Flow Revision: Public Shop URL + Scrap Profile + Node Scraper Bridge

### Motivation
Sprint 1 selesai dengan flow Staff Profiles → seller center scraping. Saat E2E test ditemukan 3 blocker:
1. **Seller Center butuh password kedua** untuk akses shop settings — tidak praktis.
2. **Bun WebSocket incompatible dengan patchright** — `chromium.connectOverCDP()` timeout di Bun, sukses di Node.
3. **Staff Profile flow terlalu tightly coupled** — butuh admin access, profile data dari prod, launch via VBOX Local API.

Sprint 2 revisi flow: public shop URL input (tidak butuh seller center), scrap profile local (tidak sync ke server), Node child process untuk scraping.

### New PBIs

#### PBI-S2.1: Rust — `launch_scrap_profile` command
**As a** admin
**I want** VBOX app punya command untuk launch browser dengan profile khusus scraping
**So that** scraper bisa connect CDP tanpa butuh staff profile dari server

**Acceptance Criteria**:
- Tambah Tauri command `launch_scrap_profile` di `src-tauri/src/lib.rs`
- Launch browser dengan UDD khusus: `{app_data_dir}/vbox-scrap-profile/` (persist cookies, tidak di temp folder)
- CDP enabled (`--remote-debugging-port=0`), headed (not headless)
- **Tidak fetch profile data dari backend** — local only, fingerprint default/generic
- Return `{pid, cdp: {port, http_url, web_socket_debugger_url}}`
- Profile tidak muncul di Profiles list (terpisah dari Chrome Profile mode)
- Kalau UDD belum ada → create. Kalau sudah ada → reuse (persist cookies dari login sebelumnya)
- Register command di `tauri.conf.json` capabilities

**Story Points**: 3

---

#### PBI-S2.2: FE — Mode "Optimization" + sidebar item "Shopee"
**As a** admin
**I want** mode "Optimization" di Mode Switcher dengan item "Shopee" di sidebar
**So that** bisa akses Shopee optimization tanpa harus lewat Staff Profiles

**Acceptance Criteria**:
- Edit `src/lib/types.ts`: tambah `"optimization"` ke `Mode` type
- Edit `src/lib/nav-config.ts`:
  - Tambah mode `{ id: "optimization", label: "Optimization", icon: Sparkles, defaultSection: "shopee-optimization" }` ke `MODES`
  - Tambah grup `{ label: "Shopee", mode: "optimization", items: [{ id: "shopee-optimization", label: "Shopee", icon: ShoppingBag }] }` ke `sidebarConfig`
- Edit `src/App.tsx`: section `shopee-optimization` & `shopee-session-detail` tidak butuh `shopeeOptProfile` (global, tanpa profile context)
- Build VBOX tidak error
- Mode "Optimization" muncul di Mode Switcher, item "Shopee" muncul di sidebar saat mode dipilih

**Story Points**: 2

---

#### PBI-S2.3: FE — Refactor ShopeeOptimizationView (global, new flow)
**As a** admin
**I want** list session global + New Analysis flow baru (launch scrap profile → check login → input URL)
**So that** bisa mulai analisa tanpa pilih staff profile

**Acceptance Criteria**:
- Refactor `ShopeeOptimization.tsx`:
  - Hapus dependency `profile` prop — global, fetch semua sessions (atau filter optional)
  - Header: "Shopee Optimization" + "New Analysis" button + "Refresh" button
  - Table: columns = Shop URL, Status, Created, Actions (view/delete)
  - Fetch dari `GET /api/shopee-optimization/sessions` (tanpa profile_id — global list)
- **"New Analysis" button flow** (new):
  1. Click → modal wizard (multi-step)
  2. **Step 1 — Launch scrap profile**: call `invoke("launch_scrap_profile")` → dapat `{pid, cdp: {web_socket_debugger_url}}`. Tampilkan "Browser terbuka, checking login..."
  3. **Step 2 — Check login**: call `POST /api/shopee-optimization/check-login` body: `{cdp_ws_url}` → `{logged_in: boolean}`
     - Kalau belum login → tampilkan "Silakan login Shopee di browser yang terbuka, lalu klik 'Sudah Login'" → user login manual → re-check
     - Kalau sudah login → lanjut Step 3
  4. **Step 3 — Input shop URL**: modal input `shopee.co.id/{shop-slug}` URL → validate format
  5. **Step 4 — Create session**: `POST /api/shopee-optimization/sessions` body: `{cdp_ws_url, shop_url}` → return `{id, status: "scraping"}` → redirect ke detail
- Concurrency control: disable "New Analysis" kalau ada session sedang jalan
- Auto-polling setiap 3s kalau ada active session
- Empty state, loading, error states
- Delete session (confirm dialog)

**Story Points**: 5

---

#### PBI-S2.4: BE — Scraper Bridge (Node child process)
**As a** developer
**I want** BE spawn Node child process untuk scraping
**So that** patchright connectOverCDP jalan (Bun WebSocket incompatible)

**Acceptance Criteria**:
- Buat `src/scraper-worker.mjs` (plain JS, run with `node`):
  - `checkLogin(cdpWsUrl)` — connect CDP, navigate shopee.co.id, detect login, disconnect
  - `scrapePublicShop(cdpWsUrl, shopUrl)` — connect CDP, navigate ke shop URL, extract shop info + 10 product unggulan, disconnect
  - `scrapeProductDetails(cdpWsUrl, productUrls)` — connect CDP, loop product URLs, extract detail, disconnect
  - Output: JSON via stdout, errors via stderr, exit code 0/1
- Buat `src/lib/scraperBridge.ts` (Bun-side helper):
  - `runScraperWorker(cdpWsUrl, command, args?)` — spawn `node src/scraper-worker.mjs`, parse stdout JSON
  - `checkLoginViaWorker(cdpWsUrl)` → `{logged_in, url}`
  - `scrapePublicShopViaWorker(cdpWsUrl, shopUrl)` → shop data + products
  - `scrapeProductDetailsViaWorker(cdpWsUrl, productUrls)` → product details array
- Update `shopeeOptimization.ts`: ganti `scrapeShop`/`scrapeAllProducts` direct calls dengan bridge calls
- `shopeeScraper.ts` (legacy) tetap ada tapi tidak dipakai (reference)

**Story Points**: 3

---

#### PBI-S2.5: BE — Update POST /sessions (terima shop_url, scrape public shop)
**As a** admin
**I want** POST /sessions terima shop_url & scrape public shop page (bukan seller center)
**So that** scraping jalan tanpa butuh seller center access

**Acceptance Criteria**:
- Update `POST /api/shopee-optimization/sessions` body: `{cdp_ws_url, shop_url}` (hapus profile_id requirement — optional)
- Update `runScrapeAndAnalyze(sessionId, cdpWsUrl, shopUrl)`:
  - Phase 1: `scrapePublicShopViaWorker(cdpWsUrl, shopUrl)` → shop info + 10 product unggulan
  - Phase 2: `scrapeProductDetailsViaWorker(cdpWsUrl, productUrls)` → product details
  - Phase 3: `analyzeSession(sessionId)` → scores + verdict (sama seperti Sprint 1)
- Update `POST /sessions/:id/run` body: `{cdp_ws_url, shop_url}` — re-run dengan shop URL
- Update `shopeeScrapeSessions` schema: `profile_id` jadi nullable (optional), `shop_url` jadi required saat create
- Save shop_url ke session saat create
- Error handling sama: login_required, captcha_required, scrape_timeout, cdp_disconnected, analyze_error

**Story Points**: 3

---

#### PBI-S2.6: BE — Update check-login (public Shopee, not seller center)
**As a** admin
**I want** check-login cek login ke shopee.co.id (public)
**So that** tidak butuh seller center access

**Acceptance Criteria**:
- Update `POST /api/shopee-optimization/check-login`:
  - Navigate ke `https://shopee.co.id/` (bukan seller.shopee.co.id)
  - Detect login: cek ada tombol "Login" / "Daftar" di header, atau cek cookie session
  - Return `{logged_in: boolean, url: string}`
- Pakai `checkLoginViaWorker(cdpWsUrl)` dari scraperBridge

**Story Points**: 1

---

### Sprint 2 Summary

| PBI | Description | SP |
|-----|-------------|----|
| S2.1 | Rust — `launch_scrap_profile` command | 3 |
| S2.2 | FE — Mode "Optimization" + sidebar item "Shopee" | 2 |
| S2.3 | FE — Refactor ShopeeOptimizationView (global, new flow) | 5 |
| S2.4 | BE — Scraper Bridge (Node child process) | 3 |
| S2.5 | BE — Update POST /sessions (terima shop_url, scrape public shop) | 3 |
| S2.6 | BE — Update check-login (public Shopee) | 1 |
| **Total** | | **17** |

**DoD**: E2E test sukses — VBOX → mode Optimization → Shopee → New Analysis → launch scrap profile → check login → input URL → scrape public shop + 10 products → analyze → drafts → export.
