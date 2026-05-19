import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  customers,
  customerProfiles,
  fbAct,
  fbActDailyData,
  meetings,
  profiles,
  scorecardData,
  scorecards,
  subscriptions,
  ticketIssues,
  todos,
  users,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import {
  resolveAdvertiserScope,
  type AdvertiserScope,
} from "../utils/scope/advertiserScope";

const router = new Hono();

router.use("*", requireAuth);

// ───────────────────────── Helpers ─────────────────────────

function startOfTodayWib(): Date {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  wib.setUTCHours(0, 0, 0, 0);
  return new Date(wib.getTime() - 7 * 60 * 60 * 1000);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function todayWibStr(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

function daysAgoWibStr(days: number): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000 - days * 24 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/**
 * If the user is an admin, this endpoint family still operates on a single
 * advertiser. Admins may impersonate via `?asUser=<userId>`; otherwise we fall
 * back to the admin's own scope (which yields no advertiser data).
 */
function effectiveAdvertiserUserId(
  scope: AdvertiserScope,
  asUser: number | undefined,
): number {
  if (scope.kind === "admin" && asUser) return asUser;
  return scope.userId;
}

async function loadAdvertiserContext(advertiserUserId: number) {
  const subs = await db
    .select({
      id: subscriptions.id,
      customerId: subscriptions.customerId,
      status: subscriptions.status,
      dueDate: subscriptions.dueDate,
      onboardingStatus: subscriptions.onboardingStatus,
      onboardingUpdatedAt: subscriptions.onboardingUpdatedAt,
    })
    .from(subscriptions)
    .where(eq(subscriptions.advertiserId, advertiserUserId));

  const subscriptionIds = subs.map((s) => s.id);
  const customerIds = Array.from(new Set(subs.map((s) => s.customerId)));

  return { subs, subscriptionIds, customerIds };
}

/**
 * Narrow scope to a single customer. Returns null if the customer is not in
 * the advertiser's scope (so caller can return 404).
 */
function scopeForCustomer(
  ctx: { subs: Array<{ id: number; customerId: number }>; subscriptionIds: number[]; customerIds: number[] },
  customerId: number,
) {
  if (!ctx.customerIds.includes(customerId)) return null;
  const subs = ctx.subs.filter((s) => s.customerId === customerId);
  return {
    subs,
    subscriptionIds: subs.map((s) => s.id),
    customerIds: [customerId],
  };
}

// ───────────────────────── /summary ─────────────────────────

const summaryQuery = z.object({
  asUser: z.coerce.number().int().optional(),
});

const scopedQuery = z.object({
  asUser: z.coerce.number().int().optional(),
  customerId: z.coerce.number().int().optional(),
});

router.get("/summary", zValidator("query", summaryQuery), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const { asUser } = c.req.valid("query");
  const advertiserUserId = effectiveAdvertiserUserId(r.scope, asUser);

  const me = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      name: profiles.name,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, advertiserUserId))
    .limit(1);

  const { subs, subscriptionIds, customerIds } =
    await loadAdvertiserContext(advertiserUserId);

  const activeSubs = subs.filter((s) => s.status === 1);
  const activeCustomerIds = Array.from(new Set(activeSubs.map((s) => s.customerId)));

  // Ads counts
  let adsTotal = 0;
  let adsActive = 0;
  let adsPaused = 0;
  let spendD1 = 0;
  if (subscriptionIds.length > 0) {
    const adsRows = await db
      .select({ id: fbAct.id, actId: fbAct.actId })
      .from(fbAct)
      .where(inArray(fbAct.subscriptionId, subscriptionIds));
    adsTotal = adsRows.length;
    if (adsRows.length > 0) {
      const yesterday = daysAgoWibStr(1);
      const dailyYesterday = await db
        .select({
          actId: fbActDailyData.actId,
          spend: fbActDailyData.spend,
          statusLevel: fbActDailyData.statusLevel,
        })
        .from(fbActDailyData)
        .where(
          and(
            inArray(
              fbActDailyData.actId,
              adsRows.map((r) => r.actId),
            ),
            eq(fbActDailyData.date, yesterday),
          ),
        );
      for (const d of dailyYesterday) {
        if (d.spend != null) spendD1 += Number(d.spend);
        if (Number(d.statusLevel ?? 0) > 0) adsPaused++;
        else adsActive++;
      }
      // accounts without yesterday row are counted as "active" (no critical signal)
      const seen = new Set(dailyYesterday.map((d) => d.actId));
      adsActive += adsRows.filter((r) => !seen.has(r.actId)).length;
    }
  }

  // Tickets open
  let ticketsOpen = 0;
  if (subscriptionIds.length > 0) {
    const rows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ticketIssues)
      .where(
        and(
          inArray(ticketIssues.subscriptionId, subscriptionIds),
          ne(ticketIssues.status, 2),
        ),
      );
    ticketsOpen = Number(rows[0]?.count ?? 0);
  }

  // Todos due in 24h
  let todosDue24h = 0;
  if (subscriptionIds.length > 0) {
    const limit = daysAgoWibStr(-1);
    const today = todayWibStr();
    const rows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(todos)
      .where(
        and(
          inArray(todos.subscriptionId, subscriptionIds),
          ne(todos.status, 2),
          gte(todos.dueDate, today),
          lte(todos.dueDate, limit),
        ),
      );
    todosDue24h = Number(rows[0]?.count ?? 0);
  }

  // Scorecard KPI counts (current period entries only)
  let scorecardsActive = 0;
  let scorecardsRed = 0;
  let scorecardsYellow = 0;
  let scorecardsGreen = 0;
  if (subscriptionIds.length > 0) {
    const rows = await db
      .select({
        scorecardId: scorecards.id,
        threshold: scorecardData.threshold,
      })
      .from(scorecards)
      .leftJoin(
        scorecardData,
        and(
          eq(scorecardData.scorecardId, scorecards.id),
          eq(scorecardData.status, 1),
        ),
      )
      .where(
        and(
          inArray(scorecards.subscriptionId, subscriptionIds),
          eq(scorecards.status, 1),
        ),
      );
    // dedupe per scorecard — take the worst (highest threshold) if there are
    // multiple current-period entries (e.g. weekly + monthly).
    const worstByScorecard = new Map<number, number | null>();
    for (const row of rows) {
      const prev = worstByScorecard.get(row.scorecardId);
      const cur = row.threshold == null ? null : Number(row.threshold);
      if (prev === undefined) {
        worstByScorecard.set(row.scorecardId, cur);
      } else if (cur != null && (prev == null || cur > prev)) {
        worstByScorecard.set(row.scorecardId, cur);
      }
    }
    scorecardsActive = worstByScorecard.size;
    for (const t of worstByScorecard.values()) {
      if (t === 2) scorecardsRed++;
      else if (t === 1) scorecardsYellow++;
      else if (t === 0) scorecardsGreen++;
    }
  }

  // Meetings this week
  let meetingsThisWeek = 0;
  if (subscriptionIds.length > 0) {
    const start = startOfTodayWib();
    const end = addDays(start, 7);
    const rows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(meetings)
      .where(
        and(
          inArray(meetings.subscriptionId, subscriptionIds),
          gte(meetings.date, start),
          lte(meetings.date, end),
        ),
      );
    meetingsThisWeek = Number(rows[0]?.count ?? 0);
  }

  return c.json({
    success: true,
    data: {
      user: me[0]
        ? {
            id: me[0].id,
            name: me[0].name ?? me[0].email ?? `User #${me[0].id}`,
            role: me[0].role,
          }
        : null,
      scope: {
        customerCount: customerIds.length,
        activeCustomerCount: activeCustomerIds.length,
        subscriptionCount: subs.length,
        activeSubscriptionCount: activeSubs.length,
      },
      cards: {
        clientsActive: activeCustomerIds.length,
        ads: {
          total: adsTotal,
          active: adsActive,
          paused: adsPaused,
          spendYesterday: spendD1,
        },
        ticketsOpen,
        todosDue24h,
        meetingsThisWeek,
        scorecards: {
          active: scorecardsActive,
          red: scorecardsRed,
          yellow: scorecardsYellow,
          green: scorecardsGreen,
        },
      },
    },
  });
});

