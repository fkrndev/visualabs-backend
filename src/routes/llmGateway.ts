import { Hono, type Context } from "hono";
import { requireAuth, requireManagement } from "../middleware/auth";
import { geminiText, geminiVision, geminiConfigured, geminiModel } from "../lib/gemini";

/**
 * LLM Gateway — proxy OpenAI-compatible ke DeepSeek dengan API key di server.
 *
 * Tujuan: request LLM terpusat. Node Hermes cukup set `base_url` ke
 * `<host>/api/llm/v1` + token tim (virtual); key DeepSeek ASLI tidak pernah
 * keluar dari server ini. Balasan streaming (SSE, `stream: true`) diteruskan
 * apa adanya (passthrough) supaya tetap real-time.
 *
 * Endpoint (di belakang basePath "/api"):
 *   GET  /api/llm/health
 *   POST /api/llm/v1/chat/completions           (DeepSeek, team token gate)
 *   GET  /api/llm/v1/models                     (DeepSeek, team token gate)
 *   POST /api/llm/gemini/text                   (Gemini text, requireAuth+mgmt)
 *   POST /api/llm/gemini/vision                 (Gemini vision, requireAuth+mgmt)
 *
 * Env:
 *   DEEPSEEK_API_KEY        (wajib untuk DeepSeek) — key asli, hanya di server ini
 *   LLM_TEAM_TOKEN          (opsional) — kalau diset, node WAJIB kirim token ini
 *   DEEPSEEK_UPSTREAM_URL   (opsional) — default https://api.deepseek.com/v1
 *   GEMINI_API_KEY          (wajib untuk Gemini) — key Google AI Studio
 *   GEMINI_MODEL            (opsional) — default gemini-3.5-flash-lite
 */

const router = new Hono();

const UPSTREAM = (
    process.env.DEEPSEEK_UPSTREAM_URL || "https://api.deepseek.com/v1"
).replace(/\/+$/, "");
const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const TEAM_TOKEN = process.env.LLM_TEAM_TOKEN || "";

// Health check TANPA auth — buat cek cepat gateway hidup + key terpasang.
router.get("/health", (c) =>
    c.json({
        ok: true,
        upstream: UPSTREAM,
        keyConfigured: !!API_KEY,
        geminiConfigured,
        geminiModel,
    }),
);

// Gate: pastikan key server ada; kalau LLM_TEAM_TOKEN diset, token pemanggil wajib cocok.
router.use("*", async (c, next) => {
    // Skip gate untuk Gemini routes (pakai requireAuth+requireManagement sendiri)
    const path = new URL(c.req.url).pathname;
    if (path.includes("/gemini/")) {
        await next();
        return;
    }
    if (!API_KEY) {
        return c.json(
            { error: { message: "LLM gateway: DEEPSEEK_API_KEY belum diset di server" } },
            500,
        );
    }
    if (TEAM_TOKEN) {
        const token = (c.req.header("authorization") || "")
            .replace(/^Bearer\s+/i, "")
            .trim();
        if (token !== TEAM_TOKEN) {
            return c.json({ error: { message: "LLM gateway: invalid team token" } }, 401);
        }
    }
    await next();
});

/** Teruskan request ke DeepSeek, inject key server, stream body balik apa adanya. */
async function forward(c: Context, upstreamPath: string): Promise<Response> {
    const method = c.req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    let upstream: Response;
    try {
        upstream = await fetch(`${UPSTREAM}${upstreamPath}`, {
            method,
            headers: {
                "content-type": c.req.header("content-type") || "application/json",
                accept: c.req.header("accept") || "application/json",
                authorization: `Bearer ${API_KEY}`,
            },
            body: hasBody ? await c.req.arrayBuffer() : undefined,
        });
    } catch (err) {
        console.error("[llm-gateway] upstream error:", err);
        return c.json(
            { error: { message: "LLM gateway: upstream tidak bisa dihubungi" } },
            502,
        );
    }

    // Passthrough status + body. Untuk `stream: true`, upstream.body adalah
    // stream SSE yang langsung diteruskan tanpa dibuffer.
    return new Response(upstream.body, {
        status: upstream.status,
        headers: {
            "content-type": upstream.headers.get("content-type") || "application/json",
            "cache-control": "no-cache",
        },
    });
}

router.post("/v1/chat/completions", (c) => forward(c, "/chat/completions"));
router.get("/v1/models", (c) => forward(c, "/models"));

// ─── Gemini: text & vision (untuk Shopee Optimization) ─────────────────────
// Core logic ada di src/lib/gemini.ts (shared). Routes ini hanya HTTP wrapper
// dengan auth middleware. Internal callers (shopeeAnalyzer, shopeeOptimization)
// langsung import dari src/lib/gemini.ts tanpa lewat HTTP.

/**
 * POST /api/llm/gemini/text
 * Body: { prompt: string, systemPrompt?: string, jsonMode?: boolean }
 * Return: { success: true, data: { text: string, raw: <gemini response> } }
 */
router.post("/gemini/text", requireAuth, requireManagement, async (c) => {
    const body = await c.req.json();
    const { prompt, systemPrompt, jsonMode } = body as {
        prompt?: string;
        systemPrompt?: string;
        jsonMode?: boolean;
    };

    if (!prompt || typeof prompt !== "string") {
        return c.json({ success: false, message: "prompt is required" }, 400);
    }

    try {
        const result = await geminiText(prompt, { systemPrompt, jsonMode });
        return c.json({ success: true, data: result });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Gemini call failed";
        return c.json({ success: false, message }, 500);
    }
});

/**
 * POST /api/llm/gemini/vision
 * Body: { prompt: string, imageUrls: string[], jsonMode?: boolean }
 *   imageUrls: array of local paths (e.g. "/uploads/abc.jpg") atau full URLs.
 * Return: { success: true, data: { text: string, raw: <gemini response> } }
 */
router.post("/gemini/vision", requireAuth, requireManagement, async (c) => {
    const body = await c.req.json();
    const { prompt, imageUrls, jsonMode } = body as {
        prompt?: string;
        imageUrls?: string[];
        jsonMode?: boolean;
    };

    if (!prompt || typeof prompt !== "string") {
        return c.json({ success: false, message: "prompt is required" }, 400);
    }
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return c.json({ success: false, message: "imageUrls is required (non-empty array)" }, 400);
    }

    try {
        const result = await geminiVision(prompt, imageUrls, { jsonMode });
        return c.json({ success: true, data: result });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Gemini call failed";
        return c.json({ success: false, message }, 500);
    }
});

export default router;
