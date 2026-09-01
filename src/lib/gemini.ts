/**
 * Gemini client — shared library untuk call Gemini API langsung (tanpa HTTP route).
 *
 * Dipakai oleh:
 *   - src/routes/llmGateway.ts (HTTP routes, delegate ke sini)
 *   - src/lib/shopeeAnalyzer.ts (internal call, tidak lewat HTTP)
 *   - src/routes/shopeeOptimization.ts (internal call untuk generate drafts)
 *
 * Rate limit: 15 RPM (sliding window), retry backoff max 3 attempts.
 */
import { config } from "dotenv";
config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// Chunked base64 encoding — avoids "Maximum call stack size exceeded" on large images
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32KB chunks
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk) as unknown as number[]);
  }
  return btoa(binary);
}
const GEMINI_UPSTREAM = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_WINDOW_MS = 60_000; // 1 minute
const GEMINI_MAX_RPM = parseInt(process.env.GEMINI_MAX_RPM || "15", 10);

// Sliding window rate limiter
const geminiCallTimes: number[] = [];

async function geminiWaitSlot(): Promise<void> {
    const now = Date.now();
    // Hapus timestamp lebih dari 1 menit yang lalu
    while (geminiCallTimes.length > 0 && now - geminiCallTimes[0] > GEMINI_WINDOW_MS) {
        geminiCallTimes.shift();
    }
    if (geminiCallTimes.length >= GEMINI_MAX_RPM) {
        const waitMs = GEMINI_WINDOW_MS - (now - geminiCallTimes[0]);
        if (waitMs > 0) {
            console.log(`[gemini] rate limit: waiting ${waitMs}ms for slot`);
            await new Promise((r) => setTimeout(r, waitMs));
        }
    }
    geminiCallTimes.push(Date.now());
}

/** Call Gemini dengan retry backoff (max 3 attempts). */
async function geminiCallWithRetry(
    body: Record<string, unknown>,
    isVision: boolean,
): Promise<{ ok: boolean; data?: unknown; error?: string; status: number }> {
    const model = GEMINI_MODEL;
    const method = "generateContent";
    const url = `${GEMINI_UPSTREAM}/models/${model}:${method}?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
        await geminiWaitSlot();
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.status === 429) {
                const waitMs = 1000 * Math.pow(2, attempt);
                console.warn(
                    `[gemini] 429 (attempt ${attempt}/3), backing off ${waitMs}ms`,
                );
                if (attempt < 3) {
                    await new Promise((r) => setTimeout(r, waitMs));
                    continue;
                }
            }

            if (!res.ok) {
                const errText = await res.text();
                return {
                    ok: false,
                    error: `Gemini API error ${res.status}: ${errText}`,
                    status: res.status,
                };
            }

            const data = await res.json();
            return { ok: true, data, status: 200 };
        } catch (err) {
            console.error(`[gemini] call error (attempt ${attempt}/3):`, err);
            if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 1000 * attempt));
                continue;
            }
            return {
                ok: false,
                error: err instanceof Error ? err.message : "Unknown error",
                status: 502,
            };
        }
    }
    return { ok: false, error: "Gemini max retries exceeded", status: 429 };
}

/** Extract text response dari Gemini response. */
function extractGeminiText(data: any): string {
    try {
        const candidates = data?.candidates || [];
        if (candidates.length === 0) return "";
        const parts = candidates[0]?.content?.parts || [];
        return parts.map((p: any) => p?.text || "").join("");
    } catch {
        return "";
    }
}

// ─── Public API ────────────────────────────────────────────────────────────

export const geminiConfigured = !!GEMINI_API_KEY;
export const geminiModel = GEMINI_MODEL;

/**
 * Call Gemini text (text-only, no vision).
 * @returns { text: string, raw: unknown } atau throw Error kalau gagal.
 */
export async function geminiText(
    prompt: string,
    options?: { systemPrompt?: string; jsonMode?: boolean },
): Promise<{ text: string; raw: unknown }> {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY belum diset di server");
    }

    const contents = [
        {
            role: "user",
            parts: [{ text: prompt }],
        },
    ];
    const payload: Record<string, unknown> = { contents };
    if (options?.systemPrompt) {
        payload.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }
    if (options?.jsonMode) {
        payload.generationConfig = { responseMimeType: "application/json" };
    }

    const result = await geminiCallWithRetry(payload, false);
    if (!result.ok) {
        throw new Error(result.error || "Gemini call failed");
    }

    return {
        text: extractGeminiText(result.data),
        raw: result.data,
    };
}

/**
 * Call Gemini vision (text + images).
 * @param imageUrls array of local paths (e.g. "/uploads/abc.jpg") atau full URLs.
 * @returns { text: string, raw: unknown } atau throw Error kalau gagal.
 */
export async function geminiVision(
    prompt: string,
    imageUrls: string[],
    options?: { jsonMode?: boolean },
): Promise<{ text: string; raw: unknown }> {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY belum diset di server");
    }

    // Build inlineData parts untuk setiap image
    const imageParts: Record<string, unknown>[] = [];
    for (const imageUrl of imageUrls) {
        try {
            let buf: ArrayBuffer;
            let mimeType = "image/jpeg";

            if (imageUrl.startsWith("/uploads/")) {
                const { join } = await import("path");
                const { UPLOAD_DIR } = await import("../routes/uploads");
                const filename = imageUrl.replace(/^\/uploads\//, "");
                const filepath = join(UPLOAD_DIR, filename);
                const file = Bun.file(filepath);
                if (!(await file.exists())) {
                    console.warn(`[gemini] image not found: ${filepath}`);
                    continue;
                }
                buf = await file.arrayBuffer();
                if (filename.endsWith(".png")) mimeType = "image/png";
                else if (filename.endsWith(".webp")) mimeType = "image/webp";
                else if (filename.endsWith(".gif")) mimeType = "image/gif";
            } else {
                const res = await fetch(imageUrl);
                if (!res.ok) {
                    console.warn(`[gemini] fetch image failed: ${imageUrl} (${res.status})`);
                    continue;
                }
                buf = await res.arrayBuffer();
                mimeType = res.headers.get("content-type") || "image/jpeg";
            }

            const base64 = arrayBufferToBase64(buf);
            imageParts.push({
                inlineData: { mimeType, data: base64 },
            });
        } catch (err) {
            console.error(`[gemini] process image error (${imageUrl}):`, err);
        }
    }

    if (imageParts.length === 0) {
        throw new Error("Tidak ada image yang berhasil di-load");
    }

    const contents = [
        {
            role: "user",
            parts: [{ text: prompt }, ...imageParts],
        },
    ];
    const payload: Record<string, unknown> = { contents };
    if (options?.jsonMode) {
        payload.generationConfig = { responseMimeType: "application/json" };
    }

    const result = await geminiCallWithRetry(payload, true);
    if (!result.ok) {
        throw new Error(result.error || "Gemini call failed");
    }

    return {
        text: extractGeminiText(result.data),
        raw: result.data,
    };
}
