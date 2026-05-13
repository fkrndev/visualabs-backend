import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { db } from '../db/client';
import {
  fbAct,
  fbActDailyData,
  fbActCampaignDailyInsights,
  fbActResultBreakdownDaily,
  fbActResultConfig,
  fbActNotificationsLog,
  fbActReportRuns,
  fbToken,
  subscriptions,
  customers,
  customerProfiles,
  users,
  profiles,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { role } from '../utils/auth/role';
import { ROLE_ADMIN } from '../utils/auth/permissions';
import type { Context, Next } from 'hono';

const router = new Hono();

// ───────────────────────── Defaults (match notify.py) ─────────────────────────
const DEFAULT_WARNING = 1_000_000;
const DEFAULT_CRITICAL = 100_000;
const DEFAULT_POSTPAID_WARNING = 1_000_000;
const DEFAULT_POSTPAID_CRITICAL = 500_000;

// ───────────────────────── Helpers ─────────────────────────

type Scope =
  | { kind: 'admin'; userId: number }
  | { kind: 'advertiser'; userId: number; customerIds: number[]; fbActIds: number[] };

async function resolveScope(c: Context): Promise<Scope | { error: Response }> {
  const payload = c.get('jwtPayload');
  const userId = payload?.sub ? Number(payload.sub) : NaN;
  if (!Number.isInteger(userId)) {
    return {
      error: c.json({ success: false, message: 'Unauthorized' }, 401),
    };
  }
  const userRole = await role(userId);
  if (userRole === ROLE_ADMIN) {
    return { kind: 'admin', userId };
  }
  // Resolve advertiser scope: subscriptions.advertiserId == userId
  const subs = await db
    .select({ customerId: subscriptions.customerId, subscriptionId: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.advertiserId, userId));
  const customerIds = Array.from(new Set(subs.map((s) => s.customerId)));
  const subIds = subs.map((s) => s.subscriptionId);

  let fbActIds: number[] = [];
  if (subIds.length > 0) {
    const rows = await db
      .select({ id: fbAct.id })
      .from(fbAct)
      .where(inArray(fbAct.subscriptionId, subIds));
    fbActIds = rows.map((r) => r.id);
  }

  return { kind: 'advertiser', userId, customerIds, fbActIds };
}

function effectiveThresholds(row: {
  thresholdWarningOverride: string | null;
  thresholdCriticalOverride: string | null;
  postpaidThresholdOverride: string | null;
}) {
  const warning =
    row.thresholdWarningOverride != null
      ? Number(row.thresholdWarningOverride)
      : DEFAULT_WARNING;
  const critical =
    row.thresholdCriticalOverride != null
      ? Number(row.thresholdCriticalOverride)
      : DEFAULT_CRITICAL;
  const postpaid =
    row.postpaidThresholdOverride != null ? Number(row.postpaidThresholdOverride) : null;
  return { warning, critical, postpaid };
}

function computeStatus(
  balanceType: string | null,
  balance: number | null,
  thresholds: { warning: number; critical: number; postpaid: number | null },
): { level: 0 | 1 | 2; message: string | null } {
  if (balance == null) return { level: 0, message: null };
  if (balanceType === 'Postpaid') {
    // balance = ruang tagihan tersisa
    const warn = thresholds.postpaid ?? DEFAULT_POSTPAID_WARNING;
    const crit = DEFAULT_POSTPAID_CRITICAL;
    if (balance <= 0)
      return { level: 2, message: 'Tagihan sudah mencapai threshold!' };
    if (balance < crit) return { level: 2, message: 'Ruang tagihan tinggal < Rp 500.000' };
    if (balance < warn) return { level: 1, message: 'Ruang tagihan tinggal < Rp 1jt' };
    return { level: 0, message: null };
  }
  if (balance <= 0) return { level: 2, message: 'SALDO HABIS!' };
  if (balance < thresholds.critical)
    return { level: 2, message: `Saldo di bawah Rp ${thresholds.critical.toLocaleString('id-ID')}` };
  if (balance < thresholds.warning)
    return { level: 1, message: `Saldo tinggal < Rp ${thresholds.warning.toLocaleString('id-ID')}` };
  return { level: 0, message: null };
}

const rangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const accountsQuery = z.object({
  customerId: z.coerce.number().int().optional(),
  status: z.enum(['ok', 'warning', 'critical']).optional(),
  balanceType: z.string().optional(),
  advertiserUserId: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

function todayWibStr(): string {
  // WIB = UTC+7
  const nowUtc = Date.now();
  const wib = new Date(nowUtc + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

function yesterdayWibStr(): string {
  const nowUtc = Date.now();
  const wib = new Date(nowUtc + 7 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

// Fetch the latest fb_act_daily_data row per act_id (replaces correlated subquery).
async function latestDailyByActId(actIds: string[]) {
  const map = new Map<string, typeof fbActDailyData.$inferSelect>();
  if (actIds.length === 0) return map;
  const maxRows = await db
    .select({ actId: fbActDailyData.actId, maxDate: sql<string>`MAX(${fbActDailyData.date})` })
    .from(fbActDailyData)
    .where(inArray(fbActDailyData.actId, actIds))
    .groupBy(fbActDailyData.actId);
  if (maxRows.length === 0) return map;
  // Use OR of (actId, date) pairs — keep it simple with separate queries when small set,
  // else fetch all rows for these actIds at max dates by building tuple matcher.
  const pairs = maxRows.map((r) => sql`(${fbActDailyData.actId} = ${r.actId} AND ${fbActDailyData.date} = ${r.maxDate})`);
  const orExpr = sql.join(pairs, sql` OR `);
  const rows = await db
    .select()
    .from(fbActDailyData)
    .where(sql`(${orExpr})`);
  for (const r of rows) {
    map.set(r.actId, r);
  }
  return map;
}

// Build a WHERE clause restricting fbAct rows to the resolved scope.
// Resolves advertiser→subscription IDs in JS to avoid problematic subqueries.
async function scopeFbActWhere(
  scope: Scope,
  opts?: { advertiserUserId?: number; customerId?: number },
) {
  const conds: any[] = [];
  if (scope.kind === 'advertiser') {
    if (scope.fbActIds.length === 0) {
      conds.push(sql`1=0`);
    } else {
      conds.push(inArray(fbAct.id, scope.fbActIds));
    }
  } else if (opts?.advertiserUserId) {
    const subs = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.advertiserId, opts.advertiserUserId));
    const subIds = subs.map((s) => s.id);
    if (subIds.length === 0) {
      conds.push(sql`1=0`);
    } else {
      conds.push(inArray(fbAct.subscriptionId, subIds));
    }
  }
  if (opts?.customerId) {
    conds.push(eq(fbAct.customerId, opts.customerId));
  }
  return conds.length ? and(...conds) : undefined;
}

// ───────────────────────── Auth ─────────────────────────
router.use('*', requireAuth);

// ───────────────────────── /customers (scope dropdown) ─────────────────────────
router.get('/customers', async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;

  const conds: any[] = [];
  if (scope.kind === 'advertiser') {
    if (scope.customerIds.length === 0) {
      return c.json({ success: true, data: [] });
    }
    conds.push(inArray(customers.id, scope.customerIds));
  }

  const rows = await db
    .select({
      id: customers.id,
      name: customerProfiles.name,
      email: customers.email,
    })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(conds.length ? and(...conds) : sql`1=1`)
    .groupBy(customers.id, customerProfiles.name, customers.email);

  return c.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name ?? r.email ?? `Customer #${r.id}`,
    })),
  });
});

