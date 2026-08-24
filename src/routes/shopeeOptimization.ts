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
import { scrapePublicShopViaWorker, scrapeProductDetailsViaWorker } from "../lib/scraperBridge";
import { analyzeSession } from "../lib/shopeeAnalyzer";
import { geminiText } from "../lib/gemini";

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

  try {
    // Phase 1: Scrape public shop page via Node worker
    console.log(`[shopeeOptimization] session ${sessionId}: scraping public shop...`);
    const { shop, products: shopProducts } = await scrapePublicShopViaWorker(cdpWsUrl, shopUrl);

    // Phase 1b: Scrape product detail pages (jika ada product URLs)
    let productDetails: any[] = [];
    if (shopProducts && shopProducts.length > 0) {
      const productUrls = shopProducts.map((p: any) => p.productUrl).filter(Boolean);
      if (productUrls.length > 0) {
        console.log(`[shopeeOptimization] session ${sessionId}: scraping ${productUrls.length} product details...`);
        productDetails = await scrapeProductDetailsViaWorker(cdpWsUrl, productUrls);
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

    // Phase 2: Analyze (score + verdict)
    await analyzeSession(sessionId);

    // Done
    await db
      .update(shopeeScrapeSessions)
      .set({
        status: "done",
        completedAt: new Date(),
      })
      .where(eq(shopeeScrapeSessions.id, sessionId));

    console.log(`[shopeeOptimization] session ${sessionId}: done`);
  } catch (err) {
    console.error(`[shopeeOptimization] session ${sessionId}: failed:`, err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

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

    // Fetch shop + products + scores
    const [shop, products, scores] = await Promise.all([
      db.select().from(shopeeShops).where(eq(shopeeShops.sessionId, id)),
      db.select().from(shopeeProducts).where(eq(shopeeProducts.sessionId, id)),
      db.select().from(shopeeScores).where(eq(shopeeScores.sessionId, id)),
    ]);

    const drafts: Array<{
      sessionId: number;
      productId: number | null;
      itemType: "shop" | "product";
      draftType: "shop_bio" | "product_title" | "product_description";
      content: string;
    }> = [];

    // Generate shop bio draft (kalau shop ada)
    if (shop[0]) {
      const shopData = shop[0];
      const shopScore = scores.find((s) => s.itemType === "shop");

      const prompt = `You are a Shopee store optimization expert. Generate an optimized shop bio/description for this Shopee store.

Current shop info:
- Name: ${shopData.shopName || "N/A"}
- Current bio: ${shopData.shopBio || "(empty)"}
- Stats: ${JSON.stringify(shopData.shopStats || {})}
- Current bio score: ${shopScore?.bioScore || "N/A"}/100
- Bio feedback: ${shopScore?.feedback?.bio || "N/A"}

Generate 1 optimized shop bio (max 200 characters) that:
- Clear & professional
- Contains relevant keywords for Shopee search
- Highlights shop's strengths
- Appropriate tone for Indonesian marketplace

Respond with ONLY the bio text (no JSON, no explanation).`;

      const bioDraft = await callGeminiTextInternal(prompt);
      if (bioDraft) {
        drafts.push({
          sessionId: id,
          productId: null,
          itemType: "shop",
          draftType: "shop_bio",
          content: bioDraft,
        });
      }
    }

    // Generate product title & description drafts
    for (const product of products) {
      const productScore = scores.find(
        (s) => s.productId === product.id && s.itemType === "product",
      );

      // Title draft
      if (product.title) {
        const prompt = `You are a Shopee product optimization expert. Generate an optimized product title for this Shopee product.

Current product info:
- Title: ${product.title}
- Price: ${product.price || "N/A"}
- Categories: ${JSON.stringify(product.categories || [])}
- Current title score: ${productScore?.titleScore || "N/A"}/100
- Title feedback: ${productScore?.feedback?.title || "N/A"}

Generate 1 optimized product title (max 120 characters) that:
- Clear & descriptive
- Contains relevant keywords for Shopee search
- Professional tone
- Appropriate length

Respond with ONLY the title text (no JSON, no explanation).`;

        const titleDraft = await callGeminiTextInternal(prompt);
        if (titleDraft) {
          drafts.push({
            sessionId: id,
            productId: product.id,
            itemType: "product",
            draftType: "product_title",
            content: titleDraft,
          });
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
- Current description score: ${productScore?.descriptionScore || "N/A"}/100
- Description feedback: ${productScore?.feedback?.description || "N/A"}

Generate 1 optimized product description (max 1000 characters) that:
- Clear & informative
- Contains product specifications
- Professional tone
- Contains relevant keywords
- Easy to read (use bullet points if appropriate)

Respond with ONLY the description text (no JSON, no explanation).`;

        const descDraft = await callGeminiTextInternal(prompt);
        if (descDraft) {
          drafts.push({
            sessionId: id,
            productId: product.id,
            itemType: "product",
            draftType: "product_description",
            content: descDraft,
          });
        }
      }
    }

    // Hapus drafts lama (kalau ada) sebelum insert baru
    await db
      .delete(shopeeDrafts)
      .where(eq(shopeeDrafts.sessionId, id));

    // Save drafts to DB
    if (drafts.length > 0) {
      await db.insert(shopeeDrafts).values(drafts);
    }

    // Audit log
    await logAuditEvent({
      userId,
      action: "CREATE",
      entityType: "shopee_drafts",
      entityId: id,
      changes: { count: drafts.length },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    return c.json({
      success: true,
      data: { generated: drafts.length, drafts },
    });
  },
);

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

// ─── Helper: call Gemini text (internal, via shared lib — no HTTP/auth needed) ──

async function callGeminiTextInternal(prompt: string): Promise<string> {
  try {
    const result = await geminiText(prompt);
    return result.text.trim();
  } catch (err) {
    console.error("[shopeeOptimization] Gemini text call failed:", err);
    return "";
  }
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

export default router;
