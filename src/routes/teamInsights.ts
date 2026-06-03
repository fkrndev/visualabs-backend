import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '../db/client';
import {
  chromeVisitEvents,
  chromeHistories,
  chromeProfiles,
  users,
  profiles,
  customerProfiles,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { role } from '../utils/auth/role';
import { isManagementLevel } from '../utils/auth/permissions';
import type { Context, Next } from 'hono';

const router = new Hono();

const adminOnly = async (c: Context, next: Next) => {
  const payload = c.get('jwtPayload');
  const userId = payload?.sub ? Number(payload.sub) : NaN;
  if (!Number.isInteger(userId)) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }
  const userRole = await role(userId);
  if (!isManagementLevel(userRole)) {
    return c.json({ success: false, message: 'Forbidden — Dev/Admin/Owner only' }, 403);
  }
  await next();
};

const rangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  customerId: z.coerce.number().int().optional(),
  userId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const accessQuery = rangeQuery.extend({
  granularity: z.enum(['hour', 'day', 'week']).optional(),
});

type Granularity = 'hour' | 'day' | 'week';

function bucketSqlFragment(grain: Granularity): string {
  switch (grain) {
    case 'hour':
      return "DATE_FORMAT(visited_at, '%Y-%m-%d %H:00:00')";
    case 'week':
      return 'DATE(DATE_SUB(visited_at, INTERVAL WEEKDAY(visited_at) DAY))';
    case 'day':
    default:
      return 'DATE(visited_at)';
  }
}

type TrendRow = {
  seriesId: number;
  bucket: string;
  visits: number;
};

type RankingItem = {
  id: number;
  label: string;
  visits: number;
  uniqueUsers?: number;
  peakBucket: string | null;
  peakBucketVisits: number;
  lastActive: string | null;
};

function computePeaks(trend: TrendRow[]): Map<number, { bucket: string; visits: number }> {
  const peak = new Map<number, { bucket: string; visits: number }>();
  for (const row of trend) {
    const cur = peak.get(row.seriesId);
    if (!cur || row.visits > cur.visits) {
      peak.set(row.seriesId, { bucket: row.bucket, visits: row.visits });
    }
  }
  return peak;
}

function bucketToIso(bucket: string | Date): string {
  if (bucket instanceof Date) return bucket.toISOString();
  // MySQL returns strings like "2026-05-16" or "2026-05-16 14:00:00"
  const s = String(bucket);
  const hasTime = s.includes(' ') || s.includes('T');
  return new Date(`${s.replace(' ', 'T')}${hasTime ? '' : 'T00:00:00'}+07:00`).toISOString();
}

const JAKARTA_OFFSET = "+07:00";

function parseDateParam(value: string, endOfDay = false) {
  // Date-only strings (YYYY-MM-DD) are anchored to Asia/Jakarta.
  // Full ISO strings with time/offset are honored as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(
      `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}${JAKARTA_OFFSET}`,
    );
  }
  return new Date(value);
}

function resolveRange(from?: string, to?: string) {
  const now = new Date();
  const toDate = to ? parseDateParam(to, true) : now;
  const fromDate = from
    ? parseDateParam(from, false)
    : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { fromDate, toDate };
}

function buildFilters(
  fromDate: Date,
  toDate: Date,
  customerId?: number,
  userId?: number,
) {
  const conds = [
    gte(chromeVisitEvents.visitedAt, fromDate),
    lte(chromeVisitEvents.visitedAt, toDate),
  ] as any[];
  if (customerId) conds.push(eq(chromeVisitEvents.customerId, customerId));
  if (userId) conds.push(eq(chromeVisitEvents.userId, userId));
  return and(...conds);
}

router.use('*', requireAuth, adminOnly);

