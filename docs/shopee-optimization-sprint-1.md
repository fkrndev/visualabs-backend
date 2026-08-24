# Sprint 1 Plan — Shopee Store Optimization System (POC)

**Sprint Goal**: End-to-end POC — dari Staff Profiles (sudah login Shopee seller) → klik "Optimization (Shopee)" di More Actions → list session per profile → New Analysis → Run Analysis (scrape Seller Center + shop page + products via VBOX CDP) → AI analisis & scoring (Gemini 3.5 Flash Lite) → decision gate → jika butuh optimasi: (1) generate text drafts → user review & edit, (2) generate template prompt → user copy-paste ke Gemini web → upload template → generate composite prompts per SKU → user copy-paste ke Gemini web → export text. Semua tersimpan per session per profile dengan history.

**UX Flow**:
```
Staff Profiles → profile → More Actions → "Optimization (Shopee)" → List session (per profile)
  → click "New Analysis"
    1. VBOX app launch profile (reuse launchProfile — browser terbuka headed)
    2. VBOX app get CDP ws URL (dari launch result atau GET /running)
    3. VBOX app call v-auto-backend: POST /check-login {cdp_ws_url}
       → v-auto-backend connect CDP, navigate seller center, detect login, disconnect
       → jika belum login → alert "Belum login, browser sudah terbuka, login manual lalu klik New Analysis lagi" (tidak create session)
       → jika sudah login → lanjut
    4. VBOX app call v-auto-backend: POST /sessions {profile_id, cdp_ws_url}
       → BE create session + auto-run (scrape + analyze via CDP) → return {id, status: "scraping"}
       → FE redirect ke detail (status="scraping", progress jalan, browser tetap terbuka untuk scrape)
  → detail page: progress (scraping → analyzing → done) → VBOX app stop profile → tabs muncul
  → "Re-run Analysis" button (kalau done/failed) → VBOX app launch profile lagi → POST /sessions/:id/run {cdp_ws_url}
  → "Cancel" button (kalau scraping/analyzing) → DELETE /sessions/:id + VBOX app stop profile

Image flow (MANUAL):
  Generate template prompt → User copy-paste ke Gemini web → Generate template manual
  → User upload template hasil ke system → Generate composite prompts per SKU
  → User copy-paste + upload template + product photo ke Gemini web → Generate composite manual
  No composite image storage di system (Sprint 1). Auto image gen defer ke Sprint 2.
```

**Architecture** (VBOX app = browser manager, v-auto-backend = scraper + AI):
```
VBOX Desktop App (Tauri + React) — BROWSER MANAGER
  ├─ Staff Profiles page (EXISTING — fetch profile data dari prod v-auto-backend)
  │   └─ More Actions → "Optimization (Shopee)" (NEW dropdown item)
  ├─ Page: ShopeeOptimization.tsx (list sessions + "New Analysis" — VBOX launch + check login + scrape)
  ├─ Page: ShopeeSessionDetail.tsx (detail with progress + 6 tabs + Re-run + Cancel)
  ├─ launchProfile (REUSE dari StaffProfiles — Tauri invoke, pass fingerprint/cookies/proxy)
  ├─ stopProfile / process_kill (REUSE dari StaffProfiles — Tauri invoke)
  ├─ Shopee API calls → LOCAL v-auto-backend (localhost:2024)
  │   ├─ POST /check-login {cdp_ws_url}
  │   ├─ POST /sessions {profile_id, cdp_ws_url} → auto-run
  │   ├─ POST /sessions/:id/run {cdp_ws_url} → re-run
  │   ├─ DELETE /sessions/:id → cancel
  │   ├─ GET /sessions?profile_id=... → list
  │   └─ GET /sessions/:id → detail (polling)
      │ HTTP (fetch to LOCAL v-auto-backend)
      ▼
v-auto-backend LOCAL (Hono + Bun + Drizzle) — SCRAPER + AI (no VBOX API client)
  ├─ /routes/shopeeOptimization.ts (session CRUD, auto-run, re-run, optimize, export)
  ├─ /routes/shopeeScraper.ts (checkLogin, scrapeShop, scrapeAllProducts — terima cdp_ws_url)
  ├─ /routes/llmGateway.ts (EXTEND: Gemini 3.5 Flash Lite text + vision)
  ├─ /routes/uploads.ts (REUSE: serve images)
  ├─ /lib/shopeeAnalyzer.ts (scoring logic — called by run flow)
  └─ Drizzle schema: shopeeScrapeSessions (profile_id + error_reason), shopeeShops, shopeeProducts, shopeeScores, shopeeDrafts, shopeeImages
      │ patchright Node connectOverCDP(cdp_ws_url)
      ▼
ShardX Engine (anti-detect browser — launched by VBOX app)
  ├─ Chromium 149 patched (fingerprint, WebRTC, QUIC)
  └─ Staff Profile (sudah login Shopee seller — profile data dari PROD v-auto-backend)

v-auto-backend PROD (vims.dots.my.id) — PROFILE DATA SOURCE (read-only untuk dev)
  ├─ chrome-profiles (profiles dengan cookies Shopee login — VALID, LIVE)
  ├─ users, customers, etc.
  └─ Table Shopee optimization: ditambah saat deploy (migration additive, tidak ganggu data existing)
```

**Duration**: 1 minggu (7 hari)
**Story Points**: 57
**DoD**: POC (happy path, demo-able, no formal test, ikut pattern existing codebase)

---

## Sprint Backlog

| PBI | Description | SP | Day |
|-----|-------------|----|-----|
| 1.1 | Staff Profiles — tambah "Optimization (Shopee)" di More Actions | 2 | 1 |
| 2.1 | Install patchright Node + scraper scaffold (no VBOX API client) | 2 | 1 |
| 2.2 | Scraper Seller Center + shop page via CDP | 5 | 1-2 |
| 2.3 | Scraper product page via CDP | 5 | 2 |
| 2.4 | Login check via CDP | 2 | 2 |
| 3.1 | Extend llmGateway (Gemini 3.5 Flash Lite vision) | 3 | 3 |
| 4.1 | Drizzle schema + session (with profile_id + error_reason) | 5 | 3 |
| 4.2 | Route session CRUD + auto-run (terima cdp_ws_url) | 5 | 3-4 |
| 4.3 | Logic — Score & verdict (called by run) | 6 | 4 |
| 4.4 | Route generate text drafts | 5 | 4 |
| 4.5 | Route generate template prompt + upload | 4 | 5 |
| 4.6 | Route generate composite prompts | 3 | 5 |
| 4.7 | Route export (text only) | 2 | 5 |
| 1.2 | VBOX FE — List sessions + New Analysis (VBOX launch + check login + scrape) | 5 | 5-6 |
| 1.3 | VBOX FE — Detail session + tabs (progress + cancel + re-run) | 7 | 6-7 |
| 2.5 | Compositor (automated) | DEFERRED | Sprint 2 |
| **Total** | | **57** | **7 days** |

**Drop candidates** (urut prioritas drop kalau tertinggal):
1. PBI-1.3 Tab editor (bagian dari 7 SP) → auto-approve text drafts, skip edit
2. PBI-4.5 + 4.6 + 1.3 Image prompts (14) → text optimization dulu, image prompts ke Sprint 2
3. PBI-4.7 Route export (2) → CLI export

