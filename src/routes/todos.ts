import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, inArray, like } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

import { db } from '../db/client';
import {
    todos,
    customers,
    customerProfiles,
    subscriptions,
    users,
    profiles,
    repeatTasks,
    todoRepeatHistories,
} from '../db/schema';
import {
    REPEAT_STATUS,
    computeFirstRun,
    todayJakarta,
    type RecurrenceRule,
} from '../utils/recurrence';
import { generateOccurrencesForTask } from '../jobs/recurringTodos';

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
        .enum([
            'id',
            'title',
            'status',
            'priority',
            'type',
            'startDate',
            'dueDate',
            'createdAt',
            'updatedAt',
        ])
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
    repeat: z
        .object({
            type: z.coerce.number().int().min(0).max(3),
            interval: z.coerce.number().int().min(1).default(1),
            byWeekday: z.coerce.number().int().min(0).max(6).optional(),
            byMonthDay: z.coerce.number().int().min(-1).max(31).optional(),
            byMonth: z.coerce.number().int().min(1).max(12).optional(),
            excludeWeekdays: z.array(z.coerce.number().int().min(0).max(6)).optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            maxOccurrences: z.coerce.number().int().min(1).optional(),
        })
        .optional(),
});

const updateTodoPayload = todoPayload.partial();

const repeatStandalonePayload = z.object({
    type: z.coerce.number().int().min(0).max(3),
    interval: z.coerce.number().int().min(1).default(1),
    byWeekday: z.coerce.number().int().min(0).max(6).optional(),
    byMonthDay: z.coerce.number().int().min(-1).max(31).optional(),
    byMonth: z.coerce.number().int().min(1).max(12).optional(),
    excludeWeekdays: z.array(z.coerce.number().int().min(0).max(6)).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    maxOccurrences: z.coerce.number().int().min(1).optional(),
});

type RepeatInput = z.infer<typeof repeatStandalonePayload>;

const occurrenceUpdatePayload = z.object({
    status: z.coerce.number().int().optional(),
    subTask: z.any().optional(),
    checklist: z.any().optional(),
    description: z.string().optional(),
    dueDate: z.string().optional(),
});

/**
 * Buat/perbarui aturan berulang untuk sebuah todo (satu repeat task per todo).
 * Mengembalikan id repeat task, atau null bila aturan tak valid.
 * Setelah upsert, langsung men-generate occurrence yang sudah jatuh tempo.
 */
async function upsertRepeatForTodo(todoId: number, p: RepeatInput): Promise<number | null> {
    const startDate = p.startDate || todayJakarta();
    // exclude hanya relevan untuk harian; buang duplikat & jaga jangan sampai 7 hari penuh
    let excludeWeekdays: number[] | null = null;
    if (p.type === 0 && p.excludeWeekdays && p.excludeWeekdays.length) {
        const uniq = [...new Set(p.excludeWeekdays)].filter((d) => d >= 0 && d <= 6);
        excludeWeekdays = uniq.length >= 7 ? uniq.slice(0, 6) : uniq.length ? uniq : null;
    }
    const rule: RecurrenceRule = {
        type: p.type,
        interval: p.interval ?? 1,
        byWeekday: p.byWeekday ?? null,
        byMonthDay: p.byMonthDay ?? null,
        byMonth: p.byMonth ?? null,
        excludeWeekdays,
        startDate,
        endDate: p.endDate ?? null,
        maxOccurrences: p.maxOccurrences ?? null,
    };
    const firstRun = computeFirstRun(rule);

    const values = {
        todoId,
        type: rule.type,
        status: REPEAT_STATUS.ACTIVE,
        interval: rule.interval,
        byWeekday: rule.byWeekday,
        byMonthDay: rule.byMonthDay,
        byMonth: rule.byMonth,
        excludeWeekdays,
        startDate: rule.startDate,
        endDate: rule.endDate,
        maxOccurrences: rule.maxOccurrences,
        nextRunDate: firstRun,
    };

    const [existing] = await db
        .select()
        .from(repeatTasks)
        .where(eq(repeatTasks.todoId, todoId))
        .limit(1);

    let repeatTaskId: number;
    if (existing) {
        await db.update(repeatTasks).set(values).where(eq(repeatTasks.id, existing.id));
        repeatTaskId = existing.id;
    } else {
        const [ins] = await db.insert(repeatTasks).values(values);
        repeatTaskId = Number(ins.insertId);
    }

    await db.update(todos).set({ isRecurring: 1 }).where(eq(todos.id, todoId));

    // generate occurrence yang sudah jatuh tempo (mis. firstRun = hari ini)
    await generateOccurrencesForTask(repeatTaskId);
    return repeatTaskId;
}

