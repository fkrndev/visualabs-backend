import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import { db } from '../db/client';
import { ticketIssues, customers, customerProfiles, subscriptions, users, profiles } from '../db/schema';

const router = new Hono();

const assigneeUsers = alias(users, 'assigneeUsers');
const assigneeProfiles = alias(profiles, 'assigneeProfiles');

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  assignedTo: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
  pendingOn: z.coerce.number().int().optional(),
  sortBy: z
    .enum(['id', 'title', 'status', 'pendingOn', 'holdSince', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const ticketIssuePayload = z.object({
  title: z.string().min(1),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  assignedTo: z.coerce.number().int().optional(),
  description: z.string().optional(),
  status: z.coerce.number().int().default(0),
  pendingOn: z.coerce.number().int().default(0),
  holdSince: z.string().optional(),
  dataJson: z.record(z.unknown()).optional(),
});

const updateTicketIssuePayload = ticketIssuePayload.partial();

function formatRow(row: any) {
  return {
    ...row.ticketIssue,
    customer: row.customer
      ? { ...row.customer, profile: row.customerProfile ?? null }
      : null,
    subscription: row.subscription ?? null,
    assignee: row.assignee
      ? { ...row.assignee, profile: row.assigneeProfile ?? null }
      : null,
  };
}

function buildSelectQuery() {
  return db
    .select({
      ticketIssue: ticketIssues,
      customer: customers,
      customerProfile: customerProfiles,
      subscription: subscriptions,
      assignee: assigneeUsers,
      assigneeProfile: assigneeProfiles,
    })
    .from(ticketIssues)
    .leftJoin(customers, eq(customers.id, ticketIssues.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .leftJoin(subscriptions, eq(subscriptions.id, ticketIssues.subscriptionId))
    .leftJoin(assigneeUsers, eq(assigneeUsers.id, ticketIssues.assignedTo))
    .leftJoin(assigneeProfiles, eq(assigneeProfiles.userId, assigneeUsers.id));
}

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    q,
    customerId,
    subscriptionId,
    assignedTo,
    status,
    pendingOn,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (q) filters.push(like(ticketIssues.title, `%${q}%`));
  if (customerId) filters.push(eq(ticketIssues.customerId, customerId));
  if (subscriptionId) filters.push(eq(ticketIssues.subscriptionId, subscriptionId));
  if (assignedTo) filters.push(eq(ticketIssues.assignedTo, assignedTo));
  if (status !== undefined) filters.push(eq(ticketIssues.status, status));
  if (pendingOn !== undefined) filters.push(eq(ticketIssues.pendingOn, pendingOn));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: ticketIssues.id,
    title: ticketIssues.title,
    status: ticketIssues.status,
    pendingOn: ticketIssues.pendingOn,
    holdSince: ticketIssues.holdSince,
    createdAt: ticketIssues.createdAt,
    updatedAt: ticketIssues.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const query = buildSelectQuery()
    .orderBy(...orders)
    .limit(limit)
    .offset(offset);

  if (whereExpr) {
    query.where(whereExpr);
  }

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
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const rows = await buildSelectQuery()
    .where(eq(ticketIssues.id, id))
    .limit(1);

  const item = rows[0] ? formatRow(rows[0]) : null;

  if (!item) {
    return c.json({ success: false, message: 'Ticket issue tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: item });
});

router.post('/', zValidator('json', ticketIssuePayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(ticketIssues).values({
      title: payload.title,
      customerId: payload.customerId ?? null,
      subscriptionId: payload.subscriptionId ?? null,
      assignedTo: payload.assignedTo ?? null,
      description: payload.description ?? null,
      status: payload.status ?? 0,
      pendingOn: payload.pendingOn ?? 0,
      holdSince: new Date(),
      dataJson: payload.dataJson ?? null,
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await buildSelectQuery()
      .where(eq(ticketIssues.id, insertId))
      .limit(1);

    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat ticket issue' }, 500);
  }
});

router.put('/:id', zValidator('json', updateTicketIssuePayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof ticketIssues.$inferInsert> = {};
  if (payload.title !== undefined) sets.title = payload.title;
  if (payload.customerId !== undefined) sets.customerId = payload.customerId ?? null;
  if (payload.subscriptionId !== undefined) sets.subscriptionId = payload.subscriptionId ?? null;
  if (payload.assignedTo !== undefined) sets.assignedTo = payload.assignedTo ?? null;
  if (payload.description !== undefined) sets.description = payload.description ?? null;
  if (payload.status !== undefined) sets.status = payload.status;
  if (payload.pendingOn !== undefined) {
    sets.pendingOn = payload.pendingOn;
    sets.holdSince = new Date();
  }
  if (payload.dataJson !== undefined) sets.dataJson = payload.dataJson ?? null;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(ticketIssues).set(sets).where(eq(ticketIssues.id, id));

    const updatedRows = await buildSelectQuery()
      .where(eq(ticketIssues.id, id))
      .limit(1);

    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update ticket issue' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(ticketIssues).where(eq(ticketIssues.id, id));
  return c.json({ success: true, message: 'Ticket issue dihapus' });
});

export default router;
