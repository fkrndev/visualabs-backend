import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like } from 'drizzle-orm';

import { db } from '../db/client';
import { profiles, users } from '../db/schema';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
  name: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  sortBy: z
    .enum(['id', 'userId', 'name', 'email', 'phone', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const profilePayload = z.object({
  userId: z.number().int(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dataJson: z.record(z.string(), z.any()).optional(),
});

const profileUpdatePayload = profilePayload.partial().extend({
  userId: z.number().int().optional(),
});

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    userId,
    q,
    name,
    email,
    phone,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (userId) filters.push(eq(profiles.userId, userId));
  if (q) {
    const value = `%${q}%`;
    filters.push(
      and(
        like(profiles.name, value),
        like(profiles.email, value),
        like(profiles.phone, value)
      )
    );
  }
  if (name) filters.push(like(profiles.name, `%${name}%`));
  if (email) filters.push(like(profiles.email, `%${email}%`));
  if (phone) filters.push(like(profiles.phone, `%${phone}%`));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: profiles.id,
    userId: profiles.userId,
    name: profiles.name,
    email: profiles.email,
    phone: profiles.phone,
    createdAt: profiles.createdAt,
    updatedAt: profiles.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const baseQuery = db.select().from(profiles);
  const filteredQuery = whereExpr ? baseQuery.where(whereExpr as any) : baseQuery;
  const orderedQuery = filteredQuery.orderBy(...orders);
  const items = await orderedQuery.limit(limit).offset(offset);

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
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, id),
    with: { user: true },
  });
  if (!profile) {
    return c.json({ success: false, message: 'Profile tidak ditemukan' }, 404);
  }
  return c.json({ success: true, data: profile });
});

router.post('/', zValidator('json', profilePayload), async (c) => {
  const payload = c.req.valid('json');
  await db
    .insert(profiles)
    .values({
      userId: payload.userId,
      name: payload.name ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      dataJson: payload.dataJson ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        name: payload.name ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        dataJson: payload.dataJson ?? null,
      },
    });

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, payload.userId),
  });

  return c.json({ success: true, data: profile }, 201);
});

router.put('/:id', zValidator('json', profileUpdatePayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const setValues: Partial<typeof profiles.$inferInsert> = {};
  if (payload.userId !== undefined) setValues.userId = payload.userId;
  if (payload.name !== undefined) setValues.name = payload.name ?? null;
  if (payload.email !== undefined) setValues.email = payload.email ?? null;
  if (payload.phone !== undefined) setValues.phone = payload.phone ?? null;
  if (payload.dataJson !== undefined) setValues.dataJson = payload.dataJson;

  if (Object.keys(setValues).length) {
    await db.update(profiles).set(setValues).where(eq(profiles.id, id));
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, id),
  });
  return c.json({ success: true, data: profile });
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  await db.delete(profiles).where(eq(profiles.id, id));
  return c.json({ success: true, message: 'Profile dihapus' });
});

export default router;
