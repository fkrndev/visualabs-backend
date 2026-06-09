/**
 * Recurring Todo Generator
 *
 * Materialisasi occurrence (todo_repeat_histories) dari repeat_tasks yang aktif
 * dan sudah jatuh tempo (next_run_date <= hari ini, TZ Asia/Jakarta).
 *
 * Dijalankan cron harian, mis. `0 6 * * *` (06:00 WIB):
 *   bun run job:recurring-todos
 *
 * Sifat:
 *  - Catch-up: bila cron sempat mati, semua occurrence tertinggal dibuat sekaligus.
 *  - Idempoten: unique (repeat_task_id, occurrence_date) + onDuplicateKeyUpdate no-op
 *    → menjalankan ulang tidak membuat duplikat.
 */

import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { repeatTasks, todoRepeatHistories, todos } from '../db/schema';
import {
    REPEAT_STATUS,
    computeNextRun,
    todayJakarta,
    type RecurrenceRule,
} from '../utils/recurrence';

const MAX_CATCHUP = 1000; // backstop loop guard

function ruleFromRow(rt: typeof repeatTasks.$inferSelect): RecurrenceRule {
    return {
        type: rt.type,
        interval: rt.interval,
        byWeekday: rt.byWeekday,
        byMonthDay: rt.byMonthDay,
        byMonth: rt.byMonth,
        excludeWeekdays: rt.excludeWeekdays,
        startDate: rt.startDate ?? todayJakarta(),
        endDate: rt.endDate,
        maxOccurrences: rt.maxOccurrences,
    };
}

export interface RecurringGenResult {
    processed: number; // repeat task yang diproses
    created: number; // occurrence yang dipastikan ada
    completed: number; // repeat task yang selesai → dinonaktifkan
}

/**
 * Proses satu repeat task: catch-up materialisasi occurrence sampai `today`,
 * lalu update cursor/counter. Mengembalikan jumlah occurrence yang dibuat dan
 * apakah task dinonaktifkan (selesai).
 */
async function processOneTask(
    rt: typeof repeatTasks.$inferSelect,
    today: string
): Promise<{ created: number; completed: boolean }> {
    const [todo] = await db.select().from(todos).where(eq(todos.id, rt.todoId)).limit(1);

    if (!todo) {
        // template hilang → nonaktifkan agar tidak diproses lagi
        await db
            .update(repeatTasks)
            .set({ status: REPEAT_STATUS.INACTIVE, nextRunDate: null })
            .where(eq(repeatTasks.id, rt.id));
        return { created: 0, completed: true };
    }

    const rule = ruleFromRow(rt);
    let nextRun: string | null = rt.nextRunDate;
    let generatedCount = rt.generatedCount;
    let lastRunDate = rt.lastRunDate;
    let created = 0;
    let guard = 0;

    while (nextRun && nextRun <= today && guard < MAX_CATCHUP) {
        guard++;

        // stop bila batas occurrence tercapai
        if (rt.maxOccurrences != null && generatedCount >= rt.maxOccurrences) {
            nextRun = null;
            break;
        }

        await db
            .insert(todoRepeatHistories)
            .values({
                repeatTaskId: rt.id,
                occurrenceDate: nextRun,
                type: todo.type,
                title: todo.title,
                customerId: todo.customerId,
                subscriptionId: todo.subscriptionId,
                assignedTo: todo.assignedTo,
                pic: todo.pic,
                scorecardId: todo.scorecardId,
                scorecardDataId: todo.scorecardDataId,
                meetingId: todo.meetingId,
                ticketIssueId: todo.ticketIssueId,
                description: todo.description,
                status: 0, // occurrence baru = not started
                subTask: todo.subTask,
                checklist: todo.checklist,
                startDate: nextRun,
                dueDate: nextRun,
                priority: todo.priority,
                tags: todo.tags,
                platform: todo.platform,
                isRecurring: 1,
                dataJson: todo.dataJson,
            })
            // no-op saat occurrence sudah ada (idempoten)
            .onDuplicateKeyUpdate({ set: { occurrenceDate: nextRun } });

        created++;
        generatedCount++;
        lastRunDate = nextRun;
        nextRun = computeNextRun(rule, nextRun);
    }

    const completed = !nextRun;
    await db
        .update(repeatTasks)
        .set({
            generatedCount,
            lastRunDate,
            nextRunDate: nextRun,
            status: completed ? REPEAT_STATUS.INACTIVE : REPEAT_STATUS.ACTIVE,
        })
        .where(eq(repeatTasks.id, rt.id));

    return { created, completed };
}

/** Generate occurrence untuk SATU repeat task (dipakai route saat todo dibuat/diubah). */
export async function generateOccurrencesForTask(
    repeatTaskId: number,
    refDate?: string
): Promise<{ created: number; completed: boolean }> {
    const today = refDate ?? todayJakarta();
    const [rt] = await db
        .select()
        .from(repeatTasks)
        .where(eq(repeatTasks.id, repeatTaskId))
        .limit(1);
    if (!rt || rt.status !== REPEAT_STATUS.ACTIVE || !rt.nextRunDate) {
        return { created: 0, completed: false };
    }
    return processOneTask(rt, today);
}

export async function runRecurringTodoGeneration(refDate?: string): Promise<RecurringGenResult> {
    const today = refDate ?? todayJakarta();

    const tasks = await db
        .select()
        .from(repeatTasks)
        .where(
            and(
                eq(repeatTasks.status, REPEAT_STATUS.ACTIVE),
                isNotNull(repeatTasks.nextRunDate),
                lte(repeatTasks.nextRunDate, today)
            )
        );

    let created = 0;
    let completed = 0;

    for (const rt of tasks) {
        const res = await processOneTask(rt, today);
        created += res.created;
        if (res.completed) completed++;
    }

    const result: RecurringGenResult = {
        processed: tasks.length,
        created,
        completed,
    };
    console.log(
        `[RecurringTodos] ${today} → processed=${result.processed} created=${result.created} completed=${result.completed}`
    );
    return result;
}
