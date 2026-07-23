import { Hono, type Context } from "hono";

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
 *   POST /api/llm/v1/chat/completions
 *   GET  /api/llm/v1/models
 *
 * Env:
 *   DEEPSEEK_API_KEY        (wajib)  — key asli, hanya di server ini
 *   LLM_TEAM_TOKEN          (opsional) — kalau diset, node WAJIB kirim token ini
 *   DEEPSEEK_UPSTREAM_URL   (opsional) — default https://api.deepseek.com/v1
 */

const router = new Hono();

const UPSTREAM = (
    process.env.DEEPSEEK_UPSTREAM_URL || "https://api.deepseek.com/v1"
).replace(/\/+$/, "");
const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const TEAM_TOKEN = process.env.LLM_TEAM_TOKEN || "";

// Health check TANPA auth — buat cek cepat gateway hidup + key terpasang.
router.get("/health", (c) =>
    c.json({ ok: true, upstream: UPSTREAM, keyConfigured: !!API_KEY }),
);

// Gate: pastikan key server ada; kalau LLM_TEAM_TOKEN diset, token pemanggil wajib cocok.
router.use("*", async (c, next) => {
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

export default router;