// GET /overview — KPI cards + activity trend
router.get('/overview', zValidator('query', rangeQuery), async (c) => {
  const { from, to, customerId } = c.req.valid('query');
  const { fromDate, toDate } = resolveRange(from, to);
  const where = buildFilters(fromDate, toDate, customerId);

  const [[totals]] = await Promise.all([
    db
      .select({
        totalVisits: sql<number>`COUNT(*)`,
        activeMembers: sql<number>`COUNT(DISTINCT ${chromeVisitEvents.userId})`,
        customersTouched: sql<number>`COUNT(DISTINCT ${chromeVisitEvents.customerId})`,
      })
      .from(chromeVisitEvents)
      .where(where),
  ]);

  // Hours active: distinct (user, date, hour) → count
  const [[hours]] = await Promise.all([
    db
      .select({
        hoursActive: sql<number>`COUNT(DISTINCT CONCAT(${chromeVisitEvents.userId}, '-', DATE(${chromeVisitEvents.visitedAt}), '-', HOUR(${chromeVisitEvents.visitedAt})))`,
      })
      .from(chromeVisitEvents)
      .where(where),
  ]);

  const trend = await db
    .select({
      date: sql<string>`DATE(${chromeVisitEvents.visitedAt})`,
      visits: sql<number>`COUNT(*)`,
      activeMembers: sql<number>`COUNT(DISTINCT ${chromeVisitEvents.userId})`,
    })
    .from(chromeVisitEvents)
    .where(where)
    .groupBy(sql`DATE(${chromeVisitEvents.visitedAt})`)
    .orderBy(sql`DATE(${chromeVisitEvents.visitedAt})`);

  // Total team size (untuk rasio active/total)
  const [[teamSize]] = await Promise.all([
    db.select({ total: sql<number>`COUNT(*)` }).from(users),
  ]);

  return c.json({
    success: true,
    data: {
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalVisits: Number(totals?.totalVisits ?? 0),
      activeMembers: Number(totals?.activeMembers ?? 0),
      teamSize: Number(teamSize?.total ?? 0),
      hoursActive: Number(hours?.hoursActive ?? 0),
      customersTouched: Number(totals?.customersTouched ?? 0),
      trend: trend.map((r) => ({
        date: r.date,
        visits: Number(r.visits),
        activeMembers: Number(r.activeMembers),
      })),
    },
  });
});

// GET /top-customers
router.get('/top-customers', zValidator('query', rangeQuery), async (c) => {
  const { from, to, limit = 10 } = c.req.valid('query');
  const { fromDate, toDate } = resolveRange(from, to);

  const rows = await db
    .select({
      customerId: chromeVisitEvents.customerId,
      customerName: customerProfiles.name,
      visits: sql<number>`COUNT(*)`,
      activeMembers: sql<number>`COUNT(DISTINCT ${chromeVisitEvents.userId})`,
    })
    .from(chromeVisitEvents)
    .leftJoin(
      customerProfiles,
      eq(customerProfiles.customerId, chromeVisitEvents.customerId),
    )
    .where(
      and(
        gte(chromeVisitEvents.visitedAt, fromDate),
        lte(chromeVisitEvents.visitedAt, toDate),
      ),
    )
    .groupBy(chromeVisitEvents.customerId, customerProfiles.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);

  return c.json({
    success: true,
    data: rows.map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName ?? '(no customer)',
      visits: Number(r.visits),
      activeMembers: Number(r.activeMembers),
    })),
  });
});

// GET /top-domains
router.get('/top-domains', zValidator('query', rangeQuery), async (c) => {
  const { from, to, limit = 10 } = c.req.valid('query');
  const { fromDate, toDate } = resolveRange(from, to);

  const rows = await db.execute(sql`
    SELECT
      SUBSTRING_INDEX(SUBSTRING_INDEX(h.url, '/', 3), '/', -1) AS domain,
      COUNT(*) AS visits,
      COUNT(DISTINCT e.user_id) AS active_members
    FROM chrome_visit_events e
    JOIN chrome_histories h ON h.id = e.history_id
    WHERE e.visited_at >= ${fromDate}
      AND e.visited_at <= ${toDate}
    GROUP BY domain
    ORDER BY visits DESC
    LIMIT ${limit}
  `);

  const list = (rows as any)[0] ?? rows;
  return c.json({
    success: true,
    data: (Array.isArray(list) ? list : []).map((r: any) => ({
      domain: r.domain,
      visits: Number(r.visits),
      activeMembers: Number(r.active_members),
    })),
  });
});

