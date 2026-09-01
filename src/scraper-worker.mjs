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

async function disconnect(browser) {
  // Timeout 15s — jangan hang forever jika browser.close/disconnect stuck
  await Promise.race([
    (async () => {
      // Close semua pages/tabs dulu — browser.close() pada CDP connection
      // tidak menutup browser user, hanya disconnect. Close pages manual.
      try {
        const contexts = browser.contexts();
        for (const ctx of contexts) {
          const pages = ctx.pages();
          for (const p of pages) {
            try { await p.close(); } catch {}
          }
        }
      } catch {}
      try { await browser.close(); } catch {}
      try { await browser.disconnect(); } catch {}
    })(),
    new Promise((r) => setTimeout(r, 15_000)),
  ]);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Anti-bot helper ───────────────────────────────────────────────────────
/** Cek apakah URL saat ini adalah halaman anti-bot verify/traffic/captcha.
 *  Pattern: /verify/, /traffic/, /captcha/, atau URL mengandung "verify" / "captcha". */
function isAntiBotUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes("/verify/") ||
    lower.includes("/traffic/") ||
    lower.includes("/captcha/") ||
    lower.includes("verify.") ||
    lower.includes("captcha.") ||
    // Shopee security check page
    lower.includes("/security/") ||
    lower.includes("/check/")
  );
}

/** Setup framenavigated listener untuk detect anti-bot redirect real-time.
 *  Return function untuk unsubscribe + get current anti-bot status. */
function setupAntiBotWatcher(page, label) {
  let antiBotDetected = false;
  const handler = (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (isAntiBotUrl(url)) {
        console.error(`[scraper] Anti-bot redirect detected on ${label}: ${url}`);
        antiBotDetected = true;
      }
    }
  };
  page.on("framenavigated", handler);
  return {
    unsubscribe: () => page.off("framenavigated", handler),
    isDetected: () => antiBotDetected,
    check: () => isAntiBotUrl(page.url()),
  };
}

/**
 * Pause scraping untuk manual verify jika page kena anti-bot.
 * - Kirim marker [VERIFY_WAIT]<url> ke stderr (BE update session status).
 * - Wait for stdin "resume" (user klik "Sudah verify" di FE).
 * - Reload page setelah resume, re-check. Max 3 attempts.
 * - Return true jika anti-bot cleared, false jika masih blocked (skip).
 *
 * @param page    Playwright Page object
 * @param label   Label untuk log (e.g. "shop page", "product XYZ")
 * @param reloadUrl URL untuk reload setelah verify (optional, default: page.url())
 */
