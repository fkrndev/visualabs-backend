import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '../db/client';
import {
  chromeVisitEvents,
  chromeHistories,
  users,
  profiles,
  customerProfiles,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { role } from '../utils/auth/role';
import { ROLE_ADMIN } from '../utils/auth/permissions';
import type { Context, Next } from 'hono';

const router = new Hono();

const adminOnly = async (c: Context, next: Next) => {
  const payload = c.get('jwtPayload');
  const userId = payload?.sub ? Number(payload.sub) : NaN;
  if (!Number.isInteger(userId)) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }
  const userRole = await role(userId);
  if (userRole !== ROLE_ADMIN) {
    return c.json({ success: false, message: 'Forbidden — admin only' }, 403);
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

function resolveRange(from?: string, to?: string) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from
    ? new Date(from)
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

export default router;
