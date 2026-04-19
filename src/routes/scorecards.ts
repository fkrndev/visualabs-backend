import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import { db } from '../db/client';
import { scorecards, customers, customerProfiles, subscriptions, users, profiles } from '../db/schema';

const router = new Hono();

const assigneeUsers = alias(users, 'assigneeUsers');
const assigneeProfiles = alias(profiles, 'assigneeProfiles');

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  assignedTo: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
  category: z.coerce.number().int().optional(),
  pic: z.coerce.number().int().optional(),
  sortBy: z
    .enum(['id', 'title', 'status', 'category', 'pic', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const scorecardPayload = z.object({
  title: z.string().min(1),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  assignedTo: z.coerce.number().int().optional(),
  description: z.string().optional(),
  pic: z.coerce.number().int().default(0),
  category: z.coerce.number().int().default(0),
  targetValue: z.string().optional(),
  unitValue: z.coerce.number().int().default(0),
  unitCustom: z.string().optional(),
  frequency: z.coerce.number().int().default(1),
  showOnScorecard: z.coerce.number().int().default(1),
  greenThreshold: z.coerce.number().int().default(100),
  yellowThreshold: z.coerce.number().int().default(80),
  status: z.coerce.number().int().default(1),
});

const updateScorecardPayload = scorecardPayload.partial();

function formatRow(row: any) {
  return {
    ...row.scorecard,
    customer: row.customer
      ? { ...row.customer, profile: row.customerProfile ?? null }
      : null,
    subscription: row.subscription ?? null,
    assignee: row.assignee
      ? { ...row.assignee, profile: row.assigneeProfile ?? null }
      : null,
  };
}

function buildSelectQuery() {
  return db
    .select({
      scorecard: scorecards,
      customer: customers,
      customerProfile: customerProfiles,
      subscription: subscriptions,
      assignee: assigneeUsers,
      assigneeProfile: assigneeProfiles,
    })
    .from(scorecards)
    .leftJoin(customers, eq(customers.id, scorecards.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .leftJoin(subscriptions, eq(subscriptions.id, scorecards.subscriptionId))
    .leftJoin(assigneeUsers, eq(assigneeUsers.id, scorecards.assignedTo))
    .leftJoin(assigneeProfiles, eq(assigneeProfiles.userId, assigneeUsers.id));
}

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    q,
    customerId,
    subscriptionId,
    assignedTo,
    status,
    category,
    pic,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (q) filters.push(like(scorecards.title, `%${q}%`));
  if (customerId) filters.push(eq(scorecards.customerId, customerId));
  if (subscriptionId) filters.push(eq(scorecards.subscriptionId, subscriptionId));
  if (assignedTo) filters.push(eq(scorecards.assignedTo, assignedTo));
  if (status !== undefined) filters.push(eq(scorecards.status, status));
  if (category !== undefined) filters.push(eq(scorecards.category, category));
  if (pic !== undefined) filters.push(eq(scorecards.pic, pic));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: scorecards.id,
    title: scorecards.title,
    status: scorecards.status,
    category: scorecards.category,
    pic: scorecards.pic,
    createdAt: scorecards.createdAt,
    updatedAt: scorecards.updatedAt,
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

router.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const rows = await buildSelectQuery()
    .where(eq(scorecards.id, id))
    .limit(1);

  const item = rows[0] ? formatRow(rows[0]) : null;

  if (!item) {
    return c.json({ success: false, message: 'Scorecard tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: item });
});

router.post('/', zValidator('json', scorecardPayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(scorecards).values({
      title: payload.title,
      customerId: payload.customerId ?? null,
      subscriptionId: payload.subscriptionId ?? null,
      assignedTo: payload.assignedTo ?? null,
      description: payload.description ?? null,
      pic: payload.pic ?? 0,
      category: payload.category ?? 0,
      targetValue: payload.targetValue ?? null,
      unitValue: payload.unitValue ?? 0,
      unitCustom: payload.unitCustom ?? null,
      frequency: payload.frequency ?? 1,
      showOnScorecard: payload.showOnScorecard ?? 1,
      greenThreshold: payload.greenThreshold ?? 100,
      yellowThreshold: payload.yellowThreshold ?? 80,
      status: payload.status ?? 1,
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await buildSelectQuery()
      .where(eq(scorecards.id, insertId))
      .limit(1);

    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat scorecard' }, 500);
  }
});

router.put('/:id', zValidator('json', updateScorecardPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof scorecards.$inferInsert> = {};
  if (payload.title !== undefined) sets.title = payload.title;
  if (payload.customerId !== undefined) sets.customerId = payload.customerId ?? null;
  if (payload.subscriptionId !== undefined) sets.subscriptionId = payload.subscriptionId ?? null;
  if (payload.assignedTo !== undefined) sets.assignedTo = payload.assignedTo ?? null;
  if (payload.description !== undefined) sets.description = payload.description ?? null;
  if (payload.pic !== undefined) sets.pic = payload.pic;
  if (payload.category !== undefined) sets.category = payload.category;
  if (payload.targetValue !== undefined) sets.targetValue = payload.targetValue ?? null;
  if (payload.unitValue !== undefined) sets.unitValue = payload.unitValue;
  if (payload.unitCustom !== undefined) sets.unitCustom = payload.unitCustom ?? null;
  if (payload.frequency !== undefined) sets.frequency = payload.frequency;
  if (payload.showOnScorecard !== undefined) sets.showOnScorecard = payload.showOnScorecard;
  if (payload.greenThreshold !== undefined) sets.greenThreshold = payload.greenThreshold;
  if (payload.yellowThreshold !== undefined) sets.yellowThreshold = payload.yellowThreshold;
  if (payload.status !== undefined) sets.status = payload.status;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(scorecards).set(sets).where(eq(scorecards.id, id));

    const updatedRows = await buildSelectQuery()
      .where(eq(scorecards.id, id))
      .limit(1);

    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update scorecard' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(scorecards).where(eq(scorecards.id, id));
  return c.json({ success: true, message: 'Scorecard dihapus' });
});

export default router;
