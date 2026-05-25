/**
 * Telegram Notification Dispatcher
 *
 * Pusat semua pengiriman notifikasi Telegram. Mengurusi:
 *  - Resolusi recipient (4-tier fallback)
 *  - Pause/quiet hours gating
 *  - User preferences (enabled/disabled per kode)
 *  - Dedupe per (dedupe_key, recipient, notif_code)
 *  - Logging ke notification_log
 *
 * Tier 1 (kritikal) bisa `forceSend` untuk bypass pause + quiet hours.
 */

import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/client";
import {
  fbAct,
  notificationLog,
  notificationPreferences,
  notificationSettingsGlobal,
  profiles,
  users,
} from "../db/schema";

export type NotifMode = "A" | "B" | "C";

export interface DispatchOptions {
  userId: number;
  fbActId?: number | null;
  notifCode: string;
  mode: NotifMode;
  dedupeKey: string;
  title: string;
  preview?: string;
  buildMessage: () => string | Promise<string>;
  forceSend?: boolean;
  /** Override recipient resolution (e.g. for /test endpoint). */
  recipientOverride?: string | null;
  /** Additional recipients in addition to main (e.g. extra_telegram_username). */
  extraRecipients?: string[];
  /** Default ON when no preference row exists. Tier 1 should pass true. */
  defaultEnabled?: boolean;
}

export interface DispatchResult {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  recipient?: string;
}

const TELEGRAM_NOTIFY_URL =
  process.env.TELEGRAM_NOTIFY_URL ??
  "https://mail.dots.my.id/api/notifications/telegram/send";

// ─────────────────────────────────────────────────────
// Username resolver
// ─────────────────────────────────────────────────────

function cleanUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^@/, "");
  return cleaned.length > 0 ? cleaned : null;
}

interface ResolvedSettings {
  telegramUsername: string | null;
  extraTelegramUsername: string | null;
  pausedUntil: Date | null;
  quietStart: number;
  quietEnd: number;
}

async function loadGlobalSettings(userId: number): Promise<ResolvedSettings> {
  const rows = await db
    .select()
    .from(notificationSettingsGlobal)
    .where(eq(notificationSettingsGlobal.userId, userId))
    .limit(1);
  const s = rows[0];
  return {
    telegramUsername: cleanUsername(s?.telegramUsername),
    extraTelegramUsername: cleanUsername(s?.extraTelegramUsername),
    pausedUntil: s?.pausedUntil ?? null,
    quietStart: s?.quietHoursStart ?? 22,
    quietEnd: s?.quietHoursEnd ?? 6,
  };
}

interface AccountConfigSnippet {
  telegramUsername?: string | null;
  extraTelegramUsername?: string | null;
}

async function loadAccountSnippet(fbActId: number | null | undefined): Promise<AccountConfigSnippet> {
  if (!fbActId) return {};
  const rows = await db
    .select({ dataJson: fbAct.dataJson })
    .from(fbAct)
    .where(eq(fbAct.id, fbActId))
    .limit(1);
  if (rows.length === 0) return {};
  const cfg = typeof rows[0].dataJson === "string" ? JSON.parse(rows[0].dataJson) : rows[0].dataJson;
  return {
    telegramUsername: cleanUsername(cfg?.telegram_username ?? cfg?.telegram_chat_id),
    extraTelegramUsername: cleanUsername(cfg?.extra_telegram_username ?? cfg?.extra_telegram_chat_id),
  };
}

