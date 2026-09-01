import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  shopeeScrapeSessions,
  shopeeShops,
  shopeeProducts,
  shopeeScores,
} from "../db/schema";
import { geminiText, geminiVision } from "./gemini";
import { setProgress } from "./shopeeProgress";

/**
 * Shopee Analyzer — score & verdict untuk shop + products.
 * Dipanggil dari run flow (POST /sessions & POST /sessions/:id/run).
 *
 * Shop scoring: banner, logo, name, bio, stats, hero, bottom hero
 * Product scoring: title, images, categories, description, specs
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
      score: match ? Math.max(0, Math.min(100, Number(match[1]))) : 0,
      feedback: text.slice(0, 500),
    };
  }
}

// ─── Phase 1: Score shop (banner, logo, name, bio, stats, hero, bottom hero) ─

async function scoreShop(sessionId: number, onProgress?: (msg: string) => void): Promise<void> {
  const [shop] = await db
    .select()
    .from(shopeeShops)
    .where(eq(shopeeShops.sessionId, sessionId));
  if (!shop) return;

  let bannerScore: number | null = null;
  let logoScore: number | null = null;
  let nameScore: number | null = null;
  let bioScore: number | null = null;
  let statsScore: number | null = null;
  let heroScore: number | null = null;
  let bottomHeroScore: number | null = null;
  const feedback: Record<string, string> = {};

  // Image URLs: prefer local, fallback ke remote URL
  const bannerImg = shop.bannerLocal || shop.bannerUrl || null;
  const logoImg = shop.logoLocal || shop.logoUrl || null;
  const heroImages = (shop.heroImages as string[] | null) || [];
  const bottomHeroImages = (shop.bottomHeroImages as string[] | null) || [];

  // Score banner (vision)
  if (bannerImg) {
    const prompt = `You are a Shopee store optimization expert. Score this shop banner/cover image (0-100) based on:
- Visual appeal & professionalism
- Clear branding
- Readability
- Appropriate for Shopee marketplace

Shop name: "${shop.shopName || "N/A"}"

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>", "description": "<VISUAL DESCRIPTION ONLY in English — describe what you actually see: layout, colors, typography, imagery, products shown, background, lighting, mood, style. Do NOT evaluate, score, judge, or give opinions. Do NOT use Indonesian. Example: 'A wide banner image with dark background, white serif text centered, gold jewelry product on the left side, soft directional lighting from the right.'>"}`;
    const response = await callGeminiVision(prompt, [bannerImg], true);
    const result = parseScoreResponse(response);
    bannerScore = result.score;
    feedback.banner = result.feedback;
    onProgress?.("Scoring banner...");
    // Extract banner description
    try {
      const parsed = JSON.parse(response.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
      if (parsed.description) {
        feedback.bannerDescription = String(parsed.description);
        console.log(`[analyzer] banner description: ${feedback.bannerDescription}`);
      }
    } catch {
      feedback.bannerDescription = result.feedback;
    }
  }

  // Score logo (vision)
  if (logoImg) {
    const prompt = `You are a Shopee store optimization expert. Score this shop logo (0-100) based on:
- Clear & recognizable
- Professional appearance
- Appropriate size/aspect ratio for Shopee
- Brand representation

Shop name: "${shop.shopName || "N/A"}"

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>", "description": "<VISUAL DESCRIPTION ONLY in English — describe what you actually see: shape, colors, typography style, imagery, layout, background, mood. Do NOT evaluate, score, judge, or give opinions. Do NOT use Indonesian. Example: 'A circular logo with black background, white uppercase serif text UNHEARD OF centered, minimalist wordmark layout.'>"}`;
    const response = await callGeminiVision(prompt, [logoImg], true);
    const result = parseScoreResponse(response);
    logoScore = result.score;
    feedback.logo = result.feedback;
    onProgress?.("Scoring logo...");
    // Extract logo description (visual appearance, bukan feedback)
    try {
      const parsed = JSON.parse(response.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
      if (parsed.description) {
        feedback.logoDescription = String(parsed.description);
        console.log(`[analyzer] logo description: ${feedback.logoDescription}`);
      }
    } catch {
      // Fallback: pakai feedback sebagai description kalau parse gagal
      feedback.logoDescription = result.feedback;
    }
  }

  // Score name (text)
  if (shop.shopName) {
    const prompt = `You are a Shopee store optimization expert. Score this shop name (0-100) based on:
- Clear & memorable
- Professional & trustworthy
- Contains relevant keywords for search
- Appropriate length (not too short, not too long)

Shop name: "${shop.shopName}"

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;
    const response = await callGeminiText(prompt, undefined, true);
    const result = parseScoreResponse(response);
    nameScore = result.score;
    feedback.name = result.feedback;
    onProgress?.("Scoring shop name...");
  }

  // Score bio (text)
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
    onProgress?.("Scoring shop bio...");
  }

  // Score stats (text) — analisa performa toko dari stats
  if (shop.shopStats && Object.keys(shop.shopStats).length > 0) {
    const statsJson = JSON.stringify(shop.shopStats);
    const prompt = `You are a Shopee store optimization expert. Score this shop performance stats (0-100) based on:
- Chat response rate & speed
- Rating & review count
- Follower count
- Products count
- Join date (how established)

Shop stats: ${statsJson}

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;
    const response = await callGeminiText(prompt, undefined, true);
    const result = parseScoreResponse(response);
    statsScore = result.score;
    feedback.stats = result.feedback;
    onProgress?.("Scoring shop stats...");
  }

  // Score hero images (vision) — PER IMAGE, generate score + feedback
  if (heroImages.length > 0) {
    const heroFeedbacks: string[] = [];
    const heroScoresArr: number[] = [];
    for (let i = 0; i < heroImages.length; i++) {
      try {
        const prompt = `You are a Shopee store optimization expert. Score this shop hero/carousel image (0-100) based on:
- Visual appeal & professionalism
- Clear branding & messaging
- Readability of text (if any)
- Appropriate for Shopee marketplace

Shop name: "${shop.shopName || "N/A"}"
Image index: ${i + 1} of ${heroImages.length}

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;
        const response = await callGeminiVision(prompt, [heroImages[i]], true);
        const result = parseScoreResponse(response);
        heroScoresArr.push(result.score || 0);
        heroFeedbacks.push(result.feedback || "N/A");
        onProgress?.(`Scoring hero image ${i + 1}/${heroImages.length}...`);
      } catch (err) {
        console.error(`[analyzer] hero[${i}] score failed:`, err);
        heroScoresArr.push(0);
        heroFeedbacks.push("N/A");
      }
    }
    heroScore = heroScoresArr.length > 0 ? Math.round(heroScoresArr.reduce((a, b) => a + b, 0) / heroScoresArr.length) : null;
    feedback.hero = heroFeedbacks.join(" | ");
    feedback.heroFeedbacks = JSON.stringify(heroFeedbacks);
    feedback.heroScores = JSON.stringify(heroScoresArr);
  }

  // Extract hero description PER IMAGE (loop sebanyak jumlah hero images)
  // Simpan sebagai JSON array string di feedback.heroDescriptions
  if (heroImages.length > 0) {
    const heroDescriptions: string[] = [];
    for (let i = 0; i < heroImages.length; i++) {
      try {
        const descPrompt = `You are a visual description assistant. Describe ONLY what you see in this shop hero/carousel image. Do NOT evaluate, score, judge, or give opinions. Respond in English only — do NOT use Indonesian.

Shop name: "${shop.shopName || "N/A"}"
Image index: ${i + 1} of ${heroImages.length}

Describe the visual appearance: layout, colors, typography, imagery, products shown, background, lighting, composition, mood, style.

Respond in JSON: {"description": "<visual description in English — what you actually see, no opinions>"}`;
        const descResponse = await callGeminiVision(descPrompt, [heroImages[i]], true);
        const parsed = JSON.parse(descResponse.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
        if (parsed.description) {
          heroDescriptions.push(String(parsed.description));
          console.log(`[analyzer] hero[${i}] description: ${parsed.description}`);
        } else {
          heroDescriptions.push("N/A");
        }
      } catch (err) {
        console.error(`[analyzer] hero[${i}] description failed:`, err);
        heroDescriptions.push(feedback.hero || "N/A");
      }
    }
    feedback.heroDescriptions = JSON.stringify(heroDescriptions);
  }

  // Score bottom hero images (vision) — PER IMAGE, generate score + feedback
  if (bottomHeroImages.length > 0) {
    const bottomHeroFeedbacks: string[] = [];
    const bottomHeroScoresArr: number[] = [];
    for (let i = 0; i < bottomHeroImages.length; i++) {
      try {
        const prompt = `You are a Shopee store optimization expert. Score this shop bottom hero/promo image (0-100) based on:
- Visual appeal & professionalism
- Clear promotion messaging
- Readability of text (if any)
- Appropriate for Shopee marketplace

Shop name: "${shop.shopName || "N/A"}"
Image index: ${i + 1} of ${bottomHeroImages.length}

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;
        const response = await callGeminiVision(prompt, [bottomHeroImages[i]], true);
        const result = parseScoreResponse(response);
        bottomHeroScoresArr.push(result.score || 0);
        bottomHeroFeedbacks.push(result.feedback || "N/A");
        onProgress?.(`Scoring bottom hero image ${i + 1}/${bottomHeroImages.length}...`);
      } catch (err) {
        console.error(`[analyzer] bottomHero[${i}] score failed:`, err);
        bottomHeroScoresArr.push(0);
        bottomHeroFeedbacks.push("N/A");
      }
    }
    bottomHeroScore = bottomHeroScoresArr.length > 0 ? Math.round(bottomHeroScoresArr.reduce((a, b) => a + b, 0) / bottomHeroScoresArr.length) : null;
    feedback.bottomHero = bottomHeroFeedbacks.join(" | ");
    feedback.bottomHeroFeedbacks = JSON.stringify(bottomHeroFeedbacks);
    feedback.bottomHeroScores = JSON.stringify(bottomHeroScoresArr);
  }

  // Extract bottom hero description PER IMAGE (loop sebanyak jumlah bottom hero images)
  // Simpan sebagai JSON array string di feedback.bottomHeroDescriptions
  if (bottomHeroImages.length > 0) {
    const bottomHeroDescriptions: string[] = [];
    for (let i = 0; i < bottomHeroImages.length; i++) {
      try {
        const descPrompt = `You are a visual description assistant. Describe ONLY what you see in this shop bottom hero/promo image. Do NOT evaluate, score, judge, or give opinions. Respond in English only — do NOT use Indonesian.

Shop name: "${shop.shopName || "N/A"}"
Image index: ${i + 1} of ${bottomHeroImages.length}

Describe the visual appearance: layout, colors, typography, imagery, products shown, promo text, background, lighting, composition, mood, style.

Respond in JSON: {"description": "<visual description in English — what you actually see, no opinions>"}`;
        const descResponse = await callGeminiVision(descPrompt, [bottomHeroImages[i]], true);
        const parsed = JSON.parse(descResponse.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
        if (parsed.description) {
          bottomHeroDescriptions.push(String(parsed.description));
          console.log(`[analyzer] bottomHero[${i}] description: ${parsed.description}`);
        } else {
          bottomHeroDescriptions.push("N/A");
        }
      } catch (err) {
        console.error(`[analyzer] bottomHero[${i}] description failed:`, err);
        bottomHeroDescriptions.push(feedback.bottomHero || "N/A");
      }
    }
    feedback.bottomHeroDescriptions = JSON.stringify(bottomHeroDescriptions);
  }

  // ─── Extract Visual Aesthetics & Brand Color Palette ──────────────────────
  // Analisa visual identity toko dari banner, logo, hero images via Gemini vision.
  // Hasil disimpan ke feedback.visualAesthetics & feedback.brandColorPalette.
  // Dipakai oleh generateSessionDrafts untuk prompt frame template.
  const brandImages: string[] = [];
  if (bannerImg) brandImages.push(bannerImg);
  if (logoImg) brandImages.push(logoImg);
  if (heroImages.length > 0) brandImages.push(...heroImages.slice(0, 3));

  if (brandImages.length > 0) {
    const prompt = `You are a brand visual identity expert. Analyze this Shopee shop's visual branding from the provided images (banner, logo, hero images).

Shop name: "${shop.shopName || "N/A"}"
Shop bio: ${shop.shopBio || "N/A"}

Extract the shop's visual identity. Respond in JSON with this exact format:
{
  "visualAesthetics": "<describe the visual style in 1-2 sentences — e.g. 'Luxury, dark mode/high contrast, refined craftsmanship, clean geometric lines, ultra-minimalist' or 'Playful, bright, colorful, casual, rounded shapes'>",
  "brandColorPalette": "<list 2-3 dominant brand colors derived from the images — e.g. 'Deep matte black, metallic silver/steel grey, pure white' or 'Pastel pink, cream, soft gold'>"
}

Base your analysis on:
- Color scheme used in banner/logo/hero
- Typography style (if visible)
- Overall mood/tone (luxury, playful, professional, casual, etc.)
- Design elements (geometric, organic, minimalist, ornate, etc.)
- Contrast level (dark mode, bright, high contrast, soft, etc.)

Respond ONLY with the JSON object, no explanation.`;
    try {
      const response = await callGeminiVision(prompt, brandImages, true);
      // Strip markdown code blocks kalau ada (```json ... ```)
      const jsonStr = response.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed.visualAesthetics) {
        feedback.visualAesthetics = String(parsed.visualAesthetics);
      }
      if (parsed.brandColorPalette) {
        feedback.brandColorPalette = String(parsed.brandColorPalette);
      }
      console.log(`[analyzer] shop visual identity: aesthetics="${feedback.visualAesthetics}", palette="${feedback.brandColorPalette}"`);
      onProgress?.("Extracting shop visual identity...");
    } catch (err) {
      console.error(`[analyzer] failed to extract visual identity:`, err);
      // Fallback: derive from bio text
      feedback.visualAesthetics = "Clean, professional, modern e-commerce aesthetic.";
      feedback.brandColorPalette = "Neutral tones with brand accent colors.";
    }
  } else {
    // No images available — fallback to generic
    feedback.visualAesthetics = "Clean, professional, modern e-commerce aesthetic.";
    feedback.brandColorPalette = "Neutral tones with brand accent colors.";
  }

  // Aggregate shop score
  const scores = [bannerScore, logoScore, nameScore, bioScore, statsScore, heroScore, bottomHeroScore].filter(
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
    nameScore,
    statsScore,
    heroScore,
    bottomHeroScore,
    totalScore,
    verdict,
    feedback,
  });
}

// ─── Phase 2: Score products (title, images, categories, description, specs) ──

async function scoreProducts(sessionId: number, onProgress?: (msg: string) => void): Promise<void> {
  const products = await db
    .select()
    .from(shopeeProducts)
    .where(eq(shopeeProducts.sessionId, sessionId));

  for (const product of products) {
    let titleScore: number | null = null;
    let descriptionScore: number | null = null;
    let photoScore: number | null = null;
    let categoriesScore: number | null = null;
    let specsScore: number | null = null;
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
      onProgress?.(`Product ${product.id}: scoring title...`);
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
      onProgress?.(`Product ${product.id}: scoring description...`);
    }

    // Score photos (vision) — PER PHOTO, generate score + feedback + description
    const thumbImg = product.thumbnailLocal || product.thumbnailUrl || null;
    const productImages = (product.images as string[] | null) || [];
    const uniquePhotos = [...new Set([thumbImg, ...productImages.slice(0, 5)].filter(Boolean))] as string[];

    const photoFeedbacks: string[] = [];
    const photoDescriptions: string[] = [];
    const photoScores: number[] = [];

    for (let pi = 0; pi < uniquePhotos.length; pi++) {
      const photoUrl = uniquePhotos[pi];
      try {
        // Score + feedback per photo
        const scorePrompt = `You are a Shopee product optimization expert. Score this product photo (0-100) based on:
- Clear & well-lit
- Professional appearance
- Shows product clearly
- Appropriate for Shopee marketplace

Product title: "${product.title || "N/A"}"
Photo index: ${pi + 1} of ${uniquePhotos.length}

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>", "description": "<VISUAL DESCRIPTION ONLY in English — describe what you actually see: background, lighting, angle, composition, props, mood, style, product placement. Do NOT evaluate or give opinions. Do NOT use Indonesian.>"}`;
        const scoreResponse = await callGeminiVision(scorePrompt, [photoUrl], true);
        if (!scoreResponse || scoreResponse.trim() === "") {
          throw new Error("Empty Gemini response (rate limited)");
        }
        const result = parseScoreResponse(scoreResponse);
        photoScores.push(result.score);
        photoFeedbacks.push(result.feedback || "N/A");

        // Extract description from same response
        try {
          const parsed = JSON.parse(scoreResponse.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
          if (parsed.description) {
            photoDescriptions.push(String(parsed.description));
          } else {
            photoDescriptions.push("N/A");
          }
        } catch {
          photoDescriptions.push("N/A");
        }
        console.log(`[analyzer] product ${product.id} photo[${pi}] score: ${result.score}, feedback: ${result.feedback?.slice(0, 60)}`);
        onProgress?.(`Product ${product.id}: scoring photo ${pi + 1}/${uniquePhotos.length}...`);
      } catch (err) {
        console.error(`[analyzer] product ${product.id} photo[${pi}] failed:`, err);
        photoScores.push(0);
        photoFeedbacks.push("N/A");
        photoDescriptions.push("N/A");
      }
    }

    if (photoScores.length > 0) {
      photoScore = Math.round(photoScores.reduce((a, b) => a + b, 0) / photoScores.length);
      feedback.photo = photoFeedbacks.join(" | ");
      feedback.photoFeedbacks = JSON.stringify(photoFeedbacks);
      feedback.photoDescriptions = JSON.stringify(photoDescriptions);
      feedback.photoScores = JSON.stringify(photoScores);
      // Keep photoDescription (first photo) for backwards compat
      feedback.photoDescription = photoDescriptions[0] || "N/A";
    }

    // Score categories (text) — analisa kategori produk
    const categories = (product.categories as string[] | null) || [];
    if (categories.length > 0) {
      const prompt = `You are a Shopee product optimization expert. Score this product category placement (0-100) based on:
- Category accuracy (is product in the right category?)
- Category depth (specific enough?)
- Search discoverability

Product title: "${product.title || "N/A"}"
Categories: ${categories.join(" > ")}

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;
      const response = await callGeminiText(prompt, undefined, true);
      const result = parseScoreResponse(response);
      categoriesScore = result.score;
      feedback.categories = result.feedback;
      onProgress?.(`Product ${product.id}: scoring categories...`);
    }

    // Score specs (text) — analisa spesifikasi produk
    const specs = (product.specs as Record<string, string> | null) || {};
    if (Object.keys(specs).length > 0) {
      const specsJson = JSON.stringify(specs);
      const prompt = `You are a Shopee product optimization expert. Score this product specifications (0-100) based on:
- Completeness (are key specs filled?)
- Accuracy & relevance
- Helps buyer decision-making

Product title: "${product.title || "N/A"}"
Specifications: ${specsJson}

Respond in JSON: {"score": <number>, "feedback": "<short feedback in Indonesian>"}`;
      const response = await callGeminiText(prompt, undefined, true);
      const result = parseScoreResponse(response);
      specsScore = result.score;
      feedback.specs = result.feedback;
      onProgress?.(`Product ${product.id}: scoring specs...`);
    }

    // Aggregate product score
    const scores = [titleScore, descriptionScore, photoScore, categoriesScore, specsScore].filter(
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
      categoriesScore,
      specsScore,
      totalScore,
      verdict,
      feedback,
    });
  }
}

// ─── Main: analyzeSession(sessionId) ───────────────────────────────────────

export async function analyzeSession(sessionId: number): Promise<void> {
  console.log(`[shopeeAnalyzer] session ${sessionId}: starting analysis`);

  // Hapus scores lama (avoid duplicates saat reanalyze)
  await db.delete(shopeeScores).where(eq(shopeeScores.sessionId, sessionId));

  // Count total steps for progress
  const products = await db
    .select({ id: shopeeProducts.id, images: shopeeProducts.images })
    .from(shopeeProducts)
    .where(eq(shopeeProducts.sessionId, sessionId));
  const [shop] = await db.select().from(shopeeShops).where(eq(shopeeShops.sessionId, sessionId));
  const heroCount = shop ? ((shop.heroImages as string[] | null) || []).length : 0;
  const bottomHeroCount = shop ? ((shop.bottomHeroImages as string[] | null) || []).length : 0;
  // Shop steps: banner + logo + name + bio + stats + hero(N) + bottomHero(N) + visualIdentity = 6 + heroCount + bottomHeroCount
  const shopSteps = 6 + heroCount + bottomHeroCount + 1;
  // Product steps: each product = title + photo(up to 5) + categories + description + specs = 9 max
  const productSteps = products.reduce((sum, p) => {
    const imgs = ((p.images as string[] | null) || []).slice(0, 5);
    return sum + 1 + imgs.length + 3; // title + photos + categories + desc + specs
  }, 0);
  const totalSteps = shopSteps + productSteps;

  let currentStep = 0;
  setProgress(sessionId, { phase: "analyzing", step: 0, total: totalSteps, message: "Starting analysis..." });

  // Phase 1: Score shop (with progress callback)
  await scoreShop(sessionId, (msg: string) => {
    currentStep++;
    setProgress(sessionId, { phase: "analyzing", step: currentStep, total: totalSteps, message: msg });
  });
  console.log(`[shopeeAnalyzer] session ${sessionId}: shop scored`);

  // Phase 2: Score products (with progress callback)
  await scoreProducts(sessionId, (msg: string) => {
    currentStep++;
    setProgress(sessionId, { phase: "analyzing", step: currentStep, total: totalSteps, message: msg });
  });
  console.log(`[shopeeAnalyzer] session ${sessionId}: products scored (${products.length})`);

  setProgress(sessionId, { phase: "analyzing", step: totalSteps, total: totalSteps, message: "Analysis complete" });
  console.log(`[shopeeAnalyzer] session ${sessionId}: analysis complete`);
}

async function countProducts(sessionId: number): Promise<number> {
  const products = await db
    .select({ id: shopeeProducts.id })
    .from(shopeeProducts)
    .where(eq(shopeeProducts.sessionId, sessionId));
  return products.length;
}
