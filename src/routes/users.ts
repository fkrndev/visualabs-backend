import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like, or } from 'drizzle-orm';

import { db } from '../db/client';
import { profiles, users } from '../db/schema';
import { cleanEmail, cleanPhone } from '../utils/normalizers';
import { hashPassword } from '../utils/security';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  email: z.string().trim().optional(),
  username: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  fbid: z.string().trim().optional(),
  googleId: z.string().trim().optional(),
  sortBy: z
    .enum(['id', 'email', 'username', 'phone', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const userPayload = z.object({
  email: z.email().optional(),
  username: z.string().min(3).optional(),
  phone: z.string().min(6).optional(),
  password: z.string().min(8).optional(),
  name: z.string().min(1).optional(),
});

const updateUserPayload = userPayload.partial().extend({
  password: z.string().min(8).optional(),
});

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    q,
    email,
    username,
    phone,
    fbid,
    googleId,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (q) {
    const value = `%${q}%`;
    filters.push(
      or(like(users.email, value), like(users.username, value), like(users.phone, value))
    );
  }
  if (email) filters.push(like(users.email, `%${email}%`));
  if (username) filters.push(like(users.username, `%${username}%`));
  if (phone) filters.push(like(users.phone, `%${phone}%`));
  if (fbid) filters.push(like(users.fbid, `%${fbid}%`));
  if (googleId) filters.push(like(users.googleId, `%${googleId}%`));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: users.id,
    email: users.email,
    username: users.username,
    phone: users.phone,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const queryOptions: Parameters<typeof db.query.users.findMany>[0] = {
    orderBy: orders,
    limit,
    offset,
  };

  if (whereExpr) {
    queryOptions.where = whereExpr as any;
  }

  const items = await db.query.users.findMany(queryOptions);

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

  const rows = await db
    .select({ user: users, profile: profiles })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, id))
    .limit(1);
  const row = rows[0];
  const user = row ? { ...(row as any).user, profile: (row as any).profile ?? null } : null;

  if (!user) {
    return c.json({ success: false, message: 'User tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: user });
});

router.post('/', zValidator('json', userPayload), async (c) => {
  const payload = c.req.valid('json');

  const { email: rawEmail, username: rawUsername, phone: rawPhone, password, name } =
    payload;

  const email = rawEmail ? cleanEmail(rawEmail) : null;
  const username = rawUsername?.trim() ?? null;
  const phone = rawPhone ? cleanPhone(rawPhone) : null;
  const hashedPassword = password ? await hashPassword(password) : null;
  const profileName = name ?? null;

  if (!email && !username && !phone && !password) {
    return c.json(
      {
        success: false,
        message: 'Minimal salah satu dari email, username, phone, atau password harus diisi',
      },
      400
    );
  }

  try {
    if (email) {
      const existingEmail = await db.query.users.findFirst({
        columns: { id: true },
        where: eq(users.email, email),
      });
      if (existingEmail) {
        return c.json({ success: false, message: 'Email sudah digunakan' }, 409);
      }
    }

    if (username) {
      const existingUsername = await db.query.users.findFirst({
        columns: { id: true },
        where: eq(users.username, username),
      });
      if (existingUsername) {
        return c.json({ success: false, message: 'Username sudah digunakan' }, 409);
      }
    }

    if (phone) {
      const existingPhone = await db.query.users.findFirst({
        columns: { id: true },
        where: eq(users.phone, phone),
      });
      if (existingPhone) {
        return c.json({ success: false, message: 'Nomor telepon sudah digunakan' }, 409);
      }
    }

    const [insertResult] = await db.insert(users).values({
      email,
      username,
      phone,
      password: hashedPassword,
    });

    const insertId = Number(insertResult.insertId);

    await db.insert(profiles).values({
      userId: insertId,
      name: profileName,
      email: rawEmail ?? null,
      phone: rawPhone ?? null,
    });

    const createdRows = await db
      .select({ user: users, profile: profiles })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, insertId))
      .limit(1);
    const createdRow = createdRows[0];
    const created = createdRow
      ? { ...(createdRow as any).user, profile: (createdRow as any).profile ?? null }
      : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Data user sudah ada' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat user' }, 500);
  }
});

router.put('/:id', zValidator('json', updateUserPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof users.$inferInsert> = {};
  const profileUpdates: Partial<typeof profiles.$inferInsert> = {};

  if (payload.email !== undefined) {
    const email = cleanEmail(payload.email);
    const existing = await db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.email, email),
    });
    if (existing && existing.id !== id) {
      return c.json({ success: false, message: 'Email sudah digunakan' }, 409);
    }
    sets.email = email;
    profileUpdates.email = payload.email;
  }

  if (payload.username !== undefined) {
    const username = payload.username.trim();
    const existing = await db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.username, username),
    });
    if (existing && existing.id !== id) {
      return c.json({ success: false, message: 'Username sudah digunakan' }, 409);
    }
    sets.username = username;
  }

  if (payload.phone !== undefined) {
    const phone = cleanPhone(payload.phone);
    const existing = await db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.phone, phone),
    });
    if (existing && existing.id !== id) {
      return c.json({ success: false, message: 'Nomor telepon sudah digunakan' }, 409);
    }
    sets.phone = phone;
    profileUpdates.phone = payload.phone;
  }

  if (payload.name !== undefined) {
    profileUpdates.name = payload.name ?? null;
  }
  if (payload.password) sets.password = await hashPassword(payload.password);

  try {
    if (Object.keys(sets).length) {
      await db.update(users).set(sets).where(eq(users.id, id));
    }

    if (Object.keys(profileUpdates).length) {
      const existingProfile = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, id))
        .limit(1);

      if (existingProfile.length) {
        await db
          .update(profiles)
          .set(profileUpdates)
          .where(eq(profiles.userId, id));
      } else {
        await db.insert(profiles).values({
          userId: id,
          ...profileUpdates,
        });
      }
    }

    const updatedRows = await db
      .select({ user: users, profile: profiles })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, id))
      .limit(1);
    const updatedRow = updatedRows[0];
    const updated = updatedRow
      ? { ...(updatedRow as any).user, profile: (updatedRow as any).profile ?? null }
      : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Data user bentrok' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal update user' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(users).where(eq(users.id, id));
  return c.json({ success: true, message: 'User dihapus' });
});

export default router;
