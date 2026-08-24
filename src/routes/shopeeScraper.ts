import { Hono } from "hono";
import { chromium } from "patchright";
import { join } from "path";
import { mkdirSync } from "fs";
import { requireAuth, requireManagement } from "../middleware/auth";
import { UPLOAD_DIR } from "./uploads";
import { checkLoginViaWorker } from "../lib/scraperBridge";

/**
 * Shopee Scraper — connect via CDP (Chrome DevTools Protocol) ke browser
 * yang di-launch oleh VBOX app. TIDAK handle start/stop profile (VBOX app yang handle).
 *
 * Flow:
 *   VBOX app launch profile → dapat CDP ws URL → pass ke v-auto-backend
 *   v-auto-backend connectOverCDP(cdpWsUrl) → scrape → disconnect (jangan close browser)
 */

const router = new Hono();

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Connect ke browser via CDP. Pakai context & page yang sudah ada di profile
 * (jangan new_context — spoof fingerprint tetap utuh).
 *
 * Return browser, context, page. Caller bertanggung jawab disconnect setelah selesai.
 */
export async function connectCdp(cdpWsUrl: string) {
  const browser = await chromium.connectOverCDP(cdpWsUrl);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  return { browser, context, page };
}

/**
 * Download image ke uploads/ folder dengan UUID filename.
 * Return relative URL untuk serving via /uploads route.
 */
export async function downloadImage(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const ext = url.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[0] || ".jpg";
    const name = `${crypto.randomUUID()}${ext}`;
    mkdirSync(UPLOAD_DIR, { recursive: true });
    await Bun.write(join(UPLOAD_DIR, name), buf);
    return `/uploads/${name}`;
  } catch (err) {
    console.error("[shopeeScraper] downloadImage failed:", url, err);
    return ""; // return empty string — caller handle skip
  }
}

// ─── Scraper Functions (scaffold — implement di PBI-2.2, 2.3, 2.4) ──────────

/**
 * Check apakah profile sudah login Shopee Seller Center.
 * Connect CDP, navigate ke seller.shopee.co.id, detect login redirect, disconnect.
 *
 * Return { logged_in: boolean }
 */
export async function checkLogin(cdpWsUrl: string): Promise<{ logged_in: boolean }> {
  const { browser, page } = await connectCdp(cdpWsUrl);
  try {
    await page.goto("https://seller.shopee.co.id/", { waitUntil: "domcontentloaded", timeout: 30000 });
    const url = page.url();
    // Kalau redirect ke login page → belum login
    const loggedIn = !url.includes("login") && !url.includes("signin");
    return { logged_in: loggedIn };
  } finally {
    await browser.close(); // disconnect CDP (jangan close browser — close() di CDP = disconnect)
  }
}

/**
 * Scrape Shopee Seller Center + public shop page.
 * Connect CDP, scrape, disconnect.
 *
 * Step 1: Seller Center → shop name, shop URL/slug, stats, performance
 * Step 2: Public shop page → shop name, bio, stats, logo, banner, hero URLs, featured products
 *
 * Return shop metadata + list produk + image URLs
 *
 * Selector pattern diadopsi dari v-auto-frontend/src/lib/automation/scrape-scripts.ts
 * (SHOPEE_SELLER_SCRAPE) yang sudah verified live.
 */