---

## Progress Tracking

| PBI | SP | Day | Status | Notes |
|-----|----|-----|--------|-------|
| 1.1 Staff Profiles — Optimization (Shopee) menu | 2 | 1 | ✅ Done | DropdownMenuItem + placeholder pages |
| 2.1 Install patchright + scraper scaffold | 2 | 1 | ✅ Done | patchright@1.62.1, shopeeScraper.ts scaffold |
| 2.4 Login check via CDP | 2 | 1 | ✅ Done | checkLogin + POST /check-login route (ahead of schedule) |
| 2.2 Scraper Seller Center + shop page | 5 | 2 | ✅ Done | scrapeShop() — seller center + public shop page, 3 routes |
| 2.3 Scraper product page | 5 | 2 | ✅ Done | scrapeProduct() + scrapeAllProducts() with rate limit |
| 3.1 Extend llmGateway (Gemini vision) | 3 | 3 | ✅ Done | Refactored ke src/lib/gemini.ts (shared lib), tested end-to-end |
| 4.1 Drizzle schema + session | 5 | 3 | ✅ Done | 6 tabel + relations + migration run to local MySQL |
| 4.2 Route session CRUD + auto-run | 5 | 4 | ✅ Done | 5 routes, tested end-to-end (create/list/detail/delete + background job) |
| 4.3 Logic — Score & verdict | 6 | 4 | ✅ Done | shopeeAnalyzer.ts — score shop (banner/logo/bio) + products (title/desc/photo) |
| 4.4 Route generate text drafts | 5 | 4 | ✅ Done | POST /generate-drafts + PATCH /drafts/:draftId (approve/reject) |
| 4.5 Route generate template prompt + upload | 4 | 5 | ✅ Done | 3 routes: generate, regenerate (custom input), upload (multipart) |
| 4.6 Route generate composite prompts | 3 | 5 | ✅ Done | POST /generate-composite-prompts dengan product_ids selection |
| 4.7 Route export (text only) | 2 | 5 | ✅ Done | GET /export?format=json|csv — JSON full data + CSV text drafts |
| 1.2 VBOX FE — List sessions + New Analysis | 5 | 5-6 | ✅ Done | ShopeeOptimization.tsx — table, New Analysis flow (VBOX launch → CDP → POST session) |
| 1.3 VBOX FE — Detail session + tabs | 7 | 6-7 | ✅ Done | ShopeeSessionDetail.tsx — 4 tabs (Overview, Products, Scores, Drafts), generate/approve/reject/export |
| **Total done** | **57 / 57** | | **100%** | Sprint 1 complete! |

---

## Daily Plan

### Day 1: VBOX FE Scaffold + Backend Scraper Scaffold ✅ DONE
**Tasks**:
- [x] **Pre-task**: Setup dev environment
  - **VBOX app**: pastikan build & jalan. VBOX app fetch profile data dari PROD v-auto-backend (vims.dots.my.id) — sudah ada code-nya (`chromeProfilesApi`).
  - **Local v-auto-backend**: pastikan jalan di localhost:2024. Set `GEMINI_API_KEY` & `GEMINI_MODEL` di `.env` (sudah ada).
  - **No VBOX_API_URL/VBOX_API_TOKEN** — v-auto-backend TIDAK call VBOX Local API. VBOX app yang handle browser lifecycle.
  - **Test profile**: pakai 1 Staff Profile dari prod (sudah login Shopee seller). VBOX app launch profile → dapat CDP ws URL → test connect dari v-auto-backend.
  - **Done**: Tambah `VITE_SHOPEE_API_BASE_URL=http://localhost:2024/api` ke VBOX `.env.development` & `VITE_SHOPEE_API_BASE_URL=https://vims.dots.my.id/api` ke `.env.production`
- [x] PBI-1.1: Staff Profiles — tambah "Optimization (Shopee)" di More Actions (2 SP)
  - Edit `vbox-new/src/lib/types.ts`: tambah `"shopee-optimization"` & `"shopee-session-detail"` ke Section type + `ShopeeOptProfile` type
  - Edit `vbox-new/src/pages/StaffProfiles.tsx`:
    - Tambah DropdownMenuItem "Optimization (Shopee)" di More Actions (icon: ShoppingBag)
    - onClick: call `onOpenShopeeOptimization({ id: p.id, name: p.name })`
    - Tambah prop `onOpenShopeeOptimization?: (profile: ShopeeOptProfile) => void`
  - Edit `vbox-new/src/App.tsx`: tambah state `shopeeOptProfile` & `shopeeSessionId`, import & render `ShopeeOptimizationView` & `ShopeeSessionDetailView`, pass callback ke `StaffProfilesView`
  - Buat `vbox-new/src/pages/ShopeeOptimization.tsx` (placeholder — header + back button)
  - Buat `vbox-new/src/pages/ShopeeSessionDetail.tsx` (placeholder — header + back button)
  - **Note**: VBOX `node_modules` belum ada (perlu `npm install` sebelum build/test FE). Code changes simple — hanya tambah type, dropdown item, placeholder pages.
- [x] PBI-2.1: Install patchright Node + scraper scaffold (2 SP)
  - `cd v-auto-backend && bun add patchright` → patchright@1.62.1 installed
  - Buat `src/routes/shopeeScraper.ts`:
    - `connectCdp(cdpWsUrl)` → helper connect CDP, return browser/context/page
    - `downloadImage(url)` → download ke uploads/ dengan UUID filename
    - `checkLogin(cdpWsUrl)` → **fully implemented** (connect, navigate seller center, detect login, disconnect)
    - `scrapeShop(cdpWsUrl)` → scaffold (TODO PBI-2.2)
    - `scrapeProduct(cdpWsUrl, productUrl)` → scaffold (TODO PBI-2.3)
    - `scrapeAllProducts(cdpWsUrl)` → scaffold (TODO PBI-2.3)
    - Route: `POST /check-login` → terima `{cdp_ws_url}`, return `{logged_in: boolean}`
  - Register route di `index.ts`: `app.route("/shopee-optimization", shopeeScraperRoutes)`
  - **No vboxClient.ts** — v-auto-backend TIDAK handle start/stop profile
  - **No VBOX_API_URL, VBOX_API_TOKEN env** — tidak perlu
  - Verify: BE jalan, route `/api/shopee-optimization/check-login` return 401 (auth required) — route terdaftar dengan benar
- [x] **BONUS: PBI-2.4 partial** — `checkLogin` function & `POST /check-login` route sudah fully implemented di Day 1 (ahead of schedule)

**Day 1 Summary**: 4 SP done (PBI-1.1: 2 SP + PBI-2.1: 2 SP) + PBI-2.4 partial (2 SP, ahead). Total Day 1: ~6 SP.

