import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  shopeeScrapeSessions,
  shopeeShops,
  shopeeProducts,
  shopeeScores,
} from "../db/schema";
import { geminiText, geminiVision } from "./gemini";

/**
 * Shopee Analyzer — score & verdict untuk shop + products.
 * Dipanggil dari run flow (POST /sessions & POST /sessions/:id/run).
 * TIDAK punya route sendiri — pure logic function.
 *
 * Phase 1: Score shop (banner, logo, bio) + aggregate shop style profile
 * Phase 2: Score products (title, description, photos) per product
 * Aggregate → verdict (threshold 70)
 *
 * Pakai Gemini vision (untuk image scoring) + text (untuk text scoring).
 * Rate limit: sudah di-handle di src/lib/gemini.ts (15 RPM, retry backoff).
 */

const VERDICT_THRESHOLD = 70;

// ─── Helpers: call Gemini via shared lib (no HTTP) ─────────────────────────

async function callGeminiText(
  prompt: string,
  systemPrompt?: string,
  jsonMode?: boolean,
): Promise<string> {
  try {
    const result = await geminiText(prompt, { systemPrompt, jsonMode });
    return result.text;
  } catch (err) {
    console.error("[shopeeAnalyzer] Gemini text error:", err);
    return "";
  }
}

async function callGeminiVision(
  prompt: string,
  imageUrls: string[],
  jsonMode?: boolean,
): Promise<string> {
  try {
    const result = await geminiVision(prompt, imageUrls, { jsonMode });
    return result.text;
  } catch (err) {
    console.error("[shopeeAnalyzer] Gemini vision error:", err);
    return "";
  }
}

// ─── Score parsing ─────────────────────────────────────────────────────────

interface ScoreResult {
  score: number;
  feedback: string;
}

function parseScoreResponse(text: string): ScoreResult {
  try {
    const parsed = JSON.parse(text);
    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      feedback: String(parsed.feedback || ""),
    };
  } catch {
    // Fallback: cari angka di text
    const match = text.match(/(\d+)/);
    return {
      score: match ? Math.max(0, Math.min(100, Number(match[1]))) : 50,
      feedback: text.slice(0, 500),
    };
  }
}

// ─── Phase 1: Score shop (banner, logo, bio) ───────────────────────────────