// ───────────────────────── /advertisers (admin only) ─────────────────────────
router.get('/advertisers', async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;
  if (scope.kind !== 'admin') {
    return c.json({ success: false, message: 'Forbidden — admin only' }, 403);
  }
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: profiles.name,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.advertiserId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .groupBy(users.id, users.email, profiles.name);

  return c.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name ?? r.email ?? `User #${r.id}`,
    })),
  });
});

// ───────────────────────── /summary ─────────────────────────
router.get(
  '/summary',
  zValidator(
    'query',
    z.object({
      customerId: z.coerce.number().int().optional(),
      advertiserUserId: z.coerce.number().int().optional(),
    }),
  ),
  async (c) => {
    const scope = await resolveScope(c);
    if ('error' in scope) return scope.error;
    const { customerId, advertiserUserId } = c.req.valid('query');

    const where = await scopeFbActWhere(scope, { customerId, advertiserUserId });

    // Fetch all in-scope fb_act with latest snapshot
    const yesterday = yesterdayWibStr();
    const today = todayWibStr();

    const accounts = await db
      .select({
        id: fbAct.id,
        actId: fbAct.actId,
        name: fbAct.name,
        tokenStatus: fbToken.status,
        tokenId: fbAct.tokenId,
        warnOv: fbAct.thresholdWarningOverride,
        critOv: fbAct.thresholdCriticalOverride,
        postOv: fbAct.postpaidThresholdOverride,
      })
      .from(fbAct)
      .leftJoin(fbToken, eq(fbToken.id, fbAct.tokenId))
      .where(where ?? sql`1=1`);

    const dailyMap = await latestDailyByActId(accounts.map((a) => a.actId));

    let totalAkun = accounts.length;
    let akunCritical = 0;
    let akunWarning = 0;
    let spendD1 = 0;
    let tokenTidakValid = 0;

    for (const a of accounts) {
      const d = dailyMap.get(a.actId);
      const t = effectiveThresholds({
        thresholdWarningOverride: a.warnOv ?? null,
        thresholdCriticalOverride: a.critOv ?? null,
        postpaidThresholdOverride: a.postOv ?? null,
      });
      let level = d?.statusLevel != null ? Number(d.statusLevel) : 0;
      if ((d?.statusLevel == null) && d?.effectiveBalance != null) {
        const computed = computeStatus(d.balanceType, Number(d.effectiveBalance), t);
        level = computed.level;
      }
      if (level === 2) akunCritical++;
      else if (level === 1) akunWarning++;
      if (d?.spend != null && d.date === yesterday) spendD1 += Number(d.spend);
      if (a.tokenId == null || a.tokenStatus === 0) tokenTidakValid++;
    }

    // Notif belum terkirim untuk today
    const actIds = accounts.map((a) => a.actId);
    let notifBelumTerkirim = totalAkun;
    if (actIds.length > 0) {
      const sentRows = await db
        .select({ actId: fbActNotificationsLog.actId })
        .from(fbActNotificationsLog)
        .where(
          and(
            inArray(fbActNotificationsLog.actId, actIds),
            eq(fbActNotificationsLog.date, today),
            eq(fbActNotificationsLog.type, 'main'),
          ),
        )
        .groupBy(fbActNotificationsLog.actId);
      notifBelumTerkirim = totalAkun - sentRows.length;
    }

    return c.json({
      success: true,
      data: {
        totalAkun,
        akunCritical,
        akunWarning,
        spendD1,
        notifBelumTerkirim,
        tokenTidakValid,
        today,
        yesterday,
      },
    });
  },
);

