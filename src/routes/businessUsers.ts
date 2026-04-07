import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like, or } from 'drizzle-orm';

import { db } from '../db/client';
import { businessUsers, businesses, users } from '../db/schema';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  businessId: z.coerce.number().int().optional(),
  userId: z.coerce.number().int().optional(),
  role: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
  sortBy: z
    .enum([
      'id',
      'businessId',
      'userId',
      'role',
      'createdAt',
      'updatedAt',
      'businessName',
      'username',
    ])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const payload = z.object({
  businessId: z.number().int(),
  userId: z.number().int(),
  role: z.number().int(),
  dataJson: z.record(z.string(), z.unknown()).optional(),
});

const updatePayload = payload.partial();

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    businessId,
    userId,
    role,
    q,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (businessId) filters.push(eq(businessUsers.businessId, businessId));
  if (userId) filters.push(eq(businessUsers.userId, userId));
  if (role !== undefined) filters.push(eq(businessUsers.role, role));
  if (q) {
    const value = `%${q}%`;
    filters.push(or(like(users.username, value), like(businesses.name, value)));
  }

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: businessUsers.id,
    businessId: businessUsers.businessId,
    userId: businessUsers.userId,
    role: businessUsers.role,
    createdAt: businessUsers.createdAt,
    updatedAt: businessUsers.updatedAt,
    businessName: businesses.name,
    username: users.username,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const baseListQuery = db
    .select({
      businessUser: businessUsers,
      businessName: businesses.name,
      username: users.username,
    })
    .from(businessUsers)
    .leftJoin(businesses, eq(businesses.id, businessUsers.businessId))
    .leftJoin(users, eq(users.id, businessUsers.userId));

  const filteredQuery = whereExpr ? baseListQuery.where(whereExpr as any) : baseListQuery;
  const orderedQuery = filteredQuery.orderBy(...orders);
  const items = await orderedQuery.limit(limit).offset(offset);

  const lastId = items.length ? (items[items.length - 1] as any).businessUser.id ?? null : null;
  const hasNext = items.length === limit;

  return c.json({
    success: true,
    data: items,
    page: { limit, lastId, hasNext, sortBy: sortKey, sortOrder },
  });
});

router.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const record = await db.query.businessUsers.findFirst({
    where: eq(businessUsers.id, id),
    with: {
      business: true,
      user: true,
    },
  });
  if (!record) return c.json({ success: false, message: 'Data tidak ditemukan' }, 404);
  return c.json({ success: true, data: record });
});

router.post('/', zValidator('json', payload), async (c) => {
  const body = c.req.valid('json');
  try {
    const [result] = await db.insert(businessUsers).values({
      businessId: body.businessId,
      userId: body.userId,
      role: body.role,
      dataJson: body.dataJson ?? null,
    });
    const insertId = Number(result.insertId);
    const record = await db.query.businessUsers.findFirst({
      where: eq(businessUsers.id, insertId),
    });
    return c.json({ success: true, data: record }, 201);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'User sudah terhubung ke bisnis ini' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal menambah relasi bisnis' }, 500);
  }
});

router.put('/:id', zValidator('json', updatePayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const body = c.req.valid('json');
  const setValues: Partial<typeof businessUsers.$inferInsert> = {};
  if (body.businessId !== undefined) setValues.businessId = body.businessId;
  if (body.userId !== undefined) setValues.userId = body.userId;
  if (body.role !== undefined) setValues.role = body.role;
  if (body.dataJson !== undefined) setValues.dataJson = body.dataJson;

  if (Object.keys(setValues).length) {
    try {
      await db
        .update(businessUsers)
        .set(setValues)
        .where(eq(businessUsers.id, id));
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return c.json({ success: false, message: 'User sudah ada pada bisnis' }, 409);
      }
      throw error;
    }
  }

  const record = await db.query.businessUsers.findFirst({
    where: eq(businessUsers.id, id),
  });
  return c.json({ success: true, data: record });
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);
  await db.delete(businessUsers).where(eq(businessUsers.id, id));
  return c.json({ success: true, message: 'Relasi business-user dihapus' });
});

export default router;