// ───────────────────────── /attention ─────────────────────────

const attentionQuery = z.object({
  asUser: z.coerce.number().int().optional(),
  customerId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

type AttentionItem = {
  id: string;
  severity: "low" | "med" | "high";
  kind:
    | "ads_paused"
    | "spend_drop"
    | "ticket_stale"
    | "scorecard_drop"
    | "subs_due"
    | "onboarding_stuck";
  brand: string | null;
  customerId: number;
  customerName: string | null;
  message: string;
  href: string;
  sortKey: number;
};

router.get("/attention", zValidator("query", attentionQuery), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const { asUser, limit, customerId } = c.req.valid("query");
  const advertiserUserId = effectiveAdvertiserUserId(r.scope, asUser);

  const fullCtx = await loadAdvertiserContext(advertiserUserId);
  let ctx = fullCtx;
  if (customerId != null) {
    const narrowed = scopeForCustomer(fullCtx, customerId);
    if (!narrowed) {
      return c.json({ success: true, data: { items: [] } });
    }
    ctx = { ...fullCtx, ...narrowed };
  }
  const { subs, subscriptionIds, customerIds } = ctx;

  if (subscriptionIds.length === 0) {
    return c.json({ success: true, data: { items: [] } });
  }

  const customerNameRows = await db
    .select({
      id: customers.id,
      name: customerProfiles.name,
      email: customers.email,
    })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(inArray(customers.id, customerIds));
  const customerNameMap = new Map<number, string>();
  for (const row of customerNameRows) {
    customerNameMap.set(row.id, row.name ?? row.email ?? `Customer #${row.id}`);
  }

  const subById = new Map(subs.map((s) => [s.id, s]));
  // We need brand from subscriptions for messages
  const subBrandRows = await db
    .select({
      id: subscriptions.id,
      brand: subscriptions.brand,
      customerId: subscriptions.customerId,
      dueDate: subscriptions.dueDate,
      onboardingStatus: subscriptions.onboardingStatus,
      onboardingUpdatedAt: subscriptions.onboardingUpdatedAt,
    })
    .from(subscriptions)
    .where(inArray(subscriptions.id, subscriptionIds));
  const subMeta = new Map(subBrandRows.map((s) => [s.id, s]));

  const items: AttentionItem[] = [];
  const now = Date.now();

  // 1) Subscription due in <= 7 days
  const today = startOfTodayWib();
  for (const s of subBrandRows) {
    if (!s.dueDate) continue;
    const due = new Date(s.dueDate as unknown as string);
    const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000);
    if (diffDays < 0) continue;
    if (diffDays > 7) continue;
    const severity: AttentionItem["severity"] =
      diffDays <= 2 ? "high" : diffDays <= 5 ? "med" : "low";
    items.push({
      id: `subs:${s.id}`,
      severity,
      kind: "subs_due",
      brand: s.brand,
      customerId: s.customerId,
      customerName: customerNameMap.get(s.customerId) ?? null,
      message:
        diffDays === 0
          ? "Subscription jatuh tempo hari ini"
          : `Subscription jatuh tempo dalam ${diffDays} hari`,
      href: `/subscriptions/admin?id=${s.id}`,
      sortKey: 1000 - diffDays, // sooner = higher
    });
  }

  // 2) Onboarding stuck (status != done AND updatedAt > 7 days ago)
  const onboardingCutoff = new Date(now - 7 * 86_400_000);
  for (const s of subBrandRows) {
    if (s.onboardingStatus === 2) continue; // assume 2 = done
    if (!s.onboardingUpdatedAt) continue;
    const upd = new Date(s.onboardingUpdatedAt as unknown as string);
    if (upd > onboardingCutoff) continue;
    const stuckDays = Math.floor((now - upd.getTime()) / 86_400_000);
    items.push({
      id: `onboarding:${s.id}`,
      severity: stuckDays > 14 ? "high" : "med",
      kind: "onboarding_stuck",
      brand: s.brand,
      customerId: s.customerId,
      customerName: customerNameMap.get(s.customerId) ?? null,
      message: `Onboarding stuck ${stuckDays} hari`,
      href: `/subscriptions/admin?id=${s.id}`,
      sortKey: 500 + stuckDays,
    });
  }

  // 3) Tickets stale (open AND updatedAt > 48 hours ago)
  const ticketCutoff = new Date(now - 48 * 60 * 60 * 1000);
  const staleTickets = await db
    .select({
      id: ticketIssues.id,
      title: ticketIssues.title,
      subscriptionId: ticketIssues.subscriptionId,
      customerId: ticketIssues.customerId,
      updatedAt: ticketIssues.updatedAt,
      status: ticketIssues.status,
    })
    .from(ticketIssues)
    .where(
      and(
        inArray(ticketIssues.subscriptionId, subscriptionIds),
        ne(ticketIssues.status, 2),
        lte(ticketIssues.updatedAt, ticketCutoff),
      ),
    )
    .orderBy(asc(ticketIssues.updatedAt))
    .limit(20);
  for (const t of staleTickets) {
    const sub = t.subscriptionId ? subMeta.get(t.subscriptionId) : null;
    const customerId = t.customerId ?? sub?.customerId ?? 0;
    if (!customerId) continue;
    const hours = Math.floor((now - new Date(t.updatedAt).getTime()) / 3_600_000);
    items.push({
      id: `ticket:${t.id}`,
      severity: hours > 168 ? "high" : "med",
      kind: "ticket_stale",
      brand: sub?.brand ?? null,
      customerId,
      customerName: customerNameMap.get(customerId) ?? null,
      message: `Ticket "${t.title}" tidak ada update ${Math.floor(hours / 24)} hari`,
      href: `/ticket-issues/admin?id=${t.id}`,
      sortKey: 300 + Math.min(hours, 999),
    });
  }

  // 4) Ads paused (yesterday's snapshot has statusLevel >= 1)
  if (subscriptionIds.length > 0) {
    const fbActRows = await db
      .select({
        id: fbAct.id,
        actId: fbAct.actId,
        name: fbAct.name,
        customerId: fbAct.customerId,
        subscriptionId: fbAct.subscriptionId,
      })
      .from(fbAct)
      .where(inArray(fbAct.subscriptionId, subscriptionIds));
    if (fbActRows.length > 0) {
      const yesterday = daysAgoWibStr(1);
      const daily = await db
        .select({
          actId: fbActDailyData.actId,
          statusLevel: fbActDailyData.statusLevel,
          warningMessage: fbActDailyData.warningMessage,
        })
        .from(fbActDailyData)
        .where(
          and(
            inArray(
              fbActDailyData.actId,
              fbActRows.map((r) => r.actId),
            ),
            eq(fbActDailyData.date, yesterday),
            gte(fbActDailyData.statusLevel, 1),
          ),
        );
      const actMeta = new Map(fbActRows.map((r) => [r.actId, r]));
      for (const d of daily) {
        const act = actMeta.get(d.actId);
        if (!act) continue;
        const sub = act.subscriptionId ? subMeta.get(act.subscriptionId) : null;
        const sev = Number(d.statusLevel) >= 2 ? "high" : "med";
        items.push({
          id: `ads:${act.id}`,
          severity: sev,
          kind: "ads_paused",
          brand: sub?.brand ?? null,
          customerId: act.customerId,
          customerName: customerNameMap.get(act.customerId) ?? null,
          message:
            d.warningMessage ??
            `Akun iklan "${act.name ?? act.actId}" perlu perhatian`,
          href: `/monitoring-ads?customerId=${act.customerId}`,
          sortKey: 700 + (Number(d.statusLevel) === 2 ? 200 : 100),
        });
      }
    }
  }

  // 5) Scorecard in red zone: current-period entry with threshold=2 (red)
  // scorecardData.status: 1 = current period, 0 = historical
  // scorecardData.threshold: 0=green, 1=yellow, 2=red
  if (subscriptionIds.length > 0) {
    const scRows = await db
      .select({
        scorecardId: scorecards.id,
        title: scorecards.title,
        subscriptionId: scorecards.subscriptionId,
        customerId: scorecards.customerId,
        dataUpdatedAt: scorecardData.updatedAt,
      })
      .from(scorecards)
      .innerJoin(scorecardData, eq(scorecardData.scorecardId, scorecards.id))
      .where(
        and(
          inArray(scorecards.subscriptionId, subscriptionIds),
          eq(scorecards.status, 1),
          eq(scorecardData.status, 1),
          eq(scorecardData.threshold, 2),
        ),
      )
      .orderBy(desc(scorecardData.updatedAt))
      .limit(20);
    const seenScorecard = new Set<number>();
    for (const row of scRows) {
      if (seenScorecard.has(row.scorecardId)) continue;
      seenScorecard.add(row.scorecardId);
      const customerId = row.customerId ?? 0;
      if (!customerId) continue;
      const sub = row.subscriptionId ? subMeta.get(row.subscriptionId) : null;
      items.push({
        id: `scorecard:${row.scorecardId}`,
        severity: "med",
        kind: "scorecard_drop",
        brand: sub?.brand ?? null,
        customerId,
        customerName: customerNameMap.get(customerId) ?? null,
        message: `Scorecard "${row.title}" di zona merah`,
        href: `/scorecard-data/advertiser?scorecardId=${row.scorecardId}`,
        sortKey: 400,
      });
    }
  }

  items.sort((a, b) => {
    const sev = { high: 2, med: 1, low: 0 };
    const ds = sev[b.severity] - sev[a.severity];
    if (ds !== 0) return ds;
    return b.sortKey - a.sortKey;
  });

  return c.json({
    success: true,
    data: { items: items.slice(0, limit) },
  });
});

