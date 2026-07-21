import type { VideoAudience, VideoPromptSet, VideoTalentBrief } from "../db/schema";

/**
 * Generator prompt 4-flow untuk produksi video AI (siap tempel ke Gemini).
 * Bagian statis dari flow tetap; bagian variabel diinterpolasi dari data request klien.
 * Flow: 1) perbaiki produk  2) prompt avatar  3) avatar+produk  4) generate video.
 */

export const CONTENT_STYLES = [
  { key: "grwm", label: "GRWM (Get Ready With Me)", hook: "GRWM" },
  { key: "review", label: "Review Produk", hook: "Review" },
  { key: "unboxing", label: "Unboxing", hook: "Unboxing" },
  { key: "storytelling", label: "Storytelling", hook: "Storytelling" },
  { key: "tutorial", label: "Tutorial / How-to", hook: "Tutorial" },
] as const;

export const PLATFORMS = [
  { key: "tiktok", label: "TikTok", phrase: "Tiktok" },
  { key: "reels", label: "Instagram Reels", phrase: "Instagram Reels" },
  { key: "shorts", label: "YouTube Shorts", phrase: "YouTube Shorts" },
] as const;

export const CONTENT_STYLE_KEYS = CONTENT_STYLES.map((s) => s.key);
export const PLATFORM_KEYS = PLATFORMS.map((p) => p.key);

function styleHook(key: string): string {
  return CONTENT_STYLES.find((s) => s.key === key)?.hook ?? "GRWM";
}
function platformPhrase(key: string): string {
  return PLATFORMS.find((p) => p.key === key)?.phrase ?? "Tiktok";
}

const FLOW1 =
  "Front view product shot of this image. Camera: straight on, eye level, centered composition. Background: clean white seamless background, soft studio lighting. Lighting: soft diffused light from front left subtle shadow on right. Surface: pure white surface, minimal clean shadow directly underneath product only. Quality: 8k, sharp focus on product label, no distortion. Aspect ratio: 1:1";

const AVATAR_JSON_TEMPLATE = `{
  "age": "",
  "shot_style": "amateur iPhone photography, tight medium close up, natural handheld feel, eye level framing",
  "framing": "tight medium close up, centered composition, intimate eye level angle, upper torso and face in frame",
  "skin_tone": "",
  "hair_style": "",
  "hair_color": "",
  "eyes": "",
  "brows": "",
  "nose": "",
  "lips": "",
  "makeup": "",
  "expression": "",
  "lighting": "soft natural lighting with gentle highlights on face",
  "acpect_ratio:" "9:16",
  "product": "wear/holding this product naturally"
}`;

export type BuildPromptInput = {
  productName: string;
  contentStyle: string;
  platform: string;
  hasTalentPhoto: boolean;
  talentBrief?: VideoTalentBrief;
  audience?: VideoAudience;
  benefits?: string | null;
};

export function buildVideoPrompts(input: BuildPromptInput): VideoPromptSet {
  const gender = (input.talentBrief?.gender ?? "").toString().trim() || "perempuan";
  const age = (input.talentBrief?.age ?? "").toString().trim() || "22";
  const setting = (input.talentBrief?.setting ?? "").toString().trim() || "kamar tidur";

  const flow2Instruction = input.hasTalentPhoto
    ? "Lengkapi JSON untuk avatar influencer Indonesia yang wajahnya sesuai dengan gambar talent terlampir."
    : `Lengkapi JSON untuk influencer Indonesia, ${gender} berusia ${age} tahun, di ${setting}`;

  const flow2 = `${AVATAR_JSON_TEMPLATE}\n\n${flow2Instruction}`;

  const flow3 =
    "Gabungkan hasil JSON dari FLOW 2 dengan gambar produk hasil FLOW 1 untuk menghasilkan avatar yang sedang memakai/memegang produk secara natural.";

  const hook = styleHook(input.contentStyle);
  const platform = platformPhrase(input.platform);
  const flow4 = `Multi-cut natural handheld feel ${platform} "${hook}" video Bahasa Indonesia dari produk "${input.productName}" ala Gen Z`;

  return { flow1: FLOW1, flow2, flow3, flow4 };
}