async function waitForVerifyIfNeeded(page, label, reloadUrl = null) {
  let isAntiBot = isAntiBotUrl(page.url());
  if (!isAntiBot) return true;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const verifyUrl = page.url();
    console.error(`[scraper] Anti-bot on ${label} (attempt ${attempt}/3), pausing for manual verify...`);
    process.stderr.write(`[VERIFY_WAIT]${verifyUrl}\n`);

    // Wait for stdin "resume" signal from BE
    const resumed = await new Promise((resolve) => {
      const onData = (data) => {
        const text = data.toString().trim();
        if (text === "resume") {
          process.stdin.removeListener("data", onData);
          resolve(true);
        }
      };
      process.stdin.on("data", onData);
      // Safety timeout: 5 menit untuk user verify
      setTimeout(() => {
        process.stdin.removeListener("data", onData);
        resolve(false);
      }, 300_000);
    });

    if (!resumed) {
      console.error(`[scraper] Verify timeout (5 min) on ${label}, skipping...`);
      return false;
    }

    console.error(`[scraper] Resumed after verify on ${label}, re-checking...`);
    await sleep(3000);

    // Reload page setelah verify
    try {
      const targetUrl = reloadUrl || page.url();
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(3000);
    } catch (reloadErr) {
      console.error(`[scraper] Reload after verify failed on ${label}: ${reloadErr.message}`);
    }

    isAntiBot = isAntiBotUrl(page.url());
    if (!isAntiBot) {
      console.error(`[scraper] Anti-bot cleared on ${label}, continuing...`);
      return true;
    }
    if (attempt === 3) {
      console.error(`[scraper] Anti-bot still active after 3 attempts on ${label}, skipping...`);
      return false;
    }
  }
  return false;
}

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
    await disconnect(browser);
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
    // Setup anti-bot watcher untuk detect redirect real-time
    const shopWatcher = setupAntiBotWatcher(page, "shop page");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(8000); // Wait for API responses (anti-bot may delay)

    // Anti-bot check: jika redirect ke /verify/ atau /traffic/, pause untuk manual verify
    const shopOk = await waitForVerifyIfNeeded(page, "shop page", url);
    if (!shopOk) {
      // Anti-bot tidak ter-clear setelah 3 attempts — return data kosong
      console.error("[scraper] Shop page blocked by anti-bot, returning empty data");
      shopWatcher.unsubscribe();
      console.log(JSON.stringify({ shop: { shopUrl: url, shopName: null, antiBotBlocked: true }, products: [] }));
      return;
    }

    // Click "Terlaris" (best selling) tab to sort products by best selling
    // Sort bar ada di .shop-page__all-products-section, perlu scroll ke sana dulu
    console.error("[scraper] Clicking 'Terlaris' sort button...");
    try {
      // Scroll ke section "Semua Produk" untuk trigger render sort bar
      await page.evaluate(() => {
        const allProductsSection = document.querySelector(".shop-page__all-products-section");
        if (allProductsSection) {
          allProductsSection.scrollIntoView({ behavior: "instant", block: "start" });
        } else {
          // Fallback: scroll ke bawah
          window.scrollBy(0, 2000);
        }
      });
      await sleep(2000);

      // Click tombol "Terlaris" di sort bar
      const clicked = await page.evaluate(() => {
        // Cari button sort dengan text "Terlaris"
        const sortButtons = document.querySelectorAll(".sort-by-options__option");
        for (const btn of sortButtons) {
          const text = btn.textContent?.trim() || "";
          if (text === "Terlaris") {
            btn.click();
            return true;
          }
        }
        // Fallback: cari elemen mana saja dengan text "Terlaris"
        const allEls = Array.from(document.querySelectorAll("button, a, span, div"));
        const terlarisEl = allEls.find((el) => {
          const text = el.textContent?.trim() || "";
          return text === "Terlaris" && el.offsetParent !== null;
        });
        if (terlarisEl) {
          terlarisEl.click();
          return true;
        }
        return false;
      });
      if (clicked) {
        console.error("[scraper] 'Terlaris' sort clicked, waiting for products to reload...");
        // Wait for sort to apply + product list to reload
        await sleep(5000);
        // Verify sort actually changed (check aria-pressed or selected class)
        const sortApplied = await page.evaluate(() => {
          const btns = document.querySelectorAll(".sort-by-options__option");
          for (const btn of btns) {
            if (btn.textContent?.trim() === "Terlaris") {
              return btn.getAttribute("aria-pressed") === "true" ||
                     btn.classList.contains("sort-by-options__option--selected");
            }
          }
          return false;
        });
        console.error(`[scraper] Terlaris sort applied: ${sortApplied}`);
        // Anti-bot check setelah click Terlaris
        if (shopWatcher.check() || shopWatcher.isDetected()) {
          console.error("[scraper] Anti-bot after Terlaris click, pausing...");
          const ok = await waitForVerifyIfNeeded(page, "shop page (after Terlaris)", url);
          if (!ok) {
            shopWatcher.unsubscribe();
            console.log(JSON.stringify({ shop: { shopUrl: url, shopName: null, antiBotBlocked: true }, products: [] }));
            return;
          }
        }
      } else {
        console.error("[scraper] 'Terlaris' sort button not found, continuing with default sort...");
      }
    } catch (clickErr) {
      console.error(`[scraper] Failed to click 'Terlaris': ${clickErr.message}`);
    }

    // Extract slug from original URL (page may redirect to verify/traffic)
    const originalSlug = url.replace(/^https?:\/\/[^/]+\//, "").split("/")[0].split("?")[0] || null;

    // Scroll + extract DOM with retry (up to 3 attempts if bio/hero/hero-bawah still empty)
    const extractDomShop = async () => {
      // Anti-bot check sebelum scroll
      if (shopWatcher.check() || shopWatcher.isDetected()) {
        console.error("[scraper] Anti-bot before scroll, pausing...");
        const ok = await waitForVerifyIfNeeded(page, "shop page (before scroll)", url);
        if (!ok) return null;
      }

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

      // Anti-bot check setelah scroll
      if (shopWatcher.check() || shopWatcher.isDetected()) {
        console.error("[scraper] Anti-bot after scroll, pausing...");
        const ok = await waitForVerifyIfNeeded(page, "shop page (after scroll)", url);
        if (!ok) return null;
      }

      // Scroll to hero carousel and click through all slides to trigger lazy-loaded images
      console.error("[scraper] Scrolling to hero carousel + clicking arrows to load all slides...");
      await page.evaluate(async () => {
        const carousels = document.querySelectorAll(".shop-decoration .image-carousel");
        let heroCarousel = null;
        for (const c of carousels) {
          if (c.querySelector(".Ni1rrY")) {
            heroCarousel = c;
            c.scrollIntoView({ behavior: "instant", block: "center" });
            await new Promise((r) => setTimeout(r, 2000));
            break;
          }
        }
        if (!heroCarousel) return;

        // Click next/prev arrows to cycle through all slides
        // Each click shifts the carousel, triggering lazy-load for newly visible slides
        const nextArrow = heroCarousel.querySelector(".image-carousel__arrow--next");
        const prevArrow = heroCarousel.querySelector(".image-carousel__arrow--prev");
        const totalSlides = heroCarousel.querySelectorAll(".Ni1rrY").length;
        console.log("Hero carousel: " + totalSlides + " slides, next=" + !!nextArrow + " prev=" + !!prevArrow);

        // Click next through all slides
        if (nextArrow) {
          for (let i = 0; i < totalSlides + 2; i++) {
            nextArrow.click();
            await new Promise((r) => setTimeout(r, 800));
          }
        }
        // Click prev back to start
        if (prevArrow) {
          for (let i = 0; i < totalSlides + 2; i++) {
            prevArrow.click();
            await new Promise((r) => setTimeout(r, 800));
          }
        }
        // Wait for images to finish loading
        await new Promise((r) => setTimeout(r, 2000));
      });

      // DEBUG: Dump full page HTML + hero-specific HTML to tmp file for inspection
      const fullHtml = await page.content();
      const heroHtml = await page.evaluate(() => {
        const shopDeco = document.querySelector(".shop-decoration");
        return shopDeco ? shopDeco.outerHTML : "NO .shop-decoration FOUND";
      });
      const fs = await import("fs");
      const tmpDir = "./tmp";
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const ts = Date.now();
      fs.writeFileSync(`${tmpDir}/shop-${ts}-full.html`, fullHtml);
      fs.writeFileSync(`${tmpDir}/shop-${ts}-hero.html`, heroHtml);
      console.error(`[scraper] HTML dumped: tmp/shop-${ts}-full.html (${(fullHtml.length / 1024).toFixed(0)}KB), tmp/shop-${ts}-hero.html (${(heroHtml.length / 1024).toFixed(0)}KB)`);

      // Also log hero image count for quick diagnosis
      const heroDiag = await page.evaluate(() => {
        const allNi1rrY = document.querySelectorAll(".shop-decoration .Ni1rrY");
        const withSrc = Array.from(allNi1rrY).filter((el) => el.src && !el.src.includes("data:image"));
        const withSrcset = Array.from(allNi1rrY).filter((el) => el.getAttribute("srcset"));
        const withDataSrc = Array.from(allNi1rrY).filter((el) => el.getAttribute("data-src"));
        const bottomHero = document.querySelectorAll(".EJEw2T .EQ9L9Q");
        const bottomWithSrc = Array.from(bottomHero).filter((el) => el.src && !el.src.includes("data:image"));
        return {
          totalNi1rrY: allNi1rrY.length,
          withSrc: withSrc.length,
          withSrcset: withSrcset.length,
          withDataSrc: withDataSrc.length,
          srcs: withSrc.map((el) => el.src),
          bottomTotal: bottomHero.length,
          bottomWithSrc: bottomWithSrc.length,
          bottomSrcs: bottomWithSrc.map((el) => el.src),
        };
      });
      console.error(`[scraper] Hero diag: ${JSON.stringify(heroDiag)}`);

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
          .filter(Boolean)
          .filter((url, i, arr) => arr.indexOf(url) === i);
        const bottomHeroImgs = Array.from(document.querySelectorAll(".EJEw2T .EQ9L9Q"))
          .map((el) => {
            if (el.src && !el.src.includes("data:image")) return el.src;
            const srcset = el.getAttribute("srcset") || el.querySelector("source")?.getAttribute("srcset");
            if (srcset) return srcset.split(" ")[0];
            const dataSrc = el.getAttribute("data-src");
            if (dataSrc) return dataSrc;
            return null;
          })
          .filter(Boolean)
          .filter((url, i, arr) => arr.indexOf(url) === i);
        return { shopName, shopBio, shopStats: stats, shopLogoUrl: logoUrl, shopBannerUrl: bannerUrl, heroImages: heroImgs, bottomHeroImages: bottomHeroImgs };
      });
    };

    // Retry logic: extract up to 3 times if bio/hero/hero-bawah still empty
    let domShop = await extractDomShop();
    if (!domShop) {
      // Anti-bot blocked during extraction
      shopWatcher.unsubscribe();
      console.log(JSON.stringify({ shop: { shopUrl: url, shopName: null, antiBotBlocked: true }, products: [] }));
      return;
    }
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
        if (!domShop) {
          shopWatcher.unsubscribe();
          console.log(JSON.stringify({ shop: { shopUrl: url, shopName: null, antiBotBlocked: true }, products: [] }));
          return;
        }
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

    // Source 1.5: DOM scrape dari section "Semua Produk" (.shop-search-result-view)
    // Hanya ambil dari section ini (sorted by Terlaris), bukan dari shop decoration
    if (products.length < 10) {
      // Scroll ke section "Semua Produk" untuk trigger render product cards
      await page.evaluate(() => {
        const section = document.querySelector(".shop-page__all-products-section");
        if (section) section.scrollIntoView({ behavior: "instant", block: "start" });
      });
      await sleep(2000);
      // Scroll dalam section untuk load lebih banyak product cards
      for (let s = 0; s < 5; s++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await sleep(1500);
      }
      const domProducts = await page.evaluate((sid) => {
        const items = [];
        // Hanya cari product cards di .shop-search-result-view (all-products section)
        const productCards = document.querySelectorAll(".shop-search-result-view__item");
        for (const card of productCards) {
          const link = card.querySelector('a[href*="-i."]');
          if (!link) continue;
          const href = link.getAttribute("href") || "";
          // Format: /{slug}-i.{shopid}.{itemid}?extraParams=...
          const match = href.match(/^\/(.+)-i\.(\d+)\.(\d+)(?:\?|$)/);
          if (!match) continue;
          const slugFromHref = match[1];
          const shopIdFromHref = match[2];
          const itemId = match[3];
          if (items.find((i) => i.itemid === itemId)) continue;
          // Title: dari card text, atau fallback ke slug (replace - dengan space)
          const title = card.querySelector('[class*="line-clamp"]')?.textContent?.trim()
            || link.textContent?.trim()?.slice(0, 150)
            || slugFromHref.replace(/-/g, " ");
          const priceEl = card.querySelector('[class*="price"]');
          const price = priceEl?.textContent?.trim() || null;
          const imgEl = card.querySelector("img");
          const image = imgEl?.src || imgEl?.getAttribute("data-src") || null;
          // Simpan slug & shopId untuk URL construction
          items.push({ itemid: itemId, name: title, price: null, image, slug: slugFromHref, shopId: shopIdFromHref });
        }
        return items;
      }, shopId);
      for (const item of domProducts) {
        const p = normalizeItem(item);
        if (p) products.push(p);
        if (products.length >= 5) break;
      }
      console.error(`[scraper] From DOM (main page): +${domProducts.length} → total ${products.length}`);
    }

    // Source 2: rcmd_items (intercepted)
    if (rcmdItems.length && products.length < 10) {
      for (const item of rcmdItems) {
        const p = normalizeItem(item);
        if (p) products.push(p);
        if (products.length >= 5) break;
      }
      console.error(`[scraper] After rcmd_items: ${products.length} products`);
    }

    // Limit to 5
    products = products.slice(0, 5);

    shopWatcher.unsubscribe();
    console.log(JSON.stringify({ shop, products }));
  } finally {
    await disconnect(browser);
  }
}

