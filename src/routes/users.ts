import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like, or } from 'drizzle-orm';

import { db } from '../db/client';
import { profiles, users } from '../db/schema';
import { cleanEmail, cleanPhone } from '../utils/normalizers';
import { hashPassword } from '../utils/security';
import { requireAuth, requireManagement } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validateIdParam, getValidatedId } from '../middleware/validation';
import { logAuditEvent, getClientIp, getUserAgent } from '../utils/audit';
import { createLogger } from '../utils/logger';
import { validateUniqueEmail, validateUniqueUsername, validateUniquePhone, fetchEntityWithProfile } from '../utils/db-helpers';
import { sanitizeUserProfile } from '../utils/security/xss';

const logger = createLogger('UsersRoute');

const router = new Hono();

// ---- SSE event bus for user changes ----------------------------------------
type SSEEmit = (event: string, data: unknown) => Promise<void>;
const sseClients = new Set<SSEEmit>();

export function broadcastUserChange(event: string, data: unknown): void {
  sseClients.forEach((emit) => {
    emit(event, data).catch(() => {});
  });
}
// ---------------------------------------------------------------------------

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
  telegramUsername: z.string().trim().max(64).optional().nullable(),
  role: z.coerce.number().int().min(0).max(7).optional(),
});

const updateUserPayload = userPayload.partial().extend({
  password: z.string().min(8).optional(),
});

router.get('/', rateLimit({ windowMs: 60000, maxRequests: 100 }), requireAuth, requireManagement, zValidator('query', paginationQuery), async (c) => {
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

  const filters: SQL[] = [];
  if (q) {
    const value = `%${q}%`;
    filters.push(
      or(like(users.email, value), like(users.username, value), like(users.phone, value))!
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

  const query = db
    .select({ user: users, profile: profiles })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .orderBy(...orders)
    .limit(limit)
    .offset(offset);

  if (whereExpr) {
    query.where(whereExpr);
  }

  const rows = await query;
  const items = rows.map((r) => ({ ...r.user, profile: r.profile ?? null }));

  // Sanitize items to prevent XSS
  const sanitizedItems = items.map(sanitizeUserProfile);

  const lastId = items.length ? items[items.length - 1].id ?? null : null;
  const hasNext = items.length === limit;

  return c.json({
    success: true,
    data: sanitizedItems,
    page: { limit, lastId, hasNext, sortBy: sortKey, sortOrder },
  });
});

// ---- SSE endpoint for real-time user changes (MUST be before /:id) --------
router.get('/events', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ success: false, message: 'Token wajib' }, 401);

  let userId: number;
  let userRole: number;
  try {
    const parts = token.split('.');
    const decoded = JSON.parse(atob(parts[1]));
    userId = Number(decoded.sub);
    userRole = Number(decoded.rol); // JWT uses 'rol' not 'role'
    if (!userId) throw new Error('invalid sub');
  } catch {
    return c.json({ success: false, message: 'Token tidak valid' }, 401);
  }

  // Only admin/super admin can subscribe to user events
  if (userRole !== 1 && userRole !== 7) {
    return c.json({ success: false, message: 'Tidak memiliki akses' }, 403);
  }

  return streamSSE(c, async (stream) => {
    const emit: SSEEmit = (event, data) =>
      stream.writeSSE({ event, data: JSON.stringify(data) });

    sseClients.add(emit);

    await stream.writeSSE({ event: 'connected', data: JSON.stringify({ message: 'Connected to user events stream' }) });

    let alive = true;
    stream.onAbort(() => {
      alive = false;
      sseClients.delete(emit);
    });

    // Keep connection alive with heartbeat
    while (alive) {
      await stream.sleep(25_000);
      if (!alive) break;
      try {
        await stream.writeSSE({ event: 'heartbeat', data: JSON.stringify({ timestamp: Date.now() }) });
      } catch {
        break;
      }
    }
  });
});

router.get('/:id', requireAuth, requireManagement, validateIdParam('id'), async (c) => {
  const id = getValidatedId(c);

  const user = await fetchEntityWithProfile(users, profiles, id, 'userId');

  if (!user) {
    return c.json({ success: false, message: 'User tidak ditemukan' }, 404);
  }

  // Sanitize user data to prevent XSS
  const sanitizedUser = sanitizeUserProfile(user);

  return c.json({ success: true, data: sanitizedUser });
});

