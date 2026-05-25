/**
 * Notifications API
 *
 * Endpoint untuk user mengatur preferensi notifikasi Telegram, melakukan
 * tes pengiriman, pause/resume cepat, dan melihat riwayat notifikasi.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  fbAct,
  fbToken,
  notificationLog,
  notificationPreferences,
  notificationSettingsGlobal,
  profiles,
  users,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { sendTelegramTest } from "../services/notifyTelegram";

const router = new Hono();

router.use("*", requireAuth);

function uid(c: any): number {
  const payload = c.get("jwtPayload");
  return Number(payload?.sub ?? 0);
}

// ─────────────────────────────────────────────────────
// Global settings
// ─────────────────────────────────────────────────────

const globalPayload = z.object({
  telegramUsername: z.string().trim().max(64).nullable().optional(),
  extraTelegramUsername: z.string().trim().max(64).nullable().optional(),
  quietHoursStart: z.coerce.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.coerce.number().int().min(0).max(23).optional(),
  dailyReportTime: z.coerce.number().int().min(0).max(23).optional(),
  language: z.string().trim().max(8).optional(),
});

async function ensureGlobalRow(userId: number) {
  await db
    .insert(notificationSettingsGlobal)
    .values({ userId })
    .onDuplicateKeyUpdate({ set: { userId } });
}

router.get("/preferences", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);

  await ensureGlobalRow(userId);

  const [globalRow] = await db
    .select()
    .from(notificationSettingsGlobal)
    .where(eq(notificationSettingsGlobal.userId, userId))
    .limit(1);

  const codes = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  // List akun untuk override per-akun (yang dimiliki user via fb_token.user_id)
  const accounts = await db
    .select({
      id: fbAct.id,
      actId: fbAct.actId,
      actName: fbAct.actName,
      name: fbAct.name,
    })
    .from(fbAct)
    .innerJoin(fbToken, eq(fbAct.tokenId, fbToken.id))
    .where(eq(fbToken.userId, userId));

  return c.json({
    success: true,
    data: {
      global: globalRow,
      codes,
      accounts,
    },
  });
});

router.put("/preferences/global", zValidator("json", globalPayload), async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
  const body = c.req.valid("json");
  await ensureGlobalRow(userId);

  const updates: Record<string, unknown> = {};
  if (body.telegramUsername !== undefined) updates.telegramUsername = body.telegramUsername;
  if (body.extraTelegramUsername !== undefined) updates.extraTelegramUsername = body.extraTelegramUsername;
  if (body.quietHoursStart !== undefined) updates.quietHoursStart = body.quietHoursStart;
  if (body.quietHoursEnd !== undefined) updates.quietHoursEnd = body.quietHoursEnd;
  if (body.dailyReportTime !== undefined) updates.dailyReportTime = body.dailyReportTime;
  if (body.language !== undefined) updates.language = body.language;

  if (Object.keys(updates).length > 0) {
    await db
      .update(notificationSettingsGlobal)
      .set(updates)
      .where(eq(notificationSettingsGlobal.userId, userId));
  }

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────
// Code preferences (bulk + per-akun)
// ─────────────────────────────────────────────────────

const codePayloadItem = z.object({
  notifCode: z.string().min(1).max(64),
  enabled: z.coerce.boolean(),
  channel: z.string().max(32).optional().default("telegram"),
  dataJson: z.record(z.string(), z.unknown()).nullable().optional(),
});

const codePayloadBulk = z.object({
  items: z.array(codePayloadItem),
});

router.put("/preferences/codes", zValidator("json", codePayloadBulk), async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
  const { items } = c.req.valid("json");

  for (const it of items) {
    await db
      .insert(notificationPreferences)
      .values({
        userId,
        fbActId: null,
        notifCode: it.notifCode,
        enabled: it.enabled ? 1 : 0,
        channel: it.channel ?? "telegram",
        dataJson: (it.dataJson ?? null) as any,
      })
      .onDuplicateKeyUpdate({
        set: {
          enabled: it.enabled ? 1 : 0,
          dataJson: (it.dataJson ?? null) as any,
        },
      });
  }

  return c.json({ success: true });
});

const accountOverridePayload = z.object({
  items: z.array(
    z.object({
      notifCode: z.string().min(1).max(64),
      enabled: z.coerce.boolean(),
      channel: z.string().max(32).optional().default("telegram"),
      dataJson: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  ),
});

async function userOwnsFbAct(userId: number, fbActId: number): Promise<boolean> {
  const rows = await db
    .select({ id: fbAct.id })
    .from(fbAct)
    .innerJoin(fbToken, eq(fbAct.tokenId, fbToken.id))
    .where(and(eq(fbAct.id, fbActId), eq(fbToken.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

router.put(
  "/preferences/accounts/:fbActId",
  zValidator("json", accountOverridePayload),
  async (c) => {
    const userId = uid(c);
    if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
    const fbActId = Number(c.req.param("fbActId"));
    if (!Number.isFinite(fbActId)) return c.json({ success: false, message: "Invalid id" }, 400);
    if (!(await userOwnsFbAct(userId, fbActId))) {
      return c.json({ success: false, message: "Forbidden" }, 403);
    }
    const { items } = c.req.valid("json");
    for (const it of items) {
      await db
        .insert(notificationPreferences)
        .values({
          userId,
          fbActId,
          notifCode: it.notifCode,
          enabled: it.enabled ? 1 : 0,
          channel: it.channel ?? "telegram",
          dataJson: (it.dataJson ?? null) as any,
        })
        .onDuplicateKeyUpdate({
          set: {
            enabled: it.enabled ? 1 : 0,
            dataJson: (it.dataJson ?? null) as any,
          },
        });
    }
    return c.json({ success: true });
  },
);

// ─────────────────────────────────────────────────────
// Test
// ─────────────────────────────────────────────────────

router.post(
  "/test",
  zValidator(
    "json",
    z.object({
      username: z.string().trim().min(1).max(64),
      target: z.enum(["main", "extra"]).optional(),
    }),
  ),
  async (c) => {
    const userId = uid(c);
    if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
    const { username, target } = c.req.valid("json");

    const result = await sendTelegramTest(username);

    // Update telegram_status pada global settings
    await ensureGlobalRow(userId);
    const set: Record<string, unknown> = {
      telegramStatus: result.ok ? 1 : 2,
      telegramVerifiedAt: result.ok ? new Date() : undefined,
    };
    // Bila tes pada main, sekalian persist usernamenya
    if (result.ok && target !== "extra") {
      set.telegramUsername = username.replace(/^@/, "");
    } else if (result.ok && target === "extra") {
      set.extraTelegramUsername = username.replace(/^@/, "");
    }
    await db
      .update(notificationSettingsGlobal)
      .set(set)
      .where(eq(notificationSettingsGlobal.userId, userId));

    return c.json({ success: result.ok, error: result.error });
  },
);

// ─────────────────────────────────────────────────────
// Pause / Resume (quick setting)
// ─────────────────────────────────────────────────────

router.post(
  "/pause",
  zValidator(
    "json",
    z.object({
      durationMinutes: z.coerce.number().int().min(1).max(60 * 24 * 30),
      reason: z.string().max(255).optional(),
    }),
  ),
  async (c) => {
    const userId = uid(c);
    if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
    const { durationMinutes, reason } = c.req.valid("json");
    await ensureGlobalRow(userId);
    const until = new Date(Date.now() + durationMinutes * 60_000);
    await db
      .update(notificationSettingsGlobal)
      .set({ pausedUntil: until, pausedReason: reason ?? null })
      .where(eq(notificationSettingsGlobal.userId, userId));
    return c.json({ success: true, data: { pausedUntil: until.toISOString() } });
  },
);

router.post("/resume", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
  await ensureGlobalRow(userId);
  await db
    .update(notificationSettingsGlobal)
    .set({ pausedUntil: null, pausedReason: null })
    .where(eq(notificationSettingsGlobal.userId, userId));
  return c.json({ success: true });
});

router.post(
  "/pause-until",
  zValidator(
    "json",
    z.object({
      untilIso: z.iso.datetime(),
      reason: z.string().max(255).optional(),
    }),
  ),
  async (c) => {
    const userId = uid(c);
    if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
    const { untilIso, reason } = c.req.valid("json");
    await ensureGlobalRow(userId);
    const until = new Date(untilIso);
    if (Number.isNaN(until.getTime())) {
      return c.json({ success: false, message: "Invalid date" }, 400);
    }
    await db
      .update(notificationSettingsGlobal)
      .set({ pausedUntil: until, pausedReason: reason ?? null })
      .where(eq(notificationSettingsGlobal.userId, userId));
    return c.json({ success: true });
  },
);

// ─────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────

router.get(
  "/history",
  zValidator(
    "query",
    z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      page: z.coerce.number().int().min(1).default(1),
      code: z.string().optional(),
      unreadOnly: z.coerce.boolean().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  ),
  async (c) => {
    const userId = uid(c);
    if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
    const { limit, page, code, unreadOnly, from, to } = c.req.valid("query");

    const conds = [eq(notificationLog.userId, userId), eq(notificationLog.status, "sent")];
    if (code) conds.push(eq(notificationLog.notifCode, code));
    if (unreadOnly) conds.push(isNull(notificationLog.readAt));
    if (from) conds.push(gte(notificationLog.createdAt, new Date(from)));
    if (to) conds.push(lte(notificationLog.createdAt, new Date(to)));

    const rows = await db
      .select({
        id: notificationLog.id,
        notifCode: notificationLog.notifCode,
        mode: notificationLog.mode,
        title: notificationLog.title,
        preview: notificationLog.preview,
        body: notificationLog.body,
        recipient: notificationLog.recipient,
        fbActId: notificationLog.fbActId,
        accountName: fbAct.name,
        readAt: notificationLog.readAt,
        createdAt: notificationLog.createdAt,
      })
      .from(notificationLog)
      .leftJoin(fbAct, eq(notificationLog.fbActId, fbAct.id))
      .where(and(...conds))
      .orderBy(desc(notificationLog.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return c.json({ success: true, data: rows, meta: { page, limit } });
  },
);

router.get("/history/unread-count", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.userId, userId),
        eq(notificationLog.status, "sent"),
        isNull(notificationLog.readAt),
      ),
    );
  return c.json({ success: true, data: { count: Number(row?.n ?? 0) } });
});

router.post(
  "/history/read",
  zValidator(
    "json",
    z.object({
      ids: z.array(z.coerce.number().int()).optional(),
      all: z.coerce.boolean().optional(),
      unread: z.coerce.boolean().optional(),
    }),
  ),
  async (c) => {
    const userId = uid(c);
    if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);
    const { ids, all, unread } = c.req.valid("json");

    const newReadAt = unread ? null : new Date();

    if (all) {
      await db
        .update(notificationLog)
        .set({ readAt: newReadAt })
        .where(
          and(
            eq(notificationLog.userId, userId),
            unread ? sql`1=1` : isNull(notificationLog.readAt),
          ),
        );
    } else if (ids && ids.length > 0) {
      for (const id of ids) {
        await db
          .update(notificationLog)
          .set({ readAt: newReadAt })
          .where(and(eq(notificationLog.id, id), eq(notificationLog.userId, userId)));
      }
    }
    return c.json({ success: true });
  },
);

export default router;
