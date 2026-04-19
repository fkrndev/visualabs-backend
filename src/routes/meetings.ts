import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, like, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import { db } from '../db/client';
import { meetings, meetingMembers, customers, customerProfiles, subscriptions, users, profiles } from '../db/schema';

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
  type: z.coerce.number().int().optional(),
  sortBy: z
    .enum(['id', 'title', 'date', 'type', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const meetingPayload = z.object({
  title: z.string().min(1),
  type: z.coerce.number().int().optional(),
  date: z.string().optional(),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  assignedTo: z.coerce.number().int().optional(),
  members: z.string().optional(),
  description: z.string().optional(),
  summary: z.any().optional(),
  actionItems: z.any().optional(),
  checklist: z.any().optional(),
  newTarget: z.any().optional(),
  newKpi: z.any().optional(),
  dataJson: z.any().optional(),
});

const updateMeetingPayload = meetingPayload.partial();

function formatRow(row: any) {
  return {
    ...row.meeting,
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
      meeting: meetings,
      customer: customers,
      customerProfile: customerProfiles,
      subscription: subscriptions,
      assignee: assigneeUsers,
      assigneeProfile: assigneeProfiles,
    })
    .from(meetings)
    .leftJoin(customers, eq(customers.id, meetings.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .leftJoin(subscriptions, eq(subscriptions.id, meetings.subscriptionId))
    .leftJoin(assigneeUsers, eq(assigneeUsers.id, meetings.assignedTo))
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
    type,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (q) filters.push(like(meetings.title, `%${q}%`));
  if (customerId) filters.push(eq(meetings.customerId, customerId));
  if (subscriptionId) filters.push(eq(meetings.subscriptionId, subscriptionId));
  if (assignedTo) filters.push(eq(meetings.assignedTo, assignedTo));
  if (type !== undefined) filters.push(eq(meetings.type, type));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: meetings.id,
    title: meetings.title,
    date: meetings.date,
    type: meetings.type,
    createdAt: meetings.createdAt,
    updatedAt: meetings.updatedAt,
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
    .where(eq(meetings.id, id))
    .limit(1);

  const item = rows[0] ? formatRow(rows[0]) : null;

  if (!item) {
    return c.json({ success: false, message: 'Meeting tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: item });
});

router.post('/', zValidator('json', meetingPayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(meetings).values({
      title: payload.title,
      type: payload.type ?? 0,
      date: payload.date ?? null,
      customerId: payload.customerId ?? null,
      subscriptionId: payload.subscriptionId ?? null,
      assignedTo: payload.assignedTo ?? null,
      members: payload.members ?? null,
      description: payload.description ?? null,
      summary: payload.summary ?? null,
      actionItems: payload.actionItems ?? null,
      checklist: payload.checklist ?? null,
      newTarget: payload.newTarget ?? null,
      newKpi: payload.newKpi ?? null,
      dataJson: payload.dataJson ?? null,
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await buildSelectQuery()
      .where(eq(meetings.id, insertId))
      .limit(1);

    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat meeting' }, 500);
  }
});

router.put('/:id', zValidator('json', updateMeetingPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof meetings.$inferInsert> = {};
  if (payload.title !== undefined) sets.title = payload.title;
  if (payload.type !== undefined) sets.type = payload.type;
  if (payload.date !== undefined) sets.date = payload.date ?? null;
  if (payload.customerId !== undefined) sets.customerId = payload.customerId ?? null;
  if (payload.subscriptionId !== undefined) sets.subscriptionId = payload.subscriptionId ?? null;
  if (payload.assignedTo !== undefined) sets.assignedTo = payload.assignedTo ?? null;
  if (payload.members !== undefined) sets.members = payload.members ?? null;
  if (payload.description !== undefined) sets.description = payload.description ?? null;
  if (payload.summary !== undefined) sets.summary = payload.summary ?? null;
  if (payload.actionItems !== undefined) sets.actionItems = payload.actionItems ?? null;
  if (payload.checklist !== undefined) sets.checklist = payload.checklist ?? null;
  if (payload.newTarget !== undefined) sets.newTarget = payload.newTarget ?? null;
  if (payload.newKpi !== undefined) sets.newKpi = payload.newKpi ?? null;
  if (payload.dataJson !== undefined) sets.dataJson = payload.dataJson ?? null;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(meetings).set(sets).where(eq(meetings.id, id));

    const updatedRows = await buildSelectQuery()
      .where(eq(meetings.id, id))
      .limit(1);

    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update meeting' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(meetings).where(eq(meetings.id, id));
  return c.json({ success: true, message: 'Meeting dihapus' });
});

// ─── Meeting Members ─────────────────────────────────────────────────

// GET /:id/members — list members of a meeting
router.get('/:id/members', async (c) => {
  const meetingId = Number(c.req.param('id'));
  if (Number.isNaN(meetingId)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const rows = await db
    .select({ member: meetingMembers, user: users, profile: profiles })
    .from(meetingMembers)
    .leftJoin(users, eq(users.id, meetingMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(meetingMembers.meetingId, meetingId));

  const data = rows.map((r) => ({
    ...r.member,
    user: r.user ? { ...r.user, profile: r.profile ?? null } : null,
  }));

  return c.json({ success: true, data });
});

// PUT /:id/members — sync members (replace all)
const syncMembersPayload = z.object({
  userIds: z.array(z.coerce.number().int()),
});

router.put('/:id/members', zValidator('json', syncMembersPayload), async (c) => {
  const meetingId = Number(c.req.param('id'));
  if (Number.isNaN(meetingId)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const { userIds } = c.req.valid('json');

  // Delete existing members
  await db.delete(meetingMembers).where(eq(meetingMembers.meetingId, meetingId));

  // Insert new members
  if (userIds.length > 0) {
    await db.insert(meetingMembers).values(
      userIds.map((userId) => ({ meetingId, userId }))
    );
  }

  // Return updated list
  const rows = await db
    .select({ member: meetingMembers, user: users, profile: profiles })
    .from(meetingMembers)
    .leftJoin(users, eq(users.id, meetingMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(meetingMembers.meetingId, meetingId));

  const data = rows.map((r) => ({
    ...r.member,
    user: r.user ? { ...r.user, profile: r.profile ?? null } : null,
  }));

  return c.json({ success: true, data });
});

export default router;
