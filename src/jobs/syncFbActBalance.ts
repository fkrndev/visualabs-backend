/**
 * Sync FB Act Balance — On-demand single-account balance fetch
 *
 * Lebih ringkas dari runMetaAdsDailyReport (no telegram, no breakdown,
 * no campaign insights). Dipakai dari API endpoint untuk akun yang
 * belum punya fb_act_daily_data hari ini.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { fbAct, fbToken, fbActDailyData } from "../db/schema";
import {
  THRESHOLD_CRITICAL,
  THRESHOLD_WARNING,
  getMetaBalance,
  getAccountInsights,
  getEffectiveBalance,
  getSaldoStatus,
  type FbActConfig,
} from "./metaAdsDailyReport";
import { dispatchNotification } from "../services/notifyTelegram";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function nowWib(): Date {
  return new Date(Date.now() + WIB_OFFSET_MS);
}

export interface SyncFbActResult {
  success: boolean;
  message: string;
  date?: string;
  balance?: number;
  balanceType?: string;
  statusLevel?: number;
}

/**
 * Sync balance + key insights untuk 1 fb_act, simpan ke fb_act_daily_data
 * untuk tanggal kemarin (WIB). Gunakan onDuplicateKeyUpdate.
 */
export async function syncFbActBalance(
  fbActId: number,
  opts: { sendRealtimeAlerts?: boolean } = {},
): Promise<SyncFbActResult> {
  const rows = await db
    .select({
      id: fbAct.id,
      actId: fbAct.actId,
      actName: fbAct.actName,
      name: fbAct.name,
      dataJson: fbAct.dataJson,
      tokenId: fbAct.tokenId,
      token: fbToken.token,
      tokenStatus: fbToken.status,
      userId: fbToken.userId,
    })
    .from(fbAct)
    .leftJoin(fbToken, eq(fbToken.id, fbAct.tokenId))
    .where(eq(fbAct.id, fbActId))
    .limit(1);

  const act = rows[0];
  if (!act) return { success: false, message: "FB Act tidak ditemukan" };
  if (!act.tokenId || !act.token) {
    return { success: false, message: "FB Act belum punya token aktif" };
  }
  if (act.tokenStatus !== 1) {
    return { success: false, message: "FB Token tidak aktif" };
  }

  const todayWib = nowWib();
  const yesterdayWib = new Date(todayWib.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterdayWib.toISOString().slice(0, 10);

  const actIdFull = act.actId.startsWith("act_") ? act.actId : `act_${act.actId}`;
  const config: FbActConfig =
    typeof act.dataJson === "string"
      ? JSON.parse(act.dataJson)
      : ((act.dataJson as FbActConfig) ?? {});

  try {
    const [balanceData, acctInsights] = await Promise.all([
      getMetaBalance(actIdFull, act.token),
      getAccountInsights(actIdFull, act.token, yesterdayStr),
    ]);

    const balanceInfo = getEffectiveBalance(config, balanceData);
    const { warningMsg } = getSaldoStatus(balanceInfo.balance, balanceInfo.balanceType);
    const accountName = balanceData.name ?? act.actName ?? act.name ?? actIdFull;

    const spend = parseFloat(acctInsights?.spend ?? "0");
    const actionsMap: Record<string, number> = {};
    for (const a of acctInsights?.actions ?? []) actionsMap[a.action_type] = parseFloat(a.value);
    const linkClicks = Math.round(actionsMap["link_click"] ?? 0);
    const cpcManual = linkClicks > 0 ? spend / linkClicks : 0;

    const statusLevel =
      balanceInfo.balance <= 0
        ? 2
        : balanceInfo.balance < THRESHOLD_CRITICAL
        ? 2
        : balanceInfo.balance < THRESHOLD_WARNING
        ? 1
        : 0;

    await db
      .insert(fbActDailyData)
      .values({
        fbActId: act.id,
        actId: act.actId,
        date: yesterdayStr,
        balance: String(balanceInfo.balance),
        amountSpent: balanceData.amount_spent
          ? String(parseInt(balanceData.amount_spent) / 100)
          : null,
        spendCap: balanceData.spend_cap ? String(parseInt(balanceData.spend_cap) / 100) : null,
        effectiveBalance: String(balanceInfo.balance),
        balanceType: balanceInfo.balanceType,
        spendingLimit: balanceInfo.spendingLimit ? String(balanceInfo.spendingLimit) : null,
        outstandingBalance: balanceInfo.outstandingBalance
          ? String(balanceInfo.outstandingBalance)
          : null,
        statusLevel,
        warningMessage: warningMsg ?? null,
        spend: acctInsights ? String(spend) : null,
        impressions: acctInsights ? parseInt(acctInsights.impressions ?? "0") : null,
        reach: acctInsights ? parseInt(acctInsights.reach ?? "0") : null,
        frequency: acctInsights ? String(parseFloat(acctInsights.frequency ?? "0")) : null,
        linkClicks: linkClicks || null,
        ctr: acctInsights ? String(parseFloat(acctInsights.ctr ?? "0")) : null,
        cpm: acctInsights ? String(parseFloat(acctInsights.cpm ?? "0")) : null,
        cpc: linkClicks ? String(cpcManual) : null,
        dataJson: { accountName } as any,
      })
      .onDuplicateKeyUpdate({
        set: {
          balance: String(balanceInfo.balance),
          effectiveBalance: String(balanceInfo.balance),
          balanceType: balanceInfo.balanceType,
          spendingLimit: balanceInfo.spendingLimit ? String(balanceInfo.spendingLimit) : null,
          outstandingBalance: balanceInfo.outstandingBalance
            ? String(balanceInfo.outstandingBalance)
            : null,
          statusLevel,
          warningMessage: warningMsg ?? null,
          spend: acctInsights ? String(spend) : null,
          impressions: acctInsights ? parseInt(acctInsights.impressions ?? "0") : null,
          reach: acctInsights ? parseInt(acctInsights.reach ?? "0") : null,
          frequency: acctInsights ? String(parseFloat(acctInsights.frequency ?? "0")) : null,
          linkClicks: linkClicks || null,
          ctr: acctInsights ? String(parseFloat(acctInsights.ctr ?? "0")) : null,
          cpm: acctInsights ? String(parseFloat(acctInsights.cpm ?? "0")) : null,
          cpc: linkClicks ? String(cpcManual) : null,
        },
      });

    // Real-time alert (BALANCE_DEPLETED / BALANCE_CRITICAL_RT) — dipakai oleh
    // realtimeBalanceCheck job. Pakai dedupe per (date, level) supaya tidak
    // dobel tiap polling.
    if (opts.sendRealtimeAlerts && act.userId) {
      const todayStr = todayWib.toISOString().slice(0, 10);
      if (balanceInfo.balance <= 0) {
        await dispatchNotification({
          userId: act.userId,
          fbActId: act.id,
          notifCode: "BALANCE_DEPLETED",
          mode: "A",
          dedupeKey: `act_${act.id}:${todayStr}:depleted`,
          title: `🚨 Saldo habis — ${accountName}`,
          preview: "Iklan akan / sudah berhenti. Segera top up.",
          buildMessage: () => [
            "🚨 <b>SALDO HABIS</b>",
            `📅 ${todayWib.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
            "━━━━━━━━━━━━━━━━━━",
            `🏢 Akun: ${accountName}`,
            `💳 ${balanceInfo.balanceType}`,
            `🔴 Sisa Saldo: ${balanceInfo.balance.toLocaleString("id-ID")}`,
            "",
            "Segera top up — iklanmu sudah berhenti atau akan berhenti.",
          ].join("\n"),
          defaultEnabled: true,
          forceSend: true,
        });
      } else if (balanceInfo.balance < THRESHOLD_CRITICAL) {
        await dispatchNotification({
          userId: act.userId,
          fbActId: act.id,
          notifCode: "BALANCE_CRITICAL_RT",
          mode: "A",
          dedupeKey: `act_${act.id}:${todayStr}:critical_rt`,
          title: `🚨 Saldo critical — ${accountName}`,
          preview: warningMsg ?? "Saldo di bawah threshold critical",
          buildMessage: () => [
            "🚨 <b>Saldo Critical</b>",
            `📅 ${todayWib.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
            "━━━━━━━━━━━━━━━━━━",
            `🏢 Akun: ${accountName}`,
            `💳 ${balanceInfo.balanceType}`,
            `🔴 Sisa Saldo: Rp ${Math.round(balanceInfo.balance).toLocaleString("id-ID")}`,
            "",
            warningMsg ?? "Saldo di bawah threshold critical. Segera top up.",
          ].join("\n"),
          defaultEnabled: true,
          forceSend: true,
        });
      }
    }

    return {
      success: true,
      message: "Sync berhasil",
      date: yesterdayStr,
      balance: balanceInfo.balance,
      balanceType: balanceInfo.balanceType,
      statusLevel,
    };
  } catch (e: any) {
    // Deteksi OAuthException → tandai token invalid + kirim alert
    const errMsg = String(e?.message ?? e);
    const isOAuthError =
      /OAuthException|oauth|access[\s_-]?token|invalid[\s_-]?token|code\s*[:=]\s*190/i.test(errMsg);
    if (isOAuthError && act.tokenId && opts.sendRealtimeAlerts && act.userId) {
      try {
        await db.update(fbToken).set({ status: 0 }).where(eq(fbToken.id, act.tokenId));
        const accountNameForAlert = act.actName ?? act.name ?? act.actId;
        const todayStr = new Date().toISOString().slice(0, 10);
        await dispatchNotification({
          userId: act.userId,
          fbActId: act.id,
          notifCode: "TOKEN_INVALID",
          mode: "A",
          dedupeKey: `token_${act.tokenId}:${todayStr}`,
          title: `🔒 Token Meta invalid — ${accountNameForAlert}`,
          preview: errMsg.slice(0, 200),
          buildMessage: () => [
            "🔒 <b>Token Meta Invalid</b>",
            `📅 ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
            "━━━━━━━━━━━━━━━━━━",
            `🏢 Akun: ${accountNameForAlert}`,
            `❌ Error: ${errMsg.slice(0, 200)}`,
            "",
            "Silakan hubungkan kembali akun Meta-mu di halaman pengaturan.",
          ].join("\n"),
          defaultEnabled: true,
          forceSend: true,
        });
      } catch (alertErr) {
        console.error("[syncFbActBalance] Failed to notify token invalid:", alertErr);
      }
    }
    return {
      success: false,
      message: `Gagal fetch dari Meta API: ${errMsg}`,
    };
  }
}