// ───────────────────────── /clients ─────────────────────────

const clientsQuery = z.object({
  asUser: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
  sort: z.enum(["last_activity", "due_date", "name"]).default("last_activity"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

router.get("/clients", zValidator("query", clientsQuery), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const q = c.req.valid("query");
  const advertiserUserId = effectiveAdvertiserUserId(r.scope, q.asUser);
  const { subs, subscriptionIds, customerIds } =
    await loadAdvertiserContext(advertiserUserId);

  if (customerIds.length === 0) {
    return c.json({ success: true, data: { data: [], total: 0 } });
  }

  // Per-customer aggregates
  const adsCounts = await db
    .select({
      customerId: fbAct.customerId,
      total: sql<number>`COUNT(*)`,
    })
    .from(fbAct)
    .where(inArray(fbAct.customerId, customerIds))
    .groupBy(fbAct.customerId);
  const adsByCustomer = new Map(adsCounts.map((r) => [r.customerId, Number(r.total)]));

  const ticketCounts = await db
    .select({
      subscriptionId: ticketIssues.subscriptionId,
      total: sql<number>`COUNT(*)`,
    })
    .from(ticketIssues)
    .where(
      and(
        inArray(ticketIssues.subscriptionId, subscriptionIds),
        ne(ticketIssues.status, 2),
      ),
    )
    .groupBy(ticketIssues.subscriptionId);
  const ticketBySub = new Map(
    ticketCounts.map((r) => [r.subscriptionId, Number(r.total)]),
  );

  // last activity: max(updatedAt) across ticket/meeting/todo per customer
  const lastActivityMap = new Map<number, Date>();
  const collectActivity = async (
    table: typeof ticketIssues | typeof meetings | typeof todos,
  ) => {
    const rows = await db
      .select({
        customerId: table.customerId,
        maxAt: sql<Date>`MAX(${table.updatedAt})`,
      })
      .from(table)
      .where(inArray(table.customerId, customerIds))
      .groupBy(table.customerId);
    for (const row of rows) {
      if (!row.customerId || !row.maxAt) continue;
      const cur = lastActivityMap.get(row.customerId);
      const at = new Date(row.maxAt);
      if (!cur || at > cur) lastActivityMap.set(row.customerId, at);
    }
  };
  await Promise.all([
    collectActivity(ticketIssues),
    collectActivity(meetings),
    collectActivity(todos),
  ]);

  const customerNameRows = await db
    .select({
      id: customers.id,
      email: customers.email,
      name: customerProfiles.name,
    })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(and(inArray(customers.id, customerIds), isNull(customers.deletedAt)));

  // build rows (one per subscription; client can have multiple brands)
  const rows = subs.map((s) => {
    const cust = customerNameRows.find((x) => x.id === s.customerId);
    const last = lastActivityMap.get(s.customerId) ?? null;
    return {
      customerId: s.customerId,
      customerName: cust?.name ?? cust?.email ?? `Customer #${s.customerId}`,
      subscriptionId: s.id,
      status: s.status,
      dueDate: s.dueDate,
      adsCount: adsByCustomer.get(s.customerId) ?? 0,
      ticketsOpen: ticketBySub.get(s.id) ?? 0,
      lastActivity: last ? last.toISOString() : null,
    };
  });

  // search filter
  const filtered = q.q
    ? rows.filter((r) =>
        r.customerName.toLowerCase().includes(q.q!.toLowerCase()),
      )
    : rows;

  // sort
  filtered.sort((a, b) => {
    let cmp = 0;
    if (q.sort === "name") cmp = a.customerName.localeCompare(b.customerName);
    else if (q.sort === "due_date") {
      const av = a.dueDate ? new Date(a.dueDate as unknown as string).getTime() : 0;
      const bv = b.dueDate ? new Date(b.dueDate as unknown as string).getTime() : 0;
      cmp = av - bv;
    } else {
      const av = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const bv = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      cmp = av - bv;
    }
    return q.dir === "asc" ? cmp : -cmp;
  });

  const total = filtered.length;
  const start = (q.page - 1) * q.pageSize;
  const data = filtered.slice(start, start + q.pageSize);

  return c.json({ success: true, data: { data, total } });
});

// ───────────────────────── /activity ─────────────────────────

router.get("/activity", zValidator("query", scopedQuery), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const { asUser, customerId } = c.req.valid("query");
  const advertiserUserId = effectiveAdvertiserUserId(r.scope, asUser);
  const fullCtx = await loadAdvertiserContext(advertiserUserId);
  let subscriptionIds = fullCtx.subscriptionIds;
  if (customerId != null) {
    const narrowed = scopeForCustomer(fullCtx, customerId);
    if (!narrowed) {
      return c.json({ success: true, data: { tickets: [], todos: [] } });
    }
    subscriptionIds = narrowed.subscriptionIds;
  }

  if (subscriptionIds.length === 0) {
    return c.json({ success: true, data: { tickets: [], todos: [] } });
  }

  const ticketRows = await db
    .select({
      id: ticketIssues.id,
      title: ticketIssues.title,
      status: ticketIssues.status,
      pendingOn: ticketIssues.pendingOn,
      customerId: ticketIssues.customerId,
      customerName: customerProfiles.name,
      updatedAt: ticketIssues.updatedAt,
    })
    .from(ticketIssues)
    .leftJoin(
      customerProfiles,
      eq(customerProfiles.customerId, ticketIssues.customerId),
    )
    .where(
      and(
        inArray(ticketIssues.subscriptionId, subscriptionIds),
        ne(ticketIssues.status, 2),
      ),
    )
    .orderBy(desc(ticketIssues.updatedAt))
    .limit(10);

  const today = todayWibStr();
  const in7d = daysAgoWibStr(-7);
  const todoRows = await db
    .select({
      id: todos.id,
      title: todos.title,
      status: todos.status,
      priority: todos.priority,
      dueDate: todos.dueDate,
      customerId: todos.customerId,
      customerName: customerProfiles.name,
    })
    .from(todos)
    .leftJoin(
      customerProfiles,
      eq(customerProfiles.customerId, todos.customerId),
    )
    .where(
      and(
        inArray(todos.subscriptionId, subscriptionIds),
        ne(todos.status, 2),
        gte(todos.dueDate, today),
        lte(todos.dueDate, in7d),
      ),
    )
    .orderBy(asc(todos.dueDate))
    .limit(10);

  return c.json({
    success: true,
    data: { tickets: ticketRows, todos: todoRows },
  });
});

// ───────────────────────── /ads-overview ─────────────────────────

router.get("/ads-overview", zValidator("query", scopedQuery), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const { asUser, customerId } = c.req.valid("query");
  const advertiserUserId = effectiveAdvertiserUserId(r.scope, asUser);
  const fullCtx = await loadAdvertiserContext(advertiserUserId);
  let subscriptionIds = fullCtx.subscriptionIds;
  if (customerId != null) {
    const narrowed = scopeForCustomer(fullCtx, customerId);
    if (!narrowed) {
      return c.json({ success: true, data: { customers: [] } });
    }
    subscriptionIds = narrowed.subscriptionIds;
  }

  if (subscriptionIds.length === 0) {
    return c.json({ success: true, data: { customers: [] } });
  }

  const adsRows = await db
    .select({
      id: fbAct.id,
      actId: fbAct.actId,
      name: fbAct.name,
      customerId: fbAct.customerId,
      customerName: customerProfiles.name,
    })
    .from(fbAct)
    .leftJoin(
      customerProfiles,
      eq(customerProfiles.customerId, fbAct.customerId),
    )
    .where(inArray(fbAct.subscriptionId, subscriptionIds));

  if (adsRows.length === 0) {
    return c.json({ success: true, data: { customers: [] } });
  }

  const actIds = adsRows.map((r) => r.actId);
  const last7Start = daysAgoWibStr(7);
  const last30Start = daysAgoWibStr(30);

  const daily = await db
    .select({
      actId: fbActDailyData.actId,
      date: fbActDailyData.date,
      spend: fbActDailyData.spend,
      statusLevel: fbActDailyData.statusLevel,
    })
    .from(fbActDailyData)
    .where(
      and(
        inArray(fbActDailyData.actId, actIds),
        gte(fbActDailyData.date, last30Start),
      ),
    );

  type Bucket = {
    customerId: number;
    customerName: string;
    adsCount: number;
    active: number;
    paused: number;
    spend7d: number;
    spend30d: number;
  };
  const buckets = new Map<number, Bucket>();
  const yesterday = daysAgoWibStr(1);
  for (const a of adsRows) {
    let b = buckets.get(a.customerId);
    if (!b) {
      b = {
        customerId: a.customerId,
        customerName: a.customerName ?? `Customer #${a.customerId}`,
        adsCount: 0,
        active: 0,
        paused: 0,
        spend7d: 0,
        spend30d: 0,
      };
      buckets.set(a.customerId, b);
    }
    b.adsCount++;
  }

  // act → customer for fast lookup
  const actToCustomer = new Map(adsRows.map((r) => [r.actId, r.customerId]));
  const yesterdayStatus = new Map<string, number>();
  for (const d of daily) {
    const cid = actToCustomer.get(d.actId);
    if (cid == null) continue;
    const b = buckets.get(cid)!;
    if (d.spend != null) {
      const val = Number(d.spend);
      b.spend30d += val;
      if (d.date >= last7Start) b.spend7d += val;
    }
    if (d.date === yesterday) {
      yesterdayStatus.set(d.actId, Number(d.statusLevel ?? 0));
    }
  }
  for (const a of adsRows) {
    const b = buckets.get(a.customerId)!;
    const lvl = yesterdayStatus.get(a.actId);
    if (lvl != null && lvl >= 1) b.paused++;
    else b.active++;
  }

  const result = Array.from(buckets.values()).sort((a, b) => b.spend30d - a.spend30d);
  return c.json({ success: true, data: { customers: result } });
});