export async function scrapeShop(cdpWsUrl: string): Promise<{
  shop: Record<string, unknown>;
  products: Record<string, unknown>[];
}> {
  const { browser, page } = await connectCdp(cdpWsUrl);
  try {
    // ─── Step 1: Seller Center ────────────────────────────────────────────
    await page.goto("https://seller.shopee.co.id/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Detect login redirect
    const sellerUrl = page.url();
    if (sellerUrl.includes("login") || sellerUrl.includes("signin")) {
      throw new Error("login_required");
    }

    // Wait for dashboard widgets to render (Performa Toko)
    await page
      .waitForFunction(
        () => {
          const L = (document.body.innerText || "")
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          const i = L.indexOf("Total Pengunjung");
          return i >= 0 && /\d/.test(L[i + 1] || "");
        },
        { timeout: 15000 },
      )
      .catch(() => {
        // Best effort — dashboard mungkin loading lambat, lanjut dengan data yang ada
      });

    // Scrape seller center dashboard (performa toko, status pesanan, iklan)
    const sellerData = await page.evaluate(() => {
      const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
      const isLogin =
        /\/(login|signin)/i.test(location.pathname) ||
        !!document.querySelector('input[type="password"]');
      const info: Record<string, unknown> = {
        url: location.href,
        title: document.title,
        scrapedAt: new Date().toISOString(),
        loggedIn: !isLogin,
      };
      if (isLogin) return info;

      const pickNum = (s: string) => {
        const m = clean(s).match(
          /Rp\s?\d[\d.,]*\s*(?:JT|Jt|jt|M|K|B|Miliar|Juta|Ribu)?|\d[\d.,]*\s*%|\d[\d.,]*\s*x|\d[\d.,]*/,
        );
        return m ? m[0].trim() : null;
      };

      const lines = (document.body.innerText || "")
        .split(/\r?\n/)
        .map(clean)
        .filter(Boolean);

      const after = (labels: string[]) => {
        for (const label of labels) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i] === label && pickNum(lines[i + 1] || "")) return pickNum(lines[i + 1]);
          }
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith(label) && lines[i].length > label.length) {
              const n = pickNum(lines[i].slice(label.length));
              if (n) return n;
            }
          }
        }
        return null;
      };

      const before = (labels: string[]) => {
        for (const label of labels) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i] === label) {
              const n = pickNum(lines[i - 1] || "");
              if (n) return n;
            }
          }
        }
        return null;
      };

      info.statusPesanan = {
        pengirimanPerluDiproses: before(["Pengiriman Perlu Diproses"]),
        pengirimanTelahDiproses: before(["Pengiriman Telah Diproses"]),
        pengembalianPembatalan: before(["Pengembalian/Pembatalan", "Pengembalian / Pembatalan"]),
      };
      info.performaToko = {
        penjualan: after(["Penjualan"]),
        totalPengunjung: after(["Total Pengunjung"]),
        jumlahProdukDiklik: after(["Jumlah Produk Diklik"]),
        pesanan: after(["Pesanan"]),
        tingkatKonversiPesanan: after(["Tingkat Konversi Pesanan"]),
      };
      info.iklanShopee = {
        saldoIklan: after(["Saldo Iklan"]),
        penjualanDariIklan: after(["Penjualan dari Iklan"]),
        roas: after(["ROAS"]),
      };
      return info;
    });

    // Extract shop slug from seller center URL or page content
    // Seller center URL format: https://seller.shopee.co.id/ (dashboard)
    // Shop slug biasanya ada di profile/settings page, tapi kita bisa dapat dari
    // public shop page link di seller center, atau dari nama toko
    const shopName = (sellerData.title as string) || "";
    // Coba cari link ke public shop page di seller center
    let shopSlug: string | null = null;
    try {
      shopSlug = await page.evaluate(() => {
        // Cari link ke shopee.co.id/{slug} di halaman seller center
        const links = Array.from(document.querySelectorAll('a[href*="shopee.co.id/"]'));
        for (const link of links) {
          const href = link.getAttribute("href") || "";
          // Format: https://shopee.co.id/{shop-slug} atau /{shop-slug}
          const match = href.match(/shopee\.co\.id\/([^/?#]+)/);
          if (match && !["buyer", "seller", "account", "product"].includes(match[1])) {
            return match[1];
          }
        }
        return null;
      });
    } catch {
      // ignore — akan dicari di step 2
    }

    // ─── Step 2: Public shop page ─────────────────────────────────────────
    // Kalau shop slug tidak ditemukan dari seller center, coba dari nama toko
    if (!shopSlug) {
      // Fallback: cari shop slug dari page content (nama toko → slug)
      // Untuk POC, kita skip kalau tidak ketemu dan tetap return seller data
      return {
        shop: {
          ...sellerData,
          shopName,
          shopSlug: null,
          shopUrl: null,
          publicPageScraped: false,
          note: "Shop slug tidak ditemukan dari seller center. Public shop page tidak di-scrape.",
        },
        products: [],
      };
    }

    const shopUrl = `https://shopee.co.id/${shopSlug}`;
    await page.goto(shopUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for shop profile section to render
    await page
      .waitForSelector(".section-seller-overview-horizontal__portrait-name", { timeout: 15000 })
      .catch(() => {
        // Best effort — lanjut dengan data yang ada
      });

    // Detect captcha
    const publicUrl = page.url();
    if (publicUrl.includes("/verify/captcha")) {
      throw new Error("captcha_required");
    }

    // Scrape public shop page
    const publicData = await page.evaluate(() => {
      const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
      const info: Record<string, unknown> = {};

      // Shop name
      const nameEl = document.querySelector(
        ".section-seller-overview-horizontal__portrait-name",
      );
      info.shopName = nameEl ? clean(nameEl.textContent || "") : null;

      // Shop bio/description
      const bioEl = document.querySelector(
        ".section-seller-overview-horizontal__portrait-description",
      );
      info.shopBio = bioEl ? clean(bioEl.textContent || "") : null;

      // Shop stats (produk, pengikut, mengikuti, rating)
      const statEls = Array.from(
        document.querySelectorAll(".section-seller-overview__item-text-name"),
      );
      const statValues = Array.from(
        document.querySelectorAll(".section-seller-overview__item-text-value"),
      );
      const stats: Record<string, string> = {};
      for (let i = 0; i < statEls.length && i < statValues.length; i++) {
        const label = clean(statEls[i].textContent || "");
        const value = clean(statValues[i].textContent || "");
        if (label) stats[label] = value;
      }
      info.shopStats = stats;

      // Shop logo
      const logoEl = document.querySelector(
        ".section-seller-overview-horizontal__portrait-image img, .shopee-avatar__img, img[class*='portrait']",
      );
      info.shopLogoUrl = logoEl ? (logoEl as HTMLImageElement).src : null;

      // Shop banner/hero
      const bannerEl = document.querySelector(
        ".section-seller-overview__shop-banner img, .shop-banner img, img[class*='banner']",
      );
      info.shopBannerUrl = bannerEl ? (bannerEl as HTMLImageElement).src : null;

      // Featured products
      const productLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a[href*='/product/']"),
      );
      const products: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const link of productLinks) {
        const href = link.getAttribute("href") || "";
        // Format: /{shop-slug}/{product-slug}.{product_id}
        const match = href.match(/\/product\/(\d+)\b|\.(\d+)$/);
        const productId = match ? match[1] || match[2] : null;
        if (!productId || seen.has(productId)) continue;
        seen.add(productId);

        const titleEl = link.querySelector(
          ".ofmHgCQoJ2oCQqCQyCQsCQoCQyCQ, [class*='product-item'] [class*='title'], .text-ellipsis",
        );
        const priceEl = link.querySelector(
          "[class*='price'], .ofmHgCQoJ2oCQqCQyCQsCQoCQyCQ span",
        );
        const imgEl = link.querySelector("img");
        const fullUrl = link.href;

        products.push({
          productId,
          title: titleEl ? clean(titleEl.textContent || "") : clean(link.textContent || ""),
          price: priceEl ? clean(priceEl.textContent || "") : null,
          thumbnailUrl: imgEl ? imgEl.src : null,
          productUrl: fullUrl,
        });
      }
      info.products = products;
      return info;
    });

    // Download shop logo & banner
    const logoUrl = publicData.shopLogoUrl as string | null;
    const bannerUrl = publicData.shopBannerUrl as string | null;
    const [logoLocal, bannerLocal] = await Promise.all([
      logoUrl ? downloadImage(logoUrl) : Promise.resolve(""),
      bannerUrl ? downloadImage(bannerUrl) : Promise.resolve(""),
    ]);

    // Download product thumbnails
    const products = publicData.products as Record<string, unknown>[];
    for (const product of products) {
      const thumbUrl = product.thumbnailUrl as string | null;
      if (thumbUrl) {
        product.thumbnailLocal = await downloadImage(thumbUrl);
      }
    }

    return {
      shop: {
        ...sellerData,
        shopName: publicData.shopName || shopName,
        shopSlug,
        shopUrl,
        shopBio: publicData.shopBio,
        shopStats: publicData.shopStats,
        shopLogoUrl: logoUrl,
        shopLogoLocal: logoLocal || null,
        shopBannerUrl: bannerUrl,
        shopBannerLocal: bannerLocal || null,
        publicPageScraped: true,
      },
      products,
    };
  } finally {
    await browser.close(); // disconnect CDP (jangan close browser — VBOX app handle stop)
  }
}

