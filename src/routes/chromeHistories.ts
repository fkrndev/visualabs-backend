import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like, sql } from 'drizzle-orm';
import { verify } from 'hono/jwt';

import { db } from '../db/client';
import { chromeHistories, chromeProfiles, chromeVisitEvents, users, customers } from '../db/schema';
import {
  buildOrderBy,
  buildWhere,
  filtersQuerySchema,
  sortsQuerySchema,
  type ColumnMap,
} from '../utils/queryFilters';
import { requireAuth, requireManagement, JWT_SECRET } from '../middleware/auth';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  profileId: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
  sortBy: z.enum(['id', 'url', 'count', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  filters: filtersQuerySchema,
  sort: sortsQuerySchema,
});

const historyColumnMap: ColumnMap = {
  id: { column: chromeHistories.id, kind: 'id' },
  userId: { column: chromeHistories.userId, kind: 'id' },
  customerId: { column: chromeHistories.customerId, kind: 'id' },
  profileId: { column: chromeHistories.profileId, kind: 'id' },
  url: { column: chromeHistories.url, kind: 'text' },
  count: { column: chromeHistories.count, kind: 'number' },
  createdAt: { column: chromeHistories.createdAt, kind: 'date' },
  updatedAt: { column: chromeHistories.updatedAt, kind: 'date' },
};

const trackPayload = z.object({
  browserUuid: z.string().min(1),
  url: z.string().url().min(1),
  title: z.string().optional(),
  durationMs: z.coerce.number().int().min(0).optional(),
});

// POST /track — dipanggil extension setiap URL berubah
router.post('/track', zValidator('json', trackPayload), async (c) => {
  const { browserUuid, url, title, durationMs } = c.req.valid('json');

  // Validate token dari extension (Authorization: Bearer header)
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Unauthorized - no token' }, 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Verify JWT token using hono/jwt
  try {
    await verify(token, JWT_SECRET);
  } catch {
    return c.json({ success: false, message: 'Token expired or invalid' }, 401);
  }

  // Cari chrome profile berdasarkan browser UUID
  const profileRows = await db
    .select()
    .from(chromeProfiles)
    .where(eq(chromeProfiles.uuid, browserUuid))
    .limit(1);

  const profile = profileRows[0];
  if (!profile) {
    return c.json({ success: false, message: 'Browser belum terdaftar' }, 404);
  }

  // Cek apakah URL sudah ada untuk profile ini
  const existingRows = await db
    .select()
    .from(chromeHistories)
    .where(and(
      eq(chromeHistories.profileId, profile.id),
      eq(chromeHistories.url, url)
    ))
    .limit(1);

  if (existingRows.length > 0) {
    // URL sudah ada, increment count + update title
    const existing = existingRows[0];
    const raw = existing.dataJson;
    const existingData: Record<string, unknown> =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    if (title) existingData.title = title;
    await db
      .update(chromeHistories)
      .set({
        count: existing.count + 1,
        dataJson: existingData,
      })
      .where(eq(chromeHistories.id, existing.id));

    await db.insert(chromeVisitEvents).values({
      historyId: existing.id,
      userId: profile.userId,
      customerId: profile.customerId ?? null,
      visitedAt: new Date(),
      durationMs: durationMs ?? null,
      dataJson: title ? { title } : null,
    });

    return c.json({ success: true, action: 'incremented', id: existing.id });
  }

  // URL baru, insert
  const [insertResult] = await db.insert(chromeHistories).values({
    userId: profile.userId,
    customerId: profile.customerId ?? null,
    profileId: profile.id,
    url,
    count: 1,
    dataJson: title ? { title } : null,
  });

  const historyId = Number(insertResult.insertId);
  await db.insert(chromeVisitEvents).values({
    historyId,
    userId: profile.userId,
    customerId: profile.customerId ?? null,
    visitedAt: new Date(),
    durationMs: durationMs ?? null,
    dataJson: title ? { title } : null,
  });

  return c.json({ success: true, action: 'created', id: historyId }, 201);
});

// GET / — list histories (admin data: Dev/Admin/Owner only)
router.get('/', requireAuth, requireManagement, zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    profileId,
    q,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
    filters: filterGroup,
    sort: sortRules,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;
  const conds: SQL[] = [];

  if (profileId) conds.push(eq(chromeHistories.profileId, profileId));
  if (q) conds.push(like(chromeHistories.url, `%${q}%`));
  const advancedWhere = buildWhere(filterGroup, historyColumnMap);
  if (advancedWhere) conds.push(advancedWhere);

  const whereExpr = conds.length ? and(...conds) : undefined;

  const legacySortKey =
    sortByParam && sortByParam in historyColumnMap ? sortByParam : 'id';
  const legacyDir: 'asc' | 'desc' = sortOrderParam === 'desc' ? 'desc' : 'asc';
  const legacyFallback = buildOrderBy(
    [{ field: legacySortKey, direction: legacyDir }],
    historyColumnMap,
  );
  if (legacySortKey !== 'id') legacyFallback.push(asc(chromeHistories.id));

  const orders = buildOrderBy(sortRules, historyColumnMap, legacyFallback);
  if (sortRules && sortRules.length > 0) orders.push(asc(chromeHistories.id));

  const responseSortKey =
    sortRules && sortRules.length > 0 ? sortRules[0].field : legacySortKey;
  const responseSortOrder =
    sortRules && sortRules.length > 0 ? sortRules[0].direction : legacyDir;

  const query = db
    .select({
      id: chromeHistories.id,
      userId: chromeHistories.userId,
      customerId: chromeHistories.customerId,
      profileId: chromeHistories.profileId,
      url: chromeHistories.url,
      count: chromeHistories.count,
      dataJson: chromeHistories.dataJson,
      createdAt: chromeHistories.createdAt,
      updatedAt: chromeHistories.updatedAt,
      userName: users.username,
      userEmail: users.email,
      customerUsername: customers.username,
      customerEmail: customers.email,
      profileName: chromeProfiles.name
    })
    .from(chromeHistories)
    .leftJoin(users, eq(chromeHistories.userId, users.id))
    .leftJoin(customers, eq(chromeHistories.customerId, customers.id))
    .leftJoin(chromeProfiles, eq(chromeHistories.profileId, chromeProfiles.id))
    .orderBy(...orders)
    .limit(limit)
    .offset(offset);
  if (whereExpr) query.where(whereExpr);

  const items = await query;
  const lastId = items.length ? items[items.length - 1].id ?? null : null;
  const hasNext = items.length === limit;

  return c.json({
    success: true,
    data: items,
    page: { limit, lastId, hasNext, sortBy: responseSortKey, sortOrder: responseSortOrder },
  });
});

router.delete('/:id', requireAuth, requireManagement, async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  await db.delete(chromeHistories).where(eq(chromeHistories.id, id));
  return c.json({ success: true, message: 'History dihapus' });
});

export default router;
