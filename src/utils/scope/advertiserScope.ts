import type { Context } from "hono";
import { eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { subscriptions, fbAct } from "../../db/schema";
import { role } from "../auth/role";
import { ROLE_ADMIN } from "../auth/permissions";

export type AdvertiserScope =
  | { kind: "admin"; userId: number }
  | {
      kind: "advertiser";
      userId: number;
      customerIds: number[];
      subscriptionIds: number[];
      fbActIds: number[];
    };

export type ScopeResult =
  | { ok: true; scope: AdvertiserScope }
  | { ok: false; response: Response };

/**
 * Resolve scope from JWT payload. Admins see everything; non-admins are scoped
 * to subscriptions where `advertiserId == userId`.
 *
 * NOTE: This mirrors the resolver previously inlined in `routes/adsMonitoring.ts`.
 * The fbAct lookup is included so callers don't have to repeat it.
 */
export async function resolveAdvertiserScope(c: Context): Promise<ScopeResult> {
  const payload = c.get("jwtPayload");
  const userId = payload?.sub ? Number(payload.sub) : NaN;
  if (!Number.isInteger(userId)) {
    return {
      ok: false,
      response: c.json({ success: false, message: "Unauthorized" }, 401),
    };
  }

  const userRole = await role(userId);
  if (userRole === ROLE_ADMIN) {
    return { ok: true, scope: { kind: "admin", userId } };
  }

  const subs = await db
    .select({
      id: subscriptions.id,
      customerId: subscriptions.customerId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.advertiserId, userId));

  const subscriptionIds = subs.map((s) => s.id);
  const customerIds = Array.from(new Set(subs.map((s) => s.customerId)));

  let fbActIds: number[] = [];
  if (subscriptionIds.length > 0) {
    const rows = await db
      .select({ id: fbAct.id })
      .from(fbAct)
      .where(inArray(fbAct.subscriptionId, subscriptionIds));
    fbActIds = rows.map((r) => r.id);
  }

  return {
    ok: true,
    scope: {
      kind: "advertiser",
      userId,
      customerIds,
      subscriptionIds,
      fbActIds,
    },
  };
}

/**
 * Check if a user acts as an advertiser (has at least one subscription where
 * subscriptions.advertiserId == userId). Useful to decide whether to surface
 * the advertiser home page.
 */
export async function isAdvertiser(userId: number): Promise<boolean> {
  if (!Number.isInteger(userId)) return false;
  const row = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.advertiserId, userId))
    .limit(1);
  return row.length > 0;
}