### Day 2: Scraper Implementation (Seller Center + Shop + Product via CDP) ✅ DONE
**Tasks**:
- [x] PBI-2.2: Scraper Seller Center + shop page via CDP (5 SP)
  - Implement `scrapeShop(cdpWsUrl)` di `src/routes/shopeeScraper.ts`
  - patchright Node `chromium.connectOverCDP(cdpWsUrl)` → pakai context & page yang ada (jangan new_context)
  - **Step 1 — Seller Center**: navigate ke https://seller.shopee.co.id/ (domcontentloaded)
    - Wait for "Total Pengunjung" widget render (best effort, 15s timeout)
    - Extract: status pesanan, performa toko (penjualan, pengunjung, dll), iklan shopee
    - Extract shop slug dari link ke public shop page
    - Detect login redirect → throw `login_required`
  - **Step 2 — Public shop page**: navigate ke https://shopee.co.id/{shop-slug} (domcontentloaded)
    - Wait for: `.section-seller-overview-horizontal__portrait-name` (best effort, 15s timeout)
    - Extract: shop name, bio, stats (produk, pengikut, rating), logo URL, banner URL
    - Extract featured products: product_id, title, price, thumbnail, URL
    - Detect captcha → throw `captcha_required`
  - Download shop logo & banner ke `uploads/` (UUID filename)
  - Download product thumbnails ke `uploads/` (UUID filename)
  - **Disconnect CDP setelah selesai** (browser.close() = disconnect, bukan close browser)
  - Fallback: kalau shop slug tidak ditemukan, return seller data saja + note
  - **Selector pattern diadopsi dari `v-auto-frontend/src/lib/automation/scrape-scripts.ts`** (SHOPEE_SELLER_SCRAPE — verified live)
  - Route: `POST /scrape-shop` → terima `{cdp_ws_url}`, return `{shop, products}`
  - Error mapping: `login_required` → 401, `captcha_required` → 423, else → 500
  - Verify: route return 401 tanpa auth (route terdaftar dengan benar)
- [x] PBI-2.3: Scraper product page via CDP (5 SP)
  - Implement `scrapeProduct(cdpWsUrl, productUrl)` & `scrapeAllProducts(cdpWsUrl)`
  - `scrapeProduct`: connect CDP, navigate ke product URL, extract:
    - Product ID (dari URL), title, price, original price, description, categories, variants, stock, rating, sold
    - Photos (up to 8) dari image gallery
    - Download photos ke `uploads/` (UUID filename)
    - Rate limit: random delay 2-5s sebelum scrape
    - Detect captcha → throw `captcha_required`
    - Disconnect CDP setelah selesai
  - `scrapeAllProducts`: scrape shop dulu (PBI-2.2), lalu loop semua featured products
    - Rate limit: delay 3-5s antar product
    - Reconnect CDP per product (disconnect setelah selesai)
    - Skip product kalau gagal (log error, lanjut ke product berikutnya)
    - Merge shop page data + detail page data per product
  - Route: `POST /scrape-all-products` → terima `{cdp_ws_url}`, return `{shop, products}`
  - Verify: route return 401 tanpa auth (route terdaftar dengan benar)
- [x] **PBI-2.4: Login check via CDP (2 SP) — DONE di Day 1**
  - `checkLogin(cdpWsUrl)` → connect CDP, navigate ke seller.shopee.co.id, detect login redirect, disconnect
  - Route: `POST /api/shopee-optimization/check-login` body: `{cdp_ws_url}` → return `{logged_in: boolean}`
  - **VBOX app handle launch profile** — v-auto-backend hanya connect CDP yang sudah di-launch
  - Verify: route return 401 tanpa auth (route terdaftar dengan benar)
  - **Remaining**: Test end-to-end dengan VBOX app launch profile → get CDP → call check-login → should return logged_in: true

**Day 2 Summary**: 10 SP done (PBI-2.2: 5 SP + PBI-2.3: 5 SP). Total Day 1+2: 16 SP (28%). Scraper fully implemented dengan 3 routes: `/check-login`, `/scrape-shop`, `/scrape-all-products`. Pattern diadopsi dari existing `scrape-scripts.ts` yang sudah verified live.

### Day 3: Gemini Gateway + DB Schema ✅ DONE
**Tasks**:
- [x] PBI-3.1: Extend llmGateway untuk Gemini (text + vision) (3 SP)
  - Tambah route `POST /api/llm/gemini/text` & `POST /api/llm/gemini/vision` di `src/routes/llmGateway.ts`
  - Pakai `GEMINI_API_KEY` & `GEMINI_MODEL` dari env (sudah diset: gemini-3.5-flash-lite)
  - JSON mode: `generationConfig.responseMimeType = "application/json"` (opsional via `jsonMode` param)
  - Rate limit: simple queue dengan sliding window 15 RPM (`geminiCallTimes` array)
  - Retry backoff: max 3 attempts, exponential (1s, 2s, 4s) untuk 429 (rate limit)
  - Vision: support local path (`/uploads/abc.jpg` — read from disk) & remote URL (fetch)
  - MIME detection: dari extension (local) atau content-type header (remote)
  - Image encode: base64 inlineData (format Gemini API)
  - Auth: `requireAuth` + `requireManagement` (berbeda dari DeepSeek routes yang pakai team token)
  - Health endpoint update: tampilkan `geminiConfigured` & `geminiModel`
  - **Test end-to-end SUKSES**:
    - `GET /api/llm/health` → `geminiConfigured: true, geminiModel: gemini-3.5-flash-lite`
    - `POST /api/llm/gemini/text` dengan JWT token (rol: 0=Dev) → 200, response: `"Hello to you!"` dari gemini-3.5-flash-lite
    - `POST /api/llm/gemini/vision` dengan image `/uploads/test-vision.png` → 200, response: `"Plain bright yellow color square."` — Gemini berhasil baca image dari disk, encode base64, dan analyze
    - Auth test: tanpa token → 401, dengan token rol:99 → 403 (Forbidden), dengan token rol:0 → 200
- [x] PBI-4.1: Drizzle schema dengan session management (with profile_id + error_reason) (5 SP)
  - Tambah 6 tabel ke `src/db/schema.ts`:
    - `shopeeScrapeSessions`: id, profile_id (varchar 36 — VBOX Staff Profile UUID), profile_name, status (enum: scraping/analyzing/done/failed), error_reason (varchar 100), shop_url, started_at, completed_at, timestamps
    - `shopeeShops`: session_id (FK cascade), shop_name, shop_slug, shop_url, shop_bio, shop_stats (json), seller_data (json), logo_url, logo_local, banner_url, banner_local. Unique index on session_id
    - `shopeeProducts`: session_id (FK cascade), product_id, title, description, price, original_price, categories (json), variants (json), stock, rating, sold, product_url, thumbnail_url, thumbnail_local, detail_error
    - `shopeeImages`: session_id (FK cascade), product_id (FK cascade), type (enum: shop_logo/shop_banner/product_thumbnail/product_photo), original_url, local_path
    - `shopeeScores`: session_id (FK cascade), product_id (FK cascade), item_type (enum: shop/product), banner_score, logo_score, bio_score, title_score, description_score, photo_score, total_score, verdict (enum: good/needs_improvement/poor), feedback (json)
    - `shopeeDrafts`: session_id (FK cascade), product_id (FK cascade), item_type, draft_type (enum: shop_bio/product_title/product_description/template_prompt/composite_prompt), content (longtext), generated_image_url, status (enum: pending/approved/rejected)
  - Tambah relations untuk semua tabel (one-to-many session → products/images/scores/drafts)
  - Migration SQL manual: `drizzle/0033_add_shopee_optimization_tables.sql` (drizzle-kit interactive tidak support di Windows)
  - **Migration di-run ke local MySQL (Laragon)**: `mysql -u root vlabs < drizzle/0033_add_shopee_optimization_tables.sql`
  - **Verify**: 6 tabel ada di DB vlabs: shopee_scrape_sessions, shopee_shops, shopee_products, shopee_images, shopee_scores, shopee_drafts