// ───────────────────────── /accounts ─────────────────────────
router.get('/accounts', zValidator('query', accountsQuery), async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;
  const q = c.req.valid('query');

  const baseWhere = await scopeFbActWhere(scope, {
    customerId: q.customerId,
    advertiserUserId: q.advertiserUserId,
  });

  const rows = await db
    .select({
      id: fbAct.id,
      actId: fbAct.actId,
      name: fbAct.name,
      actName: fbAct.actName,
      customerId: fbAct.customerId,
      customerName: customerProfiles.name,
      subscriptionId: fbAct.subscriptionId,
      advertiserUserId: subscriptions.advertiserId,
      advertiserEmail: users.email,
      advertiserName: profiles.name,
      tokenId: fbAct.tokenId,
      tokenStatus: fbToken.status,
      warnOv: fbAct.thresholdWarningOverride,
      critOv: fbAct.thresholdCriticalOverride,
      postOv: fbAct.postpaidThresholdOverride,
    })
    .from(fbAct)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, fbAct.customerId))
    .leftJoin(subscriptions, eq(subscriptions.id, fbAct.subscriptionId))
    .leftJoin(users, eq(users.id, subscriptions.advertiserId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(fbToken, eq(fbToken.id, fbAct.tokenId))
    .where(baseWhere ?? sql`1=1`)
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  const actIds = rows.map((r) => r.actId);
  const dailyMap = await latestDailyByActId(actIds);

  // Compute primary result (highest results, primary type) for each act on its latest date
  let primaryByAct: Record<string, { label: string; results: number; resultType: number } | null> = {};
  if (actIds.length > 0) {
    // Get max date per actId for breakdown
    const maxDates = await db
      .select({
        actId: fbActResultBreakdownDaily.actId,
        maxDate: sql<string>`MAX(${fbActResultBreakdownDaily.date})`,
      })
      .from(fbActResultBreakdownDaily)
      .where(inArray(fbActResultBreakdownDaily.actId, actIds))
      .groupBy(fbActResultBreakdownDaily.actId);
    let breakdownRows: any[] = [];
    if (maxDates.length > 0) {
      const pairs = maxDates.map(
        (m) =>
          sql`(${fbActResultBreakdownDaily.actId} = ${m.actId} AND ${fbActResultBreakdownDaily.date} = ${m.maxDate})`,
      );
      breakdownRows = await db
        .select({
          actId: fbActResultBreakdownDaily.actId,
          date: fbActResultBreakdownDaily.date,
          label: fbActResultBreakdownDaily.label,
          resultType: fbActResultBreakdownDaily.resultType,
          results: fbActResultBreakdownDaily.results,
          roas: fbActResultBreakdownDaily.roas,
        })
        .from(fbActResultBreakdownDaily)
        .where(sql`(${sql.join(pairs, sql` OR `)})`);
    }
    for (const b of breakdownRows) {
      const k = b.actId;
      const cur = primaryByAct[k];
      if (
        !cur ||
        b.resultType < cur.resultType ||
        (b.resultType === cur.resultType && Number(b.results) > cur.results)
      ) {
        primaryByAct[k] = {
          label: b.label,
          results: Number(b.results),
          resultType: Number(b.resultType),
        };
      }
    }
  }

  // Apply status filter post-hoc
  let filtered = rows.map((r) => {
    const d = dailyMap.get(r.actId);
    const t = effectiveThresholds({
      thresholdWarningOverride: r.warnOv ?? null,
      thresholdCriticalOverride: r.critOv ?? null,
      postpaidThresholdOverride: r.postOv ?? null,
    });
    let level: number | null = d?.statusLevel ?? null;
    let warningMsg: string | null = d?.warningMessage ?? null;
    if (level == null && d?.effectiveBalance != null) {
      const cmp = computeStatus(d.balanceType, Number(d.effectiveBalance), t);
      level = cmp.level;
      warningMsg = cmp.message;
    }
    return {
      id: r.id,
      actId: r.actId,
      name: r.name,
      actName: r.actName,
      customer: { id: r.customerId, name: r.customerName ?? null },
      advertiser: {
        userId: r.advertiserUserId,
        name: r.advertiserName ?? r.advertiserEmail ?? null,
      },
      token: { id: r.tokenId, status: r.tokenStatus ?? null },
      date: d?.date ?? null,
      balanceType: d?.balanceType ?? null,
      effectiveBalance: d?.effectiveBalance != null ? Number(d.effectiveBalance) : null,
      spendingLimit: d?.spendingLimit != null ? Number(d.spendingLimit) : null,
      outstandingBalance: d?.outstandingBalance != null ? Number(d.outstandingBalance) : null,
      statusLevel: level == null ? null : Number(level),
      warningMessage: warningMsg,
      spend: d?.spend != null ? Number(d.spend) : null,
      impressions: d?.impressions ?? null,
      reach: d?.reach ?? null,
      frequency: d?.frequency != null ? Number(d.frequency) : null,
      linkClicks: d?.linkClicks ?? null,
      ctr: d?.ctr != null ? Number(d.ctr) : null,
      cpm: d?.cpm != null ? Number(d.cpm) : null,
      cpc: d?.cpc != null ? Number(d.cpc) : null,
      primaryResult: primaryByAct[r.actId] ?? null,
      thresholds: t,
    };
  });

  if (q.status) {
    const target = q.status === 'ok' ? 0 : q.status === 'warning' ? 1 : 2;
    filtered = filtered.filter((r) => (r.statusLevel ?? 0) === target);
  }
  if (q.balanceType) {
    filtered = filtered.filter((r) => r.balanceType === q.balanceType);
  }

  return c.json({ success: true, data: filtered });
});

