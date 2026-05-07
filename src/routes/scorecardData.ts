import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, lt } from 'drizzle-orm';

import { db } from '../db/client';
import { scorecardData, scorecards, customers, subscriptions, users, customerProfiles, profiles } from '../db/schema';
import { requireAuth, getAuthUserId, type JwtPayload } from '../middleware/auth';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  scorecardId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  pic: z.coerce.number().int().optional(),
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().optional(),
  week: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
  sortBy: z
    .enum(['id', 'year', 'month', 'week', 'day', 'status', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const scorecardDataPayload = z.object({
  scorecardId: z.coerce.number().int(),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().optional(),
  week: z.coerce.number().int().optional(),
  day: z.coerce.number().int().optional(),
  actualValue: z.string().optional(),
  targetValue: z.string().optional(),
  status: z.coerce.number().int().default(1),
  threshold: z.coerce.number().int().default(0),
  enteredBy: z.coerce.number().int().default(0),
});

const updateScorecardDataPayload = scorecardDataPayload.partial();

function isCurrentPeriod(year: number, month?: number | null, week?: number | null): boolean {
  const now = new Date();
  if (year !== now.getFullYear()) return false;
  if (month != null && month !== now.getMonth() + 1) return false;
  // Week check: week-of-month (1-5)
  if (week != null) {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const curWeekOfMonth = Math.ceil((now.getDate() + firstDay.getDay()) / 7);
    if (week !== curWeekOfMonth) return false;
  }
  return true;
}

async function computeAutoFields(scorecardId: number, year: number, month?: number | null, week?: number | null, actualValue?: string | null, targetValue?: string | null) {
  // Get scorecard for thresholds and target
  const scRows = await db.select().from(scorecards).where(eq(scorecards.id, scorecardId)).limit(1);
  const sc = scRows[0];

  // Target from scorecard if not provided
  const finalTarget = targetValue ?? (sc?.targetValue ?? null);

  // Auto threshold
  // targetType 0 = minimum (actual lebih besar lebih baik): pct = actual/target * 100
  // targetType 1 = maximum (actual lebih kecil lebih baik): pct = target/actual * 100
  let threshold = 0;
  if (sc && finalTarget) {
    const actual = parseFloat(actualValue || '0');
    const target = parseFloat(String(finalTarget));
    if (target > 0) {
      const targetType = sc.targetType ?? 0;
      let pct: number;
      if (targetType === 1) {
        pct = actual > 0 ? Math.round((target / actual) * 100) : 999;
      } else {
        pct = Math.round((actual / target) * 100);
      }
      const green = sc.greenThreshold ?? 100;
      const yellow = sc.yellowThreshold ?? 80;
      if (pct >= green) threshold = 0;
      else if (pct >= yellow) threshold = 1;
      else threshold = 2;
    }
  }

  // Auto status
  const status = isCurrentPeriod(year, month, week) ? 1 : 0;

  return { targetValue: finalTarget ? String(finalTarget) : null, threshold, status };
}

// Cek data sebelumnya untuk scorecard yang sama, berdasarkan year/month/week
// Urutan prioritas periode: week > month > year
async function computeTrend(
  scorecardId: number,
  year: number,
  month?: number | null,
  week?: number | null,
  actualValue?: string | null,
): Promise<number> {
  const actual = parseFloat(actualValue || '0');

  // Cari data sebelumnya dengan periode lebih kecil pada scorecard yang sama
  const filters: any[] = [eq(scorecardData.scorecardId, scorecardId)];

  if (week != null) {
    // Data sebelumnya: same year+month, week lebih kecil; atau month lebih kecil; atau year lebih kecil
    filters.push(
      and(
        eq(scorecardData.year, year),
        lt(scorecardData.week, week),
      ) as any,
    );
  } else if (month != null) {
    filters.push(
      and(
        eq(scorecardData.year, year),
        lt(scorecardData.month, month),
      ) as any,
    );
  } else {
    filters.push(lt(scorecardData.year, year));
  }

  const query = db
    .select({ id: scorecardData.id, actualValue: scorecardData.actualValue })
    .from(scorecardData)
    .where(and(...filters))
    .orderBy(
      desc(scorecardData.year),
      desc(scorecardData.month),
      desc(scorecardData.week),
      desc(scorecardData.id),
    )
    .limit(1);

  const prev = await query;
  if (!prev.length || prev[0].actualValue == null) return 0;

  const prevActual = parseFloat(String(prev[0].actualValue));
  if (actual > prevActual) return 3; // naik
  if (actual === prevActual) return 2; // stabil
  if (actual < prevActual) return 1; // turun
  return 0; // default
}

function formatRow(row: any) {
  return {
    ...row.scorecardDataItem,
    scorecard: row.scorecard
      ? {
          id: row.scorecard.id,
          title: row.scorecard.title,
          customerId: row.scorecard.customerId,
          subscriptionId: row.scorecard.subscriptionId,
          assignedTo: row.scorecard.assignedTo,
          pic: row.scorecard.pic,
          category: row.scorecard.category,
          frequency: row.scorecard.frequency,
          targetType: row.scorecard.targetType,
          customer: row.customer ? { id: row.customer.id, username: row.customer.username } : null,
          customerProfile: row.customerProfile ? { id: row.customerProfile.id, name: row.customerProfile.name } : null,
          subscription: row.subscription ? { id: row.subscription.id, brand: row.subscription.brand } : null,
          assignee: row.assignee ? { id: row.assignee.id, username: row.assignee.username, email: row.assignee.email } : null,
          assigneeProfile: row.assigneeProfile ? { id: row.assigneeProfile.id, name: row.assigneeProfile.name } : null,
        }
      : null,
  };
}

function buildSelectQuery() {
  return db
    .select({
      scorecardDataItem: scorecardData,
      scorecard: {
        id: scorecards.id,
        title: scorecards.title,
        customerId: scorecards.customerId,
        subscriptionId: scorecards.subscriptionId,
        assignedTo: scorecards.assignedTo,
        pic: scorecards.pic,
        category: scorecards.category,
        frequency: scorecards.frequency,
        targetType: scorecards.targetType,
      },
      customer: {
        id: customers.id,
        username: customers.username,
      },
      customerProfile: {
        id: customerProfiles.id,
        name: customerProfiles.name,
      },
      subscription: {
        id: subscriptions.id,
        brand: subscriptions.brand,
      },
      assignee: {
        id: users.id,
        username: users.username,
        email: users.email,
      },
      assigneeProfile: {
        id: profiles.id,
        name: profiles.name,
      },
    })
    .from(scorecardData)
    .leftJoin(scorecards, eq(scorecards.id, scorecardData.scorecardId))
    .leftJoin(customers, eq(customers.id, scorecards.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .leftJoin(subscriptions, eq(subscriptions.id, scorecards.subscriptionId))
    .leftJoin(users, eq(users.id, scorecards.assignedTo))
    .leftJoin(profiles, eq(profiles.userId, users.id));
}

// GET /dashboard — current period data (status=1) for EOS dashboard
const dashboardQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  category: z.coerce.number().int().optional(),
  pic: z.coerce.number().int().optional(),
  assignedTo: z.coerce.number().int().optional(),
  threshold: z.coerce.number().int().optional(),
  sortBy: z.enum(['id', 'year', 'month', 'week', 'day', 'actualValue', 'targetValue', 'threshold', 'trend', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

router.get('/dashboard', zValidator('query', dashboardQuery), async (c) => {
  const { page, limit, customerId, subscriptionId, category, pic, assignedTo, threshold, sortBy: sortByParam, sortOrder: sortOrderParam } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const filters: any[] = [eq(scorecardData.status, 1)];
  if (customerId !== undefined) filters.push(eq(scorecards.customerId, customerId));
  if (subscriptionId !== undefined) filters.push(eq(scorecards.subscriptionId, subscriptionId));
  if (category !== undefined) filters.push(eq(scorecards.category, category));
  if (pic !== undefined) filters.push(eq(scorecards.pic, pic));
  if (assignedTo !== undefined) filters.push(eq(scorecards.assignedTo, assignedTo));
  if (threshold !== undefined) filters.push(eq(scorecardData.threshold, threshold));

  const sortMap = {
    id: scorecardData.id,
    year: scorecardData.year,
    month: scorecardData.month,
    week: scorecardData.week,
    day: scorecardData.day,
    actualValue: scorecardData.actualValue,
    targetValue: scorecardData.targetValue,
    threshold: scorecardData.threshold,
    trend: scorecardData.trend,
    createdAt: scorecardData.createdAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') orders.push(asc(sortMap.id));

  const query = buildSelectQuery()
    .where(and(...filters))
    .orderBy(...orders)
    .limit(limit)
    .offset(offset);

  const rows = await query;
  const items = rows.map(formatRow);

  const lastId = items.length ? items[items.length - 1].id ?? null : null;
  const hasNext = items.length === limit;

  return c.json({
    success: true,
    data: items,
    page: { limit, lastId, hasNext, sortBy: sortKey, sortOrder },
  });
});

// GET /history/:scorecardId — all data for a scorecard, ordered by period (for chart)
router.get('/history/:scorecardId', async (c) => {
  const scorecardId = Number(c.req.param('scorecardId'));
  if (Number.isNaN(scorecardId)) {
    return c.json({ success: false, message: 'scorecardId tidak valid' }, 400);
  }

  const rows = await db
    .select()
    .from(scorecardData)
    .where(eq(scorecardData.scorecardId, scorecardId))
    .orderBy(asc(scorecardData.year), asc(scorecardData.month), asc(scorecardData.week), asc(scorecardData.day));

  return c.json({ success: true, data: rows });
});

// GET / — list with pagination and filters
router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    scorecardId,
    subscriptionId,
    pic,
    year,
    month,
    week,
    status,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (scorecardId !== undefined) filters.push(eq(scorecardData.scorecardId, scorecardId));
  if (subscriptionId !== undefined) filters.push(eq(scorecards.subscriptionId, subscriptionId));
  if (pic !== undefined) filters.push(eq(scorecards.pic, pic));
  if (year !== undefined) filters.push(eq(scorecardData.year, year));
  if (month !== undefined) filters.push(eq(scorecardData.month, month));
  if (week !== undefined) filters.push(eq(scorecardData.week, week));
  if (status !== undefined) filters.push(eq(scorecardData.status, status));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: scorecardData.id,
    year: scorecardData.year,
    month: scorecardData.month,
    week: scorecardData.week,
    day: scorecardData.day,
    status: scorecardData.status,
    createdAt: scorecardData.createdAt,
    updatedAt: scorecardData.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const query = buildSelectQuery()
    .orderBy(...orders)
    .limit(limit)
    .offset(offset);

  if (whereExpr) {
    query.where(whereExpr);
  }

  const rows = await query;
  const items = rows.map(formatRow);

  const lastId = items.length ? items[items.length - 1].id ?? null : null;
  const hasNext = items.length === limit;

  return c.json({
    success: true,
    data: items,
    page: { limit, lastId, hasNext, sortBy: sortKey, sortOrder },
  });
});

// GET /:id — single record with scorecard relation
router.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const rows = await buildSelectQuery()
    .where(eq(scorecardData.id, id))
    .limit(1);

  const item = rows[0] ? formatRow(rows[0]) : null;

  if (!item) {
    return c.json({ success: false, message: 'Scorecard data tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: item });
});

// POST / — create
router.post('/', requireAuth, zValidator('json', scorecardDataPayload), async (c) => {
  const jwtPayload = c.get('jwtPayload') as JwtPayload;
  const userId = getAuthUserId(jwtPayload);
  const payload = c.req.valid('json');

  try {
    const auto = await computeAutoFields(
      payload.scorecardId, payload.year, payload.month, payload.week,
      payload.actualValue, payload.targetValue
    );

    const trend = await computeTrend(
      payload.scorecardId, payload.year, payload.month, payload.week,
      payload.actualValue,
    );

    const [insertResult] = await db.insert(scorecardData).values({
      scorecardId: payload.scorecardId,
      year: payload.year,
      month: payload.month ?? null,
      week: payload.week ?? null,
      day: payload.day ?? null,
      actualValue: payload.actualValue ?? null,
      targetValue: auto.targetValue,
      status: auto.status,
      threshold: auto.threshold,
      trend,
      enteredBy: userId,
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await buildSelectQuery()
      .where(eq(scorecardData.id, insertId))
      .limit(1);

    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat scorecard data' }, 500);
  }
});

// PUT /:id — update
router.put('/:id', requireAuth, zValidator('json', updateScorecardDataPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  // Get existing record for fallback values
  const existingRows = await db.select().from(scorecardData).where(eq(scorecardData.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) return c.json({ success: false, message: 'Data tidak ditemukan' }, 404);

  const sets: Partial<typeof scorecardData.$inferInsert> = {};
  if (payload.scorecardId !== undefined) sets.scorecardId = payload.scorecardId;
  if (payload.year !== undefined) sets.year = payload.year;
  if (payload.month !== undefined) sets.month = payload.month ?? null;
  if (payload.week !== undefined) sets.week = payload.week ?? null;
  if (payload.day !== undefined) sets.day = payload.day ?? null;
  if (payload.actualValue !== undefined) sets.actualValue = payload.actualValue ?? null;
  if (payload.enteredBy !== undefined) sets.enteredBy = payload.enteredBy;

  // Recompute auto fields
  const finalScorecardId = sets.scorecardId ?? existing.scorecardId;
  const finalYear = sets.year ?? existing.year;
  const finalMonth = sets.month !== undefined ? sets.month : existing.month;
  const finalWeek = sets.week !== undefined ? sets.week : existing.week;
  const finalActual = sets.actualValue !== undefined ? sets.actualValue : existing.actualValue;

  const auto = await computeAutoFields(finalScorecardId, finalYear, finalMonth, finalWeek, finalActual ?? undefined);
  sets.targetValue = auto.targetValue;
  sets.status = auto.status;
  sets.threshold = auto.threshold;
  sets.trend = await computeTrend(finalScorecardId, finalYear, finalMonth, finalWeek, finalActual ?? undefined);

  try {
    await db.update(scorecardData).set(sets).where(eq(scorecardData.id, id));

    const updatedRows = await buildSelectQuery()
      .where(eq(scorecardData.id, id))
      .limit(1);

    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update scorecard data' }, 500);
  }
});

// DELETE /:id — delete
router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(scorecardData).where(eq(scorecardData.id, id));
  return c.json({ success: true, message: 'Scorecard data dihapus' });
});

export { isCurrentPeriod, computeAutoFields, computeTrend, formatRow, buildSelectQuery };
export default router;
