import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, gt, like, or, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { settingMultiples } from '../db/schema';

const router = new Hono();

const dateSchema = z.preprocess((val) => {
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}, z.date({ required_error: 'Tanggal wajib diisi', invalid_type_error: 'Tanggal tidak valid' }));

const paginationQuery = z.object({
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  name: z.string().trim().optional(),
  key: z.string().trim().optional(),
  sortBy: z.enum(['id', 'name', 'key', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const payloadSchema = z.object({
  name: z.string().trim().min(1).max(191),
  key: z.string().trim().min(1).max(191),
  dataJson: z.record(z.string(), z.any()).optional(),
});

const updatePayloadSchema = payloadSchema.partial();

const nameQuery = z.object({
  name: z.string().trim().min(1),
});

const nameKeyQuery = nameQuery.extend({
  key: z.string().trim().min(1),
});

const preOrderSettingName = 'pre-order-product-category';

const setPreOrderDatePayload = z.object({
  key: z.string().trim().min(1).max(191),
  date: dateSchema,
  config: z.record(z.string(), z.any()).optional(),
});

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    cursor,
    limit,
    q,
    name,
    key,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const filters = [] as any[];

  if (cursor) {
    filters.push(gt(settingMultiples.id, cursor));
  }

  if (q) {
    const value = `%${q}%`;
    filters.push(
      or(like(settingMultiples.name, value), like(settingMultiples.key, value))
    );
  }

  if (name) filters.push(like(settingMultiples.name, `%${name}%`));
  if (key) filters.push(like(settingMultiples.key, `%${key}%`));

  const whereExpr = filters.length === 1 ? filters[0] : (and(...filters) as unknown as SQL);

  const sortMap = {
    id: settingMultiples.id,
    name: settingMultiples.name,
    key: settingMultiples.key,
    createdAt: settingMultiples.createdAt,
    updatedAt: settingMultiples.updatedAt,
  } as const;

  const isValidSortKey = (value: string): value is keyof typeof sortMap => value in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const items = await db.query.settingMultiples.findMany({
    where: whereExpr as any,
    orderBy: orders,
    limit: limit + 1,
  });

  const hasNext = items.length > limit;
  const data = hasNext ? items.slice(0, limit) : items;
  const nextCursor = hasNext && data.length > 0 ? data[data.length - 1].id : null;

  return c.json({
    success: true,
    data,
    page: { limit, nextCursor, hasNext, sortBy: sortKey, sortOrder },
  });
});

router.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const record = await db.query.settingMultiples.findFirst({
    where: eq(settingMultiples.id, id),
  });

  if (!record) {
    return c.json({ success: false, message: 'Pengaturan tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: record });
});

router.get('/by-name', zValidator('query', nameQuery), async (c) => {
  const { name } = c.req.valid('query');

  const records = await db.query.settingMultiples.findMany({
    where: eq(settingMultiples.name, name),
    orderBy: [asc(settingMultiples.id)],
  });

  return c.json({ success: true, data: records });
});

router.get('/take', zValidator('query', nameKeyQuery), async (c) => {
  const { name, key } = c.req.valid('query');

  const record = await db.query.settingMultiples.findFirst({
    where: and(
      eq(settingMultiples.name, name),
      eq(settingMultiples.key, key)
    ),
  });

  if (!record) {
    return c.json({ success: false, message: 'Pengaturan tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: record });
});

router.post('/pre-order-product-category/set-date', zValidator('json', setPreOrderDatePayload), async (c) => {
  const { key, date, config } = c.req.valid('json');

  const dataJson = { date: date.toISOString(), config: config ?? null } as const;

  await db
    .insert(settingMultiples)
    .values({ name: preOrderSettingName, key, dataJson })
    .onDuplicateKeyUpdate({
      set: { key, dataJson, updatedAt: sql`CURRENT_TIMESTAMP` },
    });

  const record = await db.query.settingMultiples.findFirst({
    where: and(
      eq(settingMultiples.name, preOrderSettingName),
      eq(settingMultiples.key, key)
    ),
  });

  return c.json({ success: true, data: record });
});

router.post('/', zValidator('json', payloadSchema), async (c) => {
  const payload = c.req.valid('json');

  const [insertResult] = await db.insert(settingMultiples).values({
    name: payload.name,
    key: payload.key,
    dataJson: payload.dataJson ?? null,
  });

  const record = await db.query.settingMultiples.findFirst({
    where: eq(settingMultiples.id, insertResult.insertId),
  });

  return c.json({ success: true, data: record }, 201);
});

router.put('/:id', zValidator('json', updatePayloadSchema), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const payload = c.req.valid('json');

  const existing = await db.query.settingMultiples.findFirst({
    columns: { id: true },
    where: eq(settingMultiples.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: 'Pengaturan tidak ditemukan' }, 404);
  }

  const sets: Partial<typeof settingMultiples.$inferInsert> = {};
  if (payload.name !== undefined) sets.name = payload.name;
  if (payload.key !== undefined) sets.key = payload.key;
  if (payload.dataJson !== undefined) sets.dataJson = payload.dataJson;

  if (Object.keys(sets).length) {
    await db
      .update(settingMultiples)
      .set(sets)
      .where(eq(settingMultiples.id, id));
  }

  const record = await db.query.settingMultiples.findFirst({
    where: eq(settingMultiples.id, id),
  });

  return c.json({ success: true, data: record });
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const existing = await db.query.settingMultiples.findFirst({
    columns: { id: true },
    where: eq(settingMultiples.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: 'Pengaturan tidak ditemukan' }, 404);
  }

  await db
    .delete(settingMultiples)
    .where(eq(settingMultiples.id, id));

  return c.json({ success: true, message: 'Pengaturan dihapus' });
});

export default router;