// GET /peak-activity — heatmap day_of_week × hour
router.get('/peak-activity', zValidator('query', rangeQuery), async (c) => {
  const { from, to, customerId } = c.req.valid('query');
  const { fromDate, toDate } = resolveRange(from, to);
  const where = buildFilters(fromDate, toDate, customerId);

  const rows = await db
    .select({
      dow: sql<number>`DAYOFWEEK(${chromeVisitEvents.visitedAt})`,
      hour: sql<number>`HOUR(${chromeVisitEvents.visitedAt})`,
      visits: sql<number>`COUNT(*)`,
    })
    .from(chromeVisitEvents)
    .where(where)
    .groupBy(
      sql`DAYOFWEEK(${chromeVisitEvents.visitedAt})`,
      sql`HOUR(${chromeVisitEvents.visitedAt})`,
    );

  return c.json({
    success: true,
    data: rows.map((r) => ({
      dayOfWeek: Number(r.dow),
      hour: Number(r.hour),
      visits: Number(r.visits),
    })),
  });
});

// GET /members — list user + metric per user
router.get('/members', zValidator('query', rangeQuery), async (c) => {
  const { from, to, customerId } = c.req.valid('query');
  const { fromDate, toDate } = resolveRange(from, to);

  const conds = [
    gte(chromeVisitEvents.visitedAt, fromDate),
    lte(chromeVisitEvents.visitedAt, toDate),
  ] as any[];
  if (customerId) conds.push(eq(chromeVisitEvents.customerId, customerId));

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: profiles.name,
      visits: sql<number>`COUNT(${chromeVisitEvents.id})`,
      activeDays: sql<number>`COUNT(DISTINCT DATE(${chromeVisitEvents.visitedAt}))`,
      hoursActive: sql<number>`COUNT(DISTINCT CONCAT(DATE(${chromeVisitEvents.visitedAt}), '-', HOUR(${chromeVisitEvents.visitedAt})))`,
      customersTouched: sql<number>`COUNT(DISTINCT ${chromeVisitEvents.customerId})`,
      lastActive: sql<Date | null>`MAX(${chromeVisitEvents.visitedAt})`,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(
      chromeVisitEvents,
      and(eq(chromeVisitEvents.userId, users.id), ...conds.slice(0, undefined)),
    )
    .groupBy(users.id, users.email, profiles.name)
    .orderBy(desc(sql`COUNT(${chromeVisitEvents.id})`));

  return c.json({
    success: true,
    data: rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      visits: Number(r.visits),
      activeDays: Number(r.activeDays),
      hoursActive: Number(r.hoursActive),
      customersTouched: Number(r.customersTouched),
      lastActive: r.lastActive,
    })),
  });
});

