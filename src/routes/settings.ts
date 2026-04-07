import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, asc, desc, eq, like, and } from 'drizzle-orm';

import { db } from '../db/client';
import { settings } from '../db/schema';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  key: z.string().trim().optional(),
  sortBy: z.enum(['id', 'key', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const payloadSchema = z.object({
  key: z.string().trim().min(1).max(191),
  dataJson: z.record(z.string(), z.any()).optional(),
});

const updatePayloadSchema = payloadSchema.partial();

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    q,
    key,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (q) {
    const value = `%${q}%`;
    filters.push(like(settings.key, value));
  }
  if (key) {
    filters.push(like(settings.key, `%${key}%`));
  }

  const whereExpr =
    filters.length === 1 ? (filters[0] as SQL) : ((and(...(filters as any)) as unknown) as SQL);

  const sortMap = {
    id: settings.id,
    key: settings.key,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  } as const;

  const isValidSortKey = (k: string): k is keyof typeof sortMap => k in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const items = await db.query.settings.findMany({
    where: whereExpr as any,
    orderBy: orders,
    limit,
    offset,
  });

  const lastId = items.length ? (items[items.length - 1] as any).id ?? null : null;
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

  const record = await db.query.settings.findFirst({
    where: eq(settings.id, id),
  });

  if (!record) {
    return c.json({ success: false, message: 'Setting tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: record });
});

router.post('/', zValidator('json', payloadSchema), async (c) => {
  const payload = c.req.valid('json');
  const { key, dataJson } = payload;

  const existing = await db.query.settings.findFirst({
    columns: { id: true },
    where: eq(settings.key, key),
  });

  if (existing) {
    return c.json({ success: false, message: 'Key sudah digunakan untuk business ini' }, 409);
  }

  const [insertResult] = await db.insert(settings).values({
    key,
    dataJson: dataJson ?? null,
  });

  const insertId = Number((insertResult as any).insertId ?? 0);

  const record = await db.query.settings.findFirst({
    where: eq(settings.id, insertId),
  });

  return c.json({ success: true, data: record }, 201);
});

router.put('/:id', zValidator('json', updatePayloadSchema), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const payload = c.req.valid('json');

  const existingRecord = await db.query.settings.findFirst({
    where: eq(settings.id, id),
  });

  if (!existingRecord) {
    return c.json({ success: false, message: 'Setting tidak ditemukan' }, 404);
  }

  const sets: Partial<typeof settings.$inferInsert> = {};

  if (payload.key !== undefined) {
    const newKey = payload.key.trim();
    const duplicate = await db.query.settings.findFirst({
      columns: { id: true },
      where: eq(settings.key, newKey),
    });

    if (duplicate && duplicate.id !== id) {
      return c.json({ success: false, message: 'Key sudah digunakan untuk business ini' }, 409);
    }

    sets.key = newKey;
  }

  if (payload.dataJson !== undefined) {
    sets.dataJson = payload.dataJson ?? null;
  }

  if (Object.keys(sets).length) {
    await db
      .update(settings)
      .set(sets)
      .where(eq(settings.id, id));
  }

  const record = await db.query.settings.findFirst({
    where: eq(settings.id, id),
  });

  return c.json({ success: true, data: record });
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const existing = await db.query.settings.findFirst({
    columns: { id: true },
    where: eq(settings.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: 'Setting tidak ditemukan' }, 404);
  }

  await db
    .delete(settings)
    .where(eq(settings.id, id));

  return c.json({ success: true, message: 'Setting dihapus' });
});

export default router;
