/**
 * Notification Reminders
 *
 * Mode B (terjadwal pendek) — meeting, todo deadline, ticket follow-up,
 * scorecard input due, scorecard alert.
 *
 * Dijalankan oleh beberapa cron schedule berbeda:
 *  - meetingReminders: cron `*\/15 * * * *` (tiap 15 menit)
 *  - todoTicketReminders: cron `0 9 * * *` (09:00 WIB)
 *  - scorecardReminders: cron `0 16 * * 5` + `0 9 * * 1` (Jumat 16:00 & Senin 09:00)
 */

import { and, eq, gte, isNotNull, lte, lt, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  meetings,
  meetingMembers,
  scorecardData,
  scorecards,
  ticketIssues,
  todos,
  users,
} from "../db/schema";
import { dispatchNotification } from "../services/notifyTelegram";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function nowWib(): Date {
  return new Date(Date.now() + WIB_OFFSET_MS);
}

function formatWibDateTime(d: Date): string {
  return new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

function formatWibDate(d: Date): string {
  return new Date(d).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ─────────────────────────────────────────────────────
// Meeting reminders: 24h / 1h / 15m before
// ─────────────────────────────────────────────────────

interface MeetingWindow {
  leadMinutes: number;
  notifCode: string;
  label: string;
}

const MEETING_WINDOWS: MeetingWindow[] = [
  { leadMinutes: 24 * 60, notifCode: "MEETING_REMINDER_24H", label: "H-1" },
  { leadMinutes: 60, notifCode: "MEETING_REMINDER_1H", label: "1 jam lagi" },
  { leadMinutes: 15, notifCode: "MEETING_REMINDER_15M", label: "15 menit lagi" },
];

const SLOT_WINDOW_MIN = 15; // toleransi cron 15 menit

export async function runMeetingReminders(): Promise<void> {
  const now = new Date();

  for (const w of MEETING_WINDOWS) {
    const targetStart = new Date(now.getTime() + w.leadMinutes * 60_000);
    const targetEnd = new Date(targetStart.getTime() + SLOT_WINDOW_MIN * 60_000);

    const rows = await db
      .select({
        id: meetings.id,
        title: meetings.title,
        date: meetings.date,
        description: meetings.description,
        assignedTo: meetings.assignedTo,
      })
      .from(meetings)
      .where(
        and(
          isNotNull(meetings.date),
          isNotNull(meetings.assignedTo),
          gte(meetings.date, targetStart),
          lt(meetings.date, targetEnd),
        ),
      );

    for (const m of rows) {
      if (!m.assignedTo || !m.date) continue;
      const dt = m.date;
      // Also include members
      const memberRows = await db
        .select({ userId: meetingMembers.userId })
        .from(meetingMembers)
        .where(eq(meetingMembers.meetingId, m.id));
      const recipients = new Set<number>([m.assignedTo, ...memberRows.map((r) => r.userId)]);

      for (const userId of recipients) {
        await dispatchNotification({
          userId,
          notifCode: w.notifCode,
          mode: "B",
          dedupeKey: `meeting_${m.id}:${w.leadMinutes}`,
          title: `🗓 Meeting ${w.label}: ${m.title}`,
          preview: `Mulai ${formatWibDateTime(dt)}`,
          buildMessage: () =>
            [
              `🗓 <b>Meeting Reminder (${w.label})</b>`,
              `📅 ${formatWibDateTime(dt)}`,
              "━━━━━━━━━━━━━━━━━━",
              `<b>${m.title}</b>`,
              m.description ? "" : "",
              m.description ?? "",
            ]
              .filter(Boolean)
              .join("\n"),
          defaultEnabled: w.leadMinutes !== 15, // 15m default OFF
        });
      }
    }
  }
}

// ─────────────────────────────────────────────────────
// Todo reminders: deadline H-1, overdue
// ─────────────────────────────────────────────────────

export async function runTodoReminders(): Promise<void> {
  const now = nowWib();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  // Deadline besok
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const dueRows = await db
    .select({
      id: todos.id,
      title: todos.title,
      assignedTo: todos.assignedTo,
      dueDate: todos.dueDate,
      status: todos.status,
    })
    .from(todos)
    .where(
      and(
        isNotNull(todos.assignedTo),
        ne(todos.status, 2),
        eq(todos.dueDate, tomorrowStr),
      ),
    );

  for (const t of dueRows) {
    if (!t.assignedTo) continue;
    await dispatchNotification({
      userId: t.assignedTo,
      notifCode: "TODO_DEADLINE",
      mode: "B",
      dedupeKey: `todo_${t.id}:${tomorrowStr}:h-1`,
      title: `⏰ Deadline besok: ${t.title}`,
      preview: `Jatuh tempo ${t.dueDate}`,
      buildMessage: () =>
        [
          "⏰ <b>Todo Deadline Besok</b>",
          `📅 Jatuh tempo: ${t.dueDate}`,
          "━━━━━━━━━━━━━━━━━━",
          `<b>${t.title}</b>`,
        ].join("\n"),
      defaultEnabled: true,
    });
  }

  // Overdue (dueDate < today, status != done)
  const overdueRows = await db
    .select({
      id: todos.id,
      title: todos.title,
      assignedTo: todos.assignedTo,
      dueDate: todos.dueDate,
      status: todos.status,
    })
    .from(todos)
    .where(
      and(
        isNotNull(todos.assignedTo),
        ne(todos.status, 2),
        isNotNull(todos.dueDate),
        lt(todos.dueDate, todayStr),
      ),
    );

  for (const t of overdueRows) {
    if (!t.assignedTo) continue;
    await dispatchNotification({
      userId: t.assignedTo,
      notifCode: "TODO_OVERDUE",
      mode: "B",
      dedupeKey: `todo_${t.id}:${todayStr}:overdue`,
      title: `⏰ Todo overdue: ${t.title}`,
      preview: `Sudah lewat deadline ${t.dueDate}`,
      buildMessage: () =>
        [
          "⏰ <b>Todo Overdue</b>",
          `📅 Deadline: ${t.dueDate} (lewat)`,
          "━━━━━━━━━━━━━━━━━━",
          `<b>${t.title}</b>`,
          "",
          "Tindak lanjuti atau ubah deadline-nya.",
        ].join("\n"),
      defaultEnabled: true,
    });
  }
}

// ─────────────────────────────────────────────────────
// Ticket follow-up: hold_since > N days, dengan N default 3
// ─────────────────────────────────────────────────────

export async function runTicketFollowupReminders(defaultDays = 3): Promise<void> {
  const cutoff = new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000);
  const todayStr = nowWib().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: ticketIssues.id,
      title: ticketIssues.title,
      assignedTo: ticketIssues.assignedTo,
      holdSince: ticketIssues.holdSince,
      pendingOn: ticketIssues.pendingOn,
    })
    .from(ticketIssues)
    .where(
      and(
        isNotNull(ticketIssues.assignedTo),
        isNotNull(ticketIssues.holdSince),
        lt(ticketIssues.holdSince, cutoff),
      ),
    );

  for (const t of rows) {
    if (!t.assignedTo || !t.holdSince) continue;
    const daysOld = Math.floor((Date.now() - new Date(t.holdSince).getTime()) / (24 * 60 * 60 * 1000));
    await dispatchNotification({
      userId: t.assignedTo,
      notifCode: "TICKET_FOLLOWUP",
      mode: "B",
      dedupeKey: `ticket_${t.id}:${todayStr}:followup`,
      title: `🎫 Ticket menunggu follow-up: ${t.title}`,
      preview: `Pending ${daysOld} hari`,
      buildMessage: () =>
        [
          "🎫 <b>Ticket Follow-up</b>",
          `📅 Pending sejak ${formatWibDate(t.holdSince!)} (${daysOld} hari)`,
          "━━━━━━━━━━━━━━━━━━",
          `<b>${t.title}</b>`,
        ].join("\n"),
      defaultEnabled: false, // opt-in
    });
  }
}

