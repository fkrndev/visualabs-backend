/**
 * Scraper Worker — dijalankan sebagai Node child process dari BE (Bun).
 *
 * Usage: node scraper-worker.ts <cdp_ws_url> <command> [json_args]
 *
 * Commands:
 *   scrapeShop <cdp_ws_url> scrapeShop → JSON shop data ke stdout
 *   scrapeProducts <cdp_ws_url> scrapeProducts <product_urls_json> → JSON products array
 *   checkLogin <cdp_ws_url> → JSON { logged_in: boolean }
 *
 * Output: JSON ke stdout (single line), errors ke stderr.
 * Exit code: 0 = success, 1 = error.
 */
import { chromium } from "patchright";

const [,, cdpWsUrl, command, ...args] = process.argv;

if (!cdpWsUrl || !command) {
  console.error("Usage: node scraper-worker.ts <cdp_ws_url> <command> [args]");
  process.exit(1);
}

async function connect() {
  const browser = await chromium.connectOverCDP(cdpWsUrl, { timeout: 30000 });
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  return { browser, context, page };
}

async function disconnect(browser: any) {
  await Promise.race([
    (async () => {
      // Close semua pages/tabs dulu
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

async function main() {
  if (command === "checkLogin") {
    const { browser, page } = await connect();
    try {
      await page.goto("https://seller.shopee.co.id/", { waitUntil: "domcontentloaded", timeout: 30000 });
      const url = page.url();
      const loggedIn = !url.includes("login") && await page.locator('input[name="loginKey"]').count() === 0;
      console.log(JSON.stringify({ logged_in: loggedIn, url }));
    } finally {
      await disconnect(browser);
    }
  } else if (command === "scrapeShop") {
    const { browser, page } = await connect();
    try {
      // Navigate to seller center
      await page.goto("https://seller.shopee.co.id/portal/shop-setting", { waitUntil: "domcontentloaded", timeout: 30000 });
      // Wait for page to settle (SPA loading)
      await page.waitForTimeout(5000);

      // Extract shop data
      const shopData = await page.evaluate(() => {
        const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || null;
        return {
          shopName: getText('input[name="shopname"]') || document.title,
          shopBio: getText('textarea[name="description"]') || null,
        };
      });

      // Get shop stats from dashboard
      await page.goto("https://seller.shopee.co.id/portal/dashboard", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(5000);
      const stats = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[class*="card"]'));
        return cards.map(c => c.textContent?.trim()).filter(Boolean).slice(0, 10);
      });

      console.log(JSON.stringify({
        ...shopData,
        shopStats: { rawCards: stats },
        sellerUrl: "https://seller.shopee.co.id/",
      }));
    } finally {
      await disconnect(browser);
    }
  } else if (command === "scrapeProducts") {
    const productUrls = JSON.parse(args[0] || "[]") as string[];
    const { browser, page } = await connect();
    try {
      const products = [];
      for (const url of productUrls.slice(0, 5)) { // Limit 5 for POC
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
          const product = await page.evaluate(() => {
            const get = (sel: string) => document.querySelector(sel)?.textContent?.trim() || null;
            return {
              title: get('h1') || document.title,
              price: get('[class*="price"]'),
              description: get('[class*="description"]'),
              rating: get('[class*="rating"]'),
              sold: get('[class*="sold"]'),
            };
          });
          products.push({ ...product, productUrl: url });
        } catch (err) {
          products.push({ productUrl: url, error: err.message });
        }
      }
      console.log(JSON.stringify(products));
    } finally {
      await disconnect(browser);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("SCRAPER_WORKER_ERROR:", err.message);
  process.exit(1);
});
