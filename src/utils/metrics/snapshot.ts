import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "../../db/client";
import {
  fbAct,
  fbActDailyData,
  fbActResultBreakdownDaily,
  platformDailyMetrics,
  subscriptions,
} from "../../db/schema";
import { normalizePlatform } from "../scope/customerScope";

export interface MetricSnapshot {
  spend: number;
  revenue: number;
  results: number;
  roas: number | null;
  period: { from: string; to: string; days: number };
  platform: string; // meta | tiktok | shopee | mixed | other
}

function daysAgoWibStr(days: number): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000 - days * 24 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

const toDateStr = (d: unknown): string =>
  d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? "");

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Hitung ringkasan performa periode (default 7 hari) untuk disematkan ke sebuah
 * update client (`client_updates.metric_snapshot`). Meta diambil dari
 * fb_act_daily_data + fb_act_result_breakdown_daily; TikTok/Shopee dari
 * platform_daily_metrics.
 *
 * subscriptionId null → agregat semua subscription milik customer.
 */
export async function computeMetricSnapshot(opts: {
  customerId: number;
  subscriptionId?: number | null;
  days?: number;
}): Promise<MetricSnapshot> {
  const days = opts.days ?? 7;
  const from = daysAgoWibStr(days);
  const to = daysAgoWibStr(1);

  // Subscription target
  const subs = await db
    .select({
      id: subscriptions.id,
      platform: subscriptions.platform,
    })
    .from(subscriptions)
    .where(
      opts.subscriptionId
        ? eq(subscriptions.id, opts.subscriptionId)
        : eq(subscriptions.customerId, opts.customerId),
    );

  let spend = 0;
  let revenue = 0;
  let results = 0;
  const platforms = new Set<string>();

  // Kumpulkan act_id Meta per subscription sekaligus
  const subIds = subs.map((s) => s.id);
  let actIdsBySub = new Map<number, string[]>();
  if (subIds.length > 0) {
    const acts = await db
      .select({ subscriptionId: fbAct.subscriptionId, actId: fbAct.actId })
      .from(fbAct)
      .where(inArray(fbAct.subscriptionId, subIds));
    for (const a of acts) {
      const arr = actIdsBySub.get(a.subscriptionId) ?? [];
      arr.push(a.actId);
      actIdsBySub.set(a.subscriptionId, arr);
    }
  }

  for (const sub of subs) {
    const key = normalizePlatform(sub.platform);
    platforms.add(key);

    if (key === "meta") {
      const actIds = actIdsBySub.get(sub.id) ?? [];
      if (actIds.length === 0) continue;

      const daily = await db
        .select({ spend: fbActDailyData.spend })
        .from(fbActDailyData)
        .where(
          and(
            inArray(fbActDailyData.actId, actIds),
            gte(fbActDailyData.date, from),
            lte(fbActDailyData.date, to),
          ),
        );
      for (const d of daily) spend += num(d.spend);

      const bd = await db
        .select({
          resultType: fbActResultBreakdownDaily.resultType,
          results: fbActResultBreakdownDaily.results,
          purchaseValue: fbActResultBreakdownDaily.purchaseValue,
        })
        .from(fbActResultBreakdownDaily)
        .where(
          and(
            inArray(fbActResultBreakdownDaily.actId, actIds),
            gte(fbActResultBreakdownDaily.date, from),
            lte(fbActResultBreakdownDaily.date, to),
          ),
        );
      for (const r of bd) {
        revenue += num(r.purchaseValue);
        if (num(r.resultType) === 0) results += num(r.results);
      }
    } else {
      const rows = await db
        .select({
          spend: platformDailyMetrics.spend,
          revenue: platformDailyMetrics.revenue,
          orders: platformDailyMetrics.orders,
        })
        .from(platformDailyMetrics)
        .where(
          and(
            eq(platformDailyMetrics.subscriptionId, sub.id),
            gte(platformDailyMetrics.date, from),
            lte(platformDailyMetrics.date, to),
          ),
        );
      for (const r of rows) {
        spend += num(r.spend);
        revenue += num(r.revenue);
        results += num(r.orders);
      }
    }
  }

  const platform =
    platforms.size === 0
      ? "other"
      : platforms.size === 1
        ? [...platforms][0]
        : "mixed";

  return {
    spend,
    revenue,
    results,
    roas: spend > 0 ? revenue / spend : null,
    period: { from, to, days },
    platform,
  };
}
