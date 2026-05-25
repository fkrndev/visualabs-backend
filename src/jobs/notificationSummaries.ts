/**
 * Notification Summaries
 *
 * Mode C (summary periodik):
 *  - WEEKLY_SUMMARY  (cron "0 8 * * 1" — Senin 08:00 WIB)
 *  - MONTHLY_SUMMARY (cron "0 9 1 * *" — Tanggal 1 jam 09:00 WIB)
 *  - SPEND_SPIKE / RESULT_DROP / ZERO_SPEND / ROAS_MILESTONE
 *    (dipanggil di akhir daily report dengan data 7 hari & insight harian)
 */

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  fbAct,
  fbActDailyData,
  fbActResultBreakdownDaily,
  fbToken,
  notificationPreferences,
  users,
} from "../db/schema";
import { dispatchNotification } from "../services/notifyTelegram";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function nowWib(): Date {
  return new Date(Date.now() + WIB_OFFSET_MS);
}

function fmtIdr(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface AcctRow {
  id: number;
  actId: string;
  actName: string | null;
  name: string | null;
  userId: number;
}

async function listActiveAccounts(): Promise<AcctRow[]> {
  return db
    .select({
      id: fbAct.id,
      actId: fbAct.actId,
      actName: fbAct.actName,
      name: fbAct.name,
      userId: fbToken.userId,
    })
    .from(fbAct)
    .innerJoin(fbToken, eq(fbAct.tokenId, fbToken.id))
    .where(eq(fbToken.status, 1));
}

interface DailyRow {
  date: string;
  spend: number;
  linkClicks: number;
}

async function getDailySeries(fbActId: number, from: string, to: string): Promise<DailyRow[]> {
  const rows = await db
    .select({
      date: fbActDailyData.date,
      spend: fbActDailyData.spend,
      linkClicks: fbActDailyData.linkClicks,
    })
    .from(fbActDailyData)
    .where(
      and(
        eq(fbActDailyData.fbActId, fbActId),
        gte(fbActDailyData.date, from),
        lte(fbActDailyData.date, to),
      ),
    )
    .orderBy(fbActDailyData.date);

  return rows.map((r) => ({
    date: String(r.date),
    spend: parseFloat((r.spend as any) ?? "0"),
    linkClicks: r.linkClicks ?? 0,
  }));
}

async function getResultTotal(fbActId: number, from: string, to: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${fbActResultBreakdownDaily.results}), 0)` })
    .from(fbActResultBreakdownDaily)
    .where(
      and(
        eq(fbActResultBreakdownDaily.fbActId, fbActId),
        gte(fbActResultBreakdownDaily.date, from),
        lte(fbActResultBreakdownDaily.date, to),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

// ─────────────────────────────────────────────────────
// Weekly Summary
// ─────────────────────────────────────────────────────

export async function runWeeklySummary(): Promise<void> {
  const now = nowWib();
  const endDate = new Date(now.getTime() - ONE_DAY);
  const startDate = new Date(endDate.getTime() - 6 * ONE_DAY);
  const from = dateStr(startDate);
  const to = dateStr(endDate);

  const accounts = await listActiveAccounts();
  for (const acc of accounts) {
    const accountName = acc.name ?? acc.actName ?? acc.actId;
    const series = await getDailySeries(acc.id, from, to);
    const totalSpend = series.reduce((s, r) => s + r.spend, 0);
    const totalClicks = series.reduce((s, r) => s + r.linkClicks, 0);
    const totalResults = await getResultTotal(acc.id, from, to);
    const cpr = totalResults > 0 ? totalSpend / totalResults : 0;

    await dispatchNotification({
      userId: acc.userId,
      fbActId: acc.id,
      notifCode: "WEEKLY_SUMMARY",
      mode: "C",
      dedupeKey: `act_${acc.id}:weekly:${from}`,
      title: `📈 Weekly Summary — ${accountName}`,
      preview: `${fmtIdr(totalSpend)} · ${totalResults} result · CPR ${fmtIdr(cpr)}`,
      buildMessage: () =>
        [
          "📈 <b>Weekly Summary</b>",
          `📅 ${from} → ${to}`,
          "━━━━━━━━━━━━━━━━━━",
          `🏢 ${accountName}`,
          `💸 Total Spent: ${fmtIdr(totalSpend)}`,
          `🖱 Link Clicks: ${totalClicks.toLocaleString("id-ID")}`,
          `✅ Total Result: ${totalResults.toLocaleString("id-ID")}`,
          `💵 CPR: ${cpr > 0 ? fmtIdr(cpr) : "N/A"}`,
        ].join("\n"),
      defaultEnabled: false,
    });
  }
}

// ─────────────────────────────────────────────────────
// Monthly Summary
// ─────────────────────────────────────────────────────

export async function runMonthlySummary(): Promise<void> {
  const now = nowWib();
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - ONE_DAY);
  const firstOfPrevMonth = new Date(
    Date.UTC(lastOfPrevMonth.getUTCFullYear(), lastOfPrevMonth.getUTCMonth(), 1),
  );
  const from = dateStr(firstOfPrevMonth);
  const to = dateStr(lastOfPrevMonth);

  // Bandingkan vs bulan sebelum-sebelumnya
  const prevToLast = new Date(firstOfPrevMonth.getTime() - ONE_DAY);
  const prevFrom = dateStr(new Date(Date.UTC(prevToLast.getUTCFullYear(), prevToLast.getUTCMonth(), 1)));
  const prevTo = dateStr(prevToLast);

  const accounts = await listActiveAccounts();
  for (const acc of accounts) {
    const accountName = acc.name ?? acc.actName ?? acc.actId;
    const cur = await getDailySeries(acc.id, from, to);
    const prev = await getDailySeries(acc.id, prevFrom, prevTo);
    const totalSpendCur = cur.reduce((s, r) => s + r.spend, 0);
    const totalSpendPrev = prev.reduce((s, r) => s + r.spend, 0);
    const totalResultsCur = await getResultTotal(acc.id, from, to);
    const totalResultsPrev = await getResultTotal(acc.id, prevFrom, prevTo);
    const cprCur = totalResultsCur > 0 ? totalSpendCur / totalResultsCur : 0;
    const deltaSpend = totalSpendPrev > 0 ? ((totalSpendCur - totalSpendPrev) / totalSpendPrev) * 100 : 0;

    await dispatchNotification({
      userId: acc.userId,
      fbActId: acc.id,
      notifCode: "MONTHLY_SUMMARY",
      mode: "C",
      dedupeKey: `act_${acc.id}:monthly:${from}`,
      title: `📈 Monthly Summary — ${accountName}`,
      preview: `${fmtIdr(totalSpendCur)} · ${totalResultsCur} result · Δ ${deltaSpend.toFixed(0)}% vs bulan lalu`,
      buildMessage: () =>
        [
          "📈 <b>Monthly Summary</b>",
          `📅 ${from} → ${to}`,
          "━━━━━━━━━━━━━━━━━━",
          `🏢 ${accountName}`,
          `💸 Total Spent: ${fmtIdr(totalSpendCur)}  (Δ ${deltaSpend > 0 ? "+" : ""}${deltaSpend.toFixed(1)}%)`,
          `✅ Total Result: ${totalResultsCur.toLocaleString("id-ID")} (sebelumnya ${totalResultsPrev.toLocaleString("id-ID")})`,
          `💵 CPR: ${cprCur > 0 ? fmtIdr(cprCur) : "N/A"}`,
        ].join("\n"),
      defaultEnabled: false,
    });
  }
}

// ─────────────────────────────────────────────────────
// Anomaly detection (dipanggil setelah daily report selesai untuk
// satu akun. Public agar bisa dipanggil dari metaAdsDailyReport.)
// ─────────────────────────────────────────────────────

export interface AnomalyContext {
  fbActId: number;
  userId: number;
  accountName: string;
  yesterdayStr: string;
  spendYesterday: number;
  resultsYesterday: number;
  purchaseRoas?: number | null;
}

export async function detectAndNotifyAnomalies(ctx: AnomalyContext): Promise<void> {
  // Cek 7 hari ke belakang (selain yesterday)
  const endPrev = new Date(new Date(ctx.yesterdayStr).getTime() - ONE_DAY);
  const startPrev = new Date(endPrev.getTime() - 6 * ONE_DAY);
  const fromPrev = dateStr(startPrev);
  const toPrev = dateStr(endPrev);

  const series = await getDailySeries(ctx.fbActId, fromPrev, toPrev);
  if (series.length === 0) return;
  const avgSpend = series.reduce((s, r) => s + r.spend, 0) / series.length;

  // Get user preference threshold (default 50%)
  const prefRow = await db
    .select({ dataJson: notificationPreferences.dataJson })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, ctx.userId),
        eq(notificationPreferences.notifCode, "SPEND_SPIKE"),
      ),
    )
    .limit(1);
  const spikePct = (prefRow[0]?.dataJson as any)?.percent ?? 50;

  if (avgSpend > 0 && ctx.spendYesterday > avgSpend * (1 + spikePct / 100)) {
    const deltaPct = ((ctx.spendYesterday - avgSpend) / avgSpend) * 100;
    await dispatchNotification({
      userId: ctx.userId,
      fbActId: ctx.fbActId,
      notifCode: "SPEND_SPIKE",
      mode: "C",
      dedupeKey: `act_${ctx.fbActId}:${ctx.yesterdayStr}:spike`,
      title: `🔺 Spend spike — ${ctx.accountName}`,
      preview: `Spend kemarin ${fmtIdr(ctx.spendYesterday)} (Δ +${deltaPct.toFixed(0)}% vs avg 7 hari)`,
      buildMessage: () =>
        [
          "🔺 <b>Spend Spike</b>",
          `📅 ${ctx.yesterdayStr}`,
          "━━━━━━━━━━━━━━━━━━",
          `🏢 ${ctx.accountName}`,
          `💸 Spend kemarin: ${fmtIdr(ctx.spendYesterday)}`,
          `📊 Rata-rata 7 hari: ${fmtIdr(avgSpend)}`,
          `📈 Δ: +${deltaPct.toFixed(0)}%`,
        ].join("\n"),
      defaultEnabled: false,
    });
  }

  // RESULT_DROP
  const resultPref = await db
    .select({ dataJson: notificationPreferences.dataJson })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, ctx.userId),
        eq(notificationPreferences.notifCode, "RESULT_DROP"),
      ),
    )
    .limit(1);
  const dropPct = (resultPref[0]?.dataJson as any)?.percent ?? 50;
  // ambil rata-rata result 7 hari prev
  const avgResults = await (async () => {
    const sum = await getResultTotal(ctx.fbActId, fromPrev, toPrev);
    return series.length > 0 ? sum / series.length : 0;
  })();

  if (avgResults > 0 && ctx.resultsYesterday < avgResults * (1 - dropPct / 100)) {
    const deltaPct = ((avgResults - ctx.resultsYesterday) / avgResults) * 100;
    await dispatchNotification({
      userId: ctx.userId,
      fbActId: ctx.fbActId,
      notifCode: "RESULT_DROP",
      mode: "C",
      dedupeKey: `act_${ctx.fbActId}:${ctx.yesterdayStr}:drop`,
      title: `🔻 Result drop — ${ctx.accountName}`,
      preview: `Result kemarin ${ctx.resultsYesterday} (Δ -${deltaPct.toFixed(0)}% vs avg 7 hari)`,
      buildMessage: () =>
        [
          "🔻 <b>Result Drop</b>",
          `📅 ${ctx.yesterdayStr}`,
          "━━━━━━━━━━━━━━━━━━",
          `🏢 ${ctx.accountName}`,
          `✅ Result kemarin: ${ctx.resultsYesterday}`,
          `📊 Rata-rata 7 hari: ${avgResults.toFixed(1)}`,
          `📉 Δ: -${deltaPct.toFixed(0)}%`,
        ].join("\n"),
      defaultEnabled: false,
    });
  }

  // ZERO_SPEND — yesterday=0 padahal H-2 ada
  if (ctx.spendYesterday === 0 && series.length > 0 && series[series.length - 1].spend > 0) {
    await dispatchNotification({
      userId: ctx.userId,
      fbActId: ctx.fbActId,
      notifCode: "ZERO_SPEND",
      mode: "C",
      dedupeKey: `act_${ctx.fbActId}:${ctx.yesterdayStr}:zero`,
      title: `💤 Akun tidur — ${ctx.accountName}`,
      preview: "Tidak ada spend kemarin padahal H-2 ada",
      buildMessage: () =>
        [
          "💤 <b>Zero Spend</b>",
          `📅 ${ctx.yesterdayStr}`,
          "━━━━━━━━━━━━━━━━━━",
          `🏢 ${ctx.accountName}`,
          "Tidak ada spend kemarin padahal H-2 masih jalan. Periksa apakah iklan disengaja di-pause.",
        ].join("\n"),
      defaultEnabled: false,
    });
  }

  // ROAS_MILESTONE
  if (typeof ctx.purchaseRoas === "number" && ctx.purchaseRoas > 0) {
    const roasPref = await db
      .select({ dataJson: notificationPreferences.dataJson })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, ctx.userId),
          eq(notificationPreferences.notifCode, "ROAS_MILESTONE"),
        ),
      )
      .limit(1);
    const target = (roasPref[0]?.dataJson as any)?.target ?? 3;
    if (ctx.purchaseRoas >= target) {
      await dispatchNotification({
        userId: ctx.userId,
        fbActId: ctx.fbActId,
        notifCode: "ROAS_MILESTONE",
        mode: "C",
        dedupeKey: `act_${ctx.fbActId}:${ctx.yesterdayStr}:roas`,
        title: `🎯 ROAS milestone — ${ctx.accountName}`,
        preview: `ROAS ${ctx.purchaseRoas.toFixed(2)}x ≥ target ${target}x`,
        buildMessage: () =>
          [
            "🎯 <b>ROAS Milestone</b>",
            `📅 ${ctx.yesterdayStr}`,
            "━━━━━━━━━━━━━━━━━━",
            `🏢 ${ctx.accountName}`,
            `📈 ROAS hari ini: ${ctx.purchaseRoas!.toFixed(2)}x`,
            `🎯 Target: ${target}x`,
          ].join("\n"),
        defaultEnabled: false,
      });
    }
  }
}
