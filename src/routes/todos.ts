import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import { db } from '../db/client';
import { todos, customers, customerProfiles, subscriptions, users, profiles } from '../db/schema';

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
  priority: z.coerce.number().int().optional(),
  type: z.coerce.number().int().optional(),
  sortBy: z
    .enum(['id', 'title', 'status', 'priority', 'type', 'startDate', 'dueDate', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const todoPayload = z.object({
  type: z.coerce.number().int().optional(),
  title: z.string().min(1),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  assignedTo: z.coerce.number().int().optional(),
  pic: z.coerce.number().int().optional(),
  scorecardId: z.coerce.number().int().optional(),
  scorecardDataId: z.coerce.number().int().optional(),
  meetingId: z.coerce.number().int().optional(),
  ticketIssueId: z.coerce.number().int().optional(),
  description: z.string().optional(),
  status: z.coerce.number().int().optional(),
  subTask: z.any().optional(),
  checklist: z.any().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.coerce.number().int().optional(),
  tags: z.string().optional(),
  platform: z.string().optional(),
  isRecurring: z.coerce.number().int().optional(),
  dataJson: z.any().optional(),
});

const updateTodoPayload = todoPayload.partial();

function formatRow(row: any) {
  return {
    ...row.todo,
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
      todo: todos,
      customer: customers,
      customerProfile: customerProfiles,
      subscription: subscriptions,
      assignee: assigneeUsers,
      assigneeProfile: assigneeProfiles,
    })
    .from(todos)
    .leftJoin(customers, eq(customers.id, todos.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .leftJoin(subscriptions, eq(subscriptions.id, todos.subscriptionId))
    .leftJoin(assigneeUsers, eq(assigneeUsers.id, todos.assignedTo))
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
    priority,
    type,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (q) filters.push(like(todos.title, `%${q}%`));
  if (customerId) filters.push(eq(todos.customerId, customerId));
  if (subscriptionId) filters.push(eq(todos.subscriptionId, subscriptionId));
  if (assignedTo) filters.push(eq(todos.assignedTo, assignedTo));
  if (status !== undefined) filters.push(eq(todos.status, status));
  if (priority !== undefined) filters.push(eq(todos.priority, priority));
  if (type !== undefined) filters.push(eq(todos.type, type));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: todos.id,
    title: todos.title,
    status: todos.status,
    priority: todos.priority,
    type: todos.type,
    startDate: todos.startDate,
    dueDate: todos.dueDate,
    createdAt: todos.createdAt,
    updatedAt: todos.updatedAt,
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
    .where(eq(todos.id, id))
    .limit(1);

  const item = rows[0] ? formatRow(rows[0]) : null;

  if (!item) {
    return c.json({ success: false, message: 'Todo tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: item });
});

router.post('/', zValidator('json', todoPayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(todos).values({
      type: payload.type ?? 3,
      title: payload.title,
      customerId: payload.customerId ?? null,
      subscriptionId: payload.subscriptionId ?? null,
      assignedTo: payload.assignedTo ?? null,
      pic: payload.pic ?? 0,
      scorecardId: payload.scorecardId ?? null,
      scorecardDataId: payload.scorecardDataId ?? null,
      meetingId: payload.meetingId ?? null,
      ticketIssueId: payload.ticketIssueId ?? null,
      description: payload.description ?? null,
      status: payload.status ?? 0,
      subTask: payload.subTask ?? null,
      checklist: payload.checklist ?? null,
      startDate: payload.startDate ?? null,
      dueDate: payload.dueDate ?? null,
      priority: payload.priority ?? 1,
      tags: payload.tags ?? null,
      platform: payload.platform ?? null,
      isRecurring: payload.isRecurring ?? 0,
      dataJson: payload.dataJson ?? null,
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await buildSelectQuery()
      .where(eq(todos.id, insertId))
      .limit(1);

    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat todo' }, 500);
  }
});

router.put('/:id', zValidator('json', updateTodoPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof todos.$inferInsert> = {};
  if (payload.type !== undefined) sets.type = payload.type;
  if (payload.title !== undefined) sets.title = payload.title;
  if (payload.customerId !== undefined) sets.customerId = payload.customerId ?? null;
  if (payload.subscriptionId !== undefined) sets.subscriptionId = payload.subscriptionId ?? null;
  if (payload.assignedTo !== undefined) sets.assignedTo = payload.assignedTo ?? null;
  if (payload.pic !== undefined) sets.pic = payload.pic;
  if (payload.scorecardId !== undefined) sets.scorecardId = payload.scorecardId ?? null;
  if (payload.scorecardDataId !== undefined) sets.scorecardDataId = payload.scorecardDataId ?? null;
  if (payload.meetingId !== undefined) sets.meetingId = payload.meetingId ?? null;
  if (payload.ticketIssueId !== undefined) sets.ticketIssueId = payload.ticketIssueId ?? null;
  if (payload.description !== undefined) sets.description = payload.description ?? null;
  if (payload.status !== undefined) sets.status = payload.status;
  if (payload.subTask !== undefined) sets.subTask = payload.subTask ?? null;
  if (payload.checklist !== undefined) sets.checklist = payload.checklist ?? null;
  if (payload.startDate !== undefined) sets.startDate = payload.startDate ?? null;
  if (payload.dueDate !== undefined) sets.dueDate = payload.dueDate ?? null;
  if (payload.priority !== undefined) sets.priority = payload.priority;
  if (payload.tags !== undefined) sets.tags = payload.tags ?? null;
  if (payload.platform !== undefined) sets.platform = payload.platform ?? null;
  if (payload.isRecurring !== undefined) sets.isRecurring = payload.isRecurring;
  if (payload.dataJson !== undefined) sets.dataJson = payload.dataJson ?? null;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(todos).set(sets).where(eq(todos.id, id));

    const updatedRows = await buildSelectQuery()
      .where(eq(todos.id, id))
      .limit(1);

    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update todo' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(todos).where(eq(todos.id, id));
  return c.json({ success: true, message: 'Todo dihapus' });
});

export default router;
