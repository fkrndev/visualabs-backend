import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  shopeeScrapeSessions,
  shopeeShops,
  shopeeProducts,
  shopeeImages,
  shopeeScores,
  shopeeDrafts,
} from "../db/schema";
import { requireAuth, requireManagement, getAuthUserId } from "../middleware/auth";
import { logAuditEvent, getClientIp, getUserAgent } from "../utils/audit";
import { scrapePublicShopViaWorker, scrapeProductDetailsViaWorker, resumeWorker } from "../lib/scraperBridge";
import { analyzeSession } from "../lib/shopeeAnalyzer";
import { setProgress, clearProgress, getProgress } from "../lib/shopeeProgress";
import { geminiText } from "../lib/gemini";

/** Pending verify resolvers — map sessionId → resolve function.
 *  Diisi oleh onVerifyWait callback, di-resolve oleh endpoint verify-resume. */
const pendingVerifyResolvers = new Map<number, () => void>();

/**
 * Shopee Optimization — Session CRUD + auto-run.
 *
 * Arsitektur:
 *   VBOX app launch profile → get CDP ws URL → POST /sessions {profile_id, cdp_ws_url}
 *   BE create session status="scraping" → background scrape + analyze → status="done"
 *   FE redirect ke detail page, polling untuk progress.
 *
 * Endpoints (di belakang basePath "/api/shopee-optimization"):
 *   GET    /sessions?profile_id=...   — list sessions per profile
 *   GET    /sessions/:id              — detail session (full data)
 *   POST   /sessions                  — create + auto-run (terima cdp_ws_url)
 *   POST   /sessions/:id/run          — re-run (VBOX app launch profile lagi)
 *   DELETE /sessions/:id              — hapus session + cascade + hapus file uploads
 */
const router = new Hono();

// ─── GET /sessions?profile_id=... — list sessions per profile ──────────────

router.get("/sessions", requireAuth, requireManagement, async (c) => {
  const profileId = c.req.query("profile_id");
  const page = Number(c.req.query("page") || "1");
  const limit = Number(c.req.query("limit") || "20");
  const offset = (page - 1) * limit;

  // Sprint 2: profile_id optional — global list kalau tidak dikasih
  const whereExpr = profileId
    ? eq(shopeeScrapeSessions.profileId, profileId)
    : undefined;
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(shopeeScrapeSessions)
      .where(whereExpr)
      .orderBy(desc(shopeeScrapeSessions.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: shopeeScrapeSessions.id })
      .from(shopeeScrapeSessions)
      .where(whereExpr),
  ]);

  return c.json({
    success: true,
    data: rows,
    pagination: {
      page,
      limit,
      total: totalRows.length,
    },
  });
});

// ─── GET /sessions/:id — detail session (full data untuk tabs) ─────────────

router.get("/sessions/:id", requireAuth, requireManagement, async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

  const [session] = await db
    .select()
    .from(shopeeScrapeSessions)
    .where(eq(shopeeScrapeSessions.id, id));

  if (!session) {
    return c.json({ success: false, message: "Session not found" }, 404);
  }

  // Parallel fetch: shop, products, scores, drafts
  const [shop, products, scores, drafts] = await Promise.all([
    db.select().from(shopeeShops).where(eq(shopeeShops.sessionId, id)),
    db.select().from(shopeeProducts).where(eq(shopeeProducts.sessionId, id)),
    db.select().from(shopeeScores).where(eq(shopeeScores.sessionId, id)),
    db.select().from(shopeeDrafts).where(eq(shopeeDrafts.sessionId, id)),
  ]);

  return c.json({
    success: true,
    data: {
      ...session,
      shop: shop[0] || null,
      products,
      scores,
      drafts,
      progress: getProgress(id),
    },
  });
});

// ─── POST /sessions — create + auto-run (terima cdp_ws_url) ────────────────