// ───────────────────────── /alerts ─────────────────────────
router.get('/alerts', async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;
  const where = await scopeFbActWhere(scope);

  const rows = await db
    .select({
      id: fbAct.id,
      actId: fbAct.actId,
      name: fbAct.name,
      customerName: customerProfiles.name,
      warnOv: fbAct.thresholdWarningOverride,
      critOv: fbAct.thresholdCriticalOverride,
      postOv: fbAct.postpaidThresholdOverride,
    })
    .from(fbAct)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, fbAct.customerId))
    .where(where ?? sql`1=1`);

  const dailyMap = await latestDailyByActId(rows.map((r) => r.actId));

  const alerts = rows
    .map((r) => {
      const d = dailyMap.get(r.actId);
      if (!d) return null;
      const t = effectiveThresholds({
        thresholdWarningOverride: r.warnOv ?? null,
        thresholdCriticalOverride: r.critOv ?? null,
        postpaidThresholdOverride: r.postOv ?? null,
      });
      let level: number | null = d.statusLevel ?? null;
      let msg: string | null = d.warningMessage ?? null;
      if (level == null && d.effectiveBalance != null) {
        const cmp = computeStatus(d.balanceType, Number(d.effectiveBalance), t);
        level = cmp.level;
        msg = cmp.message;
      }
      return {
        id: r.id,
        actId: r.actId,
        name: r.name,
        customerName: r.customerName ?? null,
        balanceType: d.balanceType,
        effectiveBalance: d.effectiveBalance != null ? Number(d.effectiveBalance) : null,
        statusLevel: level == null ? null : Number(level),
        warningMessage: msg,
        date: d.date,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null && (r.statusLevel ?? 0) >= 1)
    .sort((a, b) => (b.statusLevel ?? 0) - (a.statusLevel ?? 0));

  return c.json({ success: true, data: alerts });
});

