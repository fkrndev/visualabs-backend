import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq } from 'drizzle-orm';

import { db } from '../db/client';
import { fbToken, users, profiles } from '../db/schema';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
  sortBy: z
    .enum(['id', 'status', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const fbTokenPayload = z.object({
  userId: z.coerce.number().int(),
  token: z.string().min(1),
  status: z.coerce.number().int().min(0).max(1).optional(),
});

const updateFbTokenPayload = fbTokenPayload.partial();

function formatRow(row: any) {
  const user = row.user ? { ...row.user, profile: row.profile ?? null } : null;
  if (user) delete (user as any).password;
  return {
    ...row.fbToken,
    user,
  };
}

function buildSelectQuery() {
  return db
    .select({
      fbToken: fbToken,
      user: users,
      profile: profiles,
    })
    .from(fbToken)
    .leftJoin(users, eq(users.id, fbToken.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id));
}

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    userId,
    status,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (userId) filters.push(eq(fbToken.userId, userId));
  if (status !== undefined) filters.push(eq(fbToken.status, status));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: fbToken.id,
    status: fbToken.status,
    createdAt: fbToken.createdAt,
    updatedAt: fbToken.updatedAt,
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
    .where(eq(fbToken.id, id))
    .limit(1);

  const item = rows[0] ? formatRow(rows[0]) : null;

  if (!item) {
    return c.json({ success: false, message: 'FB Token tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: item });
});

router.post('/', zValidator('json', fbTokenPayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(fbToken).values({
      userId: payload.userId,
      token: payload.token,
      status: payload.status ?? 1,
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await buildSelectQuery()
      .where(eq(fbToken.id, insertId))
      .limit(1);

    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat FB Token' }, 500);
  }
});

router.put('/:id', zValidator('json', updateFbTokenPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof fbToken.$inferInsert> = {};
  if (payload.userId !== undefined) sets.userId = payload.userId;
  if (payload.token !== undefined) sets.token = payload.token;
  if (payload.status !== undefined) sets.status = payload.status;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(fbToken).set(sets).where(eq(fbToken.id, id));

    const updatedRows = await buildSelectQuery()
      .where(eq(fbToken.id, id))
      .limit(1);

    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update FB Token' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(fbToken).where(eq(fbToken.id, id));
  return c.json({ success: true, message: 'FB Token dihapus' });
});

export default router;