router.post("/sessions", requireAuth, requireManagement, async (c) => {
  const userId = getAuthUserId(c.get("jwtPayload") as any);
  const body = await c.req.json();
  const { profile_id, profile_name, cdp_ws_url, shop_url } = body as {
    profile_id?: string;
    profile_name?: string;
    cdp_ws_url?: string;
    shop_url?: string;
  };

  // profile_id is now optional (Sprint 2: global, no staff profile required)
  if (!cdp_ws_url || typeof cdp_ws_url !== "string") {
    return c.json({ success: false, message: "cdp_ws_url is required" }, 400);
  }
  if (!shop_url || typeof shop_url !== "string") {
    return c.json({ success: false, message: "shop_url is required" }, 400);
  }

  // Normalize shop_url — pastikan format https://shopee.co.id/{slug}
  // Handle: "shopee.co.id/unheardof", "https://shopee.co.id/unheardof", "https://shopee.co.id/shopee.co.id/unheardof"
  let normalizedShopUrl = shop_url.trim();
  // Strip semua prefix domain (http://, https://, shopee.co.id/) berulang
  normalizedShopUrl = normalizedShopUrl.replace(/^(https?:\/\/)?(shopee\.co\.id\/)+/i, "");
  normalizedShopUrl = normalizedShopUrl.replace(/^\//, "");
  normalizedShopUrl = `https://shopee.co.id/${normalizedShopUrl}`;

  // Concurrency check: reject kalau ada session lain sedang status="scraping"/"analyzing"
  // (global check — no profile_id filter since Sprint 2 is global)
  const activeSessions = await db
    .select({ id: shopeeScrapeSessions.id })
    .from(shopeeScrapeSessions)
    .where(eq(shopeeScrapeSessions.status, "scraping"));
  const activeAnalyzing = await db
    .select({ id: shopeeScrapeSessions.id })
    .from(shopeeScrapeSessions)
    .where(eq(shopeeScrapeSessions.status, "analyzing"));

  if (activeSessions.length > 0 || activeAnalyzing.length > 0) {
    return c.json(
      {
        success: false,
        message: "Another session is already running",
      },
      409,
    );
  }

  // Create session status="scraping"
  await db.insert(shopeeScrapeSessions).values({
    profileId: profile_id || null,
    profileName: profile_name || null,
    shopUrl: normalizedShopUrl,
    status: "scraping",
  });

  // Get last inserted session (select by shop_url + createdAt, since profile_id can be null)
  const [session] = await db
    .select()
    .from(shopeeScrapeSessions)
    .where(eq(shopeeScrapeSessions.shopUrl, normalizedShopUrl))
    .orderBy(desc(shopeeScrapeSessions.id))
    .limit(1);

  if (!session) {
    return c.json({ success: false, message: "Failed to create session" }, 500);
  }

  // Audit log
  await logAuditEvent({
    userId,
    action: "CREATE",
    entityType: "shopee_scrape_session",
    entityId: session.id,
    changes: { profile_id: profile_id || null, profile_name, shop_url: normalizedShopUrl },
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  // Background: scrape + analyze (async, tidak block response)
  runScrapeAndAnalyze(session.id, cdp_ws_url, normalizedShopUrl).catch((err) => {
    console.error(`[shopeeOptimization] background job failed for session ${session.id}:`, err);
  });

  // Return immediately — FE redirect ke detail, polling untuk progress
  return c.json({
    success: true,
    data: { id: session.id, profile_id, status: "scraping" },
  });
});

// ─── POST /sessions/:id/run — re-run (VBOX app launch profile lagi) ────────

router.post("/sessions/:id/run", requireAuth, requireManagement, async (c) => {
  const userId = getAuthUserId(c.get("jwtPayload") as any);
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

  const body = await c.req.json();
  const { cdp_ws_url, shop_url } = body as { cdp_ws_url?: string; shop_url?: string };
  if (!cdp_ws_url || typeof cdp_ws_url !== "string") {
    return c.json({ success: false, message: "cdp_ws_url is required" }, 400);
  }

  // Cek session exists
  const [session] = await db
    .select()
    .from(shopeeScrapeSessions)
    .where(eq(shopeeScrapeSessions.id, id));
  if (!session) {
    return c.json({ success: false, message: "Session not found" }, 404);
  }

  // shop_url optional di re-run — kalau tidak dikasih, pakai shop_url existing session
  const effectiveShopUrl = shop_url || session.shopUrl;
  if (!effectiveShopUrl) {
    return c.json({ success: false, message: "shop_url is required (no existing shop_url for this session)" }, 400);
  }

  // Warning kalau ada drafts status="approved"
  const approvedDrafts = await db
    .select({ id: shopeeDrafts.id })
    .from(shopeeDrafts)
    .where(
      and(
        eq(shopeeDrafts.sessionId, id),
        eq(shopeeDrafts.status, "approved"),
      ),
    );
  if (approvedDrafts.length > 0) {
    // Return warning — FE harus confirm sebelum re-run
    // Kalau FE sudah confirm, kirim {confirm: true} di body
    if (!body.confirm) {
      return c.json(
        {
          success: false,
          message: `${approvedDrafts.length} approved drafts will be deleted. Send {confirm: true} to proceed.`,
          approvedDraftsCount: approvedDrafts.length,
        },
        409,
      );
    }
  }

  // Hapus data lama (cascade: shops, products, images, scores, drafts)
  // Sequential, tidak pakai Promise.all — parallel deletes pada session yang
  // sama bisa trigger MySQL deadlock (ER_LOCK_DEADLOCK) karena semua compete
  // untuk lock baris yang sama di tabel relasi.
  await db.delete(shopeeShops).where(eq(shopeeShops.sessionId, id));
  await db.delete(shopeeProducts).where(eq(shopeeProducts.sessionId, id));
  await db.delete(shopeeImages).where(eq(shopeeImages.sessionId, id));
  await db.delete(shopeeScores).where(eq(shopeeScores.sessionId, id));
  await db.delete(shopeeDrafts).where(eq(shopeeDrafts.sessionId, id));

  // Reset session status
  await db
    .update(shopeeScrapeSessions)
    .set({
      status: "scraping",
      errorReason: null,
      completedAt: null,
      startedAt: new Date(),
    })
    .where(eq(shopeeScrapeSessions.id, id));

  // Audit log
  await logAuditEvent({
    userId,
    action: "UPDATE",
    entityType: "shopee_scrape_session",
    entityId: id,
    changes: { action: "re-run" },
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  // Background: scrape + analyze
  runScrapeAndAnalyze(id, cdp_ws_url, effectiveShopUrl).catch((err) => {
    console.error(`[shopeeOptimization] re-run background job failed for session ${id}:`, err);
  });

  return c.json({
    success: true,
    data: { id, status: "scraping" },
  });
});

// ─── DELETE /sessions/:id — hapus session + cascade + hapus file uploads ───

router.delete("/sessions/:id", requireAuth, requireManagement, async (c) => {
  const userId = getAuthUserId(c.get("jwtPayload") as any);
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

  // Cek session exists
  const [session] = await db
    .select()
    .from(shopeeScrapeSessions)
    .where(eq(shopeeScrapeSessions.id, id));
  if (!session) {
    return c.json({ success: false, message: "Session not found" }, 404);
  }

  // Hapus file uploads (images) dari disk sebelum delete dari DB
  try {
    const { unlinkSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { UPLOAD_DIR } = await import("./uploads");
    const images = await db
      .select({ localPath: shopeeImages.localPath })
      .from(shopeeImages)
      .where(eq(shopeeImages.sessionId, id));
    for (const img of images) {
      if (img.localPath) {
        const filename = img.localPath.replace(/^\/uploads\//, "");
        const filepath = join(UPLOAD_DIR, filename);
        if (existsSync(filepath)) {
          try {
            unlinkSync(filepath);
          } catch {
            // ignore — file mungkin sudah tidak ada
          }
        }
      }
    }
  } catch (err) {
    console.error("[shopeeOptimization] cleanup images error:", err);
  }

  // Delete session (cascade akan hapus shops, products, images, scores, drafts)
  await db.delete(shopeeScrapeSessions).where(eq(shopeeScrapeSessions.id, id));

  // Audit log
  await logAuditEvent({
    userId,
    action: "DELETE",
    entityType: "shopee_scrape_session",
    entityId: id,
    changes: { profile_id: session.profileId },
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  return c.json({ success: true, data: { id } });
});

// ─── Background: scrape + analyze ──────────────────────────────────────────

async function runScrapeAndAnalyze(sessionId: number, cdpWsUrl: string, shopUrl: string): Promise<void> {
  console.log(`[shopeeOptimization] session ${sessionId}: starting scrape + analyze (shop=${shopUrl})`);

  // onVerifyWait: update session status ke 'waiting_verify' saat anti-bot terdeteksi.
  // Promise resolve ketika user klik "Sudah verify" di FE (via endpoint verify-resume).
  // Reusable untuk shop page scrape & product detail scrape.
  const onVerifyWait = async (verifyUrl: string) => {
    console.log(`[shopeeOptimization] session ${sessionId}: anti-bot detected (${verifyUrl}), waiting for manual verify...`);
    await db.update(shopeeScrapeSessions).set({
      status: "waiting_verify",
      errorReason: "anti_bot",
      updatedAt: new Date(),
    }).where(eq(shopeeScrapeSessions.id, sessionId));
    // Wait until user clicks "Sudah verify" → endpoint verify-resume calls resolveVerify
    await new Promise<void>((resolve) => {
      pendingVerifyResolvers.set(sessionId, resolve);
    });
  };

  try {
    // Phase 1: Scrape public shop page via Node worker
    // Anti-bot check sebelum scrape: jika shop page kena anti-bot, modal verify muncul.
    console.log(`[shopeeOptimization] session ${sessionId}: scraping public shop...`);
    setProgress(sessionId, { phase: "analyzing", step: 0, total: 1, message: "Scraping shop page..." });
    const { shop, products: shopProducts } = await scrapePublicShopViaWorker(cdpWsUrl, shopUrl, sessionId, onVerifyWait);
    // Reset status ke scraping setelah verify selesai (jika sebelumnya waiting_verify)
    await db.update(shopeeScrapeSessions).set({
      status: "scraping",
      errorReason: null,
      updatedAt: new Date(),
    }).where(eq(shopeeScrapeSessions.id, sessionId));

    // Phase 1b: Scrape product detail pages (jika ada product URLs)
    let productDetails: any[] = [];
    if (shopProducts && shopProducts.length > 0) {
      const productUrls = shopProducts.map((p: any) => p.productUrl).filter(Boolean).slice(0, 5);
      if (productUrls.length > 0) {
        console.log(`[shopeeOptimization] session ${sessionId}: scraping ${productUrls.length} product details...`);
        setProgress(sessionId, { phase: "analyzing", step: 0, total: 1, message: `Scraping ${productUrls.length} product details...` });
        productDetails = await scrapeProductDetailsViaWorker(cdpWsUrl, productUrls, shopUrl, sessionId, onVerifyWait);
        // Reset status ke scraping setelah verify selesai
        await db.update(shopeeScrapeSessions).set({
          status: "scraping",
          errorReason: null,
          updatedAt: new Date(),
        }).where(eq(shopeeScrapeSessions.id, sessionId));
      }
    }

    // Merge shop page product data with detail page data
    const products = shopProducts.map((sp: any) => {
      const detail = productDetails.find((pd: any) => pd.productUrl === sp.productUrl || pd.productId === sp.productId);
      return {
        ...sp,
        ...(detail || {}),
        // Keep shop page data as fallback if detail failed
        title: detail?.title || sp.title,
        thumbnailUrl: detail?.images?.[0] || sp.thumbnailUrl,
      };
    });

    // Save shop to DB
    await db.insert(shopeeShops).values({
      sessionId,
      shopName: shop.shopName || null,
      shopSlug: shop.shopSlug || null,
      shopUrl: shop.shopUrl || shopUrl,
      shopBio: shop.shopBio || null,
      shopStats: shop.shopStats || null,
      sellerData: shop as any,
      logoUrl: shop.shopLogoUrl || null,
      logoLocal: null,
      bannerUrl: shop.shopBannerUrl || null,
      bannerLocal: null,
      heroImages: (shop as any).heroImages || null,
      bottomHeroImages: (shop as any).bottomHeroImages || null,
    });

    // Save products to DB
    if (products.length > 0) {
      const productRows = products.map((p: any) => ({
        sessionId,
        productId: (p.productId as string) || null,
        title: (p.title as string) || null,
        description: (p.description as string) || null,
        price: (p.price as string) || null,
        originalPrice: null,
        categories: (p.categories as any) || null,
        variants: null,
        stock: (p.stock as string) || null,
        rating: (p.rating as string) || null,
        ratingCount: (p.ratingCount as string) || null,
        sold: (p.sold as string) || null,
        favorit: (p.favorit as string) || null,
        brand: (p.brand as string) || null,
        specs: (p.specs as any) || null,
        images: (p.images as any) || null,
        reviews: (p.reviews as any) || null,
        productUrl: (p.productUrl as string) || null,
        thumbnailUrl: (p.thumbnailUrl as string) || null,
        thumbnailLocal: null,
        detailError: (p.error as string) || null,
      }));
      await db.insert(shopeeProducts).values(productRows);
    }

    // Update session: shop_url, status → analyzing
    await db
      .update(shopeeScrapeSessions)
      .set({
        shopUrl: shop.shopUrl || shopUrl,
        status: "analyzing",
      })
      .where(eq(shopeeScrapeSessions.id, sessionId));

    console.log(`[shopeeOptimization] session ${sessionId}: scrape done, starting analyze...`);
    setProgress(sessionId, { phase: "analyzing", step: 0, total: 1, message: "Analyzing shop & products..." });

    // Phase 2: Analyze (score + verdict)
    await analyzeSession(sessionId);

    // Phase 3: Auto-generate text drafts (bio, title, description)
    console.log(`[shopeeOptimization] session ${sessionId}: analyze done, generating drafts...`);
    setProgress(sessionId, { phase: "generating_drafts", step: 0, total: 1, message: "Generating suggestions..." });
    try {
      const draftCount = await generateSessionDrafts(sessionId, (msg, step, total) => {
        setProgress(sessionId, { phase: "generating_drafts", step: step ?? 0, total: total ?? 1, message: msg });
      });
      console.log(`[shopeeOptimization] session ${sessionId}: generated ${draftCount} drafts`);
    } catch (draftErr) {
      console.error(`[shopeeOptimization] session ${sessionId}: draft generation failed (non-fatal):`, draftErr);
    }

    // Done
    await db
      .update(shopeeScrapeSessions)
      .set({
        status: "done",
        completedAt: new Date(),
      })
      .where(eq(shopeeScrapeSessions.id, sessionId));
    setProgress(sessionId, { phase: "done", step: 1, total: 1, message: "Completed" });
    setTimeout(() => clearProgress(sessionId), 30_000);

    console.log(`[shopeeOptimization] session ${sessionId}: done`);
  } catch (err) {
    console.error(`[shopeeOptimization] session ${sessionId}: failed:`, err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    setProgress(sessionId, { phase: "error", step: 0, total: 1, message: errorMessage });
    setTimeout(() => clearProgress(sessionId), 30_000);

    // Map error ke error_reason
    let errorReason = "analyze_error";
    if (errorMessage === "login_required") errorReason = "login_required";
    else if (errorMessage === "captcha_required") errorReason = "captcha_required";
    else if (errorMessage.includes("timeout")) errorReason = "scrape_timeout";
    else if (errorMessage.includes("CDP") || errorMessage.includes("connect"))
      errorReason = "cdp_disconnected";

    await db
      .update(shopeeScrapeSessions)
      .set({
        status: "failed",
        errorReason,
        completedAt: new Date(),
      })
      .where(eq(shopeeScrapeSessions.id, sessionId));
  }
}

// ─── Generate drafts (reusable — dipanggil dari background flow & endpoint) ──

async function generateSessionDrafts(sessionId: number, onProgress?: (msg: string, step?: number, total?: number) => void): Promise<number> {
  // Fetch shop + products + scores
  const [shop, products, scores] = await Promise.all([
    db.select().from(shopeeShops).where(eq(shopeeShops.sessionId, sessionId)),
    db.select().from(shopeeProducts).where(eq(shopeeProducts.sessionId, sessionId)),
    db.select().from(shopeeScores).where(eq(shopeeScores.sessionId, sessionId)),
  ]);

  console.log(`[drafts] session ${sessionId}: shop=${!!shop[0]}, products=${products.length}, scores=${scores.length}`);

  // Estimate total drafts for progress
  const heroCount = shop[0] ? ((shop[0].heroImages as string[] | null) || []).length : 0;
  const bottomHeroCount = shop[0] ? ((shop[0].bottomHeroImages as string[] | null) || []).length : 0;
  const productPhotoCount = products.reduce((sum, p) => {
    const imgs = ((p.images as string[] | null) || []).slice(0, 5);
    const thumb = (p as any).thumbnailLocal || (p as any).thumbnailUrl || null;
    return sum + [...new Set([thumb, ...imgs].filter(Boolean))].length;
  }, 0);
  const totalDrafts = (shop[0] ? 1 + 1 + heroCount + bottomHeroCount + 1 + 1 : 0) + products.length * 2 + productPhotoCount + 1;
  let draftStep = 0;
  const tickProgress = (msg: string) => {
    draftStep++;
    onProgress?.(msg, draftStep, totalDrafts);
  };

  const drafts: Array<{
    sessionId: number;
    productId: number | null;
    imageIndex: number | null;
    itemType: "shop" | "product";
    draftType:
      | "shop_bio"
      | "product_title"
      | "product_description"
      | "template_prompt"
      | "composite_prompt"
      | "banner_prompt"
      | "logo_prompt"
      | "hero_prompt"
      | "bottom_hero_prompt"
      | "template_design"
      | "product_photo_prompt"
      | "combine_prompt";
    content: string;
  }> = [];

  // Hapus drafts lama di AWAL (sebelum generate) supaya FE lihat incremental update
  await db
    .delete(shopeeDrafts)
    .where(eq(shopeeDrafts.sessionId, sessionId));

  // Helper: push ke array + insert ke DB langsung (incremental)
  const addDraft = async (d: (typeof drafts)[number]) => {
    drafts.push(d);
    await db.insert(shopeeDrafts).values(d);
  };

  // Generate shop bio draft (kalau shop ada)
  if (shop[0]) {
    const shopData = shop[0];
    const shopScore = scores.find((s) => s.itemType === "shop");
    const feedbackBio = (shopScore?.feedback as Record<string, string> | null)?.bio;

    const prompt = `You are a Shopee store optimization expert. Generate an optimized shop bio/description for this Shopee store.

Current shop info:
- Name: ${shopData.shopName || "N/A"}
- Current bio: ${shopData.shopBio || "(empty)"}
- Stats: ${JSON.stringify(shopData.shopStats || {})}
- Current bio score: ${shopScore?.bioScore ?? "N/A"}/100
- Bio feedback: ${feedbackBio || "N/A"}

Generate 1 optimized shop bio (max 200 characters) that:
- Clear & professional
- Contains relevant keywords for Shopee search
- Highlights shop's strengths
- Appropriate tone for Indonesian marketplace

Respond with ONLY the bio text (no JSON, no explanation).`;

    const bioDraft = await callGeminiTextInternal(prompt, "shop_bio");
    if (bioDraft) {
      await addDraft({
        sessionId,
        productId: null,
        imageIndex: null,
        itemType: "shop",
        draftType: "shop_bio",
        content: bioDraft,
      });
      tickProgress("Generated shop bio draft");
    }
  }

  // Generate product title & description drafts
  for (const product of products) {
    const productScore = scores.find(
      (s) => s.productId === product.id && s.itemType === "product",
    );
    const feedbackTitle = (productScore?.feedback as Record<string, string> | null)?.title;
    const feedbackDesc = (productScore?.feedback as Record<string, string> | null)?.description;

    // Title draft
    if (product.title) {
      const prompt = `You are a Shopee product optimization expert. Generate an optimized product title for this Shopee product.

Current product info:
- Title: ${product.title}
- Price: ${product.price || "N/A"}
- Categories: ${JSON.stringify(product.categories || [])}
- Current title score: ${productScore?.titleScore ?? "N/A"}/100
- Title feedback: ${feedbackTitle || "N/A"}

Generate 1 optimized product title (max 120 characters) that:
- Clear & descriptive
- Contains relevant keywords for Shopee search
- Professional tone
- Appropriate length

Respond with ONLY the title text (no JSON, no explanation).`;

      const titleDraft = await callGeminiTextInternal(prompt, `product_title#${product.id}`);
      if (titleDraft) {
        await addDraft({
          sessionId,
          productId: product.id,
          imageIndex: null,
          itemType: "product",
          draftType: "product_title",
          content: titleDraft,
        });
        tickProgress(`Generated product ${product.id} title draft`);
      }
    }

    // Description draft
    if (product.description || product.title) {
      const prompt = `You are a Shopee product optimization expert. Generate an optimized product description for this Shopee product.

Current product info:
- Title: ${product.title || "N/A"}
- Description: ${product.description || "(empty)"}
- Price: ${product.price || "N/A"}
- Categories: ${JSON.stringify(product.categories || [])}
- Variants: ${JSON.stringify(product.variants || {})}
- Current description score: ${productScore?.descriptionScore ?? "N/A"}/100
- Description feedback: ${feedbackDesc || "N/A"}

Generate 1 optimized product description (max 1000 characters) that:
- Clear & informative
- Contains product specifications
- Professional tone
- Contains relevant keywords
- Easy to read (use bullet points if appropriate)

Respond with ONLY the description text (no JSON, no explanation).`;

      const descDraft = await callGeminiTextInternal(prompt, `product_description#${product.id}`);
      if (descDraft) {
        await addDraft({
          sessionId,
          productId: product.id,
          imageIndex: null,
          itemType: "product",
          draftType: "product_description",
          content: descDraft,
        });
        tickProgress(`Generated product ${product.id} description draft`);
      }
    }
  }

  // ─── Image optimization prompts ──────────────────────────────────────────
  // Part A: Shop image prompts
  // - banner & logo: 1 prompt each (single image)
  // - hero & bottom_hero: 1 prompt PER image (loop sebanyak jumlah images)
  if (shop[0]) {
    const shopData = shop[0];
    const shopScore = scores.find((s) => s.itemType === "shop");
    const fbDesc = (key: string) => (shopScore?.feedback as Record<string, string> | null)?.[key] || "N/A";

    // Helper: build & send prompt for a single shop image
    // Template disesuaikan per draftType — format optimized prompt
    const generateShopImagePrompt = async (
      draftType: "banner_prompt" | "logo_prompt" | "hero_prompt" | "bottom_hero_prompt",
      subject: string,
      dimensions: string,
      aspectRatio: string,
      description: string,
      imageUrl: string,
      imageIndex: number | null, // null untuk banner/logo, 0-based untuk hero/bottom_hero
      feedback: string, // AI feedback for this image
    ) => {
      const indexLabel = imageIndex !== null ? ` (Image ${imageIndex + 1})` : "";
      const shopName = shopData.shopName || "N/A";
      const shopBio = shopData.shopBio || "N/A";

      // Template berbeda per draftType
      let prompt: string;

      if (draftType === "hero_prompt") {
        prompt = `You are an expert Shopee store branding specialist and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this store's shop hero/banner image for the Shopee marketplace.

Shop Info:
- Name: ${shopName}
- Bio: ${shopBio}
- Current Shop Hero Image Description: ${description}
- Current Shop Hero Image Feedback: ${feedback}
- Shop Hero Image URL: ${imageUrl}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to preserve the exact product design, material texture, structure, and refined craftsmanship.
- Always refer to the reference photo as "the attached image" or "the attached source photo" (NEVER use technical filenames like image_0.png).
- MATCH THE SHOT CONTEXT AUTOMATICALLY: If the attached image features a model, maintain a model lifestyle shot with the same pose/context. If the attached image is product-only, maintain a standalone product shot without a model.
- ADDRESS THE FEEDBACK: The generated prompt MUST explicitly address and fix the issues raised in the AI Feedback above.
- OPTIMIZE VISUALS & BRANDING FOR SHOPEE HERO BANNER:
  - Upgrade the current layout into a high-converting, professional e-commerce hero banner optimized for a ${dimensions} aspect ratio (${aspectRatio}).
  - Enhance dark/stark background elements with modern, sophisticated aesthetic accents (such as soft architectural shadows, elegant silk or marble textures, or refined neutral/warm lighting) while maintaining the shop's sleek, minimalist identity.
  - Elevate lighting to create bright, commercial-grade highlights on the product materials, clarity, and luster.
  - Ensure seamless composition with room for clean, legible shop branding elements ("${shopName}") if rendered, matching a luxurious, modern, and high-end Korean aesthetic.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;
      } else if (draftType === "bottom_hero_prompt") {
        prompt = `You are an expert Shopee store branding specialist and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this store's shop bottom hero/promo image for the Shopee marketplace.

Shop Info:
- Name: ${shopName}
- Bio: ${shopBio}
- Current Shop Bottom Hero Image Description: ${description}
- Current Shop Bottom Hero Image Feedback: ${feedback}
- Shop Bottom Hero Image URL: ${imageUrl}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to preserve the exact product design, material texture, structure, and refined craftsmanship.
- Always refer to the reference photo as "the attached image" or "the attached source photo" (NEVER use technical filenames like image_0.png).
- MATCH THE SHOT CONTEXT AUTOMATICALLY: If the attached image features a model, maintain a model lifestyle shot with the same pose/context. If the attached image is product-only, maintain a standalone product shot without a model.
- ADDRESS THE FEEDBACK: The generated prompt MUST explicitly address and fix the issues raised in the AI Feedback above.
- OPTIMIZE VISUALS & BRANDING FOR SHOPEE BOTTOM HERO PROMO:
  - Upgrade the current layout into a high-converting, professional e-commerce promo banner optimized for a ${dimensions} aspect ratio (${aspectRatio}).
  - Enhance dark/stark background elements with modern, sophisticated aesthetic accents (such as soft architectural shadows, elegant silk or marble textures, or refined neutral/warm lighting) while maintaining the shop's sleek, minimalist identity.
  - Elevate lighting to create bright, commercial-grade highlights on the product materials, clarity, and luster.
  - Ensure seamless composition with room for clean, legible shop branding elements ("${shopName}") and promo messaging if rendered, matching a luxurious, modern, and high-end Korean aesthetic.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;
      } else if (draftType === "banner_prompt") {
        prompt = `You are an expert Shopee store branding specialist and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this store's shop banner/cover image for the Shopee marketplace.

Shop Info:
- Name: ${shopName}
- Bio: ${shopBio}
- Current Shop Banner Image Description: ${description}
- Current Shop Banner Image Feedback: ${feedback}
- Shop Banner Image URL: ${imageUrl}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to preserve the exact content, branding, and visual identity.
- Always refer to the reference photo as "the attached image" or "the attached source photo" (NEVER use technical filenames like image_0.png).
- ADDRESS THE FEEDBACK: The generated prompt MUST explicitly address and fix the issues raised in the AI Feedback above.
- OPTIMIZE VISUALS & BRANDING FOR SHOPEE BANNER:
  - Upgrade the current layout into a high-converting, professional e-commerce shop banner optimized for a ${dimensions} aspect ratio (${aspectRatio}).
  - Include the shop name "${shopName}" and tagline as clean, legible text elements.
  - Enhance background with modern, sophisticated aesthetic accents while maintaining the shop's brand identity.
  - Elevate lighting to create bright, commercial-grade visuals.
  - Ensure seamless composition with clear branding & messaging, matching a professional, modern e-commerce aesthetic.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;
      } else {
        // logo_prompt
        prompt = `You are an expert Shopee store branding specialist and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this store's shop logo for the Shopee marketplace.

Shop Info:
- Name: ${shopName}
- Bio: ${shopBio}
- Current Shop Logo Image Description: ${description}
- Current Shop Logo Image Feedback: ${feedback}
- Shop Logo Image URL: ${imageUrl}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to preserve the exact logo design, typography, and brand identity.
- Always refer to the reference photo as "the attached image" or "the attached source photo" (NEVER use technical filenames like image_0.png).
- ADDRESS THE FEEDBACK: The generated prompt MUST explicitly address and fix the issues raised in the AI Feedback above.
- OPTIMIZE VISUALS & BRANDING FOR SHOPEE LOGO:
  - Upgrade the current logo into a clear, recognizable, professional shop logo optimized for a ${dimensions} (${aspectRatio}).
  - Ensure the logo is clearly readable and recognizable at small sizes (Shopee circular avatar format).
  - Maintain the shop's brand identity (colors, typography style, tone).
  - Enhance contrast, clarity, and visual impact for Shopee marketplace.
  - Strong brand representation with professional appearance.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;
      }

      const label = imageIndex !== null ? `${draftType}#${imageIndex}` : draftType;
      const result = await callGeminiTextInternal(prompt, label);
      if (result) {
        await addDraft({
          sessionId,
          productId: null,
          imageIndex,
          itemType: "shop",
          draftType,
          content: result,
        });
        tickProgress(`Generated ${label} draft`);
      }
    };

    // 1. Banner (single)
    const bannerUrl = shopData.bannerLocal || shopData.bannerUrl || "N/A";
    await generateShopImagePrompt(
      "banner_prompt", "shop banner/cover image", "1920x640", "3:1",
      fbDesc("bannerDescription"), bannerUrl, null, fbDesc("banner"),
    );

    // 2. Logo (single)
    const logoUrl = shopData.logoLocal || shopData.logoUrl || "N/A";
    await generateShopImagePrompt(
      "logo_prompt", "shop logo", "500x500", "1:1",
      fbDesc("logoDescription"), logoUrl, null, fbDesc("logo"),
    );

    // 3. Hero (loop per image)
    const heroImages = (shopData.heroImages as string[] | null) || [];
    const heroDescriptions: string[] = (() => {
      try { return JSON.parse(fbDesc("heroDescriptions")); } catch { return []; }
    })();
    const heroFeedbacks: string[] = (() => {
      try { return JSON.parse(fbDesc("heroFeedbacks")); } catch { return []; }
    })();
    for (let i = 0; i < heroImages.length; i++) {
      await generateShopImagePrompt(
        "hero_prompt", "shop hero/carousel image", "1200x600", "2:1",
        heroDescriptions[i] || "N/A", heroImages[i], i, heroFeedbacks[i] || fbDesc("hero"),
      );
    }

    // 4. Bottom hero (loop per image)
    const bottomHeroImages = (shopData.bottomHeroImages as string[] | null) || [];
    const bottomHeroDescriptions: string[] = (() => {
      try { return JSON.parse(fbDesc("bottomHeroDescriptions")); } catch { return []; }
    })();
    const bottomHeroFeedbacks: string[] = (() => {
      try { return JSON.parse(fbDesc("bottomHeroFeedbacks")); } catch { return []; }
    })();
    for (let i = 0; i < bottomHeroImages.length; i++) {
      await generateShopImagePrompt(
        "bottom_hero_prompt", "shop bottom hero/promo image", "1200x400", "3:1",
        bottomHeroDescriptions[i] || "N/A", bottomHeroImages[i], i, bottomHeroFeedbacks[i] || fbDesc("bottomHero"),
      );
    }
  }

  // Part B: Template Design (Frame Foto Produk / Bingkai Produk Shopee — 1 per session)
  // Template design = frame/bingkai template yang dipakai untuk bungkus semua foto produk
  // supaya konsisten dan menarik (ada logo toko, decorative border, watermark).
  if (shop[0]) {
    const shopData = shop[0];
    const shopScore = scores.find((s) => s.itemType === "shop");
    const logoDescription = (shopScore?.feedback as Record<string, string> | null)?.logoDescription || (shopScore?.feedback as Record<string, string> | null)?.logo || "N/A";
    const visualAesthetics = (shopScore?.feedback as Record<string, string> | null)?.visualAesthetics || "Clean, professional, modern e-commerce aesthetic.";
    const brandColorPalette = (shopScore?.feedback as Record<string, string> | null)?.brandColorPalette || "Neutral tones with brand accent colors.";

    const prompt = `You are a Shopee product frame and template design expert. Generate a detailed, highly specific image generation prompt (in English) for a PRODUCT FRAME TEMPLATE (Bingkai Foto Produk Shopee) that will be used as a full-bleed overlay/border for a shop catalog.

Goal: Create a consistent, professional overlay template for all product photos in the shop, ensuring the referenced logo is centered inside a circular frame without obscuring the product area.

Shop Context & Brand Identity:
- Shop Name: "${shopData.shopName || "N/A"}"
- Shop Bio: ${shopData.shopBio || "N/A"}
- Logo description: ${logoDescription}
- Logo url: ${shopData.logoLocal || shopData.logoUrl || "N/A"}
- Visual Aesthetics: ${visualAesthetics}
- Brand Color Palette: ${brandColorPalette}

CRITICAL INSTRUCTIONS FOR THE PROMPT GENERATION:

1. CIRCULAR LOGO FRAME & UNTOUCHED LOGO:
- The template MUST feature a dedicated CIRCULAR (ROUND) EMBLEM/FRAME for the logo.
- The reference logo MUST be placed EXACTLY IN THE CENTER of this circular frame.
- The AI generator MUST treat the attached reference logo as an EXACT, UNTOUCHED REPLICA (no re-styling, no color changing, no filters, no shape alterations).
- Placement & Non-Obscurity: Place this circular logo frame strictly in a corner (e.g. top-left or top-center edge) integrated directly into the border structure. It MUST NOT overlap, intrude upon, or obscure the main product area in the center.

2. FULL-BLEED LAYOUT & EDGES:
- The frame border MUST touch all four edges (top, bottom, left, right) of the 1000x1000 square canvas with zero outer margin or padding.
- The outer perimeter must feature a sleek, razor-thin border frame using the brand color palette above.

3. BRANDING & TEXT:
- Include the exact shop name "${shopData.shopName || ""}" rendered in a clean, modern, high-end typeface that matches the shop's visual aesthetics (e.g. along the bottom border or opposite corner from the logo). This text is separate from the logo.

4. CLEAR & PROTECTED PRODUCT AREA:
- The central 70-75% area of the 1000x1000 canvas MUST remain completely clear, clean, and unobscured (soft light grey or studio white neutral mockup background) to ensure product photos fit perfectly without being covered by any frame elements or the logo.

5. NO AI SLOP / ZERO CLUTTER:
- STRICTLY NO promotional badges, NO discount ribbons, NO decorative flares, NO generic gradient glows, NO floral ornamentations.
- Use only purposeful, razor-sharp geometric lines, subtle corner accents, and high-end layout framing that match the shop's visual aesthetics.

6. BRAND IDENTITY ALIGNMENT:
- The frame design MUST align with the shop's visual aesthetics: ${visualAesthetics}
- The color palette MUST be restricted to the brand colors: ${brandColorPalette}
- Every design element must serve the brand identity — no generic or random decorations.

Generate ONLY the final English prompt text for an image generator (like Midjourney or DALL-E 3). Do not include introductory text, conversational filler, markdown code blocks, or explanations.`;

    const templateDesign = await callGeminiTextInternal(prompt, "template_design");
    if (templateDesign) {
      await addDraft({
        sessionId,
        productId: null,
        imageIndex: null,
        itemType: "shop",
        draftType: "template_design",
        content: templateDesign,
      });
      tickProgress("Generated template design draft");
    }
  }

  // Part C: Product photo prompts (per product, PER PHOTO — optimize each source photo)
  for (const product of products) {
    const productScore = scores.find(
      (s) => s.productId === product.id && s.itemType === "product",
    );
    const fb = (productScore?.feedback as Record<string, string> | null) || {};
    const photoFeedbacks: string[] = (() => {
      try { return JSON.parse(fb.photoFeedbacks || "[]"); } catch { return []; }
    })();
    const photoDescriptions: string[] = (() => {
      try { return JSON.parse(fb.photoDescriptions || "[]"); } catch { return []; }
    })();

    // Build unique photos list (same as analyzer)
    const thumbImg = (product as any).thumbnailLocal || (product as any).thumbnailUrl || null;
    const productImages = ((product as any).images as string[] | null) || [];
    const uniquePhotos = [...new Set([thumbImg, ...productImages.slice(0, 5)].filter(Boolean))] as string[];

    for (let pi = 0; pi < uniquePhotos.length; pi++) {
      const photoUrl = uniquePhotos[pi];
      const photoDesc = photoDescriptions[pi] || fb.photoDescription || "N/A";
      const photoFb = photoFeedbacks[pi] || fb.photo || "N/A";

      const prompt = `You are an expert Shopee product photographer and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this product's photo (photo ${pi + 1} of ${uniquePhotos.length}) for the Shopee marketplace.

Product Info:
- Title: ${product.title || "N/A"}
- Description: ${(product.description || "").slice(0, 500)}
- Categories: ${JSON.stringify(product.categories || [])}
- Photo Description: ${photoDesc}
- Photo Feedback: ${photoFb}
- Photo URL: ${photoUrl}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to replicate the EXACT product design, shape, color, and details accurately.
- MATCH THE SHOT TYPE AUTOMATICALLY: If the attached image is a lifestyle shot (featuring a model/hand wearing the product), maintain a model shot with the same pose/context. If the attached image is a product-only shot, keep it strictly as a standalone product shot without a model.
- Always refer to the reference photo as "the attached image" or "the attached product photo" (NEVER use technical filenames like image_0.png).
- OPTIMIZE VISUALS FOR SHOPEE: Upgrade dark or dull backgrounds into bright, high-end commercial studio settings (Korean aesthetic with clean soft-neutral tones), enhance metallic reflections and luster, refine soft studio lighting, and ensure pin-sharp macro focus on the product.
- SPECIFY output details: 1000x1000 pixels (1:1 aspect ratio), 8k resolution, photorealistic commercial product photography.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;

      const photoPrompt = await callGeminiTextInternal(prompt, `product_photo_prompt#${product.id}#${pi}`);
      if (photoPrompt) {
        await addDraft({
          sessionId,
          productId: product.id,
          imageIndex: pi,
          itemType: "product",
          draftType: "product_photo_prompt",
          content: photoPrompt,
        });
        tickProgress(`Generated product ${product.id} photo ${pi + 1} prompt`);
      }
    }
  }

  // Part D: Combine prompt (shop level, 1 per session — generic instruction to overlay frame + product photo)
  // User akan attach 2 image: frame template + optimized product photo → output = final catalog image
  if (shop[0]) {
    const prompt = `You are a Shopee catalog composition expert. Generate a detailed image generation prompt to COMBINE a product frame template with an optimized product photo.

WORKFLOW:
The user will attach 2 images when using this prompt:
1. Frame template image (the shop's product frame/bingkai — generated from template_design prompt)
2. Optimized product photo (generated from product_photo_prompt)

The prompt MUST instruct the image generator to:
- OVERLAY the frame template onto the product photo
- PLACE the product photo in the clear center area of the frame
- KEEP the frame's border, logo, decorative elements intact around the product
- ENSURE the product is NOT covered/obstructed by frame elements
- MAINTAIN both the frame's branding and the product's clarity
- Output a single combined image (frame + product photo merged seamlessly)

Generate a detailed prompt (in English) for an AI image generator to combine these 2 images into a final catalog image. Include:
- Explicit instruction to use both attached images (frame template + product photo)
- How to position/overlay them (product in center, frame as border overlay)
- How to handle transparency/blending
- Final output dimensions: 1000x1000 pixels
- Quality requirements (seamless merge, no artifacts, professional)

This is a GENERIC prompt — works for any product photo + frame combination from this shop. Respond with ONLY the prompt text (no JSON, no explanation).`;

    const combinePrompt = await callGeminiTextInternal(prompt, "combine_prompt");
    if (combinePrompt) {
      await addDraft({
        sessionId,
        productId: null,
        imageIndex: null,
        itemType: "shop",
        draftType: "combine_prompt",
        content: combinePrompt,
      });
      tickProgress("Generated combine prompt draft");
    }
  }

  console.log(`[drafts] session ${sessionId}: generated ${drafts.length} drafts`);
  return drafts.length;
}

// ─── POST /sessions/:id/generate-drafts — generate text drafts (bio, title, description) ──

router.post(
  "/sessions/:id/generate-drafts",
  requireAuth,
  requireManagement,
  async (c) => {
    const userId = getAuthUserId(c.get("jwtPayload") as any);
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

    // Cek session exists & status="done"
    const [session] = await db
      .select()
      .from(shopeeScrapeSessions)
      .where(eq(shopeeScrapeSessions.id, id));
    if (!session) {
      return c.json({ success: false, message: "Session not found" }, 404);
    }
    if (session.status !== "done") {
      return c.json(
        { success: false, message: "Session must be done before generating drafts" },
        400,
      );
    }

    const generated = await generateSessionDrafts(id);

    // Audit log
    await logAuditEvent({
      userId,
      action: "CREATE",
      entityType: "shopee_drafts",
      entityId: id,
      changes: { count: generated },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    return c.json({
      success: true,
      data: { generated },
    });
  },
);

// ─── POST /sessions/:id/reanalyze — re-run analysis + auto-regenerate suggestions ──

router.post(
  "/sessions/:id/reanalyze",
  requireAuth,
  requireManagement,
  async (c) => {
    const userId = getAuthUserId(c.get("jwtPayload") as any);
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

    const [session] = await db
      .select()
      .from(shopeeScrapeSessions)
      .where(eq(shopeeScrapeSessions.id, id));
    if (!session) {
      return c.json({ success: false, message: "Session not found" }, 404);
    }
    if (session.status !== "done") {
      return c.json(
        { success: false, message: "Session must be done before reanalyze" },
        400,
      );
    }

    try {
      console.log(`[shopeeOptimization] session ${id}: reanalyze started (background)`);
      // Set status to analyzing, reset startedAt, clear completedAt
      await db
        .update(shopeeScrapeSessions)
        .set({
          status: "analyzing",
          startedAt: new Date(),
          completedAt: null,
          errorReason: null,
          updatedAt: new Date(),
        })
        .where(eq(shopeeScrapeSessions.id, id));
      setProgress(id, { phase: "analyzing", step: 0, total: 1, message: "Starting analysis..." });

      // Audit log
      await logAuditEvent({
        userId,
        action: "UPDATE",
        entityType: "shopee_scrape_session",
        entityId: id,
        changes: { action: "reanalyze" },
        ipAddress: getClientIp(c),
        userAgent: getUserAgent(c),
      });

      // Run analysis + drafts in background (non-blocking)
      runReanalyze(id).catch((err) => {
        console.error(`[shopeeOptimization] session ${id}: background reanalyze failed:`, err);
      });

      // Return immediately — FE polls for progress
      return c.json({
        success: true,
        data: { reanalyzed: true, message: "Reanalyze started in background" },
      });
    } catch (err) {
      console.error(`[shopeeOptimization] session ${id}: reanalyze failed to start:`, err);
      setProgress(id, { phase: "error", step: 0, total: 1, message: err instanceof Error ? err.message : "Reanalyze failed" });
      // Restore status to done on error
      await db
        .update(shopeeScrapeSessions)
        .set({ status: "done", updatedAt: new Date() })
        .where(eq(shopeeScrapeSessions.id, id));
      return c.json({ success: false, message: err instanceof Error ? err.message : "Reanalyze failed" }, 500);
    }
  },
);

// ─── Background: reanalyze (analysis + draft generation) ───────────────────

async function runReanalyze(sessionId: number): Promise<void> {
  console.log(`[shopeeOptimization] session ${sessionId}: background reanalyze running...`);
  try {
    // Phase 1: Re-run analysis (score + verdict + descriptions)
    await analyzeSession(sessionId);
    console.log(`[shopeeOptimization] session ${sessionId}: reanalyze done, regenerating suggestions...`);
    setProgress(sessionId, { phase: "generating_drafts", step: 0, total: 1, message: "Regenerating suggestions..." });
    // Phase 2: Auto-regenerate suggestions
    const draftCount = await generateSessionDrafts(sessionId, (msg, step, total) => {
      setProgress(sessionId, { phase: "generating_drafts", step: step ?? 0, total: total ?? 1, message: msg });
    });
    console.log(`[shopeeOptimization] session ${sessionId}: regenerated ${draftCount} suggestions`);
    setProgress(sessionId, { phase: "done", step: 1, total: 1, message: `Completed · ${draftCount} suggestions` });
    // Restore status to done
    await db
      .update(shopeeScrapeSessions)
      .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(shopeeScrapeSessions.id, sessionId));
  } catch (err) {
    console.error(`[shopeeOptimization] session ${sessionId}: background reanalyze failed:`, err);
    setProgress(sessionId, { phase: "error", step: 0, total: 1, message: err instanceof Error ? err.message : "Reanalyze failed" });
    // Restore status to done on error
    await db
      .update(shopeeScrapeSessions)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(shopeeScrapeSessions.id, sessionId));
  } finally {
    // Clear progress after 30s (give FE time to fetch final state)
    setTimeout(() => clearProgress(sessionId), 30_000);
  }
}

// ─── PATCH /sessions/:id/drafts/:draftId — update draft status (approve/reject) ──

router.patch(
  "/sessions/:id/drafts/:draftId",
  requireAuth,
  requireManagement,
  async (c) => {
    const userId = getAuthUserId(c.get("jwtPayload") as any);
    const sessionId = Number(c.req.param("id"));
    const draftId = Number(c.req.param("draftId"));
    if (!sessionId || !draftId) {
      return c.json({ success: false, message: "Invalid id" }, 400);
    }

    const body = await c.req.json();
    const { status } = body as { status?: "pending" | "approved" | "rejected" };
    if (!status || !["pending", "approved", "rejected"].includes(status)) {
      return c.json({ success: false, message: "Invalid status" }, 400);
    }

    // Cek draft exists dulu
    const [existing] = await db
      .select()
      .from(shopeeDrafts)
      .where(eq(shopeeDrafts.id, draftId));
    if (!existing) {
      return c.json({ success: false, message: "Draft not found" }, 404);
    }

    // Update
    await db
      .update(shopeeDrafts)
      .set({ status })
      .where(eq(shopeeDrafts.id, draftId));

    const [updated] = await db
      .select()
      .from(shopeeDrafts)
      .where(eq(shopeeDrafts.id, draftId));

    await logAuditEvent({
      userId,
      action: "UPDATE",
      entityType: "shopee_draft",
      entityId: draftId,
      changes: { status },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    return c.json({ success: true, data: updated });
  },
);

// ─── POST /sessions/:id/drafts/:draftId/regenerate — regenerate single draft ──

router.post(
  "/sessions/:id/drafts/:draftId/regenerate",
  requireAuth,
  requireManagement,
  async (c) => {
    const userId = getAuthUserId(c.get("jwtPayload") as any);
    const sessionId = Number(c.req.param("id"));
    const draftId = Number(c.req.param("draftId"));
    if (!sessionId || !draftId) {
      return c.json({ success: false, message: "Invalid id" }, 400);
    }

    // Cek session status
    const [session] = await db
      .select()
      .from(shopeeScrapeSessions)
      .where(eq(shopeeScrapeSessions.id, sessionId));
    if (!session) {
      return c.json({ success: false, message: "Session not found" }, 404);
    }
    if (session.status !== "done") {
      return c.json(
        { success: false, message: "Session must be done before regenerating drafts" },
        400,
      );
    }

    // Cek draft exists
    const [existing] = await db
      .select()
      .from(shopeeDrafts)
      .where(eq(shopeeDrafts.id, draftId));
    if (!existing) {
      return c.json({ success: false, message: "Draft not found" }, 404);
    }

    try {
      const newContent = await regenerateDraftContent(sessionId, existing);
      if (!newContent) {
        return c.json({ success: false, message: "Failed to regenerate draft content" }, 500);
      }

      // Update draft content + reset status ke pending
      await db
        .update(shopeeDrafts)
        .set({ content: newContent, status: "pending", updatedAt: new Date() })
        .where(eq(shopeeDrafts.id, draftId));

      const [updated] = await db
        .select()
        .from(shopeeDrafts)
        .where(eq(shopeeDrafts.id, draftId));

      await logAuditEvent({
        userId,
        action: "UPDATE",
        entityType: "shopee_draft",
        entityId: draftId,
        changes: { regenerated: true },
        ipAddress: getClientIp(c),
        userAgent: getUserAgent(c),
      });

      console.log(`[drafts] draft ${draftId} regenerated (type=${existing.draftType})`);
      return c.json({ success: true, data: updated });
    } catch (err) {
      console.error(`[drafts] regenerate draft ${draftId} failed:`, err);
      return c.json({ success: false, message: err instanceof Error ? err.message : "Regenerate failed" }, 500);
    }
  },
);

// ─── Helper: call Gemini text (internal, via shared lib — no HTTP/auth needed) ──

async function callGeminiTextInternal(prompt: string, label?: string): Promise<string> {
  try {
    const result = await geminiText(prompt);
    const text = result.text.trim();
    if (!text) {
      console.warn(`[drafts] Gemini returned empty text for ${label || "draft"} (finishReason may be SAFETY or empty)`);
    }
    return text;
  } catch (err) {
    console.error(`[drafts] Gemini text call failed for ${label || "draft"}:`, err);
    return "";
  }
}

// ─── Helper: regenerate content untuk single draft ─────────────────────────
// Dipakai oleh endpoint POST /sessions/:id/drafts/:draftId/regenerate
// Reuse prompt logic per draftType — ambil data fresh dari DB, build prompt, call Gemini.

async function regenerateDraftContent(
  sessionId: number,
  draft: typeof shopeeDrafts.$inferSelect,
): Promise<string> {
  // Fetch fresh data
  const [shop, products, scores] = await Promise.all([
    db.select().from(shopeeShops).where(eq(shopeeShops.sessionId, sessionId)),
    db.select().from(shopeeProducts).where(eq(shopeeProducts.sessionId, sessionId)),
    db.select().from(shopeeScores).where(eq(shopeeScores.sessionId, sessionId)),
  ]);

  const shopData = shop[0];
  const shopScore = scores.find((s) => s.itemType === "shop");
  const fbDesc = (key: string) => (shopScore?.feedback as Record<string, string> | null)?.[key] || "N/A";
  const dt = draft.draftType;

  // ─── Shop bio ──────────────────────────────────────────────
  if (dt === "shop_bio" && shopData) {
    const prompt = `You are a Shopee store optimization expert. Generate an improved shop bio/description for this Shopee shop.

Current shop info:
- Name: ${shopData.shopName || "N/A"}
- Bio: ${shopData.shopBio || "N/A"}
- Stats: ${JSON.stringify(shopData.shopStats || {})}

Bio feedback: ${fbDesc("bio")}

Generate an optimized shop bio that:
- Is clear, professional, and engaging
- Contains relevant SEO keywords for Shopee search
- Is appropriate length (not too short, not too long)
- Reflects the shop's brand identity
- In Indonesian language (since this is Shopee Indonesia)

Respond with ONLY the bio text (no JSON, no explanation).`;
    return await callGeminiTextInternal(prompt, "shop_bio");
  }

  // ─── Shop image prompts (banner, logo, hero, bottom_hero) ──
  if ((dt === "banner_prompt" || dt === "logo_prompt" || dt === "hero_prompt" || dt === "bottom_hero_prompt") && shopData) {
    const visualAesthetics = fbDesc("visualAesthetics");
    const brandColorPalette = fbDesc("brandColorPalette");

    if (dt === "banner_prompt") {
      const bannerUrl = shopData.bannerLocal || shopData.bannerUrl || "N/A";
      const prompt = `You are an expert Shopee store branding specialist and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this store's shop banner/cover image for the Shopee marketplace.

Shop Info:
- Name: ${shopData.shopName || "N/A"}
- Bio: ${shopData.shopBio || "N/A"}
- Current Shop Banner Image Description: ${fbDesc("bannerDescription")}
- Current Shop Banner Image Feedback: ${fbDesc("banner")}
- Shop Banner Image URL: ${bannerUrl}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to preserve the exact content, branding, and visual identity.
- Always refer to the reference photo as "the attached image" or "the attached source photo" (NEVER use technical filenames like image_0.png).
- ADDRESS THE FEEDBACK: The generated prompt MUST explicitly address and fix the issues raised in the AI Feedback above.
- OPTIMIZE VISUALS & BRANDING FOR SHOPEE BANNER:
  - Upgrade the current layout into a high-converting, professional e-commerce shop banner optimized for a 1920x640 aspect ratio (3:1).
  - Include the shop name "${shopData.shopName || ""}" and tagline as clean, legible text elements.
  - Enhance background with modern, sophisticated aesthetic accents while maintaining the shop's brand identity.
  - Elevate lighting to create bright, commercial-grade visuals.
  - Ensure seamless composition with clear branding & messaging, matching a professional, modern e-commerce aesthetic.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;
      return await callGeminiTextInternal(prompt, "banner_prompt");
    }

    if (dt === "logo_prompt") {
      const logoUrl = shopData.logoLocal || shopData.logoUrl || "N/A";
      const prompt = `You are an expert Shopee store branding specialist and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this store's shop logo for the Shopee marketplace.

Shop Info:
- Name: ${shopData.shopName || "N/A"}
- Bio: ${shopData.shopBio || "N/A"}
- Current Shop Logo Image Description: ${fbDesc("logoDescription")}
- Current Shop Logo Image Feedback: ${fbDesc("logo")}
- Shop Logo Image URL: ${logoUrl}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to preserve the exact logo design, typography, and brand identity.
- Always refer to the reference photo as "the attached image" or "the attached source photo" (NEVER use technical filenames like image_0.png).
- ADDRESS THE FEEDBACK: The generated prompt MUST explicitly address and fix the issues raised in the AI Feedback above.
- OPTIMIZE VISUALS & BRANDING FOR SHOPEE LOGO:
  - Upgrade the current logo into a clear, recognizable, professional shop logo optimized for a 500x500 (1:1).
  - Ensure the logo is clearly readable and recognizable at small sizes (Shopee circular avatar format).
  - Maintain the shop's brand identity (colors, typography style, tone).
  - Enhance contrast, clarity, and visual impact for Shopee marketplace.
  - Strong brand representation with professional appearance.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;
      return await callGeminiTextInternal(prompt, "logo_prompt");
    }

    if (dt === "hero_prompt") {
      const heroImages = (shopData.heroImages as string[] | null) || [];
      const heroDescriptions: string[] = (() => {
        try { return JSON.parse(fbDesc("heroDescriptions")); } catch { return []; }
      })();
      const heroFeedbacks: string[] = (() => {
        try { return JSON.parse(fbDesc("heroFeedbacks")); } catch { return []; }
      })();
      const idx = draft.imageIndex ?? 0;
      const desc = heroDescriptions[idx] || "N/A";
      const url = heroImages[idx] || "N/A";
      const heroFb = heroFeedbacks[idx] || fbDesc("hero");
      const prompt = `You are an expert Shopee store branding specialist and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this store's shop hero/banner image for the Shopee marketplace.

Shop Info:
- Name: ${shopData.shopName || "N/A"}
- Bio: ${shopData.shopBio || "N/A"}
- Current Shop Hero Image Description: ${desc}
- Current Shop Hero Image Feedback: ${heroFb}
- Shop Hero Image URL: ${url}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to preserve the exact product design, material texture, structure, and refined craftsmanship.
- Always refer to the reference photo as "the attached image" or "the attached source photo" (NEVER use technical filenames like image_0.png).
- MATCH THE SHOT CONTEXT AUTOMATICALLY: If the attached image features a model, maintain a model lifestyle shot with the same pose/context. If the attached image is product-only, maintain a standalone product shot without a model.
- ADDRESS THE FEEDBACK: The generated prompt MUST explicitly address and fix the issues raised in the AI Feedback above.
- OPTIMIZE VISUALS & BRANDING FOR SHOPEE HERO BANNER:
  - Upgrade the current layout into a high-converting, professional e-commerce hero banner optimized for a 1200x600 aspect ratio (2:1).
  - Enhance dark/stark background elements with modern, sophisticated aesthetic accents (such as soft architectural shadows, elegant silk or marble textures, or refined neutral/warm lighting) while maintaining the shop's sleek, minimalist identity.
  - Elevate lighting to create bright, commercial-grade highlights on the product materials, clarity, and luster.
  - Ensure seamless composition with room for clean, legible shop branding elements ("${shopData.shopName || "N/A"}") if rendered, matching a luxurious, modern, and high-end Korean aesthetic.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;
      return await callGeminiTextInternal(prompt, `hero_prompt#${idx}`);
    }

    if (dt === "bottom_hero_prompt") {
      const bottomHeroImages = (shopData.bottomHeroImages as string[] | null) || [];
      const bottomHeroDescriptions: string[] = (() => {
        try { return JSON.parse(fbDesc("bottomHeroDescriptions")); } catch { return []; }
      })();
      const bottomHeroFeedbacks: string[] = (() => {
        try { return JSON.parse(fbDesc("bottomHeroFeedbacks")); } catch { return []; }
      })();
      const idx = draft.imageIndex ?? 0;
      const desc = bottomHeroDescriptions[idx] || "N/A";
      const url = bottomHeroImages[idx] || "N/A";
      const bhFb = bottomHeroFeedbacks[idx] || fbDesc("bottomHero");
      const prompt = `You are an expert Shopee store branding specialist and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this store's shop bottom hero/promo image for the Shopee marketplace.

Shop Info:
- Name: ${shopData.shopName || "N/A"}
- Bio: ${shopData.shopBio || "N/A"}
- Current Shop Bottom Hero Image Description: ${desc}
- AI Feedback: ${bhFb}
- Shop Bottom Hero Image URL: ${url}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to preserve the exact product design, material texture, structure, and refined craftsmanship.
- Always refer to the reference photo as "the attached image" or "the attached source photo" (NEVER use technical filenames like image_0.png).
- MATCH THE SHOT CONTEXT AUTOMATICALLY: If the attached image features a model, maintain a model lifestyle shot with the same pose/context. If the attached image is product-only, maintain a standalone product shot without a model.
- ADDRESS THE AI FEEDBACK: The generated prompt MUST explicitly address and fix the issues raised in the AI Feedback above.
- OPTIMIZE VISUALS & BRANDING FOR SHOPEE BOTTOM HERO PROMO:
  - Upgrade the current layout into a high-converting, professional e-commerce promo banner optimized for a 1200x400 aspect ratio (3:1).
  - Enhance dark/stark background elements with modern, sophisticated aesthetic accents (such as soft architectural shadows, elegant silk or marble textures, or refined neutral/warm lighting) while maintaining the shop's sleek, minimalist identity.
  - Elevate lighting to create bright, commercial-grade highlights on the product materials, clarity, and luster.
  - Ensure seamless composition with room for clean, legible shop branding elements ("${shopData.shopName || "N/A"}") and promo messaging if rendered, matching a luxurious, modern, and high-end Korean aesthetic.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;
      return await callGeminiTextInternal(prompt, `bottom_hero_prompt#${idx}`);
    }
  }

  // ─── Template design (frame) ───────────────────────────────
  if (dt === "template_design" && shopData) {
    const logoDescription = fbDesc("logoDescription") || fbDesc("logo");
    const visualAesthetics = fbDesc("visualAesthetics");
    const brandColorPalette = fbDesc("brandColorPalette");
    const prompt = `You are a Shopee product frame and template design expert. Generate a detailed, highly specific image generation prompt (in English) for a PRODUCT FRAME TEMPLATE (Bingkai Foto Produk Shopee) that will be used as a full-bleed overlay/border for a shop catalog.

Goal: Create a consistent, professional overlay template for all product photos in the shop, ensuring the referenced logo is centered inside a circular frame without obscuring the product area.

Shop Context & Brand Identity:
- Shop Name: "${shopData.shopName || "N/A"}"
- Shop Bio: ${shopData.shopBio || "N/A"}
- Logo description: ${logoDescription}
- Logo url: ${shopData.logoLocal || shopData.logoUrl || "N/A"}
- Visual Aesthetics: ${visualAesthetics}
- Brand Color Palette: ${brandColorPalette}

CRITICAL INSTRUCTIONS FOR THE PROMPT GENERATION:

1. CIRCULAR LOGO FRAME & UNTOUCHED LOGO:
- The template MUST feature a dedicated CIRCULAR (ROUND) EMBLEM/FRAME for the logo.
- The reference logo MUST be placed EXACTLY IN THE CENTER of this circular frame.
- The AI generator MUST treat the attached reference logo as an EXACT, UNTOUCHED REPLICA (no re-styling, no color changing, no filters, no shape alterations).
- Placement & Non-Obscurity: Place this circular logo frame strictly in a corner (e.g. top-left or top-center edge) integrated directly into the border structure. It MUST NOT overlap, intrude upon, or obscure the main product area in the center.

2. FULL-BLEED LAYOUT & EDGES:
- The frame border MUST touch all four edges (top, bottom, left, right) of the 1000x1000 square canvas with zero outer margin or padding.
- The outer perimeter must feature a sleek, razor-thin border frame using the brand color palette above.

3. BRANDING & TEXT:
- Include the exact shop name "${shopData.shopName || ""}" rendered in a clean, modern, high-end typeface that matches the shop's visual aesthetics (e.g. along the bottom border or opposite corner from the logo). This text is separate from the logo.

4. CLEAR & PROTECTED PRODUCT AREA:
- The central 70-75% area of the 1000x1000 canvas MUST remain completely clear, clean, and unobscured (soft light grey or studio white neutral mockup background) to ensure product photos fit perfectly without being covered by any frame elements or the logo.

5. NO AI SLOP / ZERO CLUTTER:
- STRICTLY NO promotional badges, NO discount ribbons, NO decorative flares, NO generic gradient glows, NO floral ornamentations.
- Use only purposeful, razor-sharp geometric lines, subtle corner accents, and high-end layout framing that match the shop's visual aesthetics.

6. BRAND IDENTITY ALIGNMENT:
- The frame design MUST align with the shop's visual aesthetics: ${visualAesthetics}
- The color palette MUST be restricted to the brand colors: ${brandColorPalette}
- Every design element must serve the brand identity — no generic or random decorations.

Generate ONLY the final English prompt text for an image generator (like Midjourney or DALL-E 3). Do not include introductory text, conversational filler, markdown code blocks, or explanations.`;
    return await callGeminiTextInternal(prompt, "template_design");
  }

  // ─── Combine prompt ────────────────────────────────────────
  if (dt === "combine_prompt" && shopData) {
    const prompt = `You are an expert AI image prompt engineer for Shopee product catalog composition.

Generate a detailed image generation prompt (in English) that COMBINES a product frame template with an optimized product photo into a final Shopee catalog image.

Context:
- Shop name: "${shopData.shopName || "N/A"}"
- The user will attach 2 images:
  1. Image 1 = the catalog frame template (generated from the template_design prompt)
  2. Image 2 = the optimized product photo (generated from the product_photo_prompt)

The prompt MUST instruct the AI image generator to:
- Use Image 1 (frame template) as the FOREGROUND overlay
- Use Image 2 (optimized product photo) as the BACKGROUND/base image
- Place the product (Image 2) in the CENTER of the frame's clear area (Image 1)
- Keep the frame border, logo emblem, and shop name text visible and unobstructed
- Ensure the product is NOT obstructed by any frame element
- Produce a seamless 1000x1000 final Shopee catalog image
- Maintain the product's accurate appearance (color, shape, details)
- Match lighting and composition between frame and product

This is a GENERIC prompt — works for any product photo + frame combination from this shop. Respond with ONLY the prompt text (no JSON, no explanation).`;
    return await callGeminiTextInternal(prompt, "combine_prompt");
  }

  // ─── Product drafts (title, description, photo prompt) ─────
  if (dt === "product_title" || dt === "product_description" || dt === "product_photo_prompt") {
    const product = products.find((p) => p.id === draft.productId);
    if (!product) return "";
    const productScore = scores.find((s) => s.productId === product.id && s.itemType === "product");
    const fb = (productScore?.feedback as Record<string, string> | null) || {};
    const fbPhoto = fb.photo || "N/A";
    const photoDescription = fb.photoDescription || fbPhoto;

    // Per-photo feedback/description arrays
    const photoFeedbacks: string[] = (() => {
      try { return JSON.parse(fb.photoFeedbacks || "[]"); } catch { return []; }
    })();
    const photoDescriptions: string[] = (() => {
      try { return JSON.parse(fb.photoDescriptions || "[]"); } catch { return []; }
    })();
    const thumbImg = (product as any).thumbnailLocal || (product as any).thumbnailUrl || null;
    const productImages = ((product as any).images as string[] | null) || [];
    const uniquePhotos = [...new Set([thumbImg, ...productImages.slice(0, 5)].filter(Boolean))] as string[];
    const imgIdx = draft.imageIndex ?? 0;
    const perPhotoDesc = photoDescriptions[imgIdx] || photoDescription;
    const perPhotoFb = photoFeedbacks[imgIdx] || fbPhoto;
    const perPhotoUrl = uniquePhotos[imgIdx] || (product as any).thumbnailLocal || (product as any).thumbnailUrl || "N/A";

    if (dt === "product_title") {
      const prompt = `You are a Shopee product optimization expert. Generate an improved product title for this Shopee product.

Current product info:
- Title: ${product.title || "N/A"}
- Description: ${(product.description || "").slice(0, 500)}
- Categories: ${JSON.stringify(product.categories || [])}

Title feedback: ${(productScore?.feedback as Record<string, string> | null)?.title || "N/A"}

Generate an optimized product title that:
- Is clear, descriptive, and professional
- Contains relevant keywords for Shopee search
- Is appropriate length (not too short, not too long)
- In Indonesian language (since this is Shopee Indonesia)

Respond with ONLY the title text (no JSON, no explanation).`;
      return await callGeminiTextInternal(prompt, `product_title#${product.id}`);
    }

    if (dt === "product_description") {
      const prompt = `You are a Shopee product optimization expert. Generate an improved product description for this Shopee product.

Current product info:
- Title: ${product.title || "N/A"}
- Description: ${(product.description || "").slice(0, 1000)}
- Categories: ${JSON.stringify(product.categories || [])}

Description feedback: ${(productScore?.feedback as Record<string, string> | null)?.description || "N/A"}

Generate an optimized product description that:
- Is clear, professional, and engaging
- Highlights key features and benefits
- Contains relevant keywords for SEO
- Is appropriate length
- In Indonesian language (since this is Shopee Indonesia)

Respond with ONLY the description text (no JSON, no explanation).`;
      return await callGeminiTextInternal(prompt, `product_description#${product.id}`);
    }

    if (dt === "product_photo_prompt") {
      const prompt = `You are an expert Shopee product photographer and AI prompt engineer.

Generate a detailed image generation prompt to OPTIMIZE this product's photo (photo ${imgIdx + 1} of ${uniquePhotos.length}) for the Shopee marketplace.

Product Info:
- Title: ${product.title || "N/A"}
- Description: ${(product.description || "").slice(0, 500)}
- Categories: ${JSON.stringify(product.categories || [])}
- Photo Description: ${perPhotoDesc}
- Photo Feedback: ${perPhotoFb}
- Photo URL: ${perPhotoUrl}

CRITICAL — SOURCE IMAGE REFERENCE & ADAPTIVE CONTEXT:
The generated prompt MUST explicitly instruct the AI image generator to:
- USE the attached image as the primary visual reference to replicate the EXACT product design, shape, color, and details accurately.
- MATCH THE SHOT TYPE AUTOMATICALLY: If the attached image is a lifestyle shot (featuring a model/hand wearing the product/ear wearing the product/any human body part wearing the product), maintain a model shot with the same pose/context. If the attached image is a product-only shot, keep it strictly as a standalone product shot without a model.
- Always refer to the reference photo as "the attached image" or "the attached product photo" (NEVER use technical filenames like image_0.png).
- OPTIMIZE VISUALS FOR SHOPEE: high-end commercial studio settings (Korean aesthetic with clean soft-neutral tones), enhance metallic reflections and luster, refine soft studio lighting, and ensure pin-sharp macro focus on the product.
- SPECIFY output details: 1000x1000 pixels (1:1 aspect ratio), 8k resolution, photorealistic commercial product photography.

Output Requirement: Respond with ONLY the finalized prompt text in English (no intro, no markdown explanation, no JSON).`;
      return await callGeminiTextInternal(prompt, `product_photo_prompt#${product.id}#${imgIdx}`);
    }
  }

  // Unknown draft type or missing data
  console.warn(`[drafts] regenerate: unknown draft type "${dt}" or missing data`);
  return "";
}

// ─── PBI-4.5: POST /sessions/:id/generate-template-prompt ──────────────────
// Generate prompt untuk image generation (banner/logo) dari shop style profile.
// User copy prompt ini ke Gemini web (gemini.google.com) untuk generate image.

router.post(
  "/sessions/:id/generate-template-prompt",
  requireAuth,
  requireManagement,
  async (c) => {
    const userId = getAuthUserId(c.get("jwtPayload") as any);
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

    const [session] = await db
      .select()
      .from(shopeeScrapeSessions)
      .where(eq(shopeeScrapeSessions.id, id));
    if (!session) {
      return c.json({ success: false, message: "Session not found" }, 404);
    }
    if (session.status !== "done") {
      return c.json(
        { success: false, message: "Session must be done before generating template prompt" },
        400,
      );
    }

    // Fetch shop + scores
    const [shop, scores] = await Promise.all([
      db.select().from(shopeeShops).where(eq(shopeeShops.sessionId, id)),
      db
        .select()
        .from(shopeeScores)
        .where(and(eq(shopeeScores.sessionId, id), eq(shopeeScores.itemType, "shop"))),
    ]);

    if (!shop[0]) {
      return c.json({ success: false, message: "Shop data not found" }, 404);
    }

    const shopData = shop[0];
    const shopScore = scores[0];

    const prompt = `You are a Shopee store branding expert. Generate a detailed image generation prompt for a new shop banner/cover image.

Current shop info:
- Name: ${shopData.shopName || "N/A"}
- Bio: ${shopData.shopBio || "N/A"}
- Stats: ${JSON.stringify(shopData.shopStats || {})}
- Current banner score: ${shopScore?.bannerScore || "N/A"}/100
- Banner feedback: ${shopScore?.feedback?.banner || "N/A"}

Generate a detailed prompt (in English) for an AI image generator (like Gemini/DALL-E/Midjourney) to create a professional Shopee shop banner. Include:
- Style (modern, professional, etc.)
- Color palette
- Layout description
- Text elements (shop name, tagline)
- Dimensions (Shopee banner: 1920x640 or similar)
- Mood/tone

Respond with ONLY the prompt text (no JSON, no explanation).`;

    const templatePrompt = await callGeminiTextInternal(prompt);
    if (!templatePrompt) {
      return c.json({ success: false, message: "Failed to generate template prompt" }, 500);
    }

    // Hapus template_prompt lama
    await db
      .delete(shopeeDrafts)
      .where(
        and(
          eq(shopeeDrafts.sessionId, id),
          eq(shopeeDrafts.draftType, "template_prompt"),
        ),
      );

    // Save ke DB
    await db.insert(shopeeDrafts).values({
      sessionId: id,
      productId: null,
      imageIndex: null,
      itemType: "shop",
      draftType: "template_prompt",
      content: templatePrompt,
    });

    // Get last inserted draft
    const [draft] = await db
      .select()
      .from(shopeeDrafts)
      .where(
        and(
          eq(shopeeDrafts.sessionId, id),
          eq(shopeeDrafts.draftType, "template_prompt"),
        ),
      )
      .orderBy(desc(shopeeDrafts.id))
      .limit(1);

    await logAuditEvent({
      userId,
      action: "CREATE",
      entityType: "shopee_template_prompt",
      entityId: id,
      changes: { generated: true },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    return c.json({ success: true, data: draft });
  },
);

// ─── PBI-4.5: POST /sessions/:id/regenerate-template-prompt ────────────────
// Regenerate template prompt dengan custom input dari user.

router.post(
  "/sessions/:id/regenerate-template-prompt",
  requireAuth,
  requireManagement,
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

    const body = await c.req.json();
    const { custom_input } = body as { custom_input?: string };
    if (!custom_input) {
      return c.json({ success: false, message: "custom_input is required" }, 400);
    }

    const [shop] = await db
      .select()
      .from(shopeeShops)
      .where(eq(shopeeShops.sessionId, id));
    if (!shop) {
      return c.json({ success: false, message: "Shop data not found" }, 404);
    }

    const prompt = `You are a Shopee store branding expert. Generate a detailed image generation prompt for a new shop banner/cover image.

Shop info:
- Name: ${shop.shopName || "N/A"}
- Bio: ${shop.shopBio || "N/A"}

User's custom requirements: "${custom_input}"

Generate a detailed prompt (in English) for an AI image generator. Include style, color palette, layout, text elements, dimensions, mood.

Respond with ONLY the prompt text.`;

    const templatePrompt = await callGeminiTextInternal(prompt);
    if (!templatePrompt) {
      return c.json({ success: false, message: "Failed to regenerate template prompt" }, 500);
    }

    // Hapus template_prompt lama, insert baru
    await db
      .delete(shopeeDrafts)
      .where(
        and(
          eq(shopeeDrafts.sessionId, id),
          eq(shopeeDrafts.draftType, "template_prompt"),
        ),
      );

    await db.insert(shopeeDrafts).values({
      sessionId: id,
      productId: null,
      imageIndex: null,
      itemType: "shop",
      draftType: "template_prompt",
      content: templatePrompt,
    });

    const [draft] = await db
      .select()
      .from(shopeeDrafts)
      .where(
        and(
          eq(shopeeDrafts.sessionId, id),
          eq(shopeeDrafts.draftType, "template_prompt"),
        ),
      )
      .orderBy(desc(shopeeDrafts.id))
      .limit(1);

    return c.json({ success: true, data: draft });
  },
);

// ─── PBI-4.5: POST /sessions/:id/upload-template (multipart) ───────────────
// Upload template image hasil generate dari Gemini web.

router.post(
  "/sessions/:id/upload-template",
  requireAuth,
  requireManagement,
  async (c) => {
    const userId = getAuthUserId(c.get("jwtPayload") as any);
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ success: false, message: "Body harus multipart/form-data" }, 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ success: false, message: "Field 'file' wajib diisi" }, 400);
    }
    if (file.size <= 0) {
      return c.json({ success: false, message: "File kosong" }, 400);
    }
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ success: false, message: "Ukuran file maksimal 10MB" }, 413);
    }

    const { extname } = await import("path");
    const { UPLOAD_DIR } = await import("./uploads");
    const { join } = await import("path");
    const ext = extname(file.name || "").toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
      return c.json({ success: false, message: "Tipe file tidak didukung" }, 415);
    }

    const name = `${crypto.randomUUID()}${ext}`;
    await Bun.write(join(UPLOAD_DIR, name), file);
    const imageUrl = `/uploads/${name}`;

    // Save ke DB sebagai composite_prompt draft (atau template_prompt dengan image)
    // Update template_prompt draft dengan generatedImageUrl
    const [existingDraft] = await db
      .select()
      .from(shopeeDrafts)
      .where(
        and(
          eq(shopeeDrafts.sessionId, id),
          eq(shopeeDrafts.draftType, "template_prompt"),
        ),
      );

    if (existingDraft) {
      // Update existing draft dengan image URL
      await db
        .update(shopeeDrafts)
        .set({ generatedImageUrl: imageUrl })
        .where(eq(shopeeDrafts.id, existingDraft.id));
    } else {
      // Insert baru
      await db.insert(shopeeDrafts).values({
        sessionId: id,
        productId: null,
        imageIndex: null,
        itemType: "shop",
        draftType: "template_prompt",
        content: null,
        generatedImageUrl: imageUrl,
      });
    }

    await logAuditEvent({
      userId,
      action: "CREATE",
      entityType: "shopee_template_upload",
      entityId: id,
      changes: { filename: name },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    return c.json({
      success: true,
      data: { url: imageUrl, size: file.size, contentType: file.type },
    });
  },
);

// ─── PBI-4.6: POST /sessions/:id/generate-composite-prompts ────────────────
// Generate composite prompts untuk product photos (overlay product ke template).
// Body: { product_ids: [1, 2, 3] } — pilih produk yang mau di-generate prompt-nya.

router.post(
  "/sessions/:id/generate-composite-prompts",
  requireAuth,
  requireManagement,
  async (c) => {
    const userId = getAuthUserId(c.get("jwtPayload") as any);
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

    const body = await c.req.json();
    const { product_ids } = body as { product_ids?: number[] };
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return c.json({ success: false, message: "product_ids is required (non-empty array)" }, 400);
    }

    // Fetch template prompt (kalau ada) + products
    const [templateDraft, products] = await Promise.all([
      db
        .select()
        .from(shopeeDrafts)
        .where(
          and(
            eq(shopeeDrafts.sessionId, id),
            eq(shopeeDrafts.draftType, "template_prompt"),
          ),
        ),
      db.select().from(shopeeProducts).where(eq(shopeeProducts.sessionId, id)),
    ]);

    const templatePrompt = templateDraft[0]?.content || "";
    const templateImageUrl = templateDraft[0]?.generatedImageUrl || null;

    const selectedProducts = products.filter((p) => product_ids.includes(p.id));
    if (selectedProducts.length === 0) {
      return c.json({ success: false, message: "No matching products found" }, 404);
    }

    const drafts: Array<{
      sessionId: number;
      productId: number;
      itemType: "product";
      draftType: "composite_prompt";
      content: string;
    }> = [];

    for (const product of selectedProducts) {
      const prompt = `You are a Shopee product photography expert. Generate a composite image prompt for this product.

Product info:
- Title: ${product.title || "N/A"}
- Description: ${(product.description || "").slice(0, 500)}
- Categories: ${JSON.stringify(product.categories || [])}

Template prompt (shop style): ${templatePrompt || "(no template — generate fresh)"}
${templateImageUrl ? `Template image: ${templateImageUrl}` : ""}

Generate a detailed prompt (in English) for an AI image generator to create a composite product photo that:
- Places the product in a professional context
- Matches the shop's visual style
- Appropriate for Shopee marketplace
- High quality, well-lit, professional

Respond with ONLY the prompt text.`;

      const compositePrompt = await callGeminiTextInternal(prompt);
      if (compositePrompt) {
        drafts.push({
          sessionId: id,
          productId: product.id,
          imageIndex: null,
          itemType: "product",
          draftType: "composite_prompt",
          content: compositePrompt,
        });
      }
    }

    // Hapus composite_prompt lama untuk product_ids ini
    if (product_ids.length > 0) {
      const { inArray } = await import("drizzle-orm");
      await db
        .delete(shopeeDrafts)
        .where(
          and(
            eq(shopeeDrafts.sessionId, id),
            eq(shopeeDrafts.draftType, "composite_prompt"),
            inArray(shopeeDrafts.productId, product_ids),
          ),
        );
    }

    // Save ke DB
    if (drafts.length > 0) {
      await db.insert(shopeeDrafts).values(drafts);
    }

    await logAuditEvent({
      userId,
      action: "CREATE",
      entityType: "shopee_composite_prompts",
      entityId: id,
      changes: { count: drafts.length, product_ids },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    return c.json({
      success: true,
      data: { generated: drafts.length, drafts },
    });
  },
);

// ─── PBI-4.7: GET /sessions/:id/export — export text drafts (JSON + CSV) ────

router.get(
  "/sessions/:id/export",
  requireAuth,
  requireManagement,
  async (c) => {
    const userId = getAuthUserId(c.get("jwtPayload") as any);
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ success: false, message: "Invalid id" }, 400);

    const format = c.req.query("format") || "json"; // json | csv

    const [session] = await db
      .select()
      .from(shopeeScrapeSessions)
      .where(eq(shopeeScrapeSessions.id, id));
    if (!session) {
      return c.json({ success: false, message: "Session not found" }, 404);
    }

    // Fetch shop, products, scores, drafts
    const [shop, products, scores, drafts] = await Promise.all([
      db.select().from(shopeeShops).where(eq(shopeeShops.sessionId, id)),
      db.select().from(shopeeProducts).where(eq(shopeeProducts.sessionId, id)),
      db.select().from(shopeeScores).where(eq(shopeeScores.sessionId, id)),
      db.select().from(shopeeDrafts).where(eq(shopeeDrafts.sessionId, id)),
    ]);

    const exportData = {
      session: {
        id: session.id,
        profileId: session.profileId,
        profileName: session.profileName,
        status: session.status,
        shopUrl: session.shopUrl,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      },
      shop: shop[0] || null,
      products: products.map((p) => ({
        id: p.id,
        productId: p.productId,
        title: p.title,
        description: p.description,
        price: p.price,
        productUrl: p.productUrl,
        thumbnailLocal: p.thumbnailLocal,
      })),
      scores: scores.map((s) => ({
        itemType: s.itemType,
        productId: s.productId,
        totalScore: s.totalScore,
        verdict: s.verdict,
        bannerScore: s.bannerScore,
        logoScore: s.logoScore,
        bioScore: s.bioScore,
        titleScore: s.titleScore,
        descriptionScore: s.descriptionScore,
        photoScore: s.photoScore,
        feedback: s.feedback,
      })),
      drafts: drafts.map((d) => ({
        id: d.id,
        itemType: d.itemType,
        productId: d.productId,
        draftType: d.draftType,
        content: d.content,
        generatedImageUrl: d.generatedImageUrl,
        status: d.status,
      })),
    };

    await logAuditEvent({
      userId,
      action: "EXPORT",
      entityType: "shopee_session_export",
      entityId: id,
      changes: { format },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    if (format === "csv") {
      // Export sebagai CSV (text drafts only — shop bio + product titles + descriptions)
      const rows: string[] = [];
      rows.push("Type,Product ID,Field,Content,Status");

      for (const d of drafts) {
        const type = d.itemType;
        const productId = d.productId || "";
        const field = d.draftType;
        const content = (d.content || "").replace(/"/g, '""').replace(/\n/g, " ");
        const status = d.status;
        rows.push(`"${type}","${productId}","${field}","${content}","${status}"`);
      }

      const csv = rows.join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="shopee-session-${id}-export.csv"`,
        },
      });
    }

    // Default: JSON
    return c.json({
      success: true,
      data: exportData,
    });
  },
);

// ─── POST /sessions/:id/verify-resume — user sudah verify anti-bot, lanjutkan scrape ──

router.post("/sessions/:id/verify-resume", requireAuth, requireManagement, async (c) => {
  const sessionId = Number(c.req.param("id"));
  if (!sessionId) return c.json({ success: false, message: "Invalid id" }, 400);

  // 1. Resolve pending verify promise (onVerifyWait callback)
  const resolveVerify = pendingVerifyResolvers.get(sessionId);
  if (resolveVerify) {
    pendingVerifyResolvers.delete(sessionId);
    resolveVerify();
  }

  // 2. Send "resume" to worker stdin via scraperBridge
  const resumed = resumeWorker(sessionId);
  if (!resumed) {
    return c.json({ success: false, message: "No active worker for this session" }, 404);
  }

  // 3. Reset session status to scraping
  await db.update(shopeeScrapeSessions).set({
    status: "scraping",
    errorReason: null,
    updatedAt: new Date(),
  }).where(eq(shopeeScrapeSessions.id, sessionId));

  console.log(`[shopeeOptimization] session ${sessionId}: verify-resume, worker resumed`);
  return c.json({ success: true, message: "Worker resumed after verify" });
});

export default router;