// ───────────────────────── /scorecards-summary ─────────────────────────
//
// Returns active scorecards in the advertiser's scope joined to their latest
// current-period entry (scorecardData.status = 1). Grouped per customer so the
// UI can render a "KPI per Client" table.

router.get("/scorecards-summary", zValidator("query", scopedQuery), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const { asUser, customerId } = c.req.valid("query");
  const advertiserUserId = effectiveAdvertiserUserId(r.scope, asUser);
  const fullCtx = await loadAdvertiserContext(advertiserUserId);
  let subscriptionIds = fullCtx.subscriptionIds;
  if (customerId != null) {
    const narrowed = scopeForCustomer(fullCtx, customerId);
    if (!narrowed) {
      return c.json({ success: true, data: { customers: [] } });
    }
    subscriptionIds = narrowed.subscriptionIds;
  }

  if (subscriptionIds.length === 0) {
    return c.json({ success: true, data: { customers: [] } });
  }

  // Active scorecards in scope (with their owning customer + subscription)
  const scRows = await db
    .select({
      id: scorecards.id,
      title: scorecards.title,
      pic: scorecards.pic,
      targetType: scorecards.targetType,
      unitValue: scorecards.unitValue,
      unitCustom: scorecards.unitCustom,
      customerId: scorecards.customerId,
      customerName: customerProfiles.name,
      subscriptionId: scorecards.subscriptionId,
      brand: subscriptions.brand,
    })
    .from(scorecards)
    .leftJoin(
      customerProfiles,
      eq(customerProfiles.customerId, scorecards.customerId),
    )
    .leftJoin(subscriptions, eq(subscriptions.id, scorecards.subscriptionId))
    .where(
      and(
        inArray(scorecards.subscriptionId, subscriptionIds),
        eq(scorecards.status, 1),
      ),
    );

  if (scRows.length === 0) {
    return c.json({ success: true, data: { customers: [] } });
  }

  const scorecardIds = scRows.map((s) => s.id);

  // Latest current-period entry per scorecard (pick the most recent updatedAt
  // when multiple current-period rows exist, e.g. weekly + monthly).
  const dataRows = await db
    .select({
      id: scorecardData.id,
      scorecardId: scorecardData.scorecardId,
      actualValue: scorecardData.actualValue,
      targetValue: scorecardData.targetValue,
      threshold: scorecardData.threshold,
      trend: scorecardData.trend,
      year: scorecardData.year,
      month: scorecardData.month,
      week: scorecardData.week,
      day: scorecardData.day,
      updatedAt: scorecardData.updatedAt,
    })
    .from(scorecardData)
    .where(
      and(
        inArray(scorecardData.scorecardId, scorecardIds),
        eq(scorecardData.status, 1),
      ),
    )
    .orderBy(desc(scorecardData.updatedAt));

  const latestByScorecard = new Map<number, (typeof dataRows)[number]>();
  for (const row of dataRows) {
    if (!latestByScorecard.has(row.scorecardId)) {
      latestByScorecard.set(row.scorecardId, row);
    }
  }

  type ScorecardItem = {
    id: number;
    title: string;
    pic: number;
    targetType: number;
    unitValue: number;
    unitCustom: string | null;
    actualValue: number | null;
    targetValue: number | null;
    threshold: number | null;
    trend: number | null;
    updatedAt: string | null;
    brand: string | null;
  };

  type CustomerBucket = {
    customerId: number;
    customerName: string;
    scorecardsTotal: number;
    red: number;
    yellow: number;
    green: number;
    noData: number;
    items: ScorecardItem[];
  };

  const buckets = new Map<number, CustomerBucket>();
  for (const sc of scRows) {
    if (sc.customerId == null) continue;
    let b = buckets.get(sc.customerId);
    if (!b) {
      b = {
        customerId: sc.customerId,
        customerName: sc.customerName ?? `Customer #${sc.customerId}`,
        scorecardsTotal: 0,
        red: 0,
        yellow: 0,
        green: 0,
        noData: 0,
        items: [],
      };
      buckets.set(sc.customerId, b);
    }
    const latest = latestByScorecard.get(sc.id);
    const threshold = latest?.threshold == null ? null : Number(latest.threshold);
    b.scorecardsTotal++;
    if (threshold === 2) b.red++;
    else if (threshold === 1) b.yellow++;
    else if (threshold === 0) b.green++;
    else b.noData++;
    b.items.push({
      id: sc.id,
      title: sc.title,
      pic: sc.pic,
      targetType: sc.targetType,
      unitValue: sc.unitValue,
      unitCustom: sc.unitCustom,
      actualValue: latest?.actualValue == null ? null : Number(latest.actualValue),
      targetValue: latest?.targetValue == null ? null : Number(latest.targetValue),
      threshold,
      trend: latest?.trend == null ? null : Number(latest.trend),
      updatedAt: latest?.updatedAt ? new Date(latest.updatedAt).toISOString() : null,
      brand: sc.brand,
    });
  }

  // Sort customers by red count desc, then by total desc.
  const result = Array.from(buckets.values()).sort((a, b) => {
    if (b.red !== a.red) return b.red - a.red;
    return b.scorecardsTotal - a.scorecardsTotal;
  });

  // Sort items inside each bucket: red > yellow > no-data > green, then by title
  for (const b of result) {
    b.items.sort((x, y) => {
      const order = (t: number | null) => {
        if (t === 2) return 0;
        if (t === 1) return 1;
        if (t == null) return 2;
        return 3;
      };
      const d = order(x.threshold) - order(y.threshold);
      if (d !== 0) return d;
      return x.title.localeCompare(y.title);
    });
  }

  return c.json({ success: true, data: { customers: result } });
});