/**
 * Scrape halaman detail product.
 * Connect CDP, scrape product page, disconnect.
 *
 * Extract: title, description, category, variants, price, photos (up to 8)
 *
 * Return product details + image URLs (local)
 */
export async function scrapeProduct(
  cdpWsUrl: string,
  productUrl: string,
): Promise<Record<string, unknown>> {
  const { browser, page } = await connectCdp(cdpWsUrl);
  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Detect captcha
    if (page.url().includes("/verify/captcha")) {
      throw new Error("captcha_required");
    }

    // Wait for product title to render
    await page
      .waitForSelector("[class*='product-quick'], .qaNIZv, .flex.items-center", { timeout: 15000 })
      .catch(() => {
        // Best effort
      });

    // Rate limit: random delay 2-5s before scraping
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));

    const productData = await page.evaluate(() => {
      const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
      const info: Record<string, unknown> = {
        url: location.href,
        scrapedAt: new Date().toISOString(),
      };

      // Product ID from URL
      const match = location.pathname.match(/\.(\d+)$/);
      info.productId = match ? match[1] : null;

      // Title — Shopee product title selector
      const titleEl = document.querySelector(
        "h1[class*='product-quick'], .qaNIZv, .flex.items-center h1, [data-sqe='name']",
      );
      info.title = titleEl ? clean(titleEl.textContent || "") : null;

      // Price
      const priceEl = document.querySelector(
        "[class*='price'], .YbrD9b, .flex.items-end [class*='text-']",
      );
      info.price = priceEl ? clean(priceEl.textContent || "") : null;

      // Original price (strikethrough)
      const originalPriceEl = document.querySelector(
        "[class*='original-price'], .JUYzLQ, del",
      );
      info.originalPrice = originalPriceEl ? clean(originalPriceEl.textContent || "") : null;

      // Description — Shopee product description in expandable section
      const descEl = document.querySelector(
        "[class*='product-description'], .e8B7a5, .shopee-product-info__content",
      );
      info.description = descEl ? clean(descEl.textContent || "") : null;

      // Category
      const categoryEls = Array.from(
        document.querySelectorAll("[class*='breadcrumb'] a, [class*='category'] a"),
      );
      info.categories = categoryEls
        .map((el) => clean(el.textContent || ""))
        .filter(Boolean);

      // Variants
      const variantGroups = Array.from(
        document.querySelectorAll("[class*='variation'], [class*='variant']"),
      );
      const variants: Record<string, string[]> = {};
      for (const group of variantGroups) {
        const labelEl = group.querySelector("label, [class*='label']");
        const label = labelEl ? clean(labelEl.textContent || "") : "variant";
        const optionEls = Array.from(
          group.querySelectorAll("button, [class*='option'], [class*='item']"),
        );
        const options = optionEls
          .map((el) => clean(el.textContent || ""))
          .filter((t) => t && t.length < 50);
        if (options.length > 0) variants[label] = options;
      }
      info.variants = variants;

      // Stock
      const stockEl = document.querySelector("[class*='stock'], [class*='quantity']");
      info.stock = stockEl ? clean(stockEl.textContent || "") : null;

      // Rating & sold
      const ratingEl = document.querySelector("[class*='rating'] [class*='number'], .shopee-rating");
      info.rating = ratingEl ? clean(ratingEl.textContent || "") : null;

      const soldEl = document.querySelector("[class*='sold'], [class*='quantity-sold']");
      info.sold = soldEl ? clean(soldEl.textContent || "") : null;

      // Photos — product image gallery (up to 8)
      const photoEls = Array.from(
        document.querySelectorAll(
          "[class*='image-gallery'] img, [class*='product-image'] img, .shopee-product-image img",
        ),
      );
      info.photoUrls = photoEls
        .slice(0, 8)
        .map((el) => (el as HTMLImageElement).src)
        .filter(Boolean);

      return info;
    });

    // Download photos
    const photoUrls = (productData.photoUrls as string[]) || [];
    const photoLocals: string[] = [];
    for (const url of photoUrls) {
      const local = await downloadImage(url);
      if (local) photoLocals.push(local);
    }
    productData.photoLocals = photoLocals;

    return productData;
  } finally {
    await browser.close(); // disconnect CDP
  }
}

