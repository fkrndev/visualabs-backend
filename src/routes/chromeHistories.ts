import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { chromeHistories, chromeProfiles, chromeVisitEvents } from '../db/schema';

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  profileId: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
  sortBy: z.enum(['id', 'url', 'count', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const trackPayload = z.object({
  browserUuid: z.string().min(1),
  url: z.string().url().min(1),
  title: z.string().optional(),
  durationMs: z.coerce.number().int().min(0).optional(),
});

// POST /track — dipanggil extension setiap URL berubah
router.post('/track', zValidator('json', trackPayload), async (c) => {
  const { browserUuid, url, title, durationMs } = c.req.valid('json');

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

// GET / — list histories
router.get('/', zValidator('query', paginationQuery), async (c) => {
  const { page, limit, profileId, q, sortBy: sortByParam, sortOrder: sortOrderParam } =
    c.req.valid('query');

  const offset = (page - 1) * limit;
  const filters = [] as any[];

  if (profileId) filters.push(eq(chromeHistories.profileId, profileId));
  if (q) filters.push(like(chromeHistories.url, `%${q}%`));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: chromeHistories.id,
    url: chromeHistories.url,
    count: chromeHistories.count,
    createdAt: chromeHistories.createdAt,
    updatedAt: chromeHistories.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') orders.push(asc(sortMap.id));

  const query = db.select().from(chromeHistories).orderBy(...orders).limit(limit).offset(offset);
  if (whereExpr) query.where(whereExpr);

  const items = await query;
  const lastId = items.length ? items[items.length - 1].id ?? null : null;
  const hasNext = items.length === limit;

  return c.json({
    success: true,
    data: items,
    page: { limit, lastId, hasNext, sortBy: sortKey, sortOrder },
  });
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  await db.delete(chromeHistories).where(eq(chromeHistories.id, id));
  return c.json({ success: true, message: 'History dihapus' });
});

export default router;
