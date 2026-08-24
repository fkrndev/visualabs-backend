/**
 * Scraper Bridge — spawn Node child process untuk scraping.
 *
 * Problem: Bun's WebSocket tidak compatible dengan `ws` package internal
 * Playwright/patchright. Playwright connectOverCDP timeout di Bun tapi
 * sukses di Node. Solusi: jalankan scraper sebagai Node child process.
 *
 * BE (Bun) → spawn node src/scraper-worker.mjs → dapat JSON via stdout.
 */
import { spawn } from "child_process";
import { join } from "path";

const WORKER_PATH = join(import.meta.dir, "..", "scraper-worker.mjs");

/**
 * Run scraper worker dengan Node, return parsed JSON.
 */
export async function runScraperWorker(
  cdpWsUrl: string,
  command: "checkLogin" | "scrapePublicShop" | "scrapeProductDetails",
  args?: string,
  timeoutMs: number = 120_000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const workerArgs = [WORKER_PATH, cdpWsUrl, command];
    if (args) workerArgs.push(args);

    const proc = spawn("node", workerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Scraper worker timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      // Forward worker stderr to BE console for debugging
      process.stderr.write(text);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (err) {
          reject(new Error(`Scraper worker: invalid JSON output: ${stdout.slice(0, 200)}`));
        }
      } else {
        const errMsg = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`Scraper worker failed: ${errMsg.slice(0, 500)}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn scraper worker: ${err.message}`));
    });
  });
}

/** Check login status via Node worker. */
export async function checkLoginViaWorker(cdpWsUrl: string): Promise<{ logged_in: boolean; url: string }> {
  return runScraperWorker(cdpWsUrl, "checkLogin", undefined, 45_000);
}

/** Scrape public shop page via Node worker. */
export async function scrapePublicShopViaWorker(cdpWsUrl: string, shopUrl: string): Promise<{ shop: any; products: any[] }> {
  return runScraperWorker(cdpWsUrl, "scrapePublicShop", shopUrl, 120_000);
}

/** Scrape product detail pages via Node worker. */
export async function scrapeProductDetailsViaWorker(cdpWsUrl: string, productUrls: string[]): Promise<any[]> {
  return runScraperWorker(cdpWsUrl, "scrapeProductDetails", JSON.stringify(productUrls), 180_000);
}
