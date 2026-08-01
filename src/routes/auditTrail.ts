import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { auditLogs, users, profiles } from '../db/schema';
import { requireAuthWithFallback } from '../middleware/auth';
import { logAuditEvent, getClientIp, getUserAgent } from '../utils/audit';

const router = new Hono();

router.use('*', requireAuthWithFallback);

/** requireAuth (hono/jwt) hanya mengisi jwtPayload, bukan c.get('userId'). */
function currentUserId(c: any): number | undefined {
  const sub = Number(c.get('jwtPayload')?.sub);
  return Number.isFinite(sub) ? sub : undefined;
}

// Frontend memakai action huruf kecil (soft_delete, status_change, ...),
// sementara audit_logs menyimpannya huruf besar. Petakan dua arah.
const ACTION_TO_DB: Record<string, string> = {
  create: 'CREATE',
  update: 'UPDATE',
  delete: 'DELETE',
  soft_delete: 'SOFT_DELETE',
  restore: 'RESTORE',
  status_change: 'STATUS_CHANGE',
};
const ACTION_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(ACTION_TO_DB).map(([k, v]) => [v, k])
);

const listQuery = z.object({
  productId: z.coerce.number().int().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  field: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const createPayload = z.object({
  productId: z.coerce.number().int(),
  productName: z.string().default(''),
  action: z.enum(['create', 'update', 'delete', 'soft_delete', 'restore', 'status_change']),
  field: z.string().optional(),
  oldValue: z.any().optional(),
  newValue: z.any().optional(),
  description: z.string().default(''),
});

/** Kolom JSON bisa kembali sebagai object atau string, tergantung driver. */
function asObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value as Record<string, any>;
}

/** Bentuk baris audit_logs jadi AuditTrailEntry yang diharapkan frontend. */
function toEntry(row: any) {
  const changes = asObject(row.log.changes);
  return {
    id: String(row.log.id),
    productId: row.log.entityId ?? 0,
    productName: changes.productName ?? '',
    action: ACTION_FROM_DB[row.log.action] ?? row.log.action.toLowerCase(),
    field: changes.field,
    oldValue: changes.oldValue,
    newValue: changes.newValue,
    userId: row.log.userId ? String(row.log.userId) : undefined,
    userName: row.profileName ?? row.username ?? undefined,
    userEmail: row.email ?? undefined,
    timestamp: row.log.createdAt,
    ipAddress: row.log.ipAddress ?? undefined,
    userAgent: row.log.userAgent ?? undefined,
    description: changes.description ?? '',
  };
}

router.get('/', zValidator('query', listQuery), async (c) => {
  const { productId, userId, action, startDate, endDate, page, limit } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const filters: SQL[] = [eq(auditLogs.entityType, 'product')];
  if (productId) filters.push(eq(auditLogs.entityId, productId));
  if (userId && /^\d+$/.test(userId)) filters.push(eq(auditLogs.userId, Number(userId)));
  if (action) filters.push(eq(auditLogs.action, ACTION_TO_DB[action] ?? action.toUpperCase()));
  if (startDate) {
    const d = new Date(startDate);
    if (!isNaN(d.getTime())) filters.push(gte(auditLogs.createdAt, d));
  }
  if (endDate) {
    const d = new Date(endDate);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      filters.push(lte(auditLogs.createdAt, d));
    }
  }

  const whereExpr = and(...filters);

  const rows = await db
    .select({
      log: auditLogs,
      username: users.username,
      email: users.email,
      profileName: profiles.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .leftJoin(profiles, eq(profiles.userId, auditLogs.userId))
    .where(whereExpr)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ value: sql<number>`count(*)` })
    .from(auditLogs)
    .where(whereExpr);

  const totalItems = Number(countRows[0]?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const items = rows.map(toEntry);

  return c.json({
    success: true,
    data: items,
    page: {
      limit,
      lastId: items.length ? Number(items[items.length - 1].id) : null,
      hasNext: offset + items.length < totalItems,
      currentPage: page,
      totalPages,
      totalItems,
    },
  });
});

router.post('/', zValidator('json', createPayload), async (c) => {
  const { productId, productName, action, field, oldValue, newValue, description } =
    c.req.valid('json');

  await logAuditEvent({
    userId: currentUserId(c),
    action: ACTION_TO_DB[action],
    entityType: 'product',
    entityId: productId,
    changes: { productName, field, oldValue, newValue, description },
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  const created = await db
    .select({
      log: auditLogs,
      username: users.username,
      email: users.email,
      profileName: profiles.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .leftJoin(profiles, eq(profiles.userId, auditLogs.userId))
    .where(and(eq(auditLogs.entityType, 'product'), eq(auditLogs.entityId, productId)))
    .orderBy(desc(auditLogs.id))
    .limit(1);

  return c.json({ success: true, data: created[0] ? toEntry(created[0]) : null }, 201);
});

export default router;