// ─────────────────────────────────────────────────────
// Scorecard input due (mingguan)
// ─────────────────────────────────────────────────────

export async function runScorecardInputReminders(): Promise<void> {
  const now = nowWib();
  const year = now.getUTCFullYear();
  // Hitung ISO week number
  const oneJan = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((now.getTime() - oneJan.getTime()) / 86400000 + oneJan.getUTCDay() + 1) / 7);
  const todayStr = now.toISOString().slice(0, 10);

  const cards = await db
    .select({
      id: scorecards.id,
      title: scorecards.title,
      assignedTo: scorecards.assignedTo,
    })
    .from(scorecards)
    .where(and(eq(scorecards.status, 1), isNotNull(scorecards.assignedTo)));

  for (const card of cards) {
    if (!card.assignedTo) continue;
    // cek apakah sudah ada data minggu ini
    const existing = await db
      .select({ id: scorecardData.id })
      .from(scorecardData)
      .where(
        and(
          eq(scorecardData.scorecardId, card.id),
          eq(scorecardData.year, year),
          eq(scorecardData.week, week),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;

    await dispatchNotification({
      userId: card.assignedTo,
      notifCode: "SCORECARD_INPUT_DUE",
      mode: "B",
      dedupeKey: `scorecard_${card.id}:${year}-w${week}`,
      title: `🎯 Scorecard belum diisi: ${card.title}`,
      preview: `Minggu ${week}/${year} belum ada data`,
      buildMessage: () =>
        [
          "🎯 <b>Scorecard Input Due</b>",
          `📅 Minggu ${week} tahun ${year}`,
          "━━━━━━━━━━━━━━━━━━",
          `<b>${card.title}</b>`,
          "",
          "Silakan input actual value-nya di dashboard.",
        ].join("\n"),
      defaultEnabled: true,
    });
  }
}

// ─────────────────────────────────────────────────────
// Scorecard alert: zona merah (status di bawah yellow)
// Dipanggil webhook setelah POST scorecard data, tapi disediakan juga
// sebagai polling untuk safety.
// ─────────────────────────────────────────────────────

export async function runScorecardAlertCheck(): Promise<void> {
  const now = nowWib();
  const todayStr = now.toISOString().slice(0, 10);

  // Ambil scorecard_data terbaru per scorecard yang status=red (status field
  // di scorecardData: 1=red default? actual schema: status default 1, color
  // tidak ada — pakai threshold yellow di scorecards).
  // Simple approach: cari data minggu ini di mana actual < target*(yellow_threshold/100).
  const rows = await db
    .select({
      id: scorecardData.id,
      scorecardId: scorecardData.scorecardId,
      actual: scorecardData.actualValue,
      target: scorecardData.targetValue,
      year: scorecardData.year,
      week: scorecardData.week,
      cardTitle: scorecards.title,
      cardAssigned: scorecards.assignedTo,
      yellowThreshold: scorecards.yellowThreshold,
      targetType: scorecards.targetType,
    })
    .from(scorecardData)
    .innerJoin(scorecards, eq(scorecardData.scorecardId, scorecards.id))
    .where(eq(scorecards.status, 1))
    .orderBy(sql`${scorecardData.updatedAt} desc`)
    .limit(200);

  for (const r of rows) {
    if (!r.cardAssigned || r.actual === null || r.target === null) continue;
    const actual = parseFloat(r.actual as any);
    const target = parseFloat(r.target as any);
    if (!Number.isFinite(actual) || !Number.isFinite(target) || target === 0) continue;
    const pct = (actual / target) * 100;
    const isRed = r.targetType === 1 ? pct > 100 + (100 - r.yellowThreshold) : pct < r.yellowThreshold;
    if (!isRed) continue;

    await dispatchNotification({
      userId: r.cardAssigned,
      notifCode: "SCORECARD_ALERT",
      mode: "B",
      dedupeKey: `scorecard_${r.scorecardId}:${r.year}-w${r.week}:red`,
      title: `🎯 Scorecard zona merah: ${r.cardTitle}`,
      preview: `Actual ${actual} vs target ${target} (${pct.toFixed(0)}%)`,
      buildMessage: () =>
        [
          "🎯 <b>Scorecard Alert</b>",
          `📅 Minggu ${r.week}/${r.year}`,
          "━━━━━━━━━━━━━━━━━━",
          `<b>${r.cardTitle}</b>`,
          `Actual: ${actual} · Target: ${target}`,
          `Pencapaian: ${pct.toFixed(0)}% (yellow threshold ${r.yellowThreshold}%)`,
        ].join("\n"),
      defaultEnabled: true,
    });
  }
}

// ─────────────────────────────────────────────────────
// Unified runner
// ─────────────────────────────────────────────────────

export async function runAllReminders(): Promise<void> {
  console.log("[Reminders] Start");
  await runMeetingReminders();
  await runTodoReminders();
  await runTicketFollowupReminders();
  await runScorecardInputReminders();
  await runScorecardAlertCheck();
  console.log("[Reminders] Done");
}

if (import.meta.main) {
  runAllReminders()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
