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

// Aggregate insights for a date range
export async function fetchInsights(actId: string, token: string, timeRange: TimeRange) {
  const key = `insights-${actId}-${timeRange.since}-${timeRange.until}`;
  const cached = getCache(key);
  if (cached) return cached;

  const data = await metaFetch(`act_${actId}/insights`, {
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify(timeRange),
  }, token);

  setCache(key, data);
  return data;
}

// Per-day breakdown (time_increment=1)
export async function fetchInsightsPerDay(actId: string, token: string, timeRange: TimeRange) {
  const key = `insights-perday-${actId}-${timeRange.since}-${timeRange.until}`;
  const cached = getCache(key);
  if (cached) return cached;

  const data = await metaFetch(`act_${actId}/insights`, {
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify(timeRange),
    time_increment: "1",
  }, token);

  setCache(key, data);
  return data;
}

// Campaign-level insights
export async function fetchInsightsByCampaign(actId: string, token: string, timeRange: TimeRange) {
  const key = `insights-campaign-${actId}-${timeRange.since}-${timeRange.until}`;
  const cached = getCache(key);
  if (cached) return cached;

  const data = await metaFetch(`act_${actId}/insights`, {
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify(timeRange),
    level: "campaign",
    sort: "reach_descending",
  }, token);

  setCache(key, data);
  return data;
}

// Ad-level insights with cursor pagination
export async function fetchInsightsByAd(actId: string, token: string, timeRange: TimeRange) {
  const key = `insights-ad-${actId}-${timeRange.since}-${timeRange.until}`;
  const cached = getCache(key);
  if (cached) return cached;

  const allData: unknown[] = [];
  let after: string | undefined;
  let iterations = 0;

  while (iterations < 10) {
    const params: Record<string, string> = {
      fields: INSIGHT_FIELDS,
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
  const key = `insights-${breakdown}-${actId}-${timeRange.since}-${timeRange.until}`;
  const cached = getCache(key);
  if (cached) return cached;

  const data = await metaFetch(`act_${actId}/insights`, {
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify(timeRange),
    breakdowns: breakdown,
  }, token);

  setCache(key, data);
  return data;
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
