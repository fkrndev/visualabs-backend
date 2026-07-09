import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  assetRequests,
  clientUpdateReads,
  clientUpdates,
  fbActDailyData,
  fbActResultBreakdownDaily,
  fbToken,
  platformDailyMetrics,
  profiles,
  scorecards,
  users,
  customerProfiles,
} from "../db/schema";
import { requireCustomer } from "../middleware/customerAuth";
import {
  resolveCustomerScope,
  type CustomerScope,
  type CustomerSubscription,
} from "../utils/scope/customerScope";
import {
  fetchInsightsByCampaign,
  fetchInsightsByAd,
  fetchInsightsByBreakdown,
  fetchAdThumbnails,
} from "../services/metaApi";

/**
 * Route untuk aplikasi client Visualabs (v-auto-client).
 * SEMUA endpoint di sini memakai JWT customer (`requireCustomer`) dan setiap
 * query difilter lewat `resolveCustomerScope` — client hanya melihat datanya sendiri.
 */
const router = new Hono();

router.use("*", requireCustomer);

// ───────────────────────── Helpers ─────────────────────────

function todayWibStr(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

function daysAgoWibStr(days: number): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000 - days * 24 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

function monthStartWibStr(): string {
  return `${todayWibStr().slice(0, 8)}01`;
}

const toDateStr = (d: unknown): string =>
  d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? "");

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type PhaseKey = "learning" | "optimization" | "scaling" | "steady";

const PHASE_KEYS: PhaseKey[] = ["learning", "optimization", "scaling", "steady"];

/**
 * Fase iklan untuk edukasi ekspektasi. Pakai subscriptions.phase kalau di-set
 * advertiser; kalau NULL, derive dari umur startDate (learning ≤ 14 hari,
 * optimization ≤ 45 hari, sisanya steady).
 */
function derivePhase(sub: CustomerSubscription): {
  key: PhaseKey;
  day: number | null;
  note: string | null;
  isManual: boolean;
} {
  let day: number | null = null;
  if (sub.startDate) {
    const start = new Date(`${sub.startDate}T00:00:00+07:00`).getTime();
    day = Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
  }

  if (sub.phase && PHASE_KEYS.includes(sub.phase as PhaseKey)) {
    return { key: sub.phase as PhaseKey, day, note: sub.phaseNote, isManual: true };
  }

  let key: PhaseKey = "steady";
  if (day == null || day <= 14) key = "learning";
  else if (day <= 45) key = "optimization";
  return { key, day, note: sub.phaseNote, isManual: false };
}

type PeriodTotals = {
  spend: number;
  revenue: number;
  results: number;
  roas: number | null;
  costPerResult: number | null;
};

function finalizeTotals(t: { spend: number; revenue: number; results: number }): PeriodTotals {
  return {
    spend: t.spend,
    revenue: t.revenue,
    results: t.results,
    roas: t.spend > 0 ? t.revenue / t.spend : null,
    costPerResult: t.results > 0 ? t.spend / t.results : null,
  };
}

type MetaDaily = Map<
  string,
  {
    spend: number;
    impressions: number;
    clicks: number;
    revenue: number;
    results: number;
    statusLevel: number;
  }
>;

/**
 * Ambil data harian Meta (spend/impressions/clicks + revenue/results dari
 * breakdown) untuk sekumpulan act_id, dikelompokkan per act lalu per tanggal.
 * results = sum baris breakdown primary (result_type=0); revenue = sum purchase_value.
 */
