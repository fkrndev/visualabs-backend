/**
 * Scraper Worker (plain JS, run with Node)
 * Connect ke browser via CDP, scrape Shopee public shop page + product details.
 *
 * Usage: node scraper-worker.mjs <cdp_ws_url> <command> [json_args]
 * Commands:
 *   checkLogin                  → { logged_in, url }
 *   scrapePublicShop <shop_url> → { shop, products }
 *   scrapeProductDetails <product_urls_json> → [product details]
 *
 * Output: JSON via stdout, errors via stderr, exit code 0/1.
 */
import { chromium } from "patchright";

const cdpWsUrl = process.argv[2];
const command = process.argv[3];
const argJson = process.argv[4];

if (!cdpWsUrl || !command) {
  console.error("Usage: node scraper-worker.mjs <cdp_ws_url> <command> [json_args]");
  process.exit(1);
}

async function connect() {
  const browser = await chromium.connectOverCDP(cdpWsUrl, { timeout: 30000 });
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  return { browser, context, page };
}

function disconnect(browser) {
  try { browser.close(); } catch {}
  try { browser.disconnect(); } catch {}
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── checkLogin ────────────────────────────────────────────────────────────
// Check if user is logged in to shopee.co.id (public, not seller center).
// Detection: navigate to shopee.co.id, check for login button in header.
async function checkLogin() {
  const { browser, context, page } = await connect();
  try {
    await page.goto("https://shopee.co.id/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(3000);
    const url = page.url();

    // Detect login: Shopee shows "Login" / "Daftar" buttons in header when not logged in.
    // When logged in, header shows user avatar/name instead.
    const hasLoginButton = await page.locator('text=/^(Login|Daftar|Log In)$/i').count();
    const hasUserAvatar = await page.locator('[class*="avatar"], [class*="user-menu"], [class*="navbar__username"]').count();

    // Also check cookies for SPC_CRT session token
    const cookies = await context.cookies("https://shopee.co.id/");
    const hasSessionCookie = cookies.some((c) => c.name === "SPC_CRT" || c.name === "SPC_F");

    const loggedIn = hasSessionCookie && (hasUserAvatar > 0 || hasLoginButton === 0);
    console.log(JSON.stringify({ logged_in: loggedIn, url, has_session_cookie: hasSessionCookie }));
  } finally {
    disconnect(browser);
  }
}

// ─── scrapePublicShop ──────────────────────────────────────────────────────
// Scrape public Shopee shop page (shopee.co.id/{slug}).
// Extract: shop name, bio, stats, logo, banner, 10 product unggulan.
async function scrapePublicShop(shopUrl) {
  const { browser, page } = await connect();
  try {
    // Normalize URL — handle cases where user already includes domain
    let url = shopUrl;
    if (!url.startsWith("http")) {
      // Strip leading "shopee.co.id/" if user typed it without https://
      const stripped = url.replace(/^(https?:\/\/)?shopee\.co\.id\//i, "").replace(/^\//, "");
      url = `https://shopee.co.id/${stripped}`;
    }

    // Intercept API responses for shop data & products
    let shopBaseData = null;
    let shopSeoData = null;
    let rcmdItems = []; // products from rcmd_items API
    page.on("response", async (res) => {
      const u = res.url();
      try {
        if (u.includes("/api/v4/shop/get_shop_base_v2") && res.status() === 200) {
          const body = await res.json();
          if (body.error === 0) shopBaseData = body.data;
        }
        if (u.includes("/api/v4/shop/get_shop_seo") && res.status() === 200) {
          const body = await res.json();
          if (body.error === 0) shopSeoData = body.data;
        }
        // Intercept rcmd_items (product list) — format: { data: { items: [...] } } atau { items: [...] }
        if (u.includes("/api/v4/shop/rcmd_items") && res.status() === 200) {
          const body = await res.json();
          const items = body.data?.items || body.items || [];
          if (Array.isArray(items) && items.length) {
            rcmdItems = items;
            console.error(`[scraper] Intercepted rcmd_items: ${items.length} products`);
          }
        }
      } catch (e) {}
    });

    console.error(`[scraper] Navigating to shop: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(8000); // Wait for API responses (anti-bot may delay)

    // If redirected to verify/traffic, wait for redirect back
    if (page.url().includes("/verify/")) {
      console.error("[scraper] Anti-bot redirect detected, waiting...");
      try {
        await page.waitForURL("**/shopee.co.id/**", { timeout: 15000 });
        await sleep(3000);
      } catch (e) {
        console.error("[scraper] Still on verify page, trying to continue...");
      }
    }

    // Extract slug from original URL (page may redirect to verify/traffic)
    const originalSlug = url.replace(/^https?:\/\/[^/]+\//, "").split("/")[0].split("?")[0] || null;

    // Scroll + extract DOM with retry (up to 3 attempts if bio/hero/hero-bawah still empty)
    const extractDomShop = async () => {
      // Scroll down to trigger lazy-loaded shop decoration
      await page.evaluate(async () => {
        for (let i = 0; i < 30; i++) {
          window.scrollBy(0, 500);
          await new Promise((r) => setTimeout(r, 150));
          if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 100) break;
        }
        const bottomHero = document.querySelector(".EJEw2T");
        if (bottomHero) {
          bottomHero.scrollIntoView({ behavior: "instant", block: "center" });
          await new Promise((r) => setTimeout(r, 1000));
        }
      });
      await sleep(2000);

      // Scroll to hero carousel specifically and wait for images to load
      console.error("[scraper] Scrolling to hero carousel...");
      await page.evaluate(async () => {
        // Find the hero carousel (2nd .image-carousel inside .shop-decoration, has .Ni1rrY images)
        const carousels = document.querySelectorAll(".shop-decoration .image-carousel");
        for (const c of carousels) {
          if (c.querySelector(".Ni1rrY")) {
            c.scrollIntoView({ behavior: "instant", block: "center" });
            await new Promise((r) => setTimeout(r, 3000));
            break;
          }
        }
      });

      return await page.evaluate(() => {
        const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
        const shopName =
          getText(".section-seller-overview-horizontal__portrait-name") ||
          getText('[class*="shop-name"]') ||
          getText("h1") ||
          document.title.replace(/\s*-\s*Shopee.*$/i, "");
        const shopBio =
          getText(".thBOtY") ||
          getText(".section-seller-overview-horizontal__portrait-bio") ||
          getText('[class*="shop-bio"]') ||
          null;
        const stats = {};
        const statItems = document.querySelectorAll(".section-seller-overview__item");
        statItems.forEach((item) => {
          const nameEl = item.querySelector(".section-seller-overview__item-text-name");
          const valueEl = item.querySelector(".section-seller-overview__item-text-value");
          if (!nameEl || !valueEl) return;
          const label = nameEl.textContent?.trim().replace(/[:\u00a0]+$/g, "").replace(/\u00a0/g, "").trim();
          if (!label) return;
          const value = valueEl.cloneNode(true);
          const helpIcon = value.querySelector(".section-seller-overview__inline-icon");
          if (helpIcon) helpIcon.remove();
          const valueText = value.textContent?.trim();
          if (valueText) stats[label] = valueText;
        });
        const logoEl = document.querySelector(".shopee-avatar__img");
        const logoUrl = logoEl?.src || logoEl?.getAttribute("data-src") || null;
        const bannerImgs = Array.from(document.querySelectorAll(".image-carousel .Ni1rrY"))
          .filter((el) => el.src && !el.src.includes("data:image"))
          .filter((el) => !el.closest(".shop-decoration"));
        const bannerUrl = bannerImgs[0]?.src || null;
        const heroImgs = Array.from(document.querySelectorAll(".shop-decoration .image-carousel .Ni1rrY"))
          .map((el) => {
            if (el.src && !el.src.includes("data:image")) return el.src;
            const srcset = el.getAttribute("srcset") || el.querySelector("source")?.getAttribute("srcset");
            if (srcset) return srcset.split(" ")[0];
            const dataSrc = el.getAttribute("data-src");
            if (dataSrc) return dataSrc;
            return null;
          })
          .filter(Boolean);
        const bottomHeroImgs = Array.from(document.querySelectorAll(".EJEw2T .EQ9L9Q"))
          .map((el) => {
            if (el.src && !el.src.includes("data:image")) return el.src;
            const srcset = el.getAttribute("srcset") || el.querySelector("source")?.getAttribute("srcset");
            if (srcset) return srcset.split(" ")[0];
            const dataSrc = el.getAttribute("data-src");
            if (dataSrc) return dataSrc;
            return null;
          })
          .filter(Boolean);
        return { shopName, shopBio, shopStats: stats, shopLogoUrl: logoUrl, shopBannerUrl: bannerUrl, heroImages: heroImgs, bottomHeroImages: bottomHeroImgs };
      });
    };

    // Retry logic: extract up to 3 times if bio/hero/hero-bawah still empty
    let domShop = await extractDomShop();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const hasBio = !!domShop.shopBio;
      const hasHero = domShop.heroImages && domShop.heroImages.length > 0;
      const hasBottomHero = domShop.bottomHeroImages && domShop.bottomHeroImages.length > 0;
      if (hasBio && hasHero && hasBottomHero) {
        console.error(`[scraper] DOM data complete on attempt ${attempt}`);
        break;
      }
      console.error(`[scraper] DOM data incomplete (attempt ${attempt}/3): bio=${hasBio} hero=${hasHero} bottomHero=${hasBottomHero}, retrying...`);
      if (attempt < 3) {
        await sleep(3000);
        domShop = await extractDomShop();
      } else {
        console.error("[scraper] DOM data still incomplete after 3 attempts, skipping");
      }
    }

    // Merge: API data takes priority, DOM as fallback
    const shop = {
      shopName: shopBaseData?.name || domShop.shopName,
      shopBio: domShop.shopBio,
      shopSlug: originalSlug || shopBaseData?.account?.username || null,
      shopUrl: url,
      shopStats: domShop.shopStats,
      shopLogoUrl: shopBaseData?.account?.portrait
        ? `https://down-tx-id.img.susercontent.com/${shopBaseData.account.portrait}_tn`
        : domShop.shopLogoUrl,
      shopBannerUrl: shopBaseData?.cover
        ? `https://down-tx-id.img.susercontent.com/${shopBaseData.cover}`
        : domShop.shopBannerUrl,
      heroImages: domShop.heroImages || [],
      bottomHeroImages: domShop.bottomHeroImages || [],
    };

    // Note: DOM stats already comprehensive (produk, pengikut, mengikuti, penilaian, Performa chat, bergabung)
    // API stats enrichment removed to avoid duplicates

    // Extract products from multiple sources: get_shop_seo + rcmd_items + search_items fetch
    const shopId = shopBaseData?.shopid || "";
    const seenIds = new Set();
    let products = [];

    // Helper: normalize product item dari API response atau DOM scrape
    const normalizeItem = (item) => {
      const id = String(item.itemid || item.id || "");
      if (!id || seenIds.has(id)) return null;
      seenIds.add(id);
      const name = item.name || item.title || null;
      // Slug: prioritas dari DOM href slug, fallback ke slugify name
      const slug = item.slug || (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "");
      const itemShopId = item.shopId || shopId;
      // Price: Shopee API simpan price dalam satuan kecil (×100000), DOM scrape sudah string
      const rawPrice = item.price || item.price_max || 0;
      let price = null;
      if (rawPrice) {
        if (typeof rawPrice === "string") {
          price = rawPrice; // DOM scrape: sudah format "Rp..."
        } else {
          price = `Rp${(rawPrice / 100000).toLocaleString("id-ID")}`;
        }
      }
      const img = item.image || item.images?.[0] || null;
      // Image: jika sudah full URL pakai langsung, jika token pakai susercontent
      const thumbnailUrl = img
        ? (img.startsWith("http") ? img : `https://down-tx-id.img.susercontent.com/${img}`)
        : null;
      return {
        productId: id,
        title: name,
        price,
        thumbnailUrl,
        productUrl: `https://shopee.co.id/${slug}-i.${itemShopId}.${id}`,
      };
    };

    // Source 1: get_shop_seo items
    if (shopSeoData?.items?.length) {
      for (const item of shopSeoData.items) {
        const p = normalizeItem(item);
        if (p) products.push(p);
      }
      console.error(`[scraper] From get_shop_seo: ${products.length} products`);
    }

    // Source 1.5: DOM scrape dari halaman utama — cari tag <a> dengan format /{slug}-i.{shopid}.{itemid}
    if (products.length < 10) {
      // Scroll dulu untuk trigger render produk
      for (let s = 0; s < 5; s++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await sleep(1500);
      }
      const domProducts = await page.evaluate((sid) => {
        const items = [];
        const links = Array.from(document.querySelectorAll('a[href]'));
        for (const link of links) {
          const href = link.getAttribute("href") || "";
          // Format: /{slug}-i.{shopid}.{itemid}?extraParams=...
          const match = href.match(/^\/(.+)-i\.(\d+)\.(\d+)(?:\?|$)/);
          if (!match) continue;
          const slugFromHref = match[1];
          const shopIdFromHref = match[2];
          const itemId = match[3];
          if (items.find((i) => i.itemid === itemId)) continue;
          // Title: dari DOM text, atau fallback ke slug (replace - dengan space)
          const title = link.querySelector('[class*="title"], [class*="name"]')?.textContent?.trim()
            || link.textContent?.trim()?.slice(0, 150)
            || slugFromHref.replace(/-/g, " ");
          const priceEl = link.querySelector('[class*="price"]');
          const price = priceEl?.textContent?.trim() || null;
          const imgEl = link.querySelector("img");
          const image = imgEl?.src || imgEl?.getAttribute("data-src") || null;
          // Simpan slug & shopId untuk URL construction
          items.push({ itemid: itemId, name: title, price: null, image, slug: slugFromHref, shopId: shopIdFromHref });
        }
        return items;
      }, shopId);
      for (const item of domProducts) {
        const p = normalizeItem(item);
        if (p) products.push(p);
        if (products.length >= 10) break;
      }
      console.error(`[scraper] From DOM (main page): +${domProducts.length} → total ${products.length}`);
    }

    // Source 2: rcmd_items (intercepted)
    if (rcmdItems.length && products.length < 10) {
      for (const item of rcmdItems) {
        const p = normalizeItem(item);
        if (p) products.push(p);
        if (products.length >= 10) break;
      }
      console.error(`[scraper] After rcmd_items: ${products.length} products`);
    }

    // Limit to 10
    products = products.slice(0, 10);

    console.log(JSON.stringify({ shop, products }));
  } finally {
    disconnect(browser);
  }
}

// ─── scrapeProductDetails ──────────────────────────────────────────────────
// Scrape product detail pages (up to 10).
async function scrapeProductDetails(productUrls) {
  const urls = JSON.parse(productUrls || "[]");
  const { browser, page } = await connect();
  try {
    const results = [];
    for (const url of urls.slice(0, 10)) {
      try {
        console.error(`[scraper] Product: ${url}`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await sleep(3000);

        const product = await page.evaluate(() => {
          const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
          const getAll = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => e.textContent?.trim()).filter(Boolean);

          // Product ID from URL
          const urlParts = window.location.pathname.split(".");
          const productId = urlParts[urlParts.length - 1] || null;

          // Title: h1.auau1S
          const title = getText("h1.auau1S") || getText("h1") || document.title;

          // Price: .pyzxvq.pw3J3G (final price)
          const price = getText(".pyzxvq.pw3J3G") || getText('[class*="price"]');

          // Description: section "Deskripsi Produk" → .UBe8YR
          const descSection = Array.from(document.querySelectorAll("section.cDKs6x")).find(
            (s) => s.querySelector("h2.nWDzia")?.textContent?.includes("Deskripsi")
          );
          const description = descSection?.querySelector(".UBe8YR")?.textContent?.trim() || null;

          // Specs: section "Spesifikasi Produk" → .c0ztn1 pairs (h3.noPqBe label + div value)
          const specSection = Array.from(document.querySelectorAll("section.cDKs6x")).find(
            (s) => s.querySelector("h2.nWDzia")?.textContent?.includes("Spesifikasi")
          );
          const specs = {};
          if (specSection) {
            specSection.querySelectorAll(".c0ztn1").forEach((row) => {
              const label = row.querySelector("h3.noPqBe")?.textContent?.trim();
              const value = row.querySelector("div:not(.noPqBe)")?.textContent?.trim()
                || row.querySelector("a.LuZSuv")?.textContent?.trim();
              if (label && value) specs[label] = value;
            });
          }
          // Kategori breadcrumb: .Wo06o3 a.Tc_yqt
          const categories = Array.from(document.querySelectorAll(".Wo06o3 a.Tc_yqt"))
            .map((a) => a.textContent?.trim())
            .filter(Boolean);
          const stock = specs["Stok"] || null;
          const brand = specs["Merek"] || null;

          // Rating: .product-rating-overview__rating-score
          const rating = getText(".product-rating-overview__rating-score");
          // Rating count: filter "5 bintang (40)" dll → total dari filter
          const ratingFilters = Array.from(document.querySelectorAll(".product-rating-overview__filter span"))
            .map((s) => s.textContent?.trim() || "");
          const ratingCountMatch = ratingFilters.find((f) => /\(\d+\)/.test(f));
          const ratingCount = ratingCountMatch ? ratingCountMatch.match(/\((\d+)\)/)?.[1] : null;

          // Sold: .Ocv3B8 (e.g. "169 Terjual")
          const soldText = getText(".Ocv3B8") || "";
          const soldMatch = soldText.match(/(\d[\d.]*)/);
          const sold = soldMatch ? soldMatch[1] : null;

          // Favorit: button with "Favorit" label
          const favBtn = Array.from(document.querySelectorAll("button")).find((b) =>
            b.textContent?.includes("Favorit")
          );
          const favText = favBtn?.textContent?.trim() || "";
          const favMatch = favText.match(/Favorit\s*\(([\d.,RBrb]+)\)/);
          const favorit = favMatch ? favMatch[1] : null;

          // Images: main image + thumbnails
          const mainImg = document.querySelector("._rXL5o img.P39yUt")?.src || null;
          const thumbEls = Array.from(document.querySelectorAll(".qIctnQ img.P39yUt"));
          const images = [mainImg, ...thumbEls.map((img) => img.src)]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 8);

          // Reviews (top 5): .q2b7Oq
          const reviews = Array.from(document.querySelectorAll(".q2b7Oq")).slice(0, 5).map((c) => {
            const author = c.querySelector(".InK5kS")?.textContent?.trim() || null;
            const dateVar = c.querySelector(".XYk98l")?.textContent?.trim() || null;
            const comment = c.querySelector(".YNedDV")?.textContent?.trim() || null;
            const sellerReply = c.querySelector(".QSiE2A")?.textContent?.trim() || null;
            const mediaImgs = Array.from(c.querySelectorAll(".rating-media-list__image-wrapper--container img"))
              .map((img) => img.src).filter(Boolean);
            return { author, dateVariation: dateVar, comment, sellerReply, mediaUrls: mediaImgs };
          });

          return {
            productId,
            title,
            price,
            description,
            specs,
            categories,
            brand,
            stock,
            rating,
            ratingCount,
            sold,
            favorit,
            images,
            reviews,
            productUrl: window.location.href,
          };
        });

        results.push(product);
        await sleep(2000 + Math.random() * 3000); // Rate limit 2-5s
      } catch (err) {
        console.error(`[scraper] Product failed: ${err.message}`);
        results.push({ productUrl: url, error: err.message });
      }
    }
    console.log(JSON.stringify(results));
  } finally {
    disconnect(browser);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  if (command === "checkLogin") {
    await checkLogin();
  } else if (command === "scrapePublicShop") {
    if (!argJson) {
      console.error("scrapePublicShop requires <shop_url> argument");
      process.exit(1);
    }
    await scrapePublicShop(argJson);
  } else if (command === "scrapeProductDetails") {
    await scrapeProductDetails(argJson);
  } else {
    console.error("Unknown command: " + command);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("SCRAPER_WORKER_ERROR: " + err.message);
  process.exit(1);
});
