/**
 * Real-time Balance Check
 *
 * Dijalankan setiap 2 jam (cron schedule "0 *_2 * * *" — replace _ with /) — loop semua fb_act aktif,
 * panggil syncFbActBalance dengan sendRealtimeAlerts=true. Notif Tier 1
 * (BALANCE_DEPLETED, BALANCE_CRITICAL_RT, TOKEN_INVALID) akan dikirim sesuai
 * dedupe per (act_id, date, level).
 */

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { fbAct, fbToken } from "../db/schema";
import { syncFbActBalance } from "./syncFbActBalance";
import { dispatchNotification } from "../services/notifyTelegram";

export async function runRealtimeBalanceCheck(): Promise<{
  total: number;
  success: number;
  failed: number;
}> {
  const acts = await db
    .select({ id: fbAct.id, actId: fbAct.actId })
    .from(fbAct)
    .innerJoin(fbToken, eq(fbAct.tokenId, fbToken.id))
    .where(eq(fbToken.status, 1));

  console.log(`[RealtimeBalanceCheck] Cek ${acts.length} akun aktif...`);
  let success = 0;
  let failed = 0;

  for (const act of acts) {
    try {
      const res = await syncFbActBalance(act.id, { sendRealtimeAlerts: true });
      if (res.success) success++;
      else failed++;
    } catch (e) {
      failed++;
      console.error(`[RealtimeBalanceCheck] Error sync ${act.actId}:`, e);
    }
  }

  console.log(`[RealtimeBalanceCheck] Selesai: ${success}/${acts.length} sukses, ${failed} gagal`);

  // Kalau >50% gagal → kirim CRON_FAILED ke admin (env var fallback)
  if (acts.length > 0 && failed / acts.length > 0.5) {
    const adminUsername = process.env.ADMIN_NOTIFY_USERNAME ?? process.env.TELEGRAM_NOTIFY_USERNAME;
    if (adminUsername) {
      const adminUserId = Number(process.env.ADMIN_NOTIFY_USER_ID ?? 0);
      if (adminUserId) {
        await dispatchNotification({
          userId: adminUserId,
          notifCode: "CRON_FAILED",
          mode: "A",
          dedupeKey: `realtime_balance:${new Date().toISOString().slice(0, 13)}`,
          title: `⚠️ Realtime balance check: ${failed}/${acts.length} gagal`,
          preview: `Lebih dari 50% akun gagal di-sync`,
          buildMessage: () =>
            `⚠️ <b>Cron Failed</b>\nRealtime balance check: ${failed}/${acts.length} akun gagal di-sync.`,
          defaultEnabled: true,
          forceSend: true,
        });
      }
    }
  }

  return { total: acts.length, success, failed };
}

if (import.meta.main) {
  runRealtimeBalanceCheck()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