// ───────────────────────── /schedule ─────────────────────────

router.get("/schedule", zValidator("query", scopedQuery), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const { asUser, customerId } = c.req.valid("query");
  const advertiserUserId = effectiveAdvertiserUserId(r.scope, asUser);
  const fullCtx = await loadAdvertiserContext(advertiserUserId);
  let subscriptionIds = fullCtx.subscriptionIds;
  if (customerId != null) {
    const narrowed = scopeForCustomer(fullCtx, customerId);
    if (!narrowed) {
      return c.json({ success: true, data: { upcoming: [] } });
    }
    subscriptionIds = narrowed.subscriptionIds;
  }

  if (subscriptionIds.length === 0) {
    return c.json({ success: true, data: { upcoming: [] } });
  }

  const start = startOfTodayWib();
  const end = addDays(start, 14);

  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      type: meetings.type,
      date: meetings.date,
      customerId: meetings.customerId,
      customerName: customerProfiles.name,
    })
    .from(meetings)
    .leftJoin(
      customerProfiles,
      eq(customerProfiles.customerId, meetings.customerId),
    )
    .where(
      and(
        inArray(meetings.subscriptionId, subscriptionIds),
        gte(meetings.date, start),
        lte(meetings.date, end),
      ),
    )
    .orderBy(asc(meetings.date))
    .limit(50);

  return c.json({ success: true, data: { upcoming: rows } });
});