// GET /members/:userId — detail per user
router.get('/members/:userId', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isInteger(userId)) {
    return c.json({ success: false, message: 'Invalid userId' }, 400);
  }
  const q = c.req.query();
  const { fromDate, toDate } = resolveRange(q.from, q.to);

  const where = and(
    eq(chromeVisitEvents.userId, userId),
    gte(chromeVisitEvents.visitedAt, fromDate),
    lte(chromeVisitEvents.visitedAt, toDate),
  );

  const [userRow] = await db
    .select({
      id: users.id,
      email: users.email,
      name: profiles.name,
      role: users.role,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) {
    return c.json({ success: false, message: 'User not found' }, 404);
  }

  const daily = await db
    .select({
      date: sql<string>`DATE(${chromeVisitEvents.visitedAt})`,
      visits: sql<number>`COUNT(*)`,
      hoursActive: sql<number>`COUNT(DISTINCT HOUR(${chromeVisitEvents.visitedAt}))`,
    })
    .from(chromeVisitEvents)
    .where(where)
    .groupBy(sql`DATE(${chromeVisitEvents.visitedAt})`)
    .orderBy(sql`DATE(${chromeVisitEvents.visitedAt})`);

  const topCustomers = await db
    .select({
      customerId: chromeVisitEvents.customerId,
      customerName: customerProfiles.name,
      visits: sql<number>`COUNT(*)`,
    })
    .from(chromeVisitEvents)
    .leftJoin(
      customerProfiles,
      eq(customerProfiles.customerId, chromeVisitEvents.customerId),
    )
    .where(where)
    .groupBy(chromeVisitEvents.customerId, customerProfiles.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10);

  const topDomainsRaw = await db.execute(sql`
    SELECT
      SUBSTRING_INDEX(SUBSTRING_INDEX(h.url, '/', 3), '/', -1) AS domain,
      COUNT(*) AS visits
    FROM chrome_visit_events e
    JOIN chrome_histories h ON h.id = e.history_id
    WHERE e.user_id = ${userId}
      AND e.visited_at >= ${fromDate}
      AND e.visited_at <= ${toDate}
    GROUP BY domain
    ORDER BY visits DESC
    LIMIT 10
  `);
  const topDomainsList = (topDomainsRaw as any)[0] ?? topDomainsRaw;

  const recentUrls = await db
    .select({
      url: chromeHistories.url,
      title: chromeHistories.dataJson,
      visitedAt: chromeVisitEvents.visitedAt,
      customerName: customerProfiles.name,
    })
    .from(chromeVisitEvents)
    .innerJoin(chromeHistories, eq(chromeHistories.id, chromeVisitEvents.historyId))
    .leftJoin(
      customerProfiles,
      eq(customerProfiles.customerId, chromeVisitEvents.customerId),
    )
    .where(where)
    .orderBy(desc(chromeVisitEvents.visitedAt))
    .limit(10);

  // Collaboration: customers yang juga diakses user lain dalam rentang
  const collabRaw = await db.execute(sql`
    SELECT u.id AS user_id, p.name AS user_name, u.email,
      COUNT(DISTINCT e2.customer_id) AS shared_customers
    FROM chrome_visit_events e1
    JOIN chrome_visit_events e2
      ON e2.customer_id = e1.customer_id
      AND e2.user_id <> e1.user_id
    JOIN users u ON u.id = e2.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE e1.user_id = ${userId}
      AND e1.customer_id IS NOT NULL
      AND e1.visited_at >= ${fromDate} AND e1.visited_at <= ${toDate}
      AND e2.visited_at >= ${fromDate} AND e2.visited_at <= ${toDate}
    GROUP BY u.id, p.name, u.email
    ORDER BY shared_customers DESC
    LIMIT 5
  `);
  const collabList = (collabRaw as any)[0] ?? collabRaw;

  return c.json({
    success: true,
    data: {
      user: userRow,
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      daily: daily.map((r) => ({
        date: r.date,
        visits: Number(r.visits),
        hoursActive: Number(r.hoursActive),
      })),
      topCustomers: topCustomers.map((r) => ({
        customerId: r.customerId,
        customerName: r.customerName ?? '(no customer)',
        visits: Number(r.visits),
      })),
      topDomains: (Array.isArray(topDomainsList) ? topDomainsList : []).map((r: any) => ({
        domain: r.domain,
        visits: Number(r.visits),
      })),
      recentUrls: recentUrls.map((r) => ({
        url: r.url,
        title:
          r.title && typeof r.title === 'object' && !Array.isArray(r.title)
            ? (r.title as any).title ?? null
            : null,
        visitedAt: r.visitedAt,
        customerName: r.customerName,
      })),
      collaboration: (Array.isArray(collabList) ? collabList : []).map((r: any) => ({
        userId: r.user_id,
        name: r.user_name,
        email: r.email,
        sharedCustomers: Number(r.shared_customers),
      })),
    },
  });
});

// ─── Access Analytics ─────────────────────────────────────────────────────
// 3 endpoints: per-user / per-customer / per-profile access trend + ranking.
// Each returns { trend: [...], ranking: [...] } with peakBucket per series.