/** Nonaktifkan rekurensi sebuah todo (occurrence lama tetap ada). */
async function deactivateRepeatForTodo(todoId: number): Promise<void> {
    await db
        .update(repeatTasks)
        .set({ status: REPEAT_STATUS.INACTIVE, nextRunDate: null })
        .where(eq(repeatTasks.todoId, todoId));
    await db.update(todos).set({ isRecurring: 0 }).where(eq(todos.id, todoId));
}

function formatRow(row: any) {
    return {
        ...row.todo,
        customer: row.customer ? { ...row.customer, profile: row.customerProfile ?? null } : null,
        subscription: row.subscription ?? null,
        assignee: row.assignee ? { ...row.assignee, profile: row.assigneeProfile ?? null } : null,
    };
}

// Lampirkan repeat task aktif (1 per todo) ke daftar item tanpa join (hindari duplikat row).
async function attachActiveRepeat(items: any[]) {
    const ids = items.map((i) => i.id).filter((x): x is number => x != null);
    if (!ids.length) return;
    const reps = await db
        .select()
        .from(repeatTasks)
        .where(and(inArray(repeatTasks.todoId, ids), eq(repeatTasks.status, REPEAT_STATUS.ACTIVE)));
    const map = new Map(reps.map((r) => [r.todoId, r]));
    for (const it of items) it.repeat = map.get(it.id) ?? null;
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
    await attachActiveRepeat(items);

    const lastId = items.length ? (items[items.length - 1].id ?? null) : null;
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

    const rows = await buildSelectQuery().where(eq(todos.id, id)).limit(1);

    const item = rows[0] ? formatRow(rows[0]) : null;

    if (!item) {
        return c.json({ success: false, message: 'Todo tidak ditemukan' }, 404);
    }

    // lampirkan aturan repeat (prioritas yang aktif)
    const reps = await db
        .select()
        .from(repeatTasks)
        .where(eq(repeatTasks.todoId, id))
        .orderBy(asc(repeatTasks.status), desc(repeatTasks.id));
    item.repeat = reps[0] ?? null;

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

        // Jika berulang + ada aturan repeat → buat repeat task + generate occurrence pertama
        if (payload.isRecurring === 1 && payload.repeat) {
            await upsertRepeatForTodo(insertId, payload.repeat);
        }

        const createdRows = await buildSelectQuery().where(eq(todos.id, insertId)).limit(1);

        const created = createdRows[0] ? formatRow(createdRows[0]) : null;
        if (created) {
            const [rep] = await db
                .select()
                .from(repeatTasks)
                .where(eq(repeatTasks.todoId, insertId))
                .orderBy(asc(repeatTasks.status), desc(repeatTasks.id));
            created.repeat = rep ?? null;
        }

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
    if (payload.scorecardDataId !== undefined)
        sets.scorecardDataId = payload.scorecardDataId ?? null;
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

    const hasRepeatChange = payload.repeat !== undefined || payload.isRecurring !== undefined;
    if (!Object.keys(sets).length && !hasRepeatChange) {
        return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
    }

    try {
        if (Object.keys(sets).length) {
            await db.update(todos).set(sets).where(eq(todos.id, id));
        }

        // Sinkronisasi aturan berulang
        if (payload.isRecurring === 0) {
            await deactivateRepeatForTodo(id);
        } else if (payload.repeat) {
            await upsertRepeatForTodo(id, payload.repeat);
        }

        const updatedRows = await buildSelectQuery().where(eq(todos.id, id)).limit(1);

        const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;
        if (updated) {
            const [rep] = await db
                .select()
                .from(repeatTasks)
                .where(eq(repeatTasks.todoId, id))
                .orderBy(asc(repeatTasks.status), desc(repeatTasks.id));
            updated.repeat = rep ?? null;
        }

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

// ─── Recurring: aturan repeat per-todo ──────────────────────────────────

// Lihat aturan berulang sebuah todo
router.get('/:id/repeat', async (c) => {
    const id = Number(c.req.param('id'));
    if (Number.isNaN(id)) {
        return c.json({ success: false, message: 'ID tidak valid' }, 400);
    }
    const [rep] = await db
        .select()
        .from(repeatTasks)
        .where(eq(repeatTasks.todoId, id))
        .orderBy(asc(repeatTasks.status), desc(repeatTasks.id));
    return c.json({ success: true, data: rep ?? null });
});

// Atur / ubah aturan berulang (membuat bila belum ada)
router.put('/:id/repeat', zValidator('json', repeatStandalonePayload), async (c) => {
    const id = Number(c.req.param('id'));
    if (Number.isNaN(id)) {
        return c.json({ success: false, message: 'ID tidak valid' }, 400);
    }
    const [todo] = await db.select().from(todos).where(eq(todos.id, id)).limit(1);
    if (!todo) {
        return c.json({ success: false, message: 'Todo tidak ditemukan' }, 404);
    }
    try {
        const repeatTaskId = await upsertRepeatForTodo(id, c.req.valid('json'));
        const [rep] = await db
            .select()
            .from(repeatTasks)
            .where(eq(repeatTasks.id, repeatTaskId!))
            .limit(1);
        return c.json({ success: true, data: rep ?? null });
    } catch (error: any) {
        console.error(error);
        return c.json({ success: false, message: 'Gagal mengatur pengulangan' }, 500);
    }
});

// Hentikan pengulangan (occurrence lama tetap ada)
router.delete('/:id/repeat', async (c) => {
    const id = Number(c.req.param('id'));
    if (Number.isNaN(id)) {
        return c.json({ success: false, message: 'ID tidak valid' }, 400);
    }
    await deactivateRepeatForTodo(id);
    return c.json({ success: true, message: 'Pengulangan dihentikan' });
});

// ─── Recurring: occurrences (todo_repeat_histories) ─────────────────────

// List occurrence untuk sebuah todo
router.get('/:id/occurrences', zValidator('query', paginationQuery), async (c) => {
    const id = Number(c.req.param('id'));
    if (Number.isNaN(id)) {
        return c.json({ success: false, message: 'ID tidak valid' }, 400);
    }
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    // repeat task milik todo ini
    const reps = await db
        .select({ id: repeatTasks.id })
        .from(repeatTasks)
        .where(eq(repeatTasks.todoId, id));
    const repeatIds = reps.map((r) => r.id);
    if (!repeatIds.length) {
        return c.json({ success: true, data: [], page: { limit, hasNext: false } });
    }

    const items = await db
        .select()
        .from(todoRepeatHistories)
        .where(inArray(todoRepeatHistories.repeatTaskId, repeatIds))
        .orderBy(desc(todoRepeatHistories.occurrenceDate), desc(todoRepeatHistories.id))
        .limit(limit)
        .offset(offset);

    const hasNext = items.length === limit;
    return c.json({ success: true, data: items, page: { limit, hasNext } });
});

// Update satu occurrence (centang selesai, ubah status/checklist, dst)
router.put('/occurrences/:occId', zValidator('json', occurrenceUpdatePayload), async (c) => {
    const occId = Number(c.req.param('occId'));
    if (Number.isNaN(occId)) {
        return c.json({ success: false, message: 'ID tidak valid' }, 400);
    }
    const payload = c.req.valid('json');

    const sets: Partial<typeof todoRepeatHistories.$inferInsert> = {};
    if (payload.status !== undefined) sets.status = payload.status;
    if (payload.subTask !== undefined) sets.subTask = payload.subTask ?? null;
    if (payload.checklist !== undefined) sets.checklist = payload.checklist ?? null;
    if (payload.description !== undefined) sets.description = payload.description ?? null;
    if (payload.dueDate !== undefined) sets.dueDate = payload.dueDate ?? null;

    if (!Object.keys(sets).length) {
        return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
    }

    await db.update(todoRepeatHistories).set(sets).where(eq(todoRepeatHistories.id, occId));
    const [updated] = await db
        .select()
        .from(todoRepeatHistories)
        .where(eq(todoRepeatHistories.id, occId))
        .limit(1);
    if (!updated) {
        return c.json({ success: false, message: 'Occurrence tidak ditemukan' }, 404);
    }
    return c.json({ success: true, data: updated });
});

export default router;