/**
 * Scrape shop dulu (PBI-2.2), lalu loop semua featured products.
 * Connect CDP sekali untuk shop, lalu connect per product (rate limit).
 *
 * Return shop metadata + all product details + image URLs
 */
export async function scrapeAllProducts(cdpWsUrl: string): Promise<{
  shop: Record<string, unknown>;
  products: Record<string, unknown>[];
}> {
  // Step 1: scrape shop untuk dapat list produk
  const { shop, products: shopProducts } = await scrapeShop(cdpWsUrl);

  // Step 2: loop semua produk, scrape detail per product
  const detailedProducts: Record<string, unknown>[] = [];
  for (const product of shopProducts) {
    const productUrl = product.productUrl as string;
    if (!productUrl) continue;

    // Rate limit: delay 3-5s antar product
    await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));

    try {
      // Reconnect CDP per product (disconnect setelah selesai)
      const detail = await scrapeProduct(cdpWsUrl, productUrl);
      detailedProducts.push({
        ...product, // keep shop page data (productId, title, price, thumbnail)
        ...detail, // merge dengan detail page data
      });
    } catch (err) {
      // Skip product kalau gagal, lanjut ke product berikutnya
      console.error(
        `[shopeeScraper] scrapeProduct failed for ${productUrl}:`,
        err instanceof Error ? err.message : err,
      );
      detailedProducts.push({
        ...product,
        detailError: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return {
    shop,
    products: detailedProducts,
  };
}

// ─── Routes ────────────────────────────────────────────────────────────────

/**
 * POST /api/shopee-optimization/check-login
 * Body: { cdp_ws_url: string }
 * Return: { logged_in: boolean }
 *
 * VBOX app launch profile → get CDP ws URL → call this endpoint.
 */
router.post("/check-login", requireAuth, requireManagement, async (c) => {
  const body = await c.req.json();
  const { cdp_ws_url } = body;

  if (!cdp_ws_url || typeof cdp_ws_url !== "string") {
    return c.json({ success: false, message: "cdp_ws_url is required" }, 400);
  }

  try {
    // Sprint 2: pakai Node worker (Bun WebSocket incompatible dengan patchright)
    // Sprint 2: check login ke public shopee.co.id (bukan seller.shopee.co.id)
    const result = await checkLoginViaWorker(cdp_ws_url);
    return c.json({ success: true, data: result });
  } catch (err) {
    console.error("[shopeeScraper] check-login error:", err);
    return c.json(
      { success: false, message: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

/**
 * POST /api/shopee-optimization/scrape-shop
 * Body: { cdp_ws_url: string }
 * Return: { shop: {...}, products: [...] }
 *
 * Scrape seller center + public shop page. For testing/manual trigger.
 * Production: dipanggil dari POST /sessions (auto-run) di shopeeOptimization.ts.
 */
router.post("/scrape-shop", requireAuth, requireManagement, async (c) => {
  const body = await c.req.json();
  const { cdp_ws_url } = body;

  if (!cdp_ws_url || typeof cdp_ws_url !== "string") {
    return c.json({ success: false, message: "cdp_ws_url is required" }, 400);
  }

  try {
    const result = await scrapeShop(cdp_ws_url);
    return c.json({ success: true, data: result });
  } catch (err) {
    console.error("[shopeeScraper] scrape-shop error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "login_required" ? 401 : message === "captcha_required" ? 423 : 500;
    return c.json({ success: false, message }, status);
  }
});

/**
 * POST /api/shopee-optimization/scrape-all-products
 * Body: { cdp_ws_url: string }
 * Return: { shop: {...}, products: [...] }
 *
 * Scrape shop + all product detail pages. For testing/manual trigger.
 * Production: dipanggil dari POST /sessions (auto-run) di shopeeOptimization.ts.
 */
router.post("/scrape-all-products", requireAuth, requireManagement, async (c) => {
  const body = await c.req.json();
  const { cdp_ws_url } = body;

  if (!cdp_ws_url || typeof cdp_ws_url !== "string") {
    return c.json({ success: false, message: "cdp_ws_url is required" }, 400);
  }

  try {
    const result = await scrapeAllProducts(cdp_ws_url);
    return c.json({ success: true, data: result });
  } catch (err) {
    console.error("[shopeeScraper] scrape-all-products error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "login_required" ? 401 : message === "captcha_required" ? 423 : 500;
    return c.json({ success: false, message }, status);
  }
});

export default router;