// ─── scrapeProductDetails ──────────────────────────────────────────────────
// Scrape product detail pages (up to 10).
// Anti-bot workaround: navigate to shop page first, then click product cards
// to open detail in new tab (human-like behavior) instead of direct URL goto.
async function scrapeProductDetails(argsJson) {
  const { shopUrl, productUrls } = JSON.parse(argsJson || "{}");
  const urls = productUrls || [];
  const { browser, page } = await connect();
  try {
    // Step 1: Navigate to shop page first (establish "human" session context)
    let shopUrlNorm = shopUrl || "";
    if (shopUrlNorm && !shopUrlNorm.startsWith("http")) {
      shopUrlNorm = `https://shopee.co.id/${shopUrlNorm.replace(/^(https?:\/\/)?shopee\.co\.id\//i, "").replace(/^\//, "")}`;
    }
    if (shopUrlNorm) {
      // Cek apakah tab pertama sudah di halaman shop (dari scrape sebelumnya)
      const currentUrl = page.url();
      const shopSlug = shopUrlNorm.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
      const alreadyOnShop = currentUrl.includes(shopSlug) && !isAntiBotUrl(currentUrl);

      // Setup anti-bot watcher untuk shop page di product detail phase
      const shopWatcher2 = setupAntiBotWatcher(page, "shop page (product detail phase)");

      if (alreadyOnShop) {
        console.error(`[scraper] Already on shop page (${currentUrl}), skipping refresh`);
      } else {
        console.error(`[scraper] Opening shop page first: ${shopUrlNorm}`);
        await page.goto(shopUrlNorm, { waitUntil: "domcontentloaded", timeout: 30000 });
        await sleep(5000); // Wait for shop page + products to render
      }

      // Anti-bot check setelah navigate ke shop page
      if (shopWatcher2.check() || shopWatcher2.isDetected()) {
        console.error("[scraper] Anti-bot on shop page (product detail phase), pausing...");
        const ok = await waitForVerifyIfNeeded(page, "shop page (product detail phase)", shopUrlNorm);
        if (!ok) {
          shopWatcher2.unsubscribe();
          // Semua product di-skip karena shop page blocked
          for (const u of urls.slice(0, 5)) {
            results.push({ productUrl: u, error: "anti_bot_blocked" });
          }
          console.log(JSON.stringify(results));
          return;
        }
      }

      // Tidak klik "Terlaris" — biarkan di tab "Populer" (default sort)
      // Product URLs sudah didapat dari shop scrape sebelumnya (sorted by Terlaris)

      // Scroll to load product cards di section "Semua Produk"
      await page.evaluate(() => {
        const section = document.querySelector(".shop-page__all-products-section");
        if (section) section.scrollIntoView({ behavior: "instant", block: "start" });
      });
      await sleep(2000);
      for (let s = 0; s < 5; s++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await sleep(1000);
      }

      // Anti-bot check setelah scroll
      if (shopWatcher2.check() || shopWatcher2.isDetected()) {
        console.error("[scraper] Anti-bot after scroll (product detail phase), pausing...");
        const ok = await waitForVerifyIfNeeded(page, "shop page (after scroll, product detail phase)", shopUrlNorm);
        if (!ok) {
          shopWatcher2.unsubscribe();
          for (const u of urls.slice(0, 5)) {
            results.push({ productUrl: u, error: "anti_bot_blocked" });
          }
          console.log(JSON.stringify(results));
          return;
        }
      }

      shopWatcher2.unsubscribe();
    }

    const results = [];
    const context = browser.defaultBrowserContext?.() || browser.contexts?.()[0] || page.context();

    for (const url of urls.slice(0, 5)) {
      try {
        console.error(`[scraper] Product: ${url}`);

        // Extract product path from URL (e.g. /slug-i.shopid.itemid)
        const urlObj = new URL(url);
        const productPath = urlObj.pathname;

        // Step 2: Find product card link on shop page (di .shop-search-result-view) dan click
        // Use Ctrl+click (meta) to open in new tab — human-like navigation
        let detailPage = null;
        try {
          // Find the <a> element with matching href di section all-products
          const linkHandle = await page.evaluateHandle((path) => {
            // Cari di .shop-search-result-view__item dulu (sorted products section)
            const cards = document.querySelectorAll(".shop-search-result-view__item");
            for (const card of cards) {
              const link = card.querySelector('a[href*="' + path + '"]');
              if (link) return link;
            }
            // Fallback: cari di seluruh page
            const links = Array.from(document.querySelectorAll('a[href]'));
            return links.find((a) => a.getAttribute("href")?.includes(path)) || null;
          }, productPath);

          const linkEl = linkHandle.asElement();
          if (linkEl) {
            console.error(`[scraper] Found product card on shop page, clicking to open new tab...`);
            // Open in new tab via keyboard modifier click
            const newPagePromise = context.waitForEvent("page", { timeout: 15000 }).catch(() => null);
            await linkEl.click({ modifiers: ["Control"] });
            detailPage = await newPagePromise;
            await linkHandle.dispose();
          } else {
            console.error(`[scraper] Product card not found on shop page, falling back to direct navigation...`);
          }
        } catch (clickErr) {
          console.error(`[scraper] Click failed: ${clickErr.message}, falling back to direct navigation...`);
        }

        // Fallback: if new tab didn't open, navigate directly
        if (!detailPage) {
          detailPage = await context.newPage();
          await detailPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        }

        try {
          // Setup anti-bot watcher untuk product detail page
          const productWatcher = setupAntiBotWatcher(detailPage, `product ${url}`);

          // Anti-bot check: jika redirect ke /verify/ atau /traffic/, pause untuk manual verify
          // Helper akan reload product URL setelah verify berhasil → re-scrape dari awal
          const productOk = await waitForVerifyIfNeeded(detailPage, `product ${url}`, url);
          if (!productOk) {
            // Skip hanya jika 3 attempts verify gagal
            console.error(`[scraper] Product ${url} blocked by anti-bot after 3 attempts, skipping...`);
            productWatcher.unsubscribe();
            results.push({ productUrl: url, error: "anti_bot_blocked" });
            continue;
          }

          // Wait for product detail page to load (re-done after verify+reload)
          await detailPage.waitForSelector("h1.auau1S, h1", { timeout: 15000, visible: true }).catch(() => {});

          // Anti-bot check setelah h1 wait
          if (productWatcher.check() || productWatcher.isDetected()) {
            console.error(`[scraper] Anti-bot after h1 wait on ${url}, pausing...`);
            const ok = await waitForVerifyIfNeeded(detailPage, `product ${url} (after h1)`, url);
            if (!ok) {
              productWatcher.unsubscribe();
              results.push({ productUrl: url, error: "anti_bot_blocked" });
              continue;
            }
          }

          // Wait for product detail content to render.
          // Price render async via client-side JS (BFF hapus dari JSON, tapi JS re-render).
          // Wait for price element — tanpa visible:true karena element mungkin ada di DOM
          // tapi belum visible (display:none saat loading). Cukup element ada di DOM.
          let priceFound = false;
          try {
            await detailPage.waitForSelector(".pyzxvq.pw3J3G", { timeout: 15000 });
            priceFound = true;
            console.error("[scraper] Price element found (.pyzxvq.pw3J3G)");
          } catch {
            console.error("[scraper] Price element not found after 15s, continuing anyway...");
          }

          // Anti-bot check setelah price wait
          if (productWatcher.check() || productWatcher.isDetected()) {
            console.error(`[scraper] Anti-bot after price wait on ${url}, pausing...`);
            const ok = await waitForVerifyIfNeeded(detailPage, `product ${url} (after price)`, url);
            if (!ok) {
              productWatcher.unsubscribe();
              results.push({ productUrl: url, error: "anti_bot_blocked" });
              continue;
            }
          }
          // Wait for sold/rating area
          try {
            await detailPage.waitForSelector(".Ocv3B8", { timeout: 5000 });
          } catch {}
          // Brief wait for specs/description sections to render
          await sleep(2000);

          // DEBUG: Dump product detail HTML to tmp for inspection
          try {
            const fs = await import("fs");
            const tmpDir = "./tmp";
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const pid = productPath.split(".").pop() || "unknown";
            const fullHtml = await detailPage.content();
            fs.writeFileSync(`${tmpDir}/product-${pid}-full.html`, fullHtml);
            console.error(`[scraper] Product HTML dumped: tmp/product-${pid}-full.html (${(fullHtml.length / 1024).toFixed(0)}KB)`);
          } catch (dumpErr) {
            console.error(`[scraper] Product HTML dump failed: ${dumpErr.message}`);
          }

          const product = await detailPage.evaluate(() => {
          const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
          const getAll = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => e.textContent?.trim()).filter(Boolean);

          // Product ID from URL
          const urlParts = window.location.pathname.split(".");
          const productId = urlParts[urlParts.length - 1] || null;

          // Title: h1.auau1S
          const title = getText("h1.auau1S") || getText("h1") || document.title;

          // Price: .pyzxvq.pw3J3G (rendered by client-side JS, e.g. "Rp154.100")
          const price = getText(".pyzxvq.pw3J3G") || getText('[class*="price"]') || null;

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
          // Stock: dari specs "Stok" atau dari "Tersedia XX" text di quantity section
          let stock = specs["Stok"] || null;
          if (!stock) {
            // Cari "Tersedia XX" di text
            const allText = document.body.textContent || "";
            const tersediaMatch = allText.match(/Tersedia\s+(\d+)/);
            if (tersediaMatch) stock = tersediaMatch[1];
          }
          const brand = specs["Merek"] || null;
          const shippedFrom = specs["Dikirim Dari"] || null;

          // Rating: .FllsTu.JXtSdn (e.g. "5.0") — rating score di button pertama
          // Jika "Belum ada penilaian" → rating = null, ratingCount = "0"
          const noRatingEl = document.querySelector(".Lsz70O");
          const isNoRating = noRatingEl?.textContent?.includes("Belum ada penilaian");
          const rating = isNoRating ? null : (getText(".FllsTu.JXtSdn") || getText(".product-rating-overview__rating-score") || null);
          // Rating count: button dengan .aEDmfN "penilaian" → .FllsTu (e.g. "212")
          let ratingCount = null;
          if (isNoRating) {
            ratingCount = "0";
          } else {
            const penilaianBtn = Array.from(document.querySelectorAll("button")).find((b) =>
              b.querySelector(".aEDmfN")?.textContent?.includes("penilaian")
            );
            if (penilaianBtn) {
              ratingCount = penilaianBtn.querySelector(".FllsTu")?.textContent?.trim() || null;
            }
            // Fallback: lama selector
            if (!ratingCount) {
              const ratingFilters = Array.from(document.querySelectorAll(".product-rating-overview__filter span"))
                .map((s) => s.textContent?.trim() || "");
              const ratingCountMatch = ratingFilters.find((f) => /\(\d+\)/.test(f));
              ratingCount = ratingCountMatch ? ratingCountMatch.match(/\((\d+)\)/)?.[1] : null;
            }
          }

          // Sold: .Ocv3B8 .PfWbfd (e.g. "680") — angka terjual
          const soldNum = getText(".Ocv3B8 .PfWbfd");
          const soldText = getText(".Ocv3B8") || "";
          const soldMatch = soldText.match(/(\d[\d.]*)/);
          const sold = soldNum || (soldMatch ? soldMatch[1] : null);

          // Favorit: button with "Favorit" label — Shopee pakai template {{count}}, tidak di-render
          // Coba ekstrak jika ada angka rendered
          const favBtn = Array.from(document.querySelectorAll("button")).find((b) =>
            b.textContent?.includes("Favorit")
          );
          const favText = favBtn?.textContent?.trim() || "";
          const favMatch = favText.match(/Favorit\s*\(([\d.,RBrb]+)\)/);
          const favorit = favMatch ? favMatch[1] : null;

          // Images: main image + thumbnails — Shopee pakai srcset (bukan src)
          // Ambil URL pertama dari srcset: "url1 1x, url2 2x" → ambil "url1"
          const getImgUrl = (img) => {
            if (img.src && !img.src.includes("data:image")) return img.src;
            const srcset = img.getAttribute("srcset");
            if (srcset) return srcset.split(",")[0].trim().split(" ")[0];
            const dataSrc = img.getAttribute("data-src");
            if (dataSrc) return dataSrc;
            return null;
          };
          const mainImgEl = document.querySelector("._rXL5o img.P39yUt");
          const mainImg = mainImgEl ? getImgUrl(mainImgEl) : null;
          const thumbEls = Array.from(document.querySelectorAll(".qIctnQ img.P39yUt"));
          const images = [mainImg, ...thumbEls.map(getImgUrl)]
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
            shippedFrom,
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
        productWatcher.unsubscribe();
        } finally {
          // Close the detail tab to avoid too many open tabs
          try { await detailPage.close(); } catch {}
        }

        // Human-like delay between products (2-4s)
        await sleep(2000 + Math.random() * 2000);
      } catch (err) {
        console.error(`[scraper] Product failed: ${err.message}`);
        results.push({ productUrl: url, error: err.message });
        try { if (detailPage) await detailPage.close(); } catch {}
      }
    }
    console.log(JSON.stringify(results));
  } finally {
    await disconnect(browser);
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

main().then(() => {
  // Force exit — jangan tunggu lingering handles (timers, CDP connections, dll)
  process.exit(0);
}).catch((err) => {
  console.error("SCRAPER_WORKER_ERROR: " + err.message);
  process.exit(1);
});
