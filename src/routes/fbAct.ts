import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like, or } from 'drizzle-orm';

import { db } from '../db/client';
import { fbAct, fbToken, customers, customerProfiles, subscriptions, users, profiles } from '../db/schema';

const router = new Hono();

const tokenUsers = users;
const tokenProfiles = profiles;

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  tokenId: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
  sortBy: z
    .enum(['id', 'actId', 'actName', 'name', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const fbActPayload = z.object({
  customerId: z.coerce.number().int(),
  subscriptionId: z.coerce.number().int(),
  tokenId: z.coerce.number().int().optional().nullable(),
  actId: z.string().min(1),
  actName: z.string().optional(),
  name: z.string().optional(),
  dataJson: z.any().optional(),
});

const updateFbActPayload = fbActPayload.partial();

function formatRow(row: any) {
  return {
    ...row.fbAct,
    customer: row.customer
      ? { ...row.customer, profile: row.customerProfile ?? null }
      : null,
    subscription: row.subscription ?? null,
    token: row.fbToken ?? null,
  };
}

function buildSelectQuery() {
  return db
    .select({
      fbAct: fbAct,
      customer: customers,
      customerProfile: customerProfiles,
      subscription: subscriptions,
      fbToken: fbToken,
    })
    .from(fbAct)
    .leftJoin(customers, eq(customers.id, fbAct.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .leftJoin(subscriptions, eq(subscriptions.id, fbAct.subscriptionId))
    .leftJoin(fbToken, eq(fbToken.id, fbAct.tokenId));
}

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    customerId,
    subscriptionId,
    tokenId,
    q,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (customerId) filters.push(eq(fbAct.customerId, customerId));
  if (subscriptionId) filters.push(eq(fbAct.subscriptionId, subscriptionId));
  if (tokenId) filters.push(eq(fbAct.tokenId, tokenId));
  if (q) {
    const value = `%${q}%`;
    filters.push(or(like(fbAct.actName, value), like(fbAct.name, value), like(fbAct.actId, value)));
  }

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: fbAct.id,
    actId: fbAct.actId,
    actName: fbAct.actName,
    name: fbAct.name,
    createdAt: fbAct.createdAt,
    updatedAt: fbAct.updatedAt,
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
    .where(eq(fbAct.id, id))
    .limit(1);

  const item = rows[0] ? formatRow(rows[0]) : null;

  if (!item) {
    return c.json({ success: false, message: 'FB Act tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: item });
});

router.post('/', zValidator('json', fbActPayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(fbAct).values({
      customerId: payload.customerId,
      subscriptionId: payload.subscriptionId,
      tokenId: payload.tokenId ?? null,
      actId: payload.actId,
      actName: payload.actName ?? null,
      name: payload.name ?? null,
      dataJson: payload.dataJson ?? null,
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await buildSelectQuery()
      .where(eq(fbAct.id, insertId))
      .limit(1);

    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat FB Act' }, 500);
  }
});

router.put('/:id', zValidator('json', updateFbActPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof fbAct.$inferInsert> = {};
  if (payload.customerId !== undefined) sets.customerId = payload.customerId;
  if (payload.subscriptionId !== undefined) sets.subscriptionId = payload.subscriptionId;
  if (payload.tokenId !== undefined) sets.tokenId = payload.tokenId ?? null;
  if (payload.actId !== undefined) sets.actId = payload.actId;
  if (payload.actName !== undefined) sets.actName = payload.actName ?? null;
  if (payload.name !== undefined) sets.name = payload.name ?? null;
  if (payload.dataJson !== undefined) sets.dataJson = payload.dataJson ?? null;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(fbAct).set(sets).where(eq(fbAct.id, id));

    const updatedRows = await buildSelectQuery()
      .where(eq(fbAct.id, id))
      .limit(1);

    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update FB Act' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(fbAct).where(eq(fbAct.id, id));
  return c.json({ success: true, message: 'FB Act dihapus' });
});

export default router;
