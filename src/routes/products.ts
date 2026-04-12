import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like } from 'drizzle-orm';

import { db } from '../db/client';
import { products } from '../db/schema';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  sortBy: z
    .enum(['id', 'name', 'price', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const productPayload = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.string().optional(),
});

const updateProductPayload = productPayload.partial();

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    q,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (q) {
    const value = `%${q}%`;
    filters.push(like(products.name, value));
  }

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: products.id,
    name: products.name,
    price: products.price,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const query = db
    .select()
    .from(products)
    .orderBy(...orders)
    .limit(limit)
    .offset(offset);

  if (whereExpr) {
    query.where(whereExpr);
  }

  const items = await query;

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

  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  const product = rows[0] ?? null;

  if (!product) {
    return c.json({ success: false, message: 'Product tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: product });
});

router.post('/', zValidator('json', productPayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(products).values({
      name: payload.name,
      description: payload.description ?? null,
      price: payload.price ?? '0',
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await db
      .select()
      .from(products)
      .where(eq(products.id, insertId))
      .limit(1);

    return c.json({ success: true, data: createdRows[0] ?? null }, 201);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Product sudah ada' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat product' }, 500);
  }
});

router.put('/:id', zValidator('json', updateProductPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof products.$inferInsert> = {};
  if (payload.name !== undefined) sets.name = payload.name;
  if (payload.description !== undefined) sets.description = payload.description ?? null;
  if (payload.price !== undefined) sets.price = payload.price ?? '0';

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(products).set(sets).where(eq(products.id, id));

    const updatedRows = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    return c.json({ success: true, data: updatedRows[0] ?? null });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Product sudah ada' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal update product' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(products).where(eq(products.id, id));
  return c.json({ success: true, message: 'Product dihapus' });
});

export default router;