async function fetchMetaDaily(
  actIds: string[],
  fromStr: string,
  toStr: string,
): Promise<Map<string, MetaDaily>> {
  const byAct = new Map<string, MetaDaily>();
  if (actIds.length === 0) return byAct;

  const ensure = (actId: string, date: string) => {
    let daily = byAct.get(actId);
    if (!daily) {
      daily = new Map();
      byAct.set(actId, daily);
    }
    let row = daily.get(date);
    if (!row) {
      row = { spend: 0, impressions: 0, clicks: 0, revenue: 0, results: 0, statusLevel: 0 };
      daily.set(date, row);
    }
    return row;
  };

  const dailyRows = await db
    .select({
      actId: fbActDailyData.actId,
      date: fbActDailyData.date,
      spend: fbActDailyData.spend,
      impressions: fbActDailyData.impressions,
      linkClicks: fbActDailyData.linkClicks,
      statusLevel: fbActDailyData.statusLevel,
    })
    .from(fbActDailyData)
    .where(
      and(
        inArray(fbActDailyData.actId, actIds),
        gte(fbActDailyData.date, fromStr),
        lte(fbActDailyData.date, toStr),
      ),
    );

  for (const r of dailyRows) {
    const row = ensure(r.actId, toDateStr(r.date));
    row.spend += num(r.spend);
    row.impressions += num(r.impressions);
    row.clicks += num(r.linkClicks);
    row.statusLevel = Math.max(row.statusLevel, num(r.statusLevel));
  }

  const breakdownRows = await db
    .select({
      actId: fbActResultBreakdownDaily.actId,
      date: fbActResultBreakdownDaily.date,
      resultType: fbActResultBreakdownDaily.resultType,
      results: fbActResultBreakdownDaily.results,
      purchaseValue: fbActResultBreakdownDaily.purchaseValue,
    })
    .from(fbActResultBreakdownDaily)
    .where(
      and(
        inArray(fbActResultBreakdownDaily.actId, actIds),
        gte(fbActResultBreakdownDaily.date, fromStr),
        lte(fbActResultBreakdownDaily.date, toStr),
      ),
    );

  for (const r of breakdownRows) {
    const row = ensure(r.actId, toDateStr(r.date));
    row.revenue += num(r.purchaseValue);
    if (num(r.resultType) === 0) row.results += num(r.results);
  }

  return byAct;
}

function sumRange(
  daily: MetaDaily | undefined,
  fromStr: string,
  toStr: string,
): { spend: number; revenue: number; results: number; lastDate: string | null; statusLevel: number } {
  const acc = { spend: 0, revenue: 0, results: 0, lastDate: null as string | null, statusLevel: 0 };
  if (!daily) return acc;
  for (const [date, row] of daily) {
    if (date < fromStr || date > toStr) continue;
    acc.spend += row.spend;
    acc.revenue += row.revenue;
    acc.results += row.results;
    if (row.spend > 0 || row.results > 0) {
      if (!acc.lastDate || date > acc.lastDate) {
        acc.lastDate = date;
        acc.statusLevel = row.statusLevel;
      }
    }
  }
  return acc;
}

// ───────────────────── Meta live insight helpers ─────────────────────
// Dipakai oleh /performance/meta/* — beda dari fetchMetaDaily (agregat harian
// dari tabel sync), ini live ke Graph API untuk breakdown campaign/ad/demografi
// yang tidak pernah disimpan di tabel sync. Lihat docs/perform-fb-mobile-version.md.

type MetaAction = { action_type: string; value: string };

// Sama persis dengan daftar alias di jobs/metaAdsDailyReport.ts supaya angka
// "purchase"/"revenue" konsisten dengan yang sudah tampil di KPI/tren Performa.
const PURCHASE_ACTION_KEYS = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"];

function actionValue(actions: MetaAction[] | undefined, keys: string[]): number {
  const map = new Map((actions ?? []).map((a) => [a.action_type, num(a.value)]));
  for (const k of keys) if (map.has(k)) return map.get(k)!;
  return 0;
}

function summarizeInsight(row: any) {
  const spend = num(row.spend);
  const purchase = actionValue(row.actions, PURCHASE_ACTION_KEYS);
  const revenue = actionValue(row.action_values, PURCHASE_ACTION_KEYS);
  return {
    spend,
    purchase,
    revenue,
    roas: spend > 0 ? revenue / spend : null,
    ctr: row.ctr != null ? num(row.ctr) : null,
    impressions: num(row.impressions),
    clicks: num(row.clicks),
  };
}

