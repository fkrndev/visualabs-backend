import { eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { fbAct, products, subscriptions } from "../../db/schema";

export type CustomerSubscription = {
  id: number;
  brand: string | null;
  platform: string | null;
  platformKey: "meta" | "tiktok" | "shopee" | "other";
  productName: string | null;
  advertiserId: number | null;
  startDate: string | null;
  dueDate: string | null;
  status: number;
  target: string | null;
  phase: string | null;
  phaseUpdatedAt: Date | null;
  phaseNote: string | null;
};

export type CustomerScope = {
  customerId: number;
  subscriptions: CustomerSubscription[];
  subscriptionIds: number[];
  /** fb_act milik customer ini, untuk join ke fb_act_daily_data dkk. */
  fbActs: Array<{ id: number; actId: string; subscriptionId: number; tokenId: number | null }>;
  actIds: string[];
};

/**
 * Normalisasi teks bebas `subscriptions.platform` menjadi key platform yang
 * dikenal client app. "Facebook Ads", "meta", "FB/IG" → meta, dst.
 */
export function normalizePlatform(
  platform: string | null,
): "meta" | "tiktok" | "shopee" | "other" {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("tik")) return "tiktok";
  if (p.includes("shop")) return "shopee";
  if (
    p.includes("meta") ||
    p.includes("face") ||
    p.includes("fb") ||
    p.includes("ig") ||
    p.includes("insta")
  ) {
    return "meta";
  }
  return "other";
}

/**
 * Scope data untuk satu customer (client). SEMUA query endpoint /api/client/*
 * wajib difilter lewat hasil resolver ini — otorisasi client murni
 * "data ini milik customerId == token.sub" karena JWT customer tidak punya role.
 */
export async function resolveCustomerScope(
  customerId: number,
): Promise<CustomerScope> {
  const subs = await db
    .select({
      id: subscriptions.id,
      brand: subscriptions.brand,
      platform: subscriptions.platform,
      productName: products.name,
      advertiserId: subscriptions.advertiserId,
      startDate: subscriptions.startDate,
      dueDate: subscriptions.dueDate,
      status: subscriptions.status,
      target: subscriptions.target,
      phase: subscriptions.phase,
      phaseUpdatedAt: subscriptions.phaseUpdatedAt,
      phaseNote: subscriptions.phaseNote,
    })
    .from(subscriptions)
    .leftJoin(products, eq(products.id, subscriptions.productId))
    .where(eq(subscriptions.customerId, customerId));

  const subscriptionIds = subs.map((s) => s.id);

  let fbActs: Array<{ id: number; actId: string; subscriptionId: number; tokenId: number | null }> = [];
  if (subscriptionIds.length > 0) {
    fbActs = await db
      .select({
        id: fbAct.id,
        actId: fbAct.actId,
        subscriptionId: fbAct.subscriptionId,
        tokenId: fbAct.tokenId,
      })
      .from(fbAct)
      .where(inArray(fbAct.subscriptionId, subscriptionIds));
  }

  const toStr = (d: unknown): string | null =>
    d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d);

  return {
    customerId,
    subscriptions: subs.map((s) => ({
      ...s,
      startDate: toStr(s.startDate),
      dueDate: toStr(s.dueDate),
      platformKey: normalizePlatform(s.platform),
    })),
    subscriptionIds,
    fbActs,
    actIds: Array.from(new Set(fbActs.map((f) => f.actId))),
  };
}