// ───────────────────────── /tokens ─────────────────────────
router.get('/tokens', async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;

  // Tokens linked to any in-scope fb_act
  const fbActWhere = await scopeFbActWhere(scope);

  // Get distinct token ids in scope (incl. null token cases via separate query)
  const tokenRows = await db
    .select({
      tokenId: fbToken.id,
      userId: fbToken.userId,
      status: fbToken.status,
      updatedAt: fbToken.updatedAt,
      ownerName: profiles.name,
      ownerEmail: users.email,
      accountsCount: sql<number>`COUNT(DISTINCT ${fbAct.id})`,
    })
    .from(fbAct)
    .leftJoin(fbToken, eq(fbToken.id, fbAct.tokenId))
    .leftJoin(users, eq(users.id, fbToken.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(fbActWhere ?? sql`1=1`)
    .groupBy(fbToken.id, fbToken.userId, fbToken.status, fbToken.updatedAt, profiles.name, users.email);

  return c.json({
    success: true,
    data: tokenRows.map((r) => ({
      tokenId: r.tokenId,
      userId: r.userId,
      status: r.tokenId == null ? null : Number(r.status ?? 0),
      updatedAt: r.updatedAt,
      owner: r.ownerName ?? r.ownerEmail ?? null,
      accountsCount: Number(r.accountsCount),
    })),
  });
});

// ───────────────────────── /report-runs ─────────────────────────
router.get(
  '/report-runs',
  zValidator('query', rangeSchema),
  async (c) => {
    const scope = await resolveScope(c);
    if ('error' in scope) return scope.error;
    if (scope.kind !== 'admin') {
      // Advertiser tetap boleh lihat status cron (read-only global)
    }
    const { from, to } = c.req.valid('query');
    const conds: any[] = [];
    if (from) conds.push(gte(fbActReportRuns.date, from));
    if (to) conds.push(lte(fbActReportRuns.date, to));

    const rows = await db
      .select()
      .from(fbActReportRuns)
      .where(conds.length ? and(...conds) : sql`1=1`)
      .orderBy(desc(fbActReportRuns.date))
      .limit(60);

    return c.json({ success: true, data: rows });
  },
);

// ───────────────────────── /accounts/:fbActId ─────────────────────────
async function loadFbActForScope(c: Context, scope: Scope, fbActId: number) {
  const [row] = await db
    .select({
      id: fbAct.id,
      actId: fbAct.actId,
      actName: fbAct.actName,
      name: fbAct.name,
      customerId: fbAct.customerId,
      customerName: customerProfiles.name,
      subscriptionId: fbAct.subscriptionId,
      advertiserUserId: subscriptions.advertiserId,
      advertiserName: profiles.name,
      advertiserEmail: users.email,
      tokenId: fbAct.tokenId,
      tokenStatus: fbToken.status,
      tokenUpdatedAt: fbToken.updatedAt,
      warnOv: fbAct.thresholdWarningOverride,
      critOv: fbAct.thresholdCriticalOverride,
      postOv: fbAct.postpaidThresholdOverride,
    })
    .from(fbAct)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, fbAct.customerId))
    .leftJoin(subscriptions, eq(subscriptions.id, fbAct.subscriptionId))
    .leftJoin(users, eq(users.id, subscriptions.advertiserId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(fbToken, eq(fbToken.id, fbAct.tokenId))
    .where(eq(fbAct.id, fbActId))
    .limit(1);

  if (!row) return { error: c.json({ success: false, message: 'Not found' }, 404) };

  if (scope.kind === 'advertiser' && !scope.fbActIds.includes(row.id)) {
    return { error: c.json({ success: false, message: 'Forbidden' }, 403) };
  }
  return { row };
}

router.get('/accounts/:fbActId', async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;
  const fbActId = Number(c.req.param('fbActId'));
  if (!Number.isInteger(fbActId)) {
    return c.json({ success: false, message: 'Invalid fbActId' }, 400);
  }
  const res = await loadFbActForScope(c, scope, fbActId);
  if ('error' in res) return res.error;
  const row = res.row;

  const [latest] = await db
    .select()
    .from(fbActDailyData)
    .where(eq(fbActDailyData.actId, row.actId))
    .orderBy(desc(fbActDailyData.date))
    .limit(1);

  const thresholds = effectiveThresholds({
    thresholdWarningOverride: row.warnOv ?? null,
    thresholdCriticalOverride: row.critOv ?? null,
    postpaidThresholdOverride: row.postOv ?? null,
  });

  return c.json({
    success: true,
    data: {
      id: row.id,
      actId: row.actId,
      name: row.name,
      actName: row.actName,
      customer: { id: row.customerId, name: row.customerName ?? null },
      advertiser: {
        userId: row.advertiserUserId,
        name: row.advertiserName ?? row.advertiserEmail ?? null,
      },
      token: {
        id: row.tokenId,
        status: row.tokenId == null ? null : Number(row.tokenStatus ?? 0),
        updatedAt: row.tokenUpdatedAt,
      },
      thresholds: {
        default: {
          warning: DEFAULT_WARNING,
          critical: DEFAULT_CRITICAL,
          postpaidWarning: DEFAULT_POSTPAID_WARNING,
          postpaidCritical: DEFAULT_POSTPAID_CRITICAL,
        },
        override: {
          warning: row.warnOv != null ? Number(row.warnOv) : null,
          critical: row.critOv != null ? Number(row.critOv) : null,
          postpaid: row.postOv != null ? Number(row.postOv) : null,
        },
        effective: thresholds,
      },
      latest: latest ?? null,
    },
  });
});