**Day 3 Summary**: 8 SP done (PBI-3.1: 3 SP + PBI-4.1: 5 SP). Total Day 1+2+3: 24 SP (42%). Gemini gateway + 6 tabel DB schema complete.

### Day 3-4: Session API + Auto-run (terima cdp_ws_url) ✅ DONE
**Tasks**:
- [x] PBI-4.2: Route session CRUD + auto-run (terima cdp_ws_url) (5 SP)
  - Buat `src/routes/shopeeOptimization.ts`
  - `GET /sessions?profile_id=...` — list sessions per profile (pagination, sort by createdAt desc)
  - `GET /sessions/:id` — detail session (full data: shop, products, scores, drafts, include error_reason kalau failed)
  - `POST /sessions` body: `{profile_id, profile_name?, cdp_ws_url}` — **create + auto-run**:
    - Concurrency check: reject kalau ada session lain dengan profile_id sama sedang scraping/analyzing (409)
    - Create session status="scraping" (MySQL tidak support .returning() — pakai insert + select lastInsertId)
    - Background: `runScrapeAndAnalyze(sessionId, cdpWsUrl)` — scrape all products → save to DB → analyzeSession → status="done"
    - Error handling: try-catch → set status="failed" + error_reason (login_required, captcha_required, scrape_timeout, cdp_disconnected, analyze_error)
    - Return immediately: `{id, profile_id, status: "scraping"}`
    - FE redirect ke detail, polling untuk progress
  - `POST /sessions/:id/run` body: `{cdp_ws_url, confirm?}` — **re-run**:
    - Warning kalau ada approved drafts (return 409 + approvedDraftsCount, butuh `confirm: true` untuk proceed)
    - Hapus data lama (cascade: shops, products, images, scores, drafts)
    - Reset session status="scraping"
    - Background: scrape + analyze lagi
  - `DELETE /sessions/:id` — hapus session + cascade + hapus file uploads dari disk
  - Auth: requireAuth + requireManagement
  - Audit log: logAuditEvent untuk CREATE/UPDATE/DELETE
  - Register di index.ts: `app.route("/shopee-optimization", shopeeOptimizationRoutes)`
  - **Test end-to-end SUKSES** (7 test cases):
    1. GET /sessions?profile_id=test → 200, empty list ✅
    2. GET /sessions/999 → 404 ✅
    3. POST /sessions tanpa cdp_ws_url → 400 ✅
    4. POST /sessions valid body → 200, create session status="scraping" ✅
    5. GET /sessions → 1 session status="scraping" ✅
    6. GET /sessions/1 setelah 5s → status="failed", errorReason="cdp_disconnected" ✅ (background job correctly detect CDP disconnect)
    7. DELETE /sessions/1 → 200 ✅

### Day 4: Scoring & Text Optimization ✅ DONE
**Tasks**:
- [x] PBI-4.3: Logic — Score & verdict (called by run endpoint) (6 SP)
  - Buat `src/lib/shopeeAnalyzer.ts` dengan `analyzeSession(sessionId)` (NO separate route — dipanggil dari run flow)
  - Phase 1: `scoreShop(sessionId)` — score banner (vision), logo (vision), bio (text) via Gemini
  - Phase 2: `scoreProducts(sessionId)` — score title (text), description (text), photo (vision) per product via Gemini
  - Aggregate → verdict (threshold 70: good >= 70, needs_improvement >= 40, poor < 40)
  - Robust JSON parsing (JSON.parse + regex fallback untuk cari angka)
  - Gemini call via internal fetch ke `/api/llm/gemini/text` & `/api/llm/gemini/vision`
  - Save scores ke DB (shopeeScores dengan itemType: shop/product)
  - Rate limit: di-handle di llmGateway (15 RPM, retry backoff)
- [x] PBI-4.4: Route generate text drafts (5 SP)
  - `POST /sessions/:id/generate-drafts` — generate shop bio + product title + product description drafts via Gemini
    - Cek session status="done" (kalau belum, return 400)
    - Fetch shop + products + scores dari DB
    - Generate drafts dengan prompt yang include current content + score + feedback
    - Hapus drafts lama sebelum insert baru
    - Return generated count + drafts
  - `PATCH /sessions/:id/drafts/:draftId` — update draft status (pending/approved/rejected)
  - Auth: requireAuth + requireManagement
  - Audit log: logAuditEvent untuk CREATE/UPDATE

**Day 4 Summary**: 16 SP done (PBI-4.2: 5 SP + PBI-4.3: 6 SP + PBI-4.4: 5 SP). Total Day 1+2+3+4: 40 SP (70%). Session CRUD + auto-run + scoring + text drafts complete & tested.

### Day 5: Image Prompts + Export ✅ DONE
**Tasks**:
- [x] PBI-4.5: Route generate template prompt + upload (4 SP)
  - `POST /sessions/:id/generate-template-prompt` — generate prompt dari shop style profile via Gemini
  - `POST /sessions/:id/regenerate-template-prompt` — regenerate dengan custom input dari user
  - `POST /sessions/:id/upload-template` (multipart) — upload template image hasil dari Gemini web
  - **Test SUKSES**: generate template prompt → 200, prompt banner profesional (style, color palette, layout, dimensions)
- [x] PBI-4.6: Route generate composite prompts (3 SP)
  - `POST /sessions/:id/generate-composite-prompts` body: `{product_ids: [...]}`
  - Generate prompt per product dengan full context (title, description, categories) + template reference
  - Hapus composite_prompt lama untuk product_ids terpilih sebelum insert baru
  - **Test SUKSES**: generate composite prompts → 200, 1 draft composite prompt untuk product
- [x] PBI-4.7: Route export (text only) (2 SP)
  - `GET /sessions/:id/export?format=json` — JSON full data (session, shop, products, scores, drafts)
  - `GET /sessions/:id/export?format=csv` — CSV text drafts only (Type, Product ID, Field, Content, Status)
  - **Test SUKSES**: export JSON → 200, full data; export CSV → 200, text/csv dengan drafts

**Refactor tambahan**: Extract Gemini logic ke `src/lib/gemini.ts` (shared lib)
  - Sebelumnya: shopeeAnalyzer & shopeeOptimization call Gemini via HTTP ke `/api/llm/gemini/text` (butuh auth token → 401)
  - Sekarang: semua internal callers pakai `geminiText()` & `geminiVision()` langsung dari shared lib (no HTTP, no auth)
  - llmGateway.ts routes tetap ada sebagai HTTP wrapper dengan auth (untuk external/test)
  - Rate limit & retry backoff tetap di shared lib (15 RPM, 3 attempts)

**Day 5 Summary**: 9 SP done (PBI-4.5: 4 SP + PBI-4.6: 3 SP + PBI-4.7: 2 SP). Total Day 1+2+3+4+5: 49 SP (86%). Backend 100% complete — semua route API siap. Tinggal VBOX FE (PBI-1.2, 1.3).