// GET /access/users
router.get('/access/users', zValidator('query', accessQuery), async (c) => {
  const { from, to, customerId, limit = 10, granularity = 'day' } = c.req.valid('query');
  const { fromDate, toDate } = resolveRange(from, to);
  const grainSql = bucketSqlFragment(granularity);
  const customerFilter = customerId ? sql`AND customer_id = ${customerId}` : sql``;

  const rankingRaw: any = await db.execute(sql`
    SELECT e.user_id AS id,
      COALESCE(p.name, u.email) AS label,
      COUNT(*) AS visits,
      MAX(e.visited_at) AS last_active
    FROM chrome_visit_events e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE e.visited_at >= ${fromDate} AND e.visited_at <= ${toDate}
      ${customerId ? sql`AND e.customer_id = ${customerId}` : sql``}
    GROUP BY e.user_id, p.name, u.email
    ORDER BY visits DESC
    LIMIT ${limit}
  `);
  const rankingRows = ((rankingRaw as any)[0] ?? rankingRaw) as any[];
  const topIds = rankingRows.map((r) => Number(r.id));

  let trendRows: any[] = [];
  if (topIds.length) {
    const trendRaw: any = await db.execute(sql`
      SELECT user_id AS seriesId,
        ${sql.raw(grainSql)} AS bucket,
        COUNT(*) AS visits
      FROM chrome_visit_events
      WHERE visited_at >= ${fromDate} AND visited_at <= ${toDate}
        AND user_id IN (${sql.join(topIds.map((i) => sql`${i}`), sql`, `)})
        ${customerFilter}
      GROUP BY user_id, bucket
      ORDER BY bucket ASC
    `);
    trendRows = (trendRaw as any)[0] ?? trendRaw;
  }

  const trend: TrendRow[] = trendRows.map((r: any) => ({
    seriesId: Number(r.seriesId ?? r.series_id ?? r.user_id),
    bucket: bucketToIso(r.bucket),
    visits: Number(r.visits),
  }));
  const peaks = computePeaks(trend);

  const ranking: RankingItem[] = rankingRows.map((r) => {
    const p = peaks.get(Number(r.id));
    return {
      id: Number(r.id),
      label: r.label ?? `User #${r.id}`,
      visits: Number(r.visits),
      peakBucket: p?.bucket ?? null,
      peakBucketVisits: p?.visits ?? 0,
      lastActive: r.last_active ? new Date(r.last_active).toISOString() : null,
    };
  });

  return c.json({
    success: true,
    data: {
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      granularity,
      trend,
      ranking,
    },
  });
});

// GET /access/customers
router.get('/access/customers', zValidator('query', accessQuery), async (c) => {
  const { from, to, limit = 10, granularity = 'day' } = c.req.valid('query');
  const { fromDate, toDate } = resolveRange(from, to);
  const grainSql = bucketSqlFragment(granularity);

  const rankingRaw: any = await db.execute(sql`
    SELECT e.customer_id AS id,
      COALESCE(cp.name, CONCAT('Customer #', e.customer_id)) AS label,
      COUNT(*) AS visits,
      COUNT(DISTINCT e.user_id) AS unique_users,
      MAX(e.visited_at) AS last_active
    FROM chrome_visit_events e
    LEFT JOIN customer_profiles cp ON cp.customer_id = e.customer_id
    WHERE e.visited_at >= ${fromDate} AND e.visited_at <= ${toDate}
      AND e.customer_id IS NOT NULL
    GROUP BY e.customer_id, cp.name
    ORDER BY visits DESC
    LIMIT ${limit}
  `);
  const rankingRows = ((rankingRaw as any)[0] ?? rankingRaw) as any[];
  const topIds = rankingRows.map((r) => Number(r.id));

  let trendRows: any[] = [];
  if (topIds.length) {
    const trendRaw: any = await db.execute(sql`
      SELECT customer_id AS seriesId,
        ${sql.raw(grainSql)} AS bucket,
        COUNT(*) AS visits
      FROM chrome_visit_events
      WHERE visited_at >= ${fromDate} AND visited_at <= ${toDate}
        AND customer_id IN (${sql.join(topIds.map((i) => sql`${i}`), sql`, `)})
      GROUP BY customer_id, bucket
      ORDER BY bucket ASC
    `);
    trendRows = (trendRaw as any)[0] ?? trendRaw;
  }

  const trend: TrendRow[] = trendRows.map((r: any) => ({
    seriesId: Number(r.seriesId ?? r.customer_id),
    bucket: bucketToIso(r.bucket),
    visits: Number(r.visits),
  }));
  const peaks = computePeaks(trend);

  const ranking: RankingItem[] = rankingRows.map((r) => {
    const p = peaks.get(Number(r.id));
    return {
      id: Number(r.id),
      label: r.label,
      visits: Number(r.visits),
      uniqueUsers: Number(r.unique_users),
      peakBucket: p?.bucket ?? null,
      peakBucketVisits: p?.visits ?? 0,
      lastActive: r.last_active ? new Date(r.last_active).toISOString() : null,
    };
  });

  return c.json({
    success: true,
    data: {
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      granularity,
      trend,
      ranking,
    },
  });
});