// ───────────────────────── /accounts/:fbActId/daily ─────────────────────────
router.get('/accounts/:fbActId/daily', zValidator('query', rangeSchema), async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;
  const fbActId = Number(c.req.param('fbActId'));
  const res = await loadFbActForScope(c, scope, fbActId);
  if ('error' in res) return res.error;
  const { from, to } = c.req.valid('query');

  const conds: any[] = [eq(fbActDailyData.actId, res.row.actId)];
  if (from) conds.push(gte(fbActDailyData.date, from));
  if (to) conds.push(lte(fbActDailyData.date, to));

  const rows = await db
    .select()
    .from(fbActDailyData)
    .where(and(...conds))
    .orderBy(desc(fbActDailyData.date))
    .limit(90);

  return c.json({ success: true, data: rows });
});

// ───────────────────────── /accounts/:fbActId/campaigns ─────────────────────────
router.get(
  '/accounts/:fbActId/campaigns',
  zValidator('query', z.object({ date: z.string().optional() })),
  async (c) => {
    const scope = await resolveScope(c);
    if ('error' in scope) return scope.error;
    const fbActId = Number(c.req.param('fbActId'));
    const res = await loadFbActForScope(c, scope, fbActId);
    if ('error' in res) return res.error;
    const { date } = c.req.valid('query');

    const conds: any[] = [eq(fbActCampaignDailyInsights.actId, res.row.actId)];
    let resolvedDate = date;
    if (!resolvedDate) {
      const [m] = await db
        .select({ maxDate: sql<string>`MAX(${fbActCampaignDailyInsights.date})` })
        .from(fbActCampaignDailyInsights)
        .where(eq(fbActCampaignDailyInsights.actId, res.row.actId));
      resolvedDate = m?.maxDate ?? undefined;
    }
    if (!resolvedDate) {
      return c.json({ success: true, data: [] });
    }
    conds.push(eq(fbActCampaignDailyInsights.date, resolvedDate));

    const rows = await db
      .select()
      .from(fbActCampaignDailyInsights)
      .where(and(...conds))
      .orderBy(desc(fbActCampaignDailyInsights.spend));

    return c.json({ success: true, data: rows });
  },
);