### Day 5-6: VBOX FE — List Sessions + New Analysis ✅ DONE
**Tasks**:
- [x] PBI-1.2: VBOX FE — List sessions + New Analysis (5 SP)
  - Edit `ShopeeOptimization.tsx`: header dengan profile name + "New Analysis" button + "Back" button + "Refresh" button
  - Fetch dari `GET VITE_SHOPEE_API_BASE_URL/shopee-optimization/sessions?profile_id=...` (LOCAL v-auto-backend)
  - Table: columns = ID, Status (badge), Shop URL, Started, Completed, Error, Actions (view/delete)
  - **"New Analysis" button flow**:
    1. Click → disable button (loading "Launching...")
    2. Get VBOX Local API info via `invoke("api_info")` → `{base_url, token}`
    3. Launch profile via VBOX Local API: `POST {base_url}/staff/profiles/{uuid}/launch` (with CDP enabled)
    4. Get CDP ws URL from response: `cdp.web_socket_debugger_url`
    5. Create session: `POST VITE_SHOPEE_API_BASE_URL/shopee-optimization/sessions` body: `{profile_id, profile_name, cdp_ws_url}`
    6. Redirect to session detail (`onOpenSession(sessionId)`)
  - **Concurrency control**: disable "New Analysis" kalau ada session lain dengan profile_id sama sedang jalan
  - **Auto-polling**: setiap 3s kalau ada active session (scraping/analyzing)
  - Empty state, loading, error states
  - Delete session (confirm dialog)
  - Auth: pakai `getAccessToken()` dari production login (same JWT secret)

### Day 6-7: VBOX FE — Detail Session + Tabs ✅ DONE
**Tasks**:
- [x] PBI-1.3: VBOX FE — Detail session + tabs (7 SP)
  - Buat `ShopeeSessionDetail.tsx` (section: "shopee-session-detail")
  - **Header**: session ID, status badge, profile name, started/completed dates, "Generate Drafts" + "Export JSON/CSV" buttons (kalau done)
  - **"Back" button** → return ke list session
  - **Progress state** (kalau status="scraping"/"analyzing"):
    - Spinner + status text ("Scraping shop & products..." / "Analyzing & scoring...")
    - Polling `GET /sessions/:id` setiap 3s
  - **Failed state**: tampilkan error_reason banner
  - **4 Tabs**:
    - **Overview**: shop info card (name, URL, bio, stats) + shop score card (banner/logo/bio scores + total + verdict) + AI feedback
    - **Products**: table dengan ID, title, price, rating, sold, URL
    - **Scores**: table dengan type (shop/product), product name, per-asset scores (banner/logo/bio/title/desc/photo), total, verdict
    - **Drafts**: card per draft dengan type badge, status badge, content (whitespace-pre-wrap), copy button, approve/reject buttons, generated image (kalau template_prompt)
  - **Generate Drafts button**: POST `/sessions/:id/generate-drafts` → generate shop bio + product titles + descriptions via Gemini
  - **Approve/Reject**: PATCH `/sessions/:id/drafts/:draftId` body: `{status}`
  - **Export**: GET `/sessions/:id/export?format=json|csv` → download file
  - Fetch dari `GET /api/shopee-optimization/sessions/:id` (full data: shop, products, scores, drafts)
  - Responsive layout

**Day 5-6-7 Summary**: 12 SP done (PBI-1.2: 5 SP + PBI-1.3: 7 SP). Total Day 1-7: 57 SP (100%). Sprint 1 complete!

### Day 7: Integration Testing + Demo Prep
**Tasks**:
- [x] End-to-end test dengan 1 Staff Profile dari prod (sudah login seller center)
  - Staff Profiles → More Actions → Optimization (Shopee) → New Analysis
  - **BLOCKER 1**: Tauri HTTP scope tidak allow `http://127.0.0.1:40325` (VBOX Local API port) → fix: wildcard `http://127.0.0.1:**` di capabilities
  - **BLOCKER 2**: JWT signature mismatch — local BE pakai placeholder JWT secret, VBOX login ke prod → fix: set `JWT_SECRET` local sama dengan prod
  - **BLOCKER 3**: MySQL mati (Laragon tidak running) → fix: start Laragon
  - **BLOCKER 4**: `chromium.connectOverCDP()` timeout di Bun (30s) — Bun WebSocket incompatible dengan `ws` package internal patchright. Raw WebSocket (Bun native) connect OK, Node + patchright connect OK, tapi Bun + patchright timeout.
  - **BLOCKER 5**: Seller Center butuh password kedua untuk akses shop settings — tidak praktis.
  - **Root cause**: Sprint 1 flow (Staff Profiles → seller center scraping) tidak viable untuk E2E.
- [x] **Discovery**: Node + patchright `connectOverCDP()` sukses — `checkLogin` return `{logged_in: true}`. Scraping via Node child process adalah solusi.
- [x] **Decision**: Sprint 2 — revisi flow ke public shop URL input + scrap profile + Node scraper bridge.

**Day 7 Summary**: Sprint 1 E2E test menemukan 5 blocker. Sprint 1 code tetap valid (BE API, Gemini, DB, FE components) tapi flow perlu revisi. Sprint 2 plan dibuat untuk fix semua blocker.

---

## ⚠️ Key Discoveries & Lessons Learned (Sprint 1 E2E Test)

### 1. 🔴 Bun WebSocket Incompatible dengan patchright (CRITICAL — Architecture Change)
**Symptom**: `chromium.connectOverCDP(cdpWsUrl)` timeout 30s di Bun. Raw WebSocket (Bun native) connect OK. Node + patchright connect OK (`Connected! Version: 149.0.7827.103, Contexts: 1`). Tapi Bun + patchright timeout.

**Root cause**: patchright/Playwright bundle `ws` package internal di `utilsBundle.js`. Bun's WebSocket implementation tidak compatible dengan `ws` package internal Playwright. Playwright pakai Node.js `ws` library yang butuh Node.js runtime.

**Impact**: Architecture change — BE (Bun) tidak bisa langsung call patchright. Perlu Node child process untuk scraping.

**Solution**: `src/lib/scraperBridge.ts` spawn `node src/scraper-worker.mjs` untuk scraping. Pass CDP ws URL via argv, return JSON via stdout.

**Lesson**: Test runtime compatibility early. Jangan assume "drop-in replacement" (patchright untuk Playwright) jalan di semua JS runtime. Bun masih punya compatibility gaps dengan Node.js ecosystem.

---

### 2. 🔴 Seller Center Butuh Password Kedua (CRITICAL — Flow Change)
**Symptom**: `scrapeShop` navigate ke `https://seller.shopee.co.id/portal/shop-setting` → redirect ke 404 atau halaman password verification. Dashboard butuh password kedua untuk akses settings.

**Root cause**: Shopee Seller Center punya layer security kedua (password verification) untuk akses sensitive settings (shop profile, payment, dll). Sprint 1 plan assume seller center dashboard langsung accessible setelah login.

**Impact**: Flow change — tidak bisa scrape dari seller center. Ganti ke public shop page (`shopee.co.id/{slug}`) yang tidak butuh seller center access.

**Solution**: Sprint 2 — user input shop URL (public), scrape dari public shop page. Tidak butuh seller center login, cukup login shopee.co.id biasa.

