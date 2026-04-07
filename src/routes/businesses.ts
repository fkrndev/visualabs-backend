import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like } from 'drizzle-orm';

import { db } from '../db/client';
import { businesses, businessUsers } from '../db/schema';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  name: z.string().trim().optional(),
  sortBy: z.enum(['id', 'name']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const businessPayload = z.object({
  name: z.string().min(3),
  dataJson: z.record(z.string(), z.any()).optional(),
});

const businessUpdatePayload = businessPayload.partial();

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const { page, limit, q, name, sortBy: sortByParam, sortOrder: sortOrderParam } =
    c.req.valid('query');
  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (q) {
    const value = `%${q}%`;
    filters.push(like(businesses.name, value));
  }
  if (name) filters.push(like(businesses.name, `%${name}%`));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: businesses.id,
    name: businesses.name,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const baseQuery = db.select().from(businesses);
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
  // Ambil business tanpa relational `with` untuk menghindari LEFT JOIN LATERAL (tidak didukung MariaDB)
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, id),
  });
  if (!business) {
    return c.json({ success: false, message: 'Business tidak ditemukan' }, 404);
  }
  // Ambil businessUsers dengan query terpisah dan gabungkan manual
  const members = await db
    .select()
    .from(businessUsers)
    .where(eq(businessUsers.businessId, id));

  return c.json({ success: true, data: { ...business, businessUsers: members } });
});

router.post('/', zValidator('json', businessPayload), async (c) => {
  const payload = c.req.valid('json');
  const [insertResult] = await db.insert(businesses)
    .values({
      name: payload.name,
      dataJson: payload.dataJson ?? null,
    });
  
  // Dapatkan data yang baru saja di-insert
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, insertResult.insertId))
    .limit(1);
    
  return c.json({ success: true, data: business }, 201);
});

router.put('/:id', zValidator('json', businessUpdatePayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');
  const setValues: Partial<typeof businesses.$inferInsert> = {};
  if (payload.name !== undefined) setValues.name = payload.name;
  if (payload.dataJson !== undefined) setValues.dataJson = payload.dataJson;

  if (Object.keys(setValues).length) {
    await db.update(businesses).set(setValues).where(eq(businesses.id, id));
  }

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, id),
  });
  return c.json({ success: true, data: business });
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  await db.delete(businesses).where(eq(businesses.id, id));
  return c.json({ success: true, message: 'Business dihapus' });
});

export default router;