// ───────────────────────── /accounts/:fbActId/results ─────────────────────────
router.get('/accounts/:fbActId/results', zValidator('query', rangeSchema), async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;
  const fbActId = Number(c.req.param('fbActId'));
  const res = await loadFbActForScope(c, scope, fbActId);
  if ('error' in res) return res.error;
  const { from, to } = c.req.valid('query');

  const conds: any[] = [eq(fbActResultBreakdownDaily.actId, res.row.actId)];
  if (from) conds.push(gte(fbActResultBreakdownDaily.date, from));
  if (to) conds.push(lte(fbActResultBreakdownDaily.date, to));

  const rows = await db
    .select()
    .from(fbActResultBreakdownDaily)
    .where(and(...conds))
    .orderBy(desc(fbActResultBreakdownDaily.date));

  // Detect purchase-metrics availability via result config
  const cfg = await db
    .select({ resultType: fbActResultConfig.resultType })
    .from(fbActResultConfig)
    .where(eq(fbActResultConfig.actId, res.row.actId));
  const hasPurchase = cfg.some((r) => r.resultType === 'purchase');

  return c.json({ success: true, data: { rows, hasPurchase } });
});

// ───────────────────────── /accounts/:fbActId/notifications ─────────────────────────
router.get(
  '/accounts/:fbActId/notifications',
  zValidator('query', z.object({ limit: z.coerce.number().int().min(1).max(200).default(60) })),
  async (c) => {
    const scope = await resolveScope(c);
    if ('error' in scope) return scope.error;
    const fbActId = Number(c.req.param('fbActId'));
    const res = await loadFbActForScope(c, scope, fbActId);
    if ('error' in res) return res.error;
    const { limit } = c.req.valid('query');

    const rows = await db
      .select()
      .from(fbActNotificationsLog)
      .where(eq(fbActNotificationsLog.actId, res.row.actId))
      .orderBy(desc(fbActNotificationsLog.createdAt))
      .limit(limit);

    return c.json({ success: true, data: rows });
  },
);