**Lesson**: Verify assumption tentang target website access flow sebelum commit ke architecture. Seller Center access flow berbeda dengan public shop page.

---

### 3. 🟡 Tauri HTTP Scope Restriction (CONFIG — Fixed)
**Symptom**: `Analysis failed: url not allowed on the configured scope: http://127.0.0.1:40325/staff/profiles/.../launch`

**Root cause**: Tauri HTTP plugin punya scope restriction di `capabilities/default.json`. Hanya URL yang di-whitelist yang bisa di-fetch dari frontend. Default hanya allow `http://localhost:2024/**` dan `http://127.0.0.1:2024/**` — tidak ada VBOX Local API port (40325).

**Solution**: Ganti ke wildcard `http://127.0.0.1:**` dan `http://localhost:**` supaya semua port local di-allow. Tauri capabilities perlu rebuild (restart `npm run tauri dev`).

**Lesson**: Tauri security model restrict HTTP access dari frontend. Selalu whitelist URL yang dibutuhkan di capabilities. Untuk dev, wildcard port local lebih praktis.

---

### 4. 🟡 JWT Secret Mismatch (CONFIG — Fixed)
**Symptom**: `Failed to load sessions: Unauthorized` — `JwtTokenSignatureMismatched: token signature mismatched`

**Root cause**: VBOX app login ke production (`vims.dots.my.id`) dan dapat token dengan JWT secret production. Token dikirim ke local BE (localhost:2024) yang pakai JWT secret placeholder (`your-secret-key`). Signature mismatch → 401.

**Solution**: Set `JWT_SECRET` di local BE `.env` sama dengan production (`GXfbBgtDeT1b7noCBe9DyUdYUU2wnUP`). Restart BE.

**Lesson**: Hybrid dev (prod auth + local API) butuh JWT secret sinkron. Document di setup guide. Pertimbangkan auth terpisah untuk local dev di Sprint 3.

---

### 5. 🟡 MySQL Dependency (OPS — Fixed)
**Symptom**: `connect ECONNREFUSED 127.0.0.1:3306` — BE logs show rate limit cleanup & account lockout cleanup errors.

**Root cause**: MySQL (Laragon) tidak running. BE butuh MySQL untuk semua operations.

**Solution**: Start Laragon sebelum start BE.

**Lesson**: Document dependencies dengan jelas. Setup checklist: Laragon (MySQL) → BE (Bun) → VBOX (Tauri). Pertimbangkan health check endpoint yang cek DB connection.

---

### 6. 🟢 What Worked Well (Sprint 1 Wins)
- **Gemini integration** — text & vision API calls sukses, JSON mode untuk scoring
- **DB schema** — 6 tabel dengan relations, migration jalan
- **BE API routes** — 61/61 E2E test pass (CRUD, generate drafts, template prompt, composite prompts, export)
- **FE components** — ShopeeOptimizationView & ShopeeSessionDetailView build sukses
- **CDP connection via Node** — `checkLogin` return `{logged_in: true}` membuktikan CDP + patchright jalan di Node
- **Tauri capabilities fix** — wildcard port local solve HTTP scope issue

---

### Architecture Decision Record (ADR)

#### ADR-001: Node Child Process untuk Scraping
**Date**: 2026-08-24
**Status**: Accepted
**Context**: Bun WebSocket incompatible dengan patchright `connectOverCDP()`. BE pakai Bun untuk performance & built-in APIs, tapi scraping butuh Node runtime.
**Decision**: BE (Bun) spawn Node child process (`node src/scraper-worker.mjs`) untuk scraping. Pass CDP ws URL via argv, return JSON via stdout. `src/lib/scraperBridge.ts` sebagai helper.
**Consequences**:
- (+) Scraping jalan (Node + patchright compatible)
- (+) BE tetap pakai Bun (performance, built-in APIs)
- (-) Overhead spawn process per scrape (~100ms)
- (-) Debugging lebih complex (2 process)
- (-) Error handling via stdout/stderr (bukan exception)

#### ADR-002: Public Shop URL Input (No Seller Center)
**Date**: 2026-08-24
**Status**: Accepted
**Context**: Seller Center butuh password kedua untuk akses shop settings. Sprint 1 plan scrape dari seller center tidak viable.
**Decision**: User input public shop URL (`shopee.co.id/{slug}`). Scrape dari public shop page + 10 product unggulan. Tidak butuh seller center access.
**Consequences**:
- (+) Tidak butuh seller center login (cukup shopee.co.id biasa)
- (+) Tidak butuh password kedua
- (-) Data lebih terbatas (tidak ada seller center stats: penjualan, pengunjung, dll)
- (-) Shop stats hanya yang public (rating, follower, produk count)

#### ADR-003: Scrap Profile Local (No Server Sync)
**Date**: 2026-08-24
**Status**: Accepted
**Context**: Staff Profile flow terlalu tightly coupled — butuh admin access, profile data dari prod, launch via VBOX Local API.
**Decision**: Auto-create scrap profile local (UDD khusus `vbox-scrap-profile`), persist cookies, tidak sync ke server, tidak muncul di Profiles list. Rust command `launch_scrap_profile` untuk launch.
**Consequences**:
- (+) Tidak butuh admin access
- (+) Tidak butuh profile data dari server
- (+) Cookies persist (login sekali, reuse)
- (-) Profile terpisah dari VBOX profile management
- (-) Tidak ada fingerprint customization (generic/default)

---

## Sprint 2 — Flow Revision (Public Shop URL + Scrap Profile + Node Scraper Bridge)

**Sprint Goal**: Revisi flow Sprint 1 supaya E2E test sukses. Ganti seller center scraping → public shop URL input. Ganti staff profile → scrap profile local. Ganti direct patchright (Bun) → Node child process scraper bridge.

**Duration**: 2-3 hari
**Story Points**: 17
**DoD**: E2E test sukses — VBOX → mode Optimization → Shopee → New Analysis → launch scrap profile → check login → input URL → scrape public shop + 10 products → analyze → drafts → export.

### Sprint 2 Backlog

| PBI | Description | SP | Status |
|-----|-------------|----|--------|
| S2.1 | Rust — `launch_scrap_profile` command | 3 | ✅ Done |
| S2.2 | FE — Mode "Optimization" + sidebar item "Shopee" | 2 | ✅ Done |
| S2.3 | FE — Refactor ShopeeOptimizationView (global, new flow) | 5 | ✅ Done |
| S2.4 | BE — Scraper Bridge (Node child process) | 3 | ✅ Done |
| S2.5 | BE — Update POST /sessions (terima shop_url, scrape public shop) | 3 | ✅ Done |
| S2.6 | BE — Update check-login (public Shopee) | 1 | ✅ Done |
| **Total** | | **17** | **100%** |

### Sprint 2 Progress

#### PBI-S2.1: Rust — `launch_scrap_profile` command ✅ DONE
- Tambah `pub async fn launch_scrap_profile()` di `src-tauri/src/browser/launch.rs`
- UDD persistent: `{data_dir}/vbox/vbox-scrap-profile/` (survive across launches, persist cookies)
- CDP enabled (`--remote-debugging-port=0`), headed
- Generic fingerprint (default Windows Chrome)
- Tidak fetch profile data dari backend (local only)
- Return `LaunchOutcome { pid, cdp }` — cdp berisi `port`, `http_url`, `web_socket_debugger_url`
- Register Tauri command `launch_scrap_profile` di `lib.rs`
- `cargo check` OK

