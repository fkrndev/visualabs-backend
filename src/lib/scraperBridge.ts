/**
 * Scraper Bridge — spawn Node child process untuk scraping.
 *
 * Problem: Bun's WebSocket tidak compatible dengan `ws` package internal
 * Playwright/patchright. Playwright connectOverCDP timeout di Bun tapi
 * sukses di Node. Solusi: jalankan scraper sebagai Node child process.
 *
 * BE (Bun) → spawn node src/scraper-worker.mjs → dapat JSON via stdout.
 *
 * Anti-bot pause/resume:
 *   Worker kirim marker `[VERIFY_WAIT]<url>` ke stderr ketika kena anti-bot.
 *   BE update session status → 'waiting_verify', simpan resolve function.
 *   User verify manual di browser, klik "Sudah verify" di FE.
 *   BE endpoint POST /sessions/:id/verify-resume → kirim "resume\n" ke stdin worker + resolve promise.
 *   Worker lanjut scraping dari produk yang kena anti-bot.
 */
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";

const WORKER_PATH = join(import.meta.dir, "..", "scraper-worker.mjs");

/** Active workers by sessionId — untuk resume dari anti-bot pause. */
const activeWorkers = new Map<number, ChildProcess>();

/** Register active worker for resume support. */
export function registerWorker(sessionId: number, proc: ChildProcess) {
  activeWorkers.set(sessionId, proc);
}

/** Unregister worker. */
export function unregisterWorker(sessionId: number) {
  activeWorkers.delete(sessionId);
}

/** Resume worker after manual anti-bot verification.
 *  Sends "resume\n" to worker stdin. Returns true if sent, false if not found/dead.
 *  Note: caller should also resolve the onVerifyWait promise (via pendingVerifyResolvers).
 */
export function resumeWorker(sessionId: number): boolean {
  const proc = activeWorkers.get(sessionId);
  if (!proc || proc.killed) return false;
  try {
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write("resume\n");
    }
    console.log(`[scraperBridge] Resumed worker for session ${sessionId}`);
    return true;
  } catch (err) {
    console.error(`[scraperBridge] Failed to resume worker: ${err.message}`);
    return false;
  }
}

/**
 * Run scraper worker dengan Node, return parsed JSON.
 * Optional onVerifyWait callback dipanggil ketika worker kena anti-bot.
 * Callback harus return promise yang resolve ketika user selesai verify.
 * sessionId: jika ada, worker di-register agar bisa di-resume dari endpoint.
 */
export async function runScraperWorker(
  cdpWsUrl: string,
  command: "checkLogin" | "scrapePublicShop" | "scrapeProductDetails",
  args?: string,
  timeoutMs: number = 120_000,
  onVerifyWait?: (url: string) => Promise<void>,
  sessionId?: number,
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

    // Timeout di-pause saat waiting for verify — tidak count ke total.
    let timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Scraper worker timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Scraper worker timeout (${timeoutMs}ms)`));
      }, timeoutMs);
    };

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      // Forward worker stderr to BE console for debugging
      process.stderr.write(text);

      // Detect anti-bot verify marker: [VERIFY_WAIT]<url>
      const verifyMatch = text.match(/\[VERIFY_WAIT\](.+)/);
      if (verifyMatch && onVerifyWait) {
        const verifyUrl = verifyMatch[1].trim();
        console.error(`[scraperBridge] Anti-bot detected, pausing for manual verify: ${verifyUrl}`);
        // Pause timeout while waiting for user
        clearTimeout(timer);
        // Register proc so endpoint can send "resume" to stdin
        if (sessionId != null) {
          registerWorker(sessionId, proc);
        }
        // Call onVerifyWait — returns promise that resolves when user clicks "Sudah verify"
        // Route handler stores resolve fn in pendingVerifyResolvers map.
        onVerifyWait(verifyUrl).then(() => {
          // User verified — restart timeout
          resetTimer();
        }).catch((err) => {
          console.error(`[scraperBridge] Verify wait failed: ${err.message}`);
          resetTimer();
        });
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (sessionId != null) unregisterWorker(sessionId);
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
      if (sessionId != null) unregisterWorker(sessionId);
      reject(new Error(`Failed to spawn scraper worker: ${err.message}`));
    });
  });
}

/** Check login status via Node worker. */
export async function checkLoginViaWorker(cdpWsUrl: string): Promise<{ logged_in: boolean; url: string }> {
  return runScraperWorker(cdpWsUrl, "checkLogin", undefined, 45_000);
}

/** Scrape public shop page via Node worker. */
export async function scrapePublicShopViaWorker(
  cdpWsUrl: string,
  shopUrl: string,
  sessionId?: number,
  onVerifyWait?: (url: string) => Promise<void>,
): Promise<{ shop: any; products: any[] }> {
  return runScraperWorker(
    cdpWsUrl,
    "scrapePublicShop",
    shopUrl,
    600_000, // 10 menit — ada pause untuk verify
    onVerifyWait,
    sessionId,
  );
}

/** Scrape product detail pages via Node worker.
 *  sessionId: untuk register worker agar bisa di-resume dari endpoint.
 *  onVerifyWait: callback when anti-bot detected, pause until user verifies.
 */
export async function scrapeProductDetailsViaWorker(
  cdpWsUrl: string,
  productUrls: string[],
  shopUrl: string,
  sessionId?: number,
  onVerifyWait?: (url: string) => Promise<void>,
): Promise<any[]> {
  return runScraperWorker(
    cdpWsUrl,
    "scrapeProductDetails",
    JSON.stringify({ shopUrl, productUrls }),
    600_000, // 10 menit — ada pause untuk verify
    onVerifyWait,
    sessionId,
  );
}
