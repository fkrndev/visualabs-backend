import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import { db } from '../db/client';
import { subscriptions, customers, customerProfiles, products, users, profiles } from '../db/schema';

const router = new Hono();

const advertiserUsers = alias(users, 'advertiserUsers');
const advertiserProfiles = alias(profiles, 'advertiserProfiles');

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  customerId: z.coerce.number().int().optional(),
  productId: z.coerce.number().int().optional(),
  advertiserId: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
  sortBy: z
    .enum(['id', 'startDate', 'dueDate', 'status', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const subscriptionPayload = z.object({
  customerId: z.coerce.number().int(),
  productId: z.coerce.number().int(),
  brand: z.string().optional(),
  platform: z.string().optional(),
  advertiserId: z.coerce.number().int().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.coerce.number().int().default(1),
  onboardingDate: z.string().optional(),
  onboardingStatus: z.coerce.number().int().min(0).max(3).optional(),
  target: z.string().optional(),
  note: z.string().optional(),
  cancelReason: z.string().optional(),
});

const updateSubscriptionPayload = subscriptionPayload.partial();

function formatRow(row: any) {
  return {
    ...row.subscription,
    customer: row.customer
      ? { ...row.customer, profile: row.customerProfile ?? null }
      : null,
    product: row.product ?? null,
    advertiser: row.advertiser
      ? { ...row.advertiser, profile: row.advertiserProfile ?? null }
      : null,
  };
}

function buildSelectQuery() {
  return db
    .select({
      subscription: subscriptions,
      customer: customers,
      customerProfile: customerProfiles,
      product: products,
      advertiser: advertiserUsers,
      advertiserProfile: advertiserProfiles,
    })
    .from(subscriptions)
    .leftJoin(customers, eq(customers.id, subscriptions.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .leftJoin(products, eq(products.id, subscriptions.productId))
    .leftJoin(advertiserUsers, eq(advertiserUsers.id, subscriptions.advertiserId))
    .leftJoin(advertiserProfiles, eq(advertiserProfiles.userId, advertiserUsers.id));
}

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    customerId,
    productId,
    advertiserId,
    status,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (customerId) filters.push(eq(subscriptions.customerId, customerId));
  if (productId) filters.push(eq(subscriptions.productId, productId));
  if (advertiserId) filters.push(eq(subscriptions.advertiserId, advertiserId));
  if (status !== undefined) filters.push(eq(subscriptions.status, status));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: subscriptions.id,
    startDate: subscriptions.startDate,
    dueDate: subscriptions.dueDate,
    status: subscriptions.status,
    createdAt: subscriptions.createdAt,
    updatedAt: subscriptions.updatedAt,
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
    .where(eq(subscriptions.id, id))
    .limit(1);

  const item = rows[0] ? formatRow(rows[0]) : null;

  if (!item) {
    return c.json({ success: false, message: 'Subscription tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: item });
});

router.post('/', zValidator('json', subscriptionPayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(subscriptions).values({
      customerId: payload.customerId,
      productId: payload.productId,
      brand: payload.brand ?? null,
      platform: payload.platform ?? null,
      advertiserId: payload.advertiserId ?? null,
      startDate: payload.startDate ?? null,
      dueDate: payload.dueDate ?? null,
      status: payload.status ?? 1,
      onboardingDate: payload.onboardingDate ?? null,
      onboardingStatus: payload.onboardingStatus ?? 0,
      target: payload.target ?? null,
      onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : null,
      note: payload.note ?? null,
      cancelReason: payload.cancelReason ?? null,
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await buildSelectQuery()
      .where(eq(subscriptions.id, insertId))
      .limit(1);

    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat subscription' }, 500);
  }
});

router.put('/:id', zValidator('json', updateSubscriptionPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof subscriptions.$inferInsert> = {};
  if (payload.customerId !== undefined) sets.customerId = payload.customerId;
  if (payload.productId !== undefined) sets.productId = payload.productId;
  if (payload.brand !== undefined) sets.brand = payload.brand ?? null;
  if (payload.platform !== undefined) sets.platform = payload.platform ?? null;
  if (payload.advertiserId !== undefined) sets.advertiserId = payload.advertiserId ?? null;
  if (payload.startDate !== undefined) sets.startDate = payload.startDate ?? null;
  if (payload.dueDate !== undefined) sets.dueDate = payload.dueDate ?? null;
  if (payload.status !== undefined) sets.status = payload.status;
  if (payload.onboardingDate !== undefined) sets.onboardingDate = payload.onboardingDate ?? null;
  if (payload.onboardingStatus !== undefined) {
    sets.onboardingStatus = payload.onboardingStatus;
    sets.onboardingUpdatedAt = new Date();
  }
  if (payload.target !== undefined) sets.target = payload.target ?? null;
  if (payload.note !== undefined) sets.note = payload.note ?? null;
  if (payload.cancelReason !== undefined) sets.cancelReason = payload.cancelReason ?? null;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(subscriptions).set(sets).where(eq(subscriptions.id, id));

    const updatedRows = await buildSelectQuery()
      .where(eq(subscriptions.id, id))
      .limit(1);

    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update subscription' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(subscriptions).where(eq(subscriptions.id, id));
  return c.json({ success: true, message: 'Subscription dihapus' });
});

export default router;