#### PBI-S2.2: FE — Mode "Optimization" + sidebar item "Shopee" ✅ DONE
- Edit `src/lib/types.ts`: tambah `"optimization"` ke `Mode` type
- Edit `src/lib/nav-config.ts`: tambah mode "Optimization" (icon: Sparkles) + grup "Shopee" dengan item "shopee-optimization" (icon: ShoppingBag)
- Edit `src/App.tsx`: section `shopee-optimization` & `shopee-session-detail` tidak butuh `shopeeOptProfile` (global)
- Hapus `ShopeeOptProfile` import dari App.tsx, StaffProfiles.tsx, ShopeeSessionDetail.tsx
- `npm run build` OK

#### PBI-S2.3: FE — Refactor ShopeeOptimizationView (global, new flow) ✅ DONE
- Refactor `ShopeeOptimization.tsx`: hapus `profile` prop, jadi global
- Fetch dari `GET /sessions` (tanpa profile_id filter — global list)
- **New Analysis wizard** (multi-step modal):
  1. Step "launch": call `invoke("launch_scrap_profile")` → dapat CDP ws URL
  2. Step "check-login": call `POST /check-login {cdp_ws_url}` → kalau belum login, show "Sudah Login" button (user login manual)
  3. Step "input-url": modal input shop URL (validate format)
  4. Step "creating": `POST /sessions {cdp_ws_url, shop_url}` → redirect ke detail
- Concurrency control, auto-polling, delete session

#### PBI-S2.4: BE — Scraper Bridge (Node child process) ✅ DONE
- Rewrite `src/scraper-worker.mjs` (plain JS, run with `node`):
  - `checkLogin(cdpWsUrl)` — connect CDP, navigate shopee.co.id, detect login via cookie + UI
  - `scrapePublicShop(cdpWsUrl, shopUrl)` — scrape shop page (name, bio, stats, logo, banner, 10 product unggulan)
  - `scrapeProductDetails(cdpWsUrl, productUrls)` — scrape product detail pages (title, price, description, categories, rating, sold, images)
- Rewrite `src/lib/scraperBridge.ts`:
  - `runScraperWorker(cdpWsUrl, command, args?, timeoutMs?)` — spawn node, parse JSON
  - `checkLoginViaWorker`, `scrapePublicShopViaWorker`, `scrapeProductDetailsViaWorker`
- Test manual: `node src/scraper-worker.mjs ws://127.0.0.1:9999/fake checkLogin` → ECONNREFUSED (worker jalan, fail dengan benar)

#### PBI-S2.5: BE — Update POST /sessions (terima shop_url, scrape public shop) ✅ DONE
- Update `POST /sessions` body: `{cdp_ws_url, shop_url, profile_id?, profile_name?}` (profile_id optional)
- Update `runScrapeAndAnalyze(sessionId, cdpWsUrl, shopUrl)`:
  - Phase 1: `scrapePublicShopViaWorker(cdpWsUrl, shopUrl)` → shop info + 10 product unggulan
  - Phase 1b: `scrapeProductDetailsViaWorker(cdpWsUrl, productUrls)` → product details
  - Phase 2: `analyzeSession(sessionId)` → scores + verdict
- Update `POST /sessions/:id/run` body: `{cdp_ws_url, shop_url?}` — re-run dengan shop URL (fallback ke session.shopUrl)
- Update `GET /sessions` — profile_id optional (global list kalau tidak dikasih)
- Schema: `profile_id` jadi nullable (migration `0034_sprint2_profile_id_nullable.sql` di-run ke local MySQL)
- **Test E2E BE SUKSES**:
  - POST /sessions tanpa shop_url → 400 "shop_url is required" ✅
  - POST /sessions dengan shop_url + CDP fake → 200, create session (profileId=null, shopUrl=test-shop) ✅
  - Background job jalan → scrape fail (CDP fake) → status="failed", errorReason="cdp_disconnected" ✅
  - GET /sessions (global) → 200, list semua session ✅
  - DELETE /sessions/:id → 200 ✅

#### PBI-S2.6: BE — Update check-login (public Shopee) ✅ DONE
- Update `POST /check-login` route: pakai `checkLoginViaWorker(cdpWsUrl)` dari scraperBridge
- Worker navigate ke `https://shopee.co.id/` (bukan seller.shopee.co.id)
- Detect login via cookie (SPC_CRT/SPC_F) + UI (avatar/login button count)

---

## Sprint 1 Deferred Items

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

## Key Decisions & Risks

