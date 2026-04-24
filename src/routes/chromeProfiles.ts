import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '../db/client';
import { chromeProfiles, customers, customerProfiles, users, profiles } from '../db/schema';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  userId: z.coerce.number().int().optional(),
  customerId: z.coerce.number().int().optional(),
  sortBy: z.enum(['id', 'name', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const chromeProfilePayload = z.object({
  name: z.string().min(1),
  customerId: z.coerce.number().int().optional(),
  browserUuid: z.string().optional(),
  userAgent: z.string().optional(),
  proxy: z.string().max(255).optional(),
  cookies: z.any().optional(),
  fingerprint: z.any().optional(),
  status: z.coerce.number().int().default(0),
});

const updateChromeProfilePayload = z.object({
  name: z.string().min(1).optional(),
  customerId: z.coerce.number().int().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  proxy: z.string().max(255).nullable().optional(),
  cookies: z.any().optional(),
  fingerprint: z.any().optional(),
  status: z.coerce.number().int().optional(),
});

function buildSelectQuery() {
  return db
    .select({
      chromeProfile: chromeProfiles,
      user: users,
      userProfile: profiles,
      customer: customers,
      customerProfile: customerProfiles,
    })
    .from(chromeProfiles)
    .leftJoin(users, eq(users.id, chromeProfiles.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(customers, eq(customers.id, chromeProfiles.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id));
}

function formatRow(row: any) {
  let user = null;
  if (row.user) {
    const { password, ...userWithoutPassword } = row.user;
    user = { ...userWithoutPassword, profile: row.userProfile ?? null };
  }
  return {
    ...row.chromeProfile,
    user,
    customer: row.customer ? { ...row.customer, profile: row.customerProfile ?? null } : null,
  };
}

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const { page, limit, q, userId, customerId, sortBy: sortByParam, sortOrder: sortOrderParam } =
    c.req.valid('query');

  const offset = (page - 1) * limit;
  const filters = [] as any[];

  if (q) {
    const value = `%${q}%`;
    filters.push(like(chromeProfiles.name, value));
  }
  if (userId) filters.push(eq(chromeProfiles.userId, userId));
  if (customerId) filters.push(eq(chromeProfiles.customerId, customerId));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: chromeProfiles.id,
    name: chromeProfiles.name,
    createdAt: chromeProfiles.createdAt,
    updatedAt: chromeProfiles.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') orders.push(asc(sortMap.id));

  const query = buildSelectQuery().orderBy(...orders).limit(limit).offset(offset);
  if (whereExpr) query.where(whereExpr);

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
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const rows = await buildSelectQuery().where(eq(chromeProfiles.id, id)).limit(1);
  const item = rows[0] ? formatRow(rows[0]) : null;
  if (!item) return c.json({ success: false, message: 'Chrome profile tidak ditemukan' }, 404);

  return c.json({ success: true, data: item });
});

router.post('/', zValidator('json', chromeProfilePayload), async (c) => {
  const payload = c.req.valid('json');

  // Ambil userId dari JWT token
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Token tidak ditemukan' }, 401);
  }
  const token = authHeader.slice(7);
  let userId: number;
  try {
    const parts = token.split('.');
    const decoded = JSON.parse(atob(parts[1]));
    userId = Number(decoded.sub);
    if (!userId) throw new Error('Invalid sub');
  } catch {
    return c.json({ success: false, message: 'Token tidak valid' }, 401);
  }

  // Generate uuid atau pakai dari browser
  const uuid = payload.browserUuid || randomUUID();

  // Cek apakah uuid sudah ada (satu browser hanya bisa ditambahkan sekali)
  const existingRows = await db
    .select()
    .from(chromeProfiles)
    .where(eq(chromeProfiles.uuid, uuid))
    .limit(1);
  const existing = existingRows[0] ?? null;
  if (existing) {
    return c.json({ success: false, message: 'Browser ini sudah terdaftar', data: existing }, 409);
  }

  try {
    const [insertResult] = await db.insert(chromeProfiles).values({
      uuid,
      userId,
      customerId: payload.customerId ?? null,
      name: payload.name,
      userAgent: payload.userAgent ?? null,
      proxy: payload.proxy ?? null,
      cookies: payload.cookies ?? null,
      fingerprint: payload.fingerprint ?? null,
      status: payload.status ?? 0,
    });

    const insertId = Number(insertResult.insertId);
    const createdRows = await buildSelectQuery().where(eq(chromeProfiles.id, insertId)).limit(1);
    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Browser ini sudah terdaftar' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat chrome profile' }, 500);
  }
});

router.put('/:id', zValidator('json', updateChromeProfilePayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const payload = c.req.valid('json');
  const sets: Partial<typeof chromeProfiles.$inferInsert> = {};
  if (payload.name !== undefined) sets.name = payload.name;
  if (payload.customerId !== undefined) sets.customerId = payload.customerId;
  if (payload.userAgent !== undefined) sets.userAgent = payload.userAgent;
  if (payload.proxy !== undefined) sets.proxy = payload.proxy;
  if (payload.cookies !== undefined) sets.cookies = payload.cookies;
  if (payload.fingerprint !== undefined) sets.fingerprint = payload.fingerprint;
  if (payload.status !== undefined) sets.status = payload.status;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(chromeProfiles).set(sets).where(eq(chromeProfiles.id, id));
    const updatedRows = await buildSelectQuery().where(eq(chromeProfiles.id, id)).limit(1);
    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update chrome profile' }, 500);
  }
});

router.put('/:id/claim', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const body = await c.req.json<{ browserUuid: string }>();
  const uuid = body.browserUuid;
  if (!uuid) return c.json({ success: false, message: 'browserUuid wajib diisi' }, 400);

  // Cek apakah uuid sudah dipakai profile LAIN
  const conflictRows = await db
    .select({ id: chromeProfiles.id })
    .from(chromeProfiles)
    .where(eq(chromeProfiles.uuid, uuid))
    .limit(1);
  if (conflictRows.length > 0 && conflictRows[0].id !== id) {
    return c.json({ success: false, message: 'Browser ini sudah terdaftar di profile lain' }, 409);
  }

  try {
    await db.update(chromeProfiles).set({ uuid }).where(eq(chromeProfiles.id, id));
    const updatedRows = await buildSelectQuery().where(eq(chromeProfiles.id, id)).limit(1);
    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;
    return c.json({ success: true, data: updated });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Browser ini sudah terdaftar' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal claim browser' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  await db.delete(chromeProfiles).where(eq(chromeProfiles.id, id));
  return c.json({ success: true, message: 'Chrome profile dihapus' });
});

export default router;