// ───────────────────────── /client/:customerId ─────────────────────────
//
// One-screen drilldown for a single client in the advertiser's scope.
// Returns customer profile, subscriptions, stat cards, and attention items
// scoped to that customer only.

const clientParam = z.object({
  customerId: z.coerce.number().int(),
});

router.get(
  "/client/:customerId",
  zValidator("param", clientParam),
  zValidator("query", summaryQuery),
  async (c) => {
    const r = await resolveAdvertiserScope(c);
    if (!r.ok) return r.response;
    const { asUser } = c.req.valid("query");
    const { customerId } = c.req.valid("param");
    const advertiserUserId = effectiveAdvertiserUserId(r.scope, asUser);

    const fullCtx = await loadAdvertiserContext(advertiserUserId);
    const narrowed = scopeForCustomer(fullCtx, customerId);
    if (!narrowed) {
      return c.json(
        { success: false, error: "Client tidak ditemukan dalam scope kamu" },
        404,
      );
    }
    const { subscriptionIds } = narrowed;

    // Customer profile
    const customerRows = await db
      .select({
        id: customers.id,
        email: customers.email,
        phone: customers.phone,
        deletedAt: customers.deletedAt,
        profileName: customerProfiles.name,
        profileEmail: customerProfiles.email,
        profilePhone: customerProfiles.phone,
      })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(eq(customers.id, customerId))
      .limit(1);

    const cust = customerRows[0];
    if (!cust || cust.deletedAt) {
      return c.json(
        { success: false, error: "Client tidak ditemukan dalam scope kamu" },
        404,
      );
    }

    // Subscriptions (with advertiser name)
    const advertiserUser = users;
    const subRows = await db
      .select({
        id: subscriptions.id,
        brand: subscriptions.brand,
        platform: subscriptions.platform,
        status: subscriptions.status,
        startDate: subscriptions.startDate,
        dueDate: subscriptions.dueDate,
        onboardingStatus: subscriptions.onboardingStatus,
        note: subscriptions.note,
        advertiserId: subscriptions.advertiserId,
        advertiserName: profiles.name,
        advertiserEmail: advertiserUser.email,
      })
      .from(subscriptions)
      .leftJoin(advertiserUser, eq(advertiserUser.id, subscriptions.advertiserId))
      .leftJoin(profiles, eq(profiles.userId, subscriptions.advertiserId))
      .where(inArray(subscriptions.id, subscriptionIds));

    // Cards: ads counts, kpi counts, tickets open, todos due 24h, todos open
    let adsTotal = 0;
    let adsActive = 0;
    let adsPaused = 0;
    if (subscriptionIds.length > 0) {
      const adsRows = await db
        .select({ id: fbAct.id, actId: fbAct.actId })
        .from(fbAct)
        .where(inArray(fbAct.subscriptionId, subscriptionIds));
      adsTotal = adsRows.length;
      if (adsRows.length > 0) {
        const yesterday = daysAgoWibStr(1);
        const dailyYesterday = await db
          .select({
            actId: fbActDailyData.actId,
            statusLevel: fbActDailyData.statusLevel,
          })
          .from(fbActDailyData)
          .where(
            and(
              inArray(fbActDailyData.actId, adsRows.map((r) => r.actId)),
              eq(fbActDailyData.date, yesterday),
            ),
          );
        for (const d of dailyYesterday) {
          if (Number(d.statusLevel ?? 0) > 0) adsPaused++;
          else adsActive++;
        }
        const seen = new Set(dailyYesterday.map((d) => d.actId));
        adsActive += adsRows.filter((r) => !seen.has(r.actId)).length;
      }
    }

    // KPI counts
    let kpiRed = 0;
    let kpiYellow = 0;
    let kpiGreen = 0;
    let kpiNoData = 0;
    if (subscriptionIds.length > 0) {
      const rows = await db
        .select({
          scorecardId: scorecards.id,
          threshold: scorecardData.threshold,
        })
        .from(scorecards)
        .leftJoin(
          scorecardData,
          and(
            eq(scorecardData.scorecardId, scorecards.id),
            eq(scorecardData.status, 1),
          ),
        )
        .where(
          and(
            inArray(scorecards.subscriptionId, subscriptionIds),
            eq(scorecards.status, 1),
          ),
        );
      const worstByScorecard = new Map<number, number | null>();
      for (const row of rows) {
        const prev = worstByScorecard.get(row.scorecardId);
        const cur = row.threshold == null ? null : Number(row.threshold);
        if (prev === undefined) worstByScorecard.set(row.scorecardId, cur);
        else if (cur != null && (prev == null || cur > prev)) {
          worstByScorecard.set(row.scorecardId, cur);
        }
      }
      for (const t of worstByScorecard.values()) {
        if (t === 2) kpiRed++;
        else if (t === 1) kpiYellow++;
        else if (t === 0) kpiGreen++;
        else kpiNoData++;
      }
    }

    // Tickets open
    let ticketsOpen = 0;
    if (subscriptionIds.length > 0) {
      const rows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(ticketIssues)
        .where(
          and(
            inArray(ticketIssues.subscriptionId, subscriptionIds),
            ne(ticketIssues.status, 2),
          ),
        );
      ticketsOpen = Number(rows[0]?.count ?? 0);
    }

    // Todos open + due 24h
    let todosOpen = 0;
    let todosDue24h = 0;
    if (subscriptionIds.length > 0) {
      const openRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(todos)
        .where(
          and(
            inArray(todos.subscriptionId, subscriptionIds),
            ne(todos.status, 2),
          ),
        );
      todosOpen = Number(openRows[0]?.count ?? 0);
      const today = todayWibStr();
      const limit = daysAgoWibStr(-1);
      const dueRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(todos)
        .where(
          and(
            inArray(todos.subscriptionId, subscriptionIds),
            ne(todos.status, 2),
            gte(todos.dueDate, today),
            lte(todos.dueDate, limit),
          ),
        );
      todosDue24h = Number(dueRows[0]?.count ?? 0);
    }

    return c.json({
      success: true,
      data: {
        customer: {
          id: cust.id,
          name: cust.profileName ?? cust.email ?? `Customer #${cust.id}`,
          email: cust.profileEmail ?? cust.email,
          phone: cust.profilePhone ?? cust.phone,
        },
        subscriptions: subRows.map((s) => ({
          id: s.id,
          brand: s.brand,
          platform: s.platform,
          status: s.status,
          startDate: s.startDate,
          dueDate: s.dueDate,
          onboardingStatus: s.onboardingStatus,
          note: s.note,
          advertiserId: s.advertiserId,
          advertiserName: s.advertiserName ?? s.advertiserEmail ?? null,
        })),
        cards: {
          ads: { total: adsTotal, active: adsActive, paused: adsPaused },
          kpi: { red: kpiRed, yellow: kpiYellow, green: kpiGreen, noData: kpiNoData },
          ticketsOpen,
          todosOpen,
          todosDue24h,
        },
      },
    });
  },
);