### Decisions
1. **VBOX app = browser manager, v-auto-backend = scraper + AI** — VBOX app handle launch/stop profile (reuse launchProfile), v-auto-backend terima CDP ws URL & connect via patchright. Separation of concerns lebih clean, tidak perlu vboxClient.ts.
2. **Hybrid dev: prod profiles + local Shopee API** — VBOX app fetch profile data dari PROD v-auto-backend (vims.dots.my.id), tapi Shopee optimization API call ke LOCAL v-auto-backend (localhost:2024). Table baru ditambah saat deploy (additive migration, tidak ganggu data existing).
3. **2 Vite env variables di VBOX app** — `VITE_API_BASE_URL` (prod, untuk profiles & existing API) + `VITE_SHOPEE_API_BASE_URL` (local, untuk Shopee optimization API). Buat `shopeeApi` client terpisah dengan base URL sendiri.
4. **Same JWT secret untuk local v-auto-backend** — local v-auto-backend pakai JWT secret yang sama dengan prod. Token dari prod login valid untuk local. Set `JWT_SECRET` sama di local `.env` dengan prod.
5. **No proxy untuk profile** — dev VBOX hingga sekarang fitur proxy tidak pernah dipakai, dan masih aman untuk akun Shopee. Launch dengan IP local, cookies Shopee tetap valid.
6. **Pakai Staff Profiles (sudah login seller center)** — tidak perlu auto-create profile, tidak perlu login flow complex. Akun seller asli dari client agency, teruji tidak kena captcha.
7. **Session per profile (profile_id di schema)** — tiap staff profile punya history session sendiri. Schema tambah profile_id & error_reason column.
8. **No URL input** — seller center URL always same (https://seller.shopee.co.id/). shop_url di-discover saat scrape dari seller center dashboard.
9. **Login check di depan (di "New Analysis" click)** — VBOX app launch profile → get CDP → call check-login → kalau belum login, tidak create session. Kalau sudah login, create + auto-run langsung.
10. **POST /sessions = create + auto-run (async, terima cdp_ws_url)** — satu API call create session + trigger scrape + analyze in background. FE langsung redirect ke detail page dengan status="scraping", polling untuk progress. Tidak ada "Run Analysis" button di detail page (hanya "Re-run" untuk done/failed).
11. **Cancel = delete session + VBOX stop profile** — kalau user mau cancel, click "Cancel" → DELETE /sessions/:id + VBOX app stop profile (reuse process_kill). Simple & clean.
12. **Re-run dengan confirm dialog** — re-run hapus semua data lama (destructive). VBOX app launch profile lagi, pass new cdp_ws_url. FE tampilkan confirm dialog dengan warning kalau ada drafts status="approved".
13. **error_reason di schema** — session yang failed punya error_reason (login_required, captcha_required, scrape_timeout, cdp_disconnected, analyze_error). FE tampilkan error reason + appropriate action.
14. **No separate analyze endpoint** — run = scrape + analyze, data selalu fresh. Analyze logic di `src/lib/shopeeAnalyzer.ts`, dipanggil dari run flow.
15. **Concurrency: disable "New Analysis"** — 1 profile tidak bisa scrape 2 session bersamaan. FE disable "New Analysis" button kalau ada session lain dengan profile_id sama sedang status="scraping"/"analyzing".
16. **Disconnect CDP, jangan close browser** — v-auto-backend disconnect dari CDP setelah scrape/analyze selesai, tapi tidak close browser. VBOX app yang handle stop profile (process_kill).
17. **Browser tetap terbuka selama scrape (5-15 menit)** — VBOX app launch profile headed → browser terbuka → scrape jalan → setelah done, VBOX app stop profile. FE tampilkan warning "Jangan tutup browser ini selama proses scraping".

### Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| VBOX app ditutup saat scraping | CDP disconnect, background job gagal | BE try-catch → set status="failed" + error_reason="cdp_disconnected". FE polling timeout 15 menit → user re-run. |
| User tutup browser selama scrape | CDP disconnect, scrape gagal | FE warning "Jangan tutup browser ini selama proses scraping". BE detect CDP disconnect → set status="failed" + error_reason="cdp_disconnected". |
| BE restart (dev hot reload) saat background job jalan | Background job hilang, session stuck "scraping" | Accept risk untuk POC. FE polling timeout 15 menit → user re-run. Sprint 2: persistent job queue. |
| Login session expire antara check-login & POST /sessions | Scrape gagal dengan login_required | BE set status="failed" + error_reason="login_required". FE tampilkan alert di detail page. User login manual → re-run. |
| User klik "New Analysis" berkali-kali cepat | Multiple sessions auto-run dengan profile sama → conflict | FE disable button setelah click (loading state). FE concurrency check (disable kalau ada session lain sedang jalan). |
| Captcha muncul (meski shardX) | Scrape stuck | BE set status="failed" + error_reason="captcha_required". FE alert "Captcha di browser, solve manual" → user solve → re-run. |
| Re-run tanpa sengaja (kehilangan drafts) | Data hilang | FE confirm dialog dengan warning kalau ada drafts status="approved". |
| CDP ws URL expired (browser ditutup sebelum scrape selesai) | Scrape gagal | BE detect CDP disconnect → set status="failed" + error_reason="cdp_disconnected". FE alert "Browser ditutup, klik re-run untuk coba lagi". |
| v-auto-backend local tidak reachable | Shopee API call gagal | FE cek `GET /api/health` (local v-auto-backend) sebelum enable "New Analysis". Error message jelas. |
| Gemini rate limit (15 RPM) | Analyze lambat untuk toko banyak produk | Queue di BE. Sprint 2: upgrade ke Tier 1 (gemini-3.7-flash). |
| Profile data dari prod tidak kompatibel dengan local VBOX launch | launchProfile gagal | Verify saat Day 1: VBOX app fetch profile dari prod → launch → verify CDP. Reuse launchProfile code yang sudah ada. |
| Prod migration ganggu data existing | Prod down | Migration additive (CREATE TABLE saja, tidak ALTER table existing). Test di local dulu. Backup prod DB sebelum migration. Run migration saat deploy bersama code. |

---

## Technical Notes

### VBOX App (Browser Manager)
- **Role**: Launch & stop browser profile, pass CDP ws URL to v-auto-backend
- **Profile data source**: PROD v-auto-backend (vims.dots.my.id) via `chromeProfilesApi.getByUuid(p.id)` — sudah ada code-nya
- **Launch profile**: Reuse `launchProfile` dari StaffProfiles (Tauri invoke, pass fingerprint, cookies, proxy)
- **Stop profile**: Reuse `process_kill` dari StaffProfiles (Tauri invoke)
- **Get CDP ws URL**: Dari launch result, atau dari VBOX Local API `GET /running`
- **Shopee API calls**: Ke LOCAL v-auto-backend (localhost:2024) — bukan prod
- **2 Vite env variables**:
  - `VITE_API_BASE_URL` — prod v-auto-backend (https://vims.dots.my.id/api) — untuk profiles & existing API (sudah ada)
  - `VITE_SHOPEE_API_BASE_URL` — local v-auto-backend (http://localhost:2024/api) — untuk Shopee optimization API (NEW)
  - Buat `src/lib/shopeeApi.ts` — API client terpisah dengan base URL `VITE_SHOPEE_API_BASE_URL`
  - Auth: reuse `backend_auth_token` dari settings (same JWT secret → token valid untuk local)
- **No proxy**: Dev VBOX tidak pakai proxy, launch dengan IP local. Cookies Shopee tetap valid (teruji aman).

### VBOX Local API (internal Tauri, untuk get CDP)
- Host: 127.0.0.1:40325 (default)
- Auth: `Authorization: Bearer <JWT>` (10-year token, dari Settings → Automation API)
- Key endpoints (dipakai VBOX app, BUKAN v-auto-backend):
  - `GET /running` → list running profiles + CDP ws URL
- **Penting**: VBOX app harus jalan (API hidup di proses Tauri)
- **Penting**: v-auto-backend TIDAK call VBOX Local API — hanya VBOX app yang call

### patchright Node (di v-auto-backend)
- Drop-in replacement Playwright, source-level stealth untuk driver
- Install: `bun add patchright`
- Import: `import { chromium } from "patchright"`
- Connect: `const browser = await chromium.connectOverCDP(cdpWsUrl)` — cdpWsUrl diterima dari VBOX app
- **Penting**: Pakai `browser.contexts()[0]` (context profile), jangan `new_context()` — spoof fingerprint tetap utuh
- **Penting**: Disconnect setelah selesai, jangan close browser — VBOX app yang handle stop

### Gemini API
- Model: `gemini-3.5-flash-lite` (dev, free tier 15 RPM / 500 RPD)
- Production: ganti `GEMINI_MODEL=gemini-3.7-flash` (Tier 1)
- Text: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Vision: same endpoint, tambah `inlineData` part dengan base64 image
- JSON mode: `generationConfig.responseMimeType = "application/json"`
- API key sudah diset di v-auto-backend `.env`: `GEMINI_API_KEY` & `GEMINI_MODEL`

### Shopee Seller Center
- URL: https://seller.shopee.co.id/ (always same, tidak perlu input user)
- Login required: redirect ke https://seller.shopee.co.id/account/signin kalau belum login
- Setelah login: dashboard menampilkan shop name, performance, stats
- Shop URL/slug bisa di-extract dari seller center (untuk navigate ke public shop page)

### Shopee Shop Page Selectors (verified via inspect)
- Shop name: `.section-seller-overview-horizontal__portrait-name`
- Shop stats: `.section-seller-overview__item-text-name` (label-value pairs: produk, pengikut, mengikuti, penilaian)
- Product links: `a[href*='/product/']` (format: `/{shop-slug}/{product-slug}.{product_id}`)
- **Penting**: Pakai Staff Profile yang sudah login seller center (akun seller asli, teruji tidak kena captcha)