async function loadAdvertiserFallback(userId: number): Promise<string | null> {
  const rows = await db
    .select({
      username: users.username,
      profileUsername: profiles.telegramUsername,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (rows.length === 0) return null;
  return cleanUsername(rows[0].profileUsername) ?? cleanUsername(rows[0].username);
}

/**
 * Resolve main + extra recipients using priority chain:
 *   1. account override (fb_act.data_json.telegram_username)
 *   2. user global settings (notification_settings_global.telegram_username)
 *   3. profiles.telegram_username
 *   4. users.username
 *   5. process.env.TELEGRAM_NOTIFY_USERNAME (ops fallback)
 */
export async function resolveRecipients(
  userId: number,
  fbActId?: number | null,
): Promise<{ main: string | null; extra: string | null; settings: ResolvedSettings }> {
  const [settings, acct, advFallback] = await Promise.all([
    loadGlobalSettings(userId),
    loadAccountSnippet(fbActId),
    loadAdvertiserFallback(userId),
  ]);
  const envFallback = cleanUsername(process.env.TELEGRAM_NOTIFY_USERNAME ?? process.env.TELEGRAM_CHAT_ID);
  const main =
    acct.telegramUsername ?? settings.telegramUsername ?? advFallback ?? envFallback;
  const extra = acct.extraTelegramUsername ?? settings.extraTelegramUsername ?? null;
  return { main, extra, settings };
}

// ─────────────────────────────────────────────────────
// Preference resolver
// ─────────────────────────────────────────────────────

async function isEnabledForUser(
  userId: number,
  notifCode: string,
  fbActId?: number | null,
  defaultEnabled: boolean = true,
): Promise<boolean> {
  // 1. Per-account override
  if (fbActId) {
    const acctRow = await db
      .select({ enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.fbActId, fbActId),
          eq(notificationPreferences.notifCode, notifCode),
        ),
      )
      .limit(1);
    if (acctRow.length > 0) return acctRow[0].enabled === 1;
  }
  // 2. Global user
  const globalRow = await db
    .select({ enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        isNull(notificationPreferences.fbActId),
        eq(notificationPreferences.notifCode, notifCode),
      ),
    )
    .limit(1);
  if (globalRow.length > 0) return globalRow[0].enabled === 1;
  return defaultEnabled;
}

// ─────────────────────────────────────────────────────
// Quiet hours
// ─────────────────────────────────────────────────────

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function isInQuietHours(start: number, end: number, now = new Date()): boolean {
  if (start === end) return false;
  const wibHour = new Date(now.getTime() + WIB_OFFSET_MS).getUTCHours();
  if (start < end) return wibHour >= start && wibHour < end;
  // Wrap (e.g. 22 → 6)
  return wibHour >= start || wibHour < end;
}

// ─────────────────────────────────────────────────────
// Low-level send
// ─────────────────────────────────────────────────────

async function sendTelegramRaw(message: string, username: string, apiToken: string): Promise<void> {
  const res = await fetch(TELEGRAM_NOTIFY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, text: message, parseMode: "HTML" }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Telegram notify error ${res.status}: ${errText.slice(0, 200)}`);
  }
}

// ─────────────────────────────────────────────────────
// Logging helper
// ─────────────────────────────────────────────────────

interface LogPayload {
  userId: number;
  fbActId?: number | null;
  notifCode: string;
  mode: NotifMode;
  dedupeKey: string;
  recipient: string;
  title: string;
  preview?: string;
  body?: string;
  status: "sent" | "failed" | "skipped";
  reason?: string;
  dataJson?: Record<string, unknown>;
}

async function writeLog(p: LogPayload): Promise<void> {
  try {
    await db.insert(notificationLog).values({
      userId: p.userId,
      fbActId: p.fbActId ?? null,
      notifCode: p.notifCode,
      mode: p.mode,
      dedupeKey: p.dedupeKey,
      recipient: p.recipient,
      title: p.title.slice(0, 255),
      preview: p.preview?.slice(0, 500) ?? null,
      body: p.body ?? null,
      status: p.status,
      reason: p.reason ?? null,
      dataJson: (p.dataJson ?? {}) as any,
    });
  } catch (e: any) {
    // Duplicate dedupe is benign (means already sent); other errors swallowed but logged.
    if (e?.code !== "ER_DUP_ENTRY") {
      console.error("[notify] writeLog failed:", e?.message ?? e);
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────

export async function dispatchNotification(opts: DispatchOptions): Promise<DispatchResult> {
  const apiToken = process.env.TELEGRAM_NOTIFY_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!apiToken) {
    return { status: "skipped", reason: "no_api_token" };
  }

  // Resolve recipients (or use override)
  let mainRecipient: string | null;
  let extraRecipient: string | null;
  let settings: ResolvedSettings;

  if (opts.recipientOverride !== undefined) {
    mainRecipient = cleanUsername(opts.recipientOverride);
    extraRecipient = null;
    settings = await loadGlobalSettings(opts.userId);
  } else {
    const resolved = await resolveRecipients(opts.userId, opts.fbActId);
    mainRecipient = resolved.main;
    extraRecipient = resolved.extra;
    settings = resolved.settings;
  }

  if (!mainRecipient) {
    return { status: "skipped", reason: "no_recipient" };
  }

  // Pause check
  if (!opts.forceSend && settings.pausedUntil && settings.pausedUntil.getTime() > Date.now()) {
    await writeLog({
      ...opts,
      recipient: mainRecipient,
      status: "skipped",
      reason: "paused",
    });
    return { status: "skipped", reason: "paused", recipient: mainRecipient };
  }

  // Preference check
  const enabled = await isEnabledForUser(
    opts.userId,
    opts.notifCode,
    opts.fbActId,
    opts.defaultEnabled ?? true,
  );
  if (!enabled && !opts.forceSend) {
    await writeLog({
      ...opts,
      recipient: mainRecipient,
      status: "skipped",
      reason: "disabled",
    });
    return { status: "skipped", reason: "disabled", recipient: mainRecipient };
  }

  // Quiet hours (only mode B / C)
  if (
    !opts.forceSend &&
    (opts.mode === "B" || opts.mode === "C") &&
    isInQuietHours(settings.quietStart, settings.quietEnd)
  ) {
    await writeLog({
      ...opts,
      recipient: mainRecipient,
      status: "skipped",
      reason: "quiet_hours",
    });
    return { status: "skipped", reason: "quiet_hours", recipient: mainRecipient };
  }

  // Build message once
  const message = await opts.buildMessage();
  const allRecipients = [mainRecipient, ...(opts.extraRecipients ?? [])];
  if (extraRecipient && !opts.extraRecipients) allRecipients.push(extraRecipient);

  let lastStatus: "sent" | "failed" = "sent";

  for (const rcpt of allRecipients) {
    // Dedupe via DB unique constraint — try insert "sent" placeholder first
    try {
      await writeLog({
        ...opts,
        recipient: rcpt,
        body: message,
        status: "sent",
      });
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") {
        // Already sent this dedupe key to this recipient; skip silently.
        continue;
      }
      // Unexpected DB error — log skipped and continue
      lastStatus = "failed";
      continue;
    }

    try {
      await sendTelegramRaw(message, rcpt, apiToken);
    } catch (err: any) {
      lastStatus = "failed";
      // Update row to status=failed
      try {
        await db
          .update(notificationLog)
          .set({ status: "failed", reason: String(err?.message ?? err).slice(0, 255) })
          .where(
            and(
              eq(notificationLog.dedupeKey, opts.dedupeKey),
              eq(notificationLog.recipient, rcpt),
              eq(notificationLog.notifCode, opts.notifCode),
            ),
          );
      } catch {}
    }
  }

  return { status: lastStatus, recipient: mainRecipient };
}

/**
 * Send a one-off test message bypassing all preferences/dedupe.
 * Used by POST /api/notifications/test.
 */
export async function sendTelegramTest(
  username: string,
  apiToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = apiToken ?? process.env.TELEGRAM_NOTIFY_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_NOTIFY_TOKEN tidak terpasang di server" };
  const cleaned = cleanUsername(username);
  if (!cleaned) return { ok: false, error: "Username tidak valid" };
  const message = [
    "🧪 <b>Tes Notifikasi v-auto</b>",
    "━━━━━━━━━━━━━━━━━━",
    "Jika kamu menerima pesan ini, koneksi Telegram-mu sudah aktif. 🎉",
    "",
    `Dikirim pada ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
  ].join("\n");
  try {
    await sendTelegramRaw(message, cleaned, token);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}