// GET /access/profiles
router.get('/access/profiles', zValidator('query', accessQuery), async (c) => {
  const { from, to, customerId, limit = 10, granularity = 'day' } = c.req.valid('query');
  const { fromDate, toDate } = resolveRange(from, to);
  const grainSql = bucketSqlFragment(granularity).replaceAll('visited_at', 'e.visited_at');

  const rankingRaw: any = await db.execute(sql`
    SELECT h.profile_id AS id,
      cp.name AS profile_name,
      COALESCE(up.name, ou.email) AS owner_label,
      cust.name AS customer_label,
      COUNT(*) AS visits,
      COUNT(DISTINCT e.user_id) AS unique_users,
      MAX(e.visited_at) AS last_active
    FROM chrome_visit_events e
    JOIN chrome_histories h ON h.id = e.history_id
    JOIN chrome_profiles cp ON cp.id = h.profile_id
    LEFT JOIN users ou ON ou.id = cp.user_id
    LEFT JOIN profiles up ON up.user_id = cp.user_id
    LEFT JOIN customer_profiles cust ON cust.customer_id = cp.customer_id
    WHERE e.visited_at >= ${fromDate} AND e.visited_at <= ${toDate}
      ${customerId ? sql`AND e.customer_id = ${customerId}` : sql``}
    GROUP BY h.profile_id, cp.name, up.name, ou.email, cust.name
    ORDER BY visits DESC
    LIMIT ${limit}
  `);
  const rankingRows = ((rankingRaw as any)[0] ?? rankingRaw) as any[];
  const topIds = rankingRows.map((r) => Number(r.id));

  let trendRows: any[] = [];
  if (topIds.length) {
    const trendRaw: any = await db.execute(sql`
      SELECT h.profile_id AS seriesId,
        ${sql.raw(grainSql)} AS bucket,
        COUNT(*) AS visits
      FROM chrome_visit_events e
      JOIN chrome_histories h ON h.id = e.history_id
      WHERE e.visited_at >= ${fromDate} AND e.visited_at <= ${toDate}
        AND h.profile_id IN (${sql.join(topIds.map((i) => sql`${i}`), sql`, `)})
        ${customerId ? sql`AND e.customer_id = ${customerId}` : sql``}
      GROUP BY h.profile_id, bucket
      ORDER BY bucket ASC
    `);
    trendRows = (trendRaw as any)[0] ?? trendRaw;
  }

  const trend: TrendRow[] = trendRows.map((r: any) => ({
    seriesId: Number(r.seriesId ?? r.profile_id),
    bucket: bucketToIso(r.bucket),
    visits: Number(r.visits),
  }));
  const peaks = computePeaks(trend);

  const ranking = rankingRows.map((r) => {
    const p = peaks.get(Number(r.id));
    return {
      id: Number(r.id),
      label: r.profile_name ?? `Profile #${r.id}`,
      ownerLabel: r.owner_label ?? null,
      customerLabel: r.customer_label ?? null,
      visits: Number(r.visits),
      uniqueUsers: Number(r.unique_users),
      peakBucket: p?.bucket ?? null,
      peakBucketVisits: p?.visits ?? 0,
      lastActive: r.last_active ? new Date(r.last_active).toISOString() : null,
    };
  });

  return c.json({
    success: true,
    data: {
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      granularity,
      trend,
      ranking,
    },
  });
});

export default router;
