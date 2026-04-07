import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like, ne, or } from 'drizzle-orm';

import { db } from '../db/client';
import { customerProfiles, customers } from '../db/schema';

const router = new Hono();

const businessQuery = z.object({
  businessId: z.coerce.number().int().min(1),
});

const paginationQuery = businessQuery.extend({
  customerId: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
  name: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  sortBy: z
    .enum(['id', 'customerId', 'name', 'email', 'phone', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const profilePayload = z.object({
  businessId: z.number().int().min(1),
  customerId: z.number().int().min(1),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dataJson: z.record(z.string(), z.any()).optional(),
});

const profileUpdatePayload = profilePayload.partial().extend({
  businessId: z.number().int().min(1),
});

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    businessId,
    customerId,
    q,
    name,
    email,
    phone,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
    page,
    limit,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [eq(customerProfiles.businessId, businessId)] as any[];
  if (customerId) filters.push(eq(customerProfiles.customerId, customerId));
  if (q) {
    const value = `%${q}%`;
    filters.push(
      or(
        like(customerProfiles.name, value),
        like(customerProfiles.email, value),
        like(customerProfiles.phone, value)
      )
    );
  }
  if (name) filters.push(like(customerProfiles.name, `%${name}%`));
  if (email) filters.push(like(customerProfiles.email, `%${email}%`));
  if (phone) filters.push(like(customerProfiles.phone, `%${phone}%`));

  const whereExpr =
    filters.length === 1 ? filters[0] : (and(...(filters as any)) as unknown as SQL);

  const sortMap = {
    id: customerProfiles.id,
    customerId: customerProfiles.customerId,
    name: customerProfiles.name,
    email: customerProfiles.email,
    phone: customerProfiles.phone,
    createdAt: customerProfiles.createdAt,
    updatedAt: customerProfiles.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const items = await db.query.customerProfiles.findMany({
    where: whereExpr as any,
    orderBy: orders,
    limit,
    offset,
    with: { customer: true },
  });

  const lastId = items.length ? (items[items.length - 1] as any).id ?? null : null;
  const hasNext = items.length === limit;

  return c.json({
    success: true,
    data: items,
    page: { limit, lastId, hasNext, sortBy: sortKey, sortOrder },
  });
});

router.get('/:id', zValidator('query', businessQuery), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const { businessId } = c.req.valid('query');

  const profile = await db.query.customerProfiles.findFirst({
    where: and(eq(customerProfiles.id, id), eq(customerProfiles.businessId, businessId)),
    with: { customer: true },
  });

  if (!profile) {
    return c.json({ success: false, message: 'Profile tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: profile });
});

router.post('/', zValidator('json', profilePayload), async (c) => {
  const payload = c.req.valid('json');
  const { businessId, customerId, name, email, phone, dataJson } = payload;

  const customer = await db.query.customers.findFirst({
    columns: { id: true },
    where: and(eq(customers.id, customerId), eq(customers.businessId, businessId)),
  });

  if (!customer) {
    return c.json({ success: false, message: 'Customer tidak ditemukan pada bisnis ini' }, 404);
  }

  const existing = await db.query.customerProfiles.findFirst({
    columns: { id: true },
    where: and(eq(customerProfiles.customerId, customerId), eq(customerProfiles.businessId, businessId)),
  });

  if (existing) {
    return c.json({ success: false, message: 'Profile customer sudah ada' }, 409);
  }

  const [insertResult] = await db.insert(customerProfiles).values({
    businessId,
    customerId,
    name: name ?? null,
    email: email ?? null,
    phone: phone ?? null,
    dataJson: dataJson ?? null,
  });

  const insertId = Number(insertResult.insertId);

  const profile = await db.query.customerProfiles.findFirst({
    where: eq(customerProfiles.id, insertId),
    with: { customer: true },
  });

  return c.json({ success: true, data: profile }, 201);
});

router.put('/:id', zValidator('json', profileUpdatePayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const payload = c.req.valid('json');
  const { businessId } = payload;

  const existingProfile = await db.query.customerProfiles.findFirst({
    where: and(eq(customerProfiles.id, id), eq(customerProfiles.businessId, businessId)),
  });

  if (!existingProfile) {
    return c.json({ success: false, message: 'Profile tidak ditemukan' }, 404);
  }

  const sets: Partial<typeof customerProfiles.$inferInsert> = {};

  if (payload.customerId !== undefined) {
    const customer = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(eq(customers.id, payload.customerId), eq(customers.businessId, businessId)),
    });
    if (!customer) {
      return c.json({ success: false, message: 'Customer tidak ditemukan pada bisnis ini' }, 404);
    }

    const duplicate = await db.query.customerProfiles.findFirst({
      columns: { id: true },
      where: and(
        eq(customerProfiles.customerId, payload.customerId),
        eq(customerProfiles.businessId, businessId),
        ne(customerProfiles.id, id)
      ),
    });

    if (duplicate) {
      return c.json({ success: false, message: 'Customer sudah memiliki profile' }, 409);
    }

    sets.customerId = payload.customerId;
  }

  if (payload.name !== undefined) sets.name = payload.name ?? null;
  if (payload.email !== undefined) sets.email = payload.email ?? null;
  if (payload.phone !== undefined) sets.phone = payload.phone ?? null;
  if (payload.dataJson !== undefined) sets.dataJson = payload.dataJson ?? null;

  if (Object.keys(sets).length) {
    await db
      .update(customerProfiles)
      .set(sets)
      .where(and(eq(customerProfiles.id, id), eq(customerProfiles.businessId, businessId)));
  }

  const profile = await db.query.customerProfiles.findFirst({
    where: and(eq(customerProfiles.id, id), eq(customerProfiles.businessId, businessId)),
    with: { customer: true },
  });

  return c.json({ success: true, data: profile });
});

router.delete('/:id', zValidator('query', businessQuery), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const { businessId } = c.req.valid('query');

  const existing = await db.query.customerProfiles.findFirst({
    columns: { id: true },
    where: and(eq(customerProfiles.id, id), eq(customerProfiles.businessId, businessId)),
  });

  if (!existing) {
    return c.json({ success: false, message: 'Profile tidak ditemukan' }, 404);
  }

  await db
    .delete(customerProfiles)
    .where(and(eq(customerProfiles.id, id), eq(customerProfiles.businessId, businessId)));

  return c.json({ success: true, message: 'Profile customer dihapus' });
});

export default router;