function bucketize(rows: any[], key: string, valueKey: "spend" | "reach" = "reach") {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = row[key] ?? "-";
    map.set(label, (map.get(label) ?? 0) + num(row[valueKey]));
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .map(([label, value]) => ({
      label,
      value,
      pct: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Resolve token per fb_act milik subscription — kepemilikan sudah dipastikan lewat scope. */
async function actTokensForSub(
  scope: CustomerScope,
  subscriptionId: number,
): Promise<Array<{ actId: string; token: string }>> {
  const acts = scope.fbActs.filter((f) => f.subscriptionId === subscriptionId);
  const tokenIds = Array.from(
    new Set(acts.map((a) => a.tokenId).filter((id): id is number => id != null)),
  );
  if (tokenIds.length === 0) return [];

  const tokens = await db
    .select({ id: fbToken.id, token: fbToken.token })
    .from(fbToken)
    .where(inArray(fbToken.id, tokenIds));
  const tokenMap = new Map(tokens.map((t) => [t.id, t.token]));

  return acts
    .filter((a) => a.tokenId != null && tokenMap.has(a.tokenId))
    .map((a) => ({ actId: a.actId.replace(/^act_/, ""), token: tokenMap.get(a.tokenId!)! }));
}

/** Validasi subscriptionId milik customer & platform-nya Meta. */
async function resolveMetaSub(
  customerId: number,
  subscriptionId: number,
): Promise<{ scope: CustomerScope; sub: CustomerSubscription } | null> {
  const scope = await resolveCustomerScope(customerId);
  const sub = scope.subscriptions.find((s) => s.id === subscriptionId);
  if (!sub || sub.platformKey !== "meta") return null;
  return { scope, sub };
}

const metaDetailQuery = z.object({
  subscriptionId: z.coerce.number().int(),
  days: z.coerce.number().int().min(7).max(90).default(7),
});

// ───────────────────────── GET /summary ─────────────────────────

router.get("/summary", async (c) => {
  const customerId = c.get("customerId") as number;
  const scope = await resolveCustomerScope(customerId);

  const activeSubs = scope.subscriptions.filter((s) => s.status === 1);
  const subs = activeSubs.length > 0 ? activeSubs : scope.subscriptions;

  const today = todayWibStr();
  const last7From = daysAgoWibStr(7);
  const last7To = daysAgoWibStr(1);
  const prev7From = daysAgoWibStr(14);
  const prev7To = daysAgoWibStr(8);
  const monthStart = monthStartWibStr();
  const minDate = prev7From < monthStart ? prev7From : monthStart;

  // Nama client
  const profileRows = await db
    .select({ name: customerProfiles.name })
    .from(customerProfiles)
    .where(eq(customerProfiles.customerId, customerId))
    .limit(1);

  // Data Meta untuk semua act milik customer
  const metaByAct = await fetchMetaDaily(scope.actIds, minDate, today);

  // Data manual TikTok/Shopee
  const subIds = subs.map((s) => s.id);
  const pdmRows = subIds.length
    ? await db
        .select()
        .from(platformDailyMetrics)
        .where(
          and(
            inArray(platformDailyMetrics.subscriptionId, subIds),
            gte(platformDailyMetrics.date, minDate),
          ),
        )
    : [];

  let overallStatus = 0;
  const monthToDate = { spend: 0, revenue: 0, results: 0 };

  const brands = subs.map((sub) => {
    const phase = derivePhase(sub);
    const isMeta = sub.platformKey === "meta";

    const acc = {
      last7: { spend: 0, revenue: 0, results: 0 },
      prev7: { spend: 0, revenue: 0 },
      mtd: { spend: 0, revenue: 0, results: 0 },
      lastDataDate: null as string | null,
      statusLevel: 0,
    };

    if (isMeta) {
      const actIds = scope.fbActs
        .filter((f) => f.subscriptionId === sub.id)
        .map((f) => f.actId);
      for (const actId of actIds) {
        const daily = metaByAct.get(actId);
        const l7 = sumRange(daily, last7From, last7To);
        const p7 = sumRange(daily, prev7From, prev7To);
        const mtd = sumRange(daily, monthStart, today);
        acc.last7.spend += l7.spend;
        acc.last7.revenue += l7.revenue;
        acc.last7.results += l7.results;
        acc.prev7.spend += p7.spend;
        acc.prev7.revenue += p7.revenue;
        acc.mtd.spend += mtd.spend;
        acc.mtd.revenue += mtd.revenue;
        acc.mtd.results += mtd.results;
        if (l7.lastDate && (!acc.lastDataDate || l7.lastDate > acc.lastDataDate)) {
          acc.lastDataDate = l7.lastDate;
          acc.statusLevel = Math.max(acc.statusLevel, l7.statusLevel);
        }
      }
    } else {
      for (const r of pdmRows) {
        if (r.subscriptionId !== sub.id) continue;
        const date = toDateStr(r.date);
        const spend = num(r.spend);
        const revenue = num(r.revenue);
        const orders = num(r.orders);
        if (date >= last7From && date <= last7To) {
          acc.last7.spend += spend;
          acc.last7.revenue += revenue;
          acc.last7.results += orders;
        }
        if (date >= prev7From && date <= prev7To) {
          acc.prev7.spend += spend;
          acc.prev7.revenue += revenue;
        }
        if (date >= monthStart) {
          acc.mtd.spend += spend;
          acc.mtd.revenue += revenue;
          acc.mtd.results += orders;
        }
        if (!acc.lastDataDate || date > acc.lastDataDate) acc.lastDataDate = date;
      }
    }

    overallStatus = Math.max(overallStatus, acc.statusLevel);
    monthToDate.spend += acc.mtd.spend;
    monthToDate.revenue += acc.mtd.revenue;
    monthToDate.results += acc.mtd.results;

    return {
      subscriptionId: sub.id,
      brand: sub.brand,
      platform: sub.platform,
      platformKey: sub.platformKey,
      productName: sub.productName,
      status: sub.status,
      startDate: sub.startDate,
      dueDate: sub.dueDate,
      target: sub.target,
      phase,
      last7: finalizeTotals(acc.last7),
      prev7: {
        spend: acc.prev7.spend,
        revenue: acc.prev7.revenue,
      },
      statusLevel: acc.statusLevel,
      lastDataDate: acc.lastDataDate,
    };
  });

  // Update terbaru + unread count (badge notifikasi in-app)
  const latestUpdates = await db
    .select({
      id: clientUpdates.id,
      type: clientUpdates.type,
      title: clientUpdates.title,
      publishedAt: clientUpdates.publishedAt,
      readAt: clientUpdateReads.readAt,
    })
    .from(clientUpdates)
    .leftJoin(
      clientUpdateReads,
      and(
        eq(clientUpdateReads.updateId, clientUpdates.id),
        eq(clientUpdateReads.customerId, customerId),
      ),
    )
    .where(eq(clientUpdates.customerId, customerId))
    .orderBy(desc(clientUpdates.id))
    .limit(3);

  const unreadRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(clientUpdates)
    .leftJoin(
      clientUpdateReads,
      and(
        eq(clientUpdateReads.updateId, clientUpdates.id),
        eq(clientUpdateReads.customerId, customerId),
      ),
    )
    .where(and(eq(clientUpdates.customerId, customerId), isNull(clientUpdateReads.id)));

  const pendingTaskRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(assetRequests)
    .where(
      and(
        eq(assetRequests.customerId, customerId),
        inArray(assetRequests.status, ["requested", "in_progress"]),
      ),
    );

  return c.json({
    success: true,
    data: {
      profileName: profileRows[0]?.name ?? null,
      overall: {
        statusLevel: overallStatus,
      },
      monthToDate: finalizeTotals(monthToDate),
      brands,
      latestUpdates: latestUpdates.map((u) => ({
        id: u.id,
        type: u.type,
        title: u.title,
        publishedAt: u.publishedAt,
        read: u.readAt != null,
      })),
      unreadUpdates: num(unreadRows[0]?.count),
      pendingTasks: num(pendingTaskRows[0]?.count),
    },
  });
});

// ───────────────────────── GET /performance ─────────────────────────

const performanceQuery = z.object({
  subscriptionId: z.coerce.number().int(),
  days: z.coerce.number().int().min(7).max(90).default(7),
});

router.get("/performance", zValidator("query", performanceQuery), async (c) => {
  const customerId = c.get("customerId") as number;
  const { subscriptionId, days } = c.req.valid("query");

  const scope = await resolveCustomerScope(customerId);
  const sub = scope.subscriptions.find((s) => s.id === subscriptionId);
  if (!sub) {
    return c.json({ success: false, message: "Subscription tidak ditemukan" }, 404);
  }

  const to = daysAgoWibStr(1);
  const from = daysAgoWibStr(days);
  const prevTo = daysAgoWibStr(days + 1);
  const prevFrom = daysAgoWibStr(days * 2);

  type SeriesRow = {
    date: string;
    spend: number;
    revenue: number;
    results: number;
    impressions: number;
    clicks: number;
  };
  const series = new Map<string, SeriesRow>();
  for (let i = days; i >= 1; i--) {
    const date = daysAgoWibStr(i);
    series.set(date, { date, spend: 0, revenue: 0, results: 0, impressions: 0, clicks: 0 });
  }

  const totals = { spend: 0, revenue: 0, results: 0 };
  const prev = { spend: 0, revenue: 0, results: 0 };
  const detail = { impressions: 0, clicks: 0 };
  let lastDataDate: string | null = null;

  if (sub.platformKey === "meta") {
    const actIds = scope.fbActs
      .filter((f) => f.subscriptionId === sub.id)
      .map((f) => f.actId);
    const metaByAct = await fetchMetaDaily(actIds, prevFrom, to);

    for (const daily of metaByAct.values()) {
      for (const [date, row] of daily) {
        if (date >= from && date <= to) {
          const s = series.get(date);
          if (s) {
            s.spend += row.spend;
            s.revenue += row.revenue;
            s.results += row.results;
            s.impressions += row.impressions;
            s.clicks += row.clicks;
          }
          totals.spend += row.spend;
          totals.revenue += row.revenue;
          totals.results += row.results;
          detail.impressions += row.impressions;
          detail.clicks += row.clicks;
          if (row.spend > 0 && (!lastDataDate || date > lastDataDate)) lastDataDate = date;
        } else if (date >= prevFrom && date <= prevTo) {
          prev.spend += row.spend;
          prev.revenue += row.revenue;
          prev.results += row.results;
        }
      }
    }
  } else {
    const rows = await db
      .select()
      .from(platformDailyMetrics)
      .where(
        and(
          eq(platformDailyMetrics.subscriptionId, sub.id),
          gte(platformDailyMetrics.date, prevFrom),
          lte(platformDailyMetrics.date, to),
        ),
      );

    for (const r of rows) {
      const date = toDateStr(r.date);
      const spend = num(r.spend);
      const revenue = num(r.revenue);
      const orders = num(r.orders);
      if (date >= from && date <= to) {
        const s = series.get(date);
        if (s) {
          s.spend += spend;
          s.revenue += revenue;
          s.results += orders;
          s.impressions += num(r.impressions);
          s.clicks += num(r.clicks);
        }
        totals.spend += spend;
        totals.revenue += revenue;
        totals.results += orders;
        detail.impressions += num(r.impressions);
        detail.clicks += num(r.clicks);
        if (spend > 0 && (!lastDataDate || date > lastDataDate)) lastDataDate = date;
      } else if (date >= prevFrom && date <= prevTo) {
        prev.spend += spend;
        prev.revenue += revenue;
        prev.results += orders;
      }
    }
  }

  return c.json({
    success: true,
    data: {
      subscriptionId: sub.id,
      brand: sub.brand,
      platformKey: sub.platformKey,
      phase: derivePhase(sub),
      from,
      to,
      series: Array.from(series.values()),
      totals: finalizeTotals(totals),
      prev: finalizeTotals(prev),
      detail: {
        impressions: detail.impressions,
        clicks: detail.clicks,
        ctr: detail.impressions > 0 ? (detail.clicks / detail.impressions) * 100 : null,
        cpm: detail.impressions > 0 ? (totals.spend / detail.impressions) * 1000 : null,
      },
      lastDataDate,
    },
  });
});

// ───────────────────── GET /performance/meta/campaigns ─────────────────────

router.get(
  "/performance/meta/campaigns",
  zValidator("query", metaDetailQuery),
  async (c) => {
    const customerId = c.get("customerId") as number;
    const { subscriptionId, days } = c.req.valid("query");

    const resolved = await resolveMetaSub(customerId, subscriptionId);
    if (!resolved) {
      return c.json({ success: false, message: "Brand Meta tidak ditemukan" }, 404);
    }

    const acts = await actTokensForSub(resolved.scope, subscriptionId);
    if (acts.length === 0) return c.json({ success: true, data: [] });

    const timeRange = { since: daysAgoWibStr(days), until: daysAgoWibStr(1) };

    try {
      const results = await Promise.all(
        acts.map((a) => fetchInsightsByCampaign(a.actId, a.token, timeRange)),
      );

      const campaigns = results
        .flatMap((r: any) => r?.data ?? [])
        .map((row: any) => ({
          id: row.campaign_id,
          name: row.campaign_name || "Campaign",
          ...summarizeInsight(row),
        }))
        .sort((a, b) => b.spend - a.spend);

      return c.json({ success: true, data: campaigns });
    } catch (e: any) {
      console.error("[client/performance/meta/campaigns]", e);
      return c.json({ success: false, message: e?.message || "Gagal mengambil data campaign" }, 500);
    }
  },
);

// ───────────────────────── GET /performance/meta/ads ─────────────────────

router.get(
  "/performance/meta/ads",
  zValidator("query", metaDetailQuery),
  async (c) => {
    const customerId = c.get("customerId") as number;
    const { subscriptionId, days } = c.req.valid("query");

    const resolved = await resolveMetaSub(customerId, subscriptionId);
    if (!resolved) {
      return c.json({ success: false, message: "Brand Meta tidak ditemukan" }, 404);
    }

    const acts = await actTokensForSub(resolved.scope, subscriptionId);
    if (acts.length === 0) return c.json({ success: true, data: [] });

    const timeRange = { since: daysAgoWibStr(days), until: daysAgoWibStr(1) };

    try {
      const perAct = await Promise.all(
        acts.map(async (a) => {
          const res: any = await fetchInsightsByAd(a.actId, a.token, timeRange);
          return { act: a, rows: (res?.data ?? []) as any[] };
        }),
      );

      const topAds = perAct
        .flatMap(({ act, rows }) =>
          rows.map((row) => ({
            id: row.ad_id as string,
            name: (row.ad_name as string) || "Iklan",
            campaignName: (row.campaign_name as string) || null,
            actId: act.actId,
            token: act.token,
            ...summarizeInsight(row),
          })),
        )
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);

      // Thumbnail dikelompokkan per act (token beda per akun iklan)
      const byAct = new Map<string, typeof topAds>();
      for (const ad of topAds) {
        const list = byAct.get(ad.actId) ?? [];
        list.push(ad);
        byAct.set(ad.actId, list);
      }
      const thumbMaps = await Promise.all(
        Array.from(byAct.values()).map((list) =>
          fetchAdThumbnails(list.map((a) => a.id).filter(Boolean), list[0].token),
        ),
      );
      const thumbMap: Record<string, string | null> = Object.assign({}, ...thumbMaps);

      const data = topAds.map(({ token, actId, ...rest }) => ({
        ...rest,
        thumbnailUrl: thumbMap[rest.id] ?? null,
      }));

      return c.json({ success: true, data });
    } catch (e: any) {
      console.error("[client/performance/meta/ads]", e);
      return c.json({ success: false, message: e?.message || "Gagal mengambil data iklan" }, 500);
    }
  },
);

// ───────────────────── GET /performance/meta/demographics ─────────────────

router.get(
  "/performance/meta/demographics",
  zValidator("query", metaDetailQuery),
  async (c) => {
    const customerId = c.get("customerId") as number;
    const { subscriptionId, days } = c.req.valid("query");

    const resolved = await resolveMetaSub(customerId, subscriptionId);
    if (!resolved) {
      return c.json({ success: false, message: "Brand Meta tidak ditemukan" }, 404);
    }

    const acts = await actTokensForSub(resolved.scope, subscriptionId);
    if (acts.length === 0) {
      return c.json({ success: true, data: { age: [], gender: [], device: [] } });
    }

    const timeRange = { since: daysAgoWibStr(days), until: daysAgoWibStr(1) };

    try {
      const [ageRes, genderRes, deviceRes] = await Promise.all([
        Promise.all(acts.map((a) => fetchInsightsByBreakdown(a.actId, a.token, timeRange, "age"))),
        Promise.all(acts.map((a) => fetchInsightsByBreakdown(a.actId, a.token, timeRange, "gender"))),
        Promise.all(
          acts.map((a) => fetchInsightsByBreakdown(a.actId, a.token, timeRange, "impression_device")),
        ),
      ]);

      const ageRows = ageRes.flatMap((r: any) => r?.data ?? []);
      const genderRows = genderRes.flatMap((r: any) => r?.data ?? []);
      const deviceRows = deviceRes.flatMap((r: any) => r?.data ?? []);

      return c.json({
        success: true,
        data: {
          age: bucketize(ageRows, "age"),
          gender: bucketize(genderRows, "gender"),
          device: bucketize(deviceRows, "impression_device"),
        },
      });
    } catch (e: any) {
      console.error("[client/performance/meta/demographics]", e);
      return c.json({ success: false, message: e?.message || "Gagal mengambil data demografi" }, 500);
    }
  },
);

// ───────────────────────── GET /updates ─────────────────────────

const updatesQuery = z.object({
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get("/updates", zValidator("query", updatesQuery), async (c) => {
  const customerId = c.get("customerId") as number;
  const { cursor, limit } = c.req.valid("query");

  const conditions = [eq(clientUpdates.customerId, customerId)];
  if (cursor) conditions.push(lte(clientUpdates.id, cursor - 1));

  const rows = await db
    .select({
      id: clientUpdates.id,
      subscriptionId: clientUpdates.subscriptionId,
      type: clientUpdates.type,
      title: clientUpdates.title,
      body: clientUpdates.body,
      metricSnapshot: clientUpdates.metricSnapshot,
      publishedAt: clientUpdates.publishedAt,
      authorName: profiles.name,
      authorUsername: users.username,
      readAt: clientUpdateReads.readAt,
    })
    .from(clientUpdates)
    .leftJoin(users, eq(users.id, clientUpdates.authorUserId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(
      clientUpdateReads,
      and(
        eq(clientUpdateReads.updateId, clientUpdates.id),
        eq(clientUpdateReads.customerId, customerId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(clientUpdates.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((r) => ({
    id: r.id,
    subscriptionId: r.subscriptionId,
    type: r.type,
    title: r.title,
    body: r.body,
    metricSnapshot: r.metricSnapshot,
    publishedAt: r.publishedAt,
    author: r.authorName ?? r.authorUsername ?? "Tim Visualabs",
    read: r.readAt != null,
  }));

  return c.json({
    success: true,
    data: {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    },
  });
});

// ───────────────────────── POST /updates/:id/read ─────────────────────────

router.post("/updates/:id/read", async (c) => {
  const customerId = c.get("customerId") as number;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ success: false, message: "ID tidak valid" }, 400);
  }

  // Pastikan update milik customer ini
  const rows = await db
    .select({ id: clientUpdates.id })
    .from(clientUpdates)
    .where(and(eq(clientUpdates.id, id), eq(clientUpdates.customerId, customerId)))
    .limit(1);
  if (!rows[0]) {
    return c.json({ success: false, message: "Update tidak ditemukan" }, 404);
  }

  await db
    .insert(clientUpdateReads)
    .values({ updateId: id, customerId })
    .onDuplicateKeyUpdate({ set: { readAt: new Date() } });

  return c.json({ success: true, message: "Ditandai sudah dibaca" });
});

// ───────────────────────── GET /tasks ─────────────────────────

router.get("/tasks", async (c) => {
  const customerId = c.get("customerId") as number;

  const assets = await db
    .select({
      id: assetRequests.id,
      subscriptionId: assetRequests.subscriptionId,
      type: assetRequests.type,
      title: assetRequests.title,
      description: assetRequests.description,
      dueDate: assetRequests.dueDate,
      status: assetRequests.status,
      deliveredAt: assetRequests.deliveredAt,
      createdAt: assetRequests.createdAt,
      requesterName: profiles.name,
    })
    .from(assetRequests)
    .leftJoin(users, eq(users.id, assetRequests.requestedBy))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(assetRequests.customerId, customerId))
    .orderBy(desc(assetRequests.createdAt))
    .limit(100);

  // Checklist rutin tim client = scorecards dengan pic=1 (client)
  const checklists = await db
    .select({
      id: scorecards.id,
      subscriptionId: scorecards.subscriptionId,
      title: scorecards.title,
      description: scorecards.description,
      frequency: scorecards.frequency,
      targetValue: scorecards.targetValue,
      unitValue: scorecards.unitValue,
      unitCustom: scorecards.unitCustom,
    })
    .from(scorecards)
    .where(
      and(
        eq(scorecards.customerId, customerId),
        eq(scorecards.pic, 1),
        eq(scorecards.status, 1),
      ),
    )
    .orderBy(desc(scorecards.id))
    .limit(50);

  return c.json({
    success: true,
    data: { assets, checklists },
  });
});

// ───────────────────────── PATCH /tasks/:id ─────────────────────────

const taskPatchSchema = z.object({
  status: z.enum(["in_progress", "delivered"]),
});

router.patch("/tasks/:id", zValidator("json", taskPatchSchema), async (c) => {
  const customerId = c.get("customerId") as number;
  const id = Number(c.req.param("id"));
  const { status } = c.req.valid("json");
  if (!Number.isInteger(id)) {
    return c.json({ success: false, message: "ID tidak valid" }, 400);
  }

  const rows = await db
    .select({ id: assetRequests.id, status: assetRequests.status })
    .from(assetRequests)
    .where(and(eq(assetRequests.id, id), eq(assetRequests.customerId, customerId)))
    .limit(1);
  const existing = rows[0];
  if (!existing) {
    return c.json({ success: false, message: "Tugas tidak ditemukan" }, 404);
  }
  if (existing.status === "approved") {
    return c.json(
      { success: false, message: "Tugas sudah disetujui — tidak bisa diubah" },
      400,
    );
  }

  await db
    .update(assetRequests)
    .set({
      status,
      deliveredAt: status === "delivered" ? new Date() : null,
    })
    .where(eq(assetRequests.id, id));

  return c.json({ success: true, message: "Status tugas diperbarui" });
});

export default router;