// ───────────────────────── /client/:customerId/ads ─────────────────────────
//
// Per-ads detail list for a single client. Used by the "Ads" tab on the client
// overview page. Returns name, platform (always Meta for now), status from
// yesterday's snapshot, spend 7d/30d, and last-active timestamp.

router.get(
  "/client/:customerId/ads",
  zValidator("param", clientParam),
  zValidator("query", summaryQuery),
  async (c) => {
    const r = await resolveAdvertiserScope(c);
    if (!r.ok) return r.response;
    const { asUser } = c.req.valid("query");
    const { customerId } = c.req.valid("param");
    const advertiserUserId = effectiveAdvertiserUserId(r.scope, asUser);

    const fullCtx = await loadAdvertiserContext(advertiserUserId);
    const narrowed = scopeForCustomer(fullCtx, customerId);
    if (!narrowed) {
      return c.json(
        { success: false, error: "Client tidak ditemukan dalam scope kamu" },
        404,
      );
    }
    const { subscriptionIds } = narrowed;
    if (subscriptionIds.length === 0) {
      return c.json({ success: true, data: { ads: [] } });
    }

    const adsRows = await db
      .select({
        id: fbAct.id,
        actId: fbAct.actId,
        name: fbAct.name,
        actName: fbAct.actName,
        subscriptionId: fbAct.subscriptionId,
        brand: subscriptions.brand,
      })
      .from(fbAct)
      .leftJoin(subscriptions, eq(subscriptions.id, fbAct.subscriptionId))
      .where(inArray(fbAct.subscriptionId, subscriptionIds));

    if (adsRows.length === 0) {
      return c.json({ success: true, data: { ads: [] } });
    }

    const actIds = adsRows.map((r) => r.actId);
    const last30Start = daysAgoWibStr(30);
    const last7Start = daysAgoWibStr(7);
    const yesterday = daysAgoWibStr(1);

    const daily = await db
      .select({
        actId: fbActDailyData.actId,
        date: fbActDailyData.date,
        spend: fbActDailyData.spend,
        statusLevel: fbActDailyData.statusLevel,
        warningMessage: fbActDailyData.warningMessage,
      })
      .from(fbActDailyData)
      .where(
        and(
          inArray(fbActDailyData.actId, actIds),
          gte(fbActDailyData.date, last30Start),
        ),
      );

    type AggAd = {
      id: number;
      actId: string;
      name: string;
      brand: string | null;
      status: number;
      warning: string | null;
      spend7d: number;
      spend30d: number;
      lastActiveDate: string | null;
    };

    const map = new Map<string, AggAd>();
    for (const a of adsRows) {
      map.set(a.actId, {
        id: a.id,
        actId: a.actId,
        name: a.name ?? a.actName ?? a.actId,
        brand: a.brand,
        status: 0,
        warning: null,
        spend7d: 0,
        spend30d: 0,
        lastActiveDate: null,
      });
    }
    for (const d of daily) {
      const ad = map.get(d.actId);
      if (!ad) continue;
      const sp = d.spend == null ? 0 : Number(d.spend);
      ad.spend30d += sp;
      if (d.date >= last7Start) ad.spend7d += sp;
      if (sp > 0 && (!ad.lastActiveDate || d.date > ad.lastActiveDate)) {
        ad.lastActiveDate = d.date;
      }
      if (d.date === yesterday) {
        ad.status = Number(d.statusLevel ?? 0);
        ad.warning = d.warningMessage ?? null;
      }
    }

    const ads = Array.from(map.values()).sort((a, b) => {
      // paused first (status >= 1), then by spend30d desc
      const aPaused = a.status >= 1 ? 1 : 0;
      const bPaused = b.status >= 1 ? 1 : 0;
      if (aPaused !== bPaused) return bPaused - aPaused;
      return b.spend30d - a.spend30d;
    });

    return c.json({ success: true, data: { ads } });
  },
);

export default router;