router.post('/', rateLimit({ windowMs: 60000, maxRequests: 20 }), requireAuth, requireManagement, zValidator('json', userPayload), async (c) => {
  const payload = c.req.valid('json');

  const { email: rawEmail, username: rawUsername, phone: rawPhone, password, name, telegramUsername, role } =
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
    // Check for duplicates using helper functions
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

    // Use transaction for atomic insert of user + profile
    const result = await db.transaction(async (tx) => {
      const [insertResult] = await tx.insert(users).values({
        email,
        username,
        phone,
        password: hashedPassword,
        role: role ?? 1,
      });

      const insertId = Number(insertResult.insertId);

      await tx.insert(profiles).values({
        userId: insertId,
        name: profileName,
        email: rawEmail ?? null,
        phone: rawPhone ?? null,
        telegramUsername: telegramUsername ?? null,
      });

      return insertId;
    });

    const created = await fetchEntityWithProfile(users, profiles, result, 'userId');

    // Sanitize created user data
    const sanitizedCreated = created ? sanitizeUserProfile(created) : null;

    // Log audit event
    const payload = c.get('jwtPayload');
    await logAuditEvent({
      userId: payload?.sub ? Number(payload.sub) : undefined,
      action: 'CREATE',
      entityType: 'user',
      entityId: result,
      changes: { email, username, phone, role: role ?? 1 },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    // Broadcast user created event
    if (sanitizedCreated) {
      broadcastUserChange('user.created', sanitizedCreated);
    }

    return c.json({ success: true, data: sanitizedCreated }, 201);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Data user sudah ada' }, 409);
    }
    logger.error('Gagal membuat user', error, { email, username, phone });
    return c.json({ success: false, message: 'Gagal membuat user' }, 500);
  }
});

router.put('/:id', rateLimit({ windowMs: 60000, maxRequests: 50 }), requireAuth, requireManagement, validateIdParam('id'), zValidator('json', updateUserPayload), async (c) => {
  const id = getValidatedId(c);
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
  if (payload.telegramUsername !== undefined) {
    profileUpdates.telegramUsername = payload.telegramUsername ?? null;
  }
  if (payload.role !== undefined) sets.role = payload.role;
  if (payload.password) sets.password = await hashPassword(payload.password);

  try {
    // Use transaction for atomic update of user + profile
    await db.transaction(async (tx) => {
      if (Object.keys(sets).length) {
        await tx.update(users).set(sets).where(eq(users.id, id));
      }

      if (Object.keys(profileUpdates).length) {
        const existingProfile = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.userId, id))
          .limit(1);

        if (existingProfile.length) {
          await tx
            .update(profiles)
            .set(profileUpdates)
            .where(eq(profiles.userId, id));
        } else {
          await tx.insert(profiles).values({
            userId: id,
            ...profileUpdates,
          });
        }
      }
    });

    const updated = await fetchEntityWithProfile(users, profiles, id, 'userId');

    // Sanitize updated user data
    const sanitizedUpdated = updated ? sanitizeUserProfile(updated) : null;

    // Log audit event
    const payload = c.get('jwtPayload');
    await logAuditEvent({
      userId: payload?.sub ? Number(payload.sub) : undefined,
      action: 'UPDATE',
      entityType: 'user',
      entityId: id,
      changes: { ...sets, ...profileUpdates },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    // Broadcast user updated event
    if (sanitizedUpdated) {
      broadcastUserChange('user.updated', sanitizedUpdated);
    }

    return c.json({ success: true, data: sanitizedUpdated });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Data user bentrok' }, 409);
    }
    logger.error('Gagal update user', error, { id });
    return c.json({ success: false, message: 'Gagal update user' }, 500);
  }
});

router.delete('/:id', rateLimit({ windowMs: 60000, maxRequests: 30 }), requireAuth, requireManagement, validateIdParam('id'), async (c) => {
  const id = getValidatedId(c);

  await db.delete(users).where(eq(users.id, id));

  // Log audit event
  const payload = c.get('jwtPayload');
  await logAuditEvent({
    userId: payload?.sub ? Number(payload.sub) : undefined,
    action: 'DELETE',
    entityType: 'user',
    entityId: id,
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  // Broadcast user deleted event
  broadcastUserChange('user.deleted', { id });

  return c.json({ success: true, message: 'User dihapus' });
});

export default router;
