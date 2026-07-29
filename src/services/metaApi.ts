import { db } from "../db/client";
import { fbAct } from "../db/schema";

const META_API_BASE = "https://graph.facebook.com/v20.0";

const INSIGHT_FIELDS = [
  "impressions",
  "spend",
  "clicks",
  "reach",
  "actions",
  "action_values",
  "cost_per_action_type",
  "cpm",
  "cpc",
  "ctr",
  "cost_per_conversion",
  "unique_actions",
  "unique_outbound_clicks",
  "outbound_clicks",
  "inline_link_clicks",
  "campaign_name",
  "adset_name",
  "ad_name",
  "ad_id",
  "adset_id",
  "campaign_id",
  "account_id",
  "account_name",
  "account_currency",
].join(",");

// Simple in-memory cache (1-minute default TTL)
const cache = new Map<string, { data: unknown; expiry: number }>();

function getCache(key: string): unknown | null {
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) return hit.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown, ttlMs = 60_000) {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

async function metaFetch(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${META_API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const data: any = await res.json();

  if (data.error) {
    throw new Error(data.error.message || "Meta API error");
  }
  return data;
}

export type TimeRange = { since: string; until: string };

// ── Konversi CPAS / Collaborative Ads ────────────────────────────────────────
// Untuk akun katalog bersama, konversi TIDAK muncul di `actions` — Meta menaruh
// purchase/add_to_cart/view_content di laci terpisah `catalog_segment_*`
// (kolom "…for shared items only" di Ads Manager). Akun begini ditandai satu per
// satu lewat `fb_act.data_json.conversion_source = "catalog_segment"`; akun lain
// sama sekali tidak berubah perilakunya.
const CATALOG_SEGMENT_FIELDS = "catalog_segment_actions,catalog_segment_value";

type ActionRow = { action_type: string; value: string };

function parseDataJson(v: unknown): any {
  if (typeof v !== "string") return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

let catalogActsCache: { ids: Set<string>; expiry: number } | null = null;

/** Set act id (tanpa prefix `act_`) yang dikonfigurasi memakai catalog segment. */
async function catalogSegmentActIds(): Promise<Set<string>> {
  if (catalogActsCache && catalogActsCache.expiry > Date.now()) return catalogActsCache.ids;

  const ids = new Set<string>();
  try {
    const rows = await db.select({ actId: fbAct.actId, dataJson: fbAct.dataJson }).from(fbAct);
    for (const r of rows) {
      if (parseDataJson(r.dataJson)?.conversion_source === "catalog_segment") {
        ids.add(r.actId.replace(/^act_/, ""));
      }
    }
  } catch (error) {
    // Config tak terbaca jangan sampai menjatuhkan insight — perlakukan sebagai
    // "tidak ada akun CPAS", persis perilaku sebelum fitur ini ada.
    console.error("[metaApi] gagal membaca config conversion_source", error);
  }

  catalogActsCache = { ids, expiry: Date.now() + 60_000 };
  return ids;
}

/** Dipanggil setelah staff menyimpan konfigurasi akun supaya tidak perlu tunggu TTL. */
export function invalidateInsightConfigCache() {
  catalogActsCache = null;
}

function mergeActions(
  base: ActionRow[] | undefined,
  extra: ActionRow[] | undefined,
): ActionRow[] | undefined {
  if (!extra?.length) return base;
  const out = new Map<string, ActionRow>();
  for (const a of base ?? []) out.set(a.action_type, a);
  for (const a of extra) out.set(a.action_type, a);
  return Array.from(out.values());
}

/**
 * Tulis ulang baris insight: nilai catalog segment ditimpakan ke `actions` /
 * `action_values` supaya SEMUA consumer (dashboard staff, app client, tabel
 * campaign/ad, demografi) membaca angka yang sama dengan Ads Manager tanpa perlu
 * tahu soal CPAS.
 */
function applyCatalogSegment<T>(payload: T): T {
  const rows = (payload as any)?.data;
  if (!Array.isArray(rows)) return payload;

  for (const row of rows) {
    const acts = row?.catalog_segment_actions as ActionRow[] | undefined;
    const vals = row?.catalog_segment_value as ActionRow[] | undefined;
    if (!acts?.length && !vals?.length) continue;

    row.actions = mergeActions(row.actions, acts);
    row.action_values = mergeActions(row.action_values, vals);

    // Meta tidak mengirim cost-per untuk catalog segment; turunkan dari spend
    // supaya kartu `costs_per_*` ikut benar dan bukan nol.
    const spend = Number(row.spend ?? 0);
    if (spend > 0 && acts?.length) {
      const derived = acts
        .filter((a) => Number(a.value) > 0)
        .map((a) => ({ action_type: a.action_type, value: String(spend / Number(a.value)) }));
      row.cost_per_action_type = mergeActions(row.cost_per_action_type, derived);
    }

    delete row.catalog_segment_actions;
    delete row.catalog_segment_value;
  }
  return payload;
}

const fieldsFor = (useCatalog: boolean) =>
  useCatalog ? `${INSIGHT_FIELDS},${CATALOG_SEGMENT_FIELDS}` : INSIGHT_FIELDS;

/** Suffix cache — hasil untuk akun CPAS sudah ter-merge, jadi tak boleh tertukar. */
const catSuffix = (useCatalog: boolean) => (useCatalog ? "-cat" : "");

// Aggregate insights for a date range
export async function fetchInsights(actId: string, token: string, timeRange: TimeRange) {
  const cat = (await catalogSegmentActIds()).has(actId);
  const key = `insights-${actId}-${timeRange.since}-${timeRange.until}${catSuffix(cat)}`;
  const cached = getCache(key);
  if (cached) return cached;

  const raw = await metaFetch(`act_${actId}/insights`, {
    fields: fieldsFor(cat),
    time_range: JSON.stringify(timeRange),
  }, token);
  const data = cat ? applyCatalogSegment(raw) : raw;

  setCache(key, data);
  return data;
}

// Per-day breakdown (time_increment=1)
export async function fetchInsightsPerDay(actId: string, token: string, timeRange: TimeRange) {
  const cat = (await catalogSegmentActIds()).has(actId);
  const key = `insights-perday-${actId}-${timeRange.since}-${timeRange.until}${catSuffix(cat)}`;
  const cached = getCache(key);
  if (cached) return cached;

  const raw = await metaFetch(`act_${actId}/insights`, {
    fields: fieldsFor(cat),
    time_range: JSON.stringify(timeRange),
    time_increment: "1",
  }, token);
  const data = cat ? applyCatalogSegment(raw) : raw;

  setCache(key, data);
  return data;
}

// Campaign-level insights
export async function fetchInsightsByCampaign(actId: string, token: string, timeRange: TimeRange) {
  const cat = (await catalogSegmentActIds()).has(actId);
  const key = `insights-campaign-${actId}-${timeRange.since}-${timeRange.until}${catSuffix(cat)}`;
  const cached = getCache(key);
  if (cached) return cached;

  const raw = await metaFetch(`act_${actId}/insights`, {
    fields: fieldsFor(cat),
    time_range: JSON.stringify(timeRange),
    level: "campaign",
    sort: "reach_descending",
  }, token);
  const data = cat ? applyCatalogSegment(raw) : raw;

  setCache(key, data);
  return data;
}

// Ad-level insights with cursor pagination
export async function fetchInsightsByAd(actId: string, token: string, timeRange: TimeRange) {
  const cat = (await catalogSegmentActIds()).has(actId);
  const key = `insights-ad-${actId}-${timeRange.since}-${timeRange.until}${catSuffix(cat)}`;
  const cached = getCache(key);
  if (cached) return cached;

  const allData: unknown[] = [];
  let after: string | undefined;
  let iterations = 0;

  while (iterations < 10) {
    const params: Record<string, string> = {
      fields: fieldsFor(cat),
      time_range: JSON.stringify(timeRange),
      level: "ad",
      sort: "clicks_descending",
    };
    if (after) params.after = after;

    const res: any = await metaFetch(`act_${actId}/insights`, params, token);
    if (res.data) allData.push(...res.data);

    after = res.paging?.cursors?.after;
    if (!after || !res.paging?.next) break;
    iterations++;
  }

  const result = { data: allData };
  if (cat) applyCatalogSegment(result);
  setCache(key, result);
  return result;
}

// Demographic breakdowns
export async function fetchInsightsByBreakdown(
  actId: string,
  token: string,
  timeRange: TimeRange,
  breakdown: "age" | "gender" | "impression_device"
) {
  const cat = (await catalogSegmentActIds()).has(actId);
  const key = `insights-${breakdown}-${actId}-${timeRange.since}-${timeRange.until}${catSuffix(cat)}`;
  const cached = getCache(key);
  if (cached) return cached;

  const raw = await metaFetch(`act_${actId}/insights`, {
    fields: fieldsFor(cat),
    time_range: JSON.stringify(timeRange),
    breakdowns: breakdown,
  }, token);
  const data = cat ? applyCatalogSegment(raw) : raw;

  setCache(key, data);
  return data;
}

// Ad creative thumbnails (batch) — gambar statis untuk kartu "Iklan Terbaik"
// di client app; sengaja BUKAN fetchAdPreview (iframe embed), lihat catatan
// di docs/perform-fb-mobile-version.md §3.3.
export async function fetchAdThumbnails(
  adIds: string[],
  token: string
): Promise<Record<string, string | null>> {
  if (adIds.length === 0) return {};

  const key = `ad-thumbs-${adIds.slice().sort().join(",")}`;
  const cached = getCache(key) as Record<string, string | null> | null;
  if (cached) return cached;

  const data: any = await metaFetch("", {
    ids: adIds.join(","),
    fields: "creative{thumbnail_url}",
  }, token);

  const result: Record<string, string | null> = {};
  for (const id of adIds) {
    result[id] = data?.[id]?.creative?.thumbnail_url ?? null;
  }

  setCache(key, result, 5 * 60_000);
  return result;
}

// Ad preview — returns HTML iframe body
export async function fetchAdPreview(adId: string, token: string) {
  const key = `preview-${adId}`;
  const cached = getCache(key);
  if (cached) return cached;

  try {
    const data: any = await metaFetch(`${adId}/previews`, {
      ad_format: "MOBILE_FEED_STANDARD",
    }, token);

    setCache(key, data);
    return data;
  } catch {
    // Fallback: fetch creative data
    const adData: any = await metaFetch(adId, {
      fields: "creative,account_id,adset_id,campaign_id",
    }, token);

    if (adData?.creative?.id) {
      const creative: any = await metaFetch(adData.creative.id, {
        fields: "effective_object_story_id,object_story_spec",
      }, token);
      const result = { data: [{ body: creative?.object_story_spec || null }] };
      setCache(key, result);
      return result;
    }

    return { data: [] };
  }
}