// ───────────────────────── /accounts/:fbActId/thresholds ─────────────────────────
router.get('/accounts/:fbActId/thresholds', async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;
  const fbActId = Number(c.req.param('fbActId'));
  const res = await loadFbActForScope(c, scope, fbActId);
  if ('error' in res) return res.error;
  const r = res.row;
  const eff = effectiveThresholds({
    thresholdWarningOverride: r.warnOv ?? null,
    thresholdCriticalOverride: r.critOv ?? null,
    postpaidThresholdOverride: r.postOv ?? null,
  });
  return c.json({
    success: true,
    data: {
      default: {
        warning: DEFAULT_WARNING,
        critical: DEFAULT_CRITICAL,
        postpaidWarning: DEFAULT_POSTPAID_WARNING,
        postpaidCritical: DEFAULT_POSTPAID_CRITICAL,
      },
      override: {
        warning: r.warnOv != null ? Number(r.warnOv) : null,
        critical: r.critOv != null ? Number(r.critOv) : null,
        postpaid: r.postOv != null ? Number(r.postOv) : null,
      },
      effective: eff,
    },
  });
});

const thresholdPutSchema = z.object({
  warning: z.number().nonnegative().nullable().optional(),
  critical: z.number().nonnegative().nullable().optional(),
  postpaid: z.number().nonnegative().nullable().optional(),
});

router.put('/accounts/:fbActId/thresholds', zValidator('json', thresholdPutSchema), async (c) => {
  const scope = await resolveScope(c);
  if ('error' in scope) return scope.error;
  const fbActId = Number(c.req.param('fbActId'));
  const res = await loadFbActForScope(c, scope, fbActId);
  if ('error' in res) return res.error;
  const body = c.req.valid('json');

  if (
    body.warning != null &&
    body.critical != null &&
    Number(body.critical) > Number(body.warning)
  ) {
    return c.json({ success: false, message: 'critical harus <= warning' }, 400);
  }

  const r = res.row;
  const beforeAudit = {
    warning: r.warnOv != null ? Number(r.warnOv) : null,
    critical: r.critOv != null ? Number(r.critOv) : null,
    postpaid: r.postOv != null ? Number(r.postOv) : null,
  };

  const updates: Record<string, any> = {};
  if (body.warning !== undefined) updates.thresholdWarningOverride = body.warning == null ? null : String(body.warning);
  if (body.critical !== undefined) updates.thresholdCriticalOverride = body.critical == null ? null : String(body.critical);
  if (body.postpaid !== undefined) updates.postpaidThresholdOverride = body.postpaid == null ? null : String(body.postpaid);

  // Audit append to data_json
  const existing = await db
    .select({ dataJson: fbAct.dataJson })
    .from(fbAct)
    .where(eq(fbAct.id, fbActId))
    .limit(1);
  const dj: any = existing[0]?.dataJson ?? {};
  const history = Array.isArray(dj.threshold_audit) ? dj.threshold_audit : [];
  history.push({
    at: new Date().toISOString(),
    by: scope.userId,
    before: beforeAudit,
    after: {
      warning: body.warning === undefined ? beforeAudit.warning : body.warning ?? null,
      critical: body.critical === undefined ? beforeAudit.critical : body.critical ?? null,
      postpaid: body.postpaid === undefined ? beforeAudit.postpaid : body.postpaid ?? null,
    },
  });
  updates.dataJson = { ...dj, threshold_audit: history.slice(-50) };

  await db.update(fbAct).set(updates).where(eq(fbAct.id, fbActId));

  return c.json({ success: true, message: 'Threshold updated' });
});

export default router;