async function scoreShop(sessionId: number): Promise<void> {
  const [shop] = await db
    .select()
    .from(shopeeShops)
    .where(eq(shopeeShops.sessionId, sessionId));
  if (!shop) return;

  let bannerScore: number | null = null;
  let logoScore: number | null = null;
  let bioScore: number | null = null;
  const feedback: Record<string, string> = {};

  // Score banner (vision) — kalau ada banner image
  if (shop.bannerLocal) {
    const prompt = `You are a Shopee store optimization expert. Score this shop banner/cover image (0-100) based on:
- Visual appeal & professionalism
- Clear branding
- Readability
- Appropriate for Shopee marketplace

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;

    const response = await callGeminiVision(prompt, [shop.bannerLocal], true);
    const result = parseScoreResponse(response);
    bannerScore = result.score;
    feedback.banner = result.feedback;
  }

  // Score logo (vision) — kalau ada logo image
  if (shop.logoLocal) {
    const prompt = `You are a Shopee store optimization expert. Score this shop logo (0-100) based on:
- Clear & recognizable
- Professional appearance
- Appropriate size/aspect ratio for Shopee
- Brand representation

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;

    const response = await callGeminiVision(prompt, [shop.logoLocal], true);
    const result = parseScoreResponse(response);
    logoScore = result.score;
    feedback.logo = result.feedback;
  }

  // Score bio (text) — kalau ada bio
  if (shop.shopBio) {
    const prompt = `You are a Shopee store optimization expert. Score this shop bio/description (0-100) based on:
- Clear & informative
- Professional tone
- Contains relevant keywords for SEO
- Appropriate length (not too short, not too long)

Shop bio: "${shop.shopBio}"

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;

    const response = await callGeminiText(prompt, undefined, true);
    const result = parseScoreResponse(response);
    bioScore = result.score;
    feedback.bio = result.feedback;
  }

  // Aggregate shop score
  const scores = [bannerScore, logoScore, bioScore].filter(
    (s): s is number => s !== null,
  );
  const totalScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
  const verdict =
    totalScore >= VERDICT_THRESHOLD
      ? "good"
      : totalScore >= 40
        ? "needs_improvement"
        : "poor";

  // Save shop score
  await db.insert(shopeeScores).values({
    sessionId,
    productId: null,
    itemType: "shop",
    bannerScore,
    logoScore,
    bioScore,
    totalScore,
    verdict,
    feedback,
  });
}

// ─── Phase 2: Score products (title, description, photos) ──────────────────

async function scoreProducts(sessionId: number): Promise<void> {
  const products = await db
    .select()
    .from(shopeeProducts)
    .where(eq(shopeeProducts.sessionId, sessionId));

  for (const product of products) {
    let titleScore: number | null = null;
    let descriptionScore: number | null = null;
    let photoScore: number | null = null;
    const feedback: Record<string, string> = {};

    // Score title (text)
    if (product.title) {
      const prompt = `You are a Shopee product optimization expert. Score this product title (0-100) based on:
- Clear & descriptive
- Contains relevant keywords for Shopee search
- Appropriate length (not too short, not too long)
- Professional tone

Product title: "${product.title}"

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;

      const response = await callGeminiText(prompt, undefined, true);
      const result = parseScoreResponse(response);
      titleScore = result.score;
      feedback.title = result.feedback;
    }

    // Score description (text)
    if (product.description) {
      const prompt = `You are a Shopee product optimization expert. Score this product description (0-100) based on:
- Clear & informative
- Contains product specifications
- Professional tone
- Appropriate length
- Contains relevant keywords

Product description: "${product.description.slice(0, 1000)}"

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;

      const response = await callGeminiText(prompt, undefined, true);
      const result = parseScoreResponse(response);
      descriptionScore = result.score;
      feedback.description = result.feedback;
    }

    // Score photos (vision) — kalau ada thumbnail
    if (product.thumbnailLocal) {
      const prompt = `You are a Shopee product optimization expert. Score this product thumbnail photo (0-100) based on:
- Clear & well-lit
- Professional appearance
- Shows product clearly
- Appropriate for Shopee marketplace

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;

      const response = await callGeminiVision(prompt, [product.thumbnailLocal], true);
      const result = parseScoreResponse(response);
      photoScore = result.score;
      feedback.photo = result.feedback;
    }

    // Aggregate product score
    const scores = [titleScore, descriptionScore, photoScore].filter(
      (s): s is number => s !== null,
    );
    const totalScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    const verdict =
      totalScore >= VERDICT_THRESHOLD
        ? "good"
        : totalScore >= 40
          ? "needs_improvement"
          : "poor";

    // Save product score
    await db.insert(shopeeScores).values({
      sessionId,
      productId: product.id,
      itemType: "product",
      titleScore,
      descriptionScore,
      photoScore,
      totalScore,
      verdict,
      feedback,
    });
  }
}

// ─── Main: analyzeSession(sessionId) ───────────────────────────────────────

export async function analyzeSession(sessionId: number): Promise<void> {
  console.log(`[shopeeAnalyzer] session ${sessionId}: starting analysis`);

  // Phase 1: Score shop
  await scoreShop(sessionId);
  console.log(`[shopeeAnalyzer] session ${sessionId}: shop scored`);

  // Phase 2: Score products
  await scoreProducts(sessionId);
  console.log(`[shopeeAnalyzer] session ${sessionId}: products scored (${await countProducts(sessionId)})`);

  console.log(`[shopeeAnalyzer] session ${sessionId}: analysis complete`);
}

async function countProducts(sessionId: number): Promise<number> {
  const products = await db
    .select({ id: shopeeProducts.id })
    .from(shopeeProducts)
    .where(eq(shopeeProducts.sessionId, sessionId));
  return products.length;
}
