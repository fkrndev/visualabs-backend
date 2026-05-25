/**
 * Onboarding API
 *
 * State + persistence untuk fitur onboarding advertiser.
 * - GET  /onboarding/state    → return current state (auto-detect 5 milestone + lock graph)
 * - POST /onboarding/progress → mark complete / dismiss per step
 * - POST /onboarding/reset    → hapus row supaya checklist/tour muncul lagi
 *
 * Lihat docs/plan-2/onboarding-advertiser.md untuk konteks lengkap.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  fbAct,
  fbToken,
  notificationPreferences,
  notificationSettingsGlobal,
  scorecardData,
  subscriptions,
  userOnboardingProgress,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";

const router = new Hono();

router.use("*", requireAuth);

function uid(c: any): number {
  const payload = c.get("jwtPayload");
  return Number(payload?.sub ?? 0);
}

// ─────────────────────────────────────────────────────
// Flow & step definitions
// ─────────────────────────────────────────────────────

const FLOW_TOUR = "advertiser_tour";
const FLOW_SETUP = "advertiser_setup";

const SETUP_STEPS = [
  "client_added",
  "fb_token_added",
  "fb_act_added",
  "kpi_ready",
  "monitoring_active",
] as const;

type SetupStepKey = (typeof SETUP_STEPS)[number];

const STEP_DEPENDENCIES: Record<SetupStepKey, SetupStepKey[]> = {
  client_added: [],
  fb_token_added: [],
  fb_act_added: [],
  kpi_ready: ["client_added"],
  monitoring_active: ["fb_token_added", "fb_act_added"],
};

const STEP_LOCK_REASON: Record<SetupStepKey, string> = {
  client_added: "",
  fb_token_added: "",
  fb_act_added: "",
  kpi_ready: "Tambah client dulu sebelum setup KPI",
  monitoring_active: "Hubungkan FB Token & FB Ad Account dulu",
};

const KNOWN_FLOWS = new Set([FLOW_TOUR, FLOW_SETUP]);

// step_key khusus untuk operasi flow-level
const SPECIAL_STEPS = new Set(["__done__", "__flow__"]);

// ─────────────────────────────────────────────────────
// Auto-detect helpers (1 round-trip via Promise.all)
// ─────────────────────────────────────────────────────

async function detectIsAdvertiser(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(subscriptions)
    .where(eq(subscriptions.advertiserId, userId))
    .limit(1);
  return !!row;
}

async function detectClientAdded(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(subscriptions)
    .where(eq(subscriptions.advertiserId, userId))
    .limit(1);
  return !!row;
}

async function detectFbTokenAdded(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(fbToken)
    .where(and(eq(fbToken.userId, userId), eq(fbToken.status, 1)))
    .limit(1);
  return !!row;
}

async function detectFbActAdded(userId: number): Promise<boolean> {
  // Ad account dianggap "added" jika user (sebagai advertiser) punya subscription
  // yang sudah ter-link ke setidaknya satu fb_act row.
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(fbAct)
    .innerJoin(subscriptions, eq(fbAct.subscriptionId, subscriptions.id))
    .where(eq(subscriptions.advertiserId, userId))
    .limit(1);
  return !!row;
}

async function detectKpiReady(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(scorecardData)
    .where(eq(scorecardData.enteredBy, userId))
    .limit(1);
  return !!row;
}

async function detectMonitoringActive(userId: number): Promise<boolean> {
  // Done bila user sudah pernah mengisi telegram_username (di settings notifikasi)
  // ATAU sudah punya minimal 1 preference yang dia toggle eksplisit.
  const [globalRow] = await db
    .select({
      telegramUsername: notificationSettingsGlobal.telegramUsername,
    })
    .from(notificationSettingsGlobal)
    .where(eq(notificationSettingsGlobal.userId, userId))
    .limit(1);

  if (globalRow?.telegramUsername && globalRow.telegramUsername.length > 0) {
    return true;
  }

  const [prefRow] = await db
    .select({ n: sql<number>`1` })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  return !!prefRow;
}

const STEP_DETECTORS: Record<SetupStepKey, (userId: number) => Promise<boolean>> = {
  client_added: detectClientAdded,
  fb_token_added: detectFbTokenAdded,
  fb_act_added: detectFbActAdded,
  kpi_ready: detectKpiReady,
  monitoring_active: detectMonitoringActive,
};

// ─────────────────────────────────────────────────────
// GET /onboarding/state
// ─────────────────────────────────────────────────────

router.get("/state", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);

  // 1. Fetch semua row progress user (kedua flow)
  const progressRows = await db
    .select()
    .from(userOnboardingProgress)
    .where(eq(userOnboardingProgress.userId, userId));

  const tourRow = progressRows.find(
    (r) => r.flowKey === FLOW_TOUR && (r.stepKey === "__done__" || r.stepKey === "__flow__"),
  );
  const setupDismissRow = progressRows.find(
    (r) => r.flowKey === FLOW_SETUP && r.stepKey === "__flow__" && r.dismissedAt,
  );

  // 2. Auto-detect 5 milestone + isAdvertiser dalam satu round-trip
  const [
    isAdvertiser,
    autoClient,
    autoFbToken,
    autoFbAct,
    autoKpi,
    autoMonitoring,
  ] = await Promise.all([
    detectIsAdvertiser(userId),
    STEP_DETECTORS.client_added(userId),
    STEP_DETECTORS.fb_token_added(userId),
    STEP_DETECTORS.fb_act_added(userId),
    STEP_DETECTORS.kpi_ready(userId),
    STEP_DETECTORS.monitoring_active(userId),
  ]);

  const autoMap: Record<SetupStepKey, boolean> = {
    client_added: autoClient,
    fb_token_added: autoFbToken,
    fb_act_added: autoFbAct,
    kpi_ready: autoKpi,
    monitoring_active: autoMonitoring,
  };

  // 3. Bangun list step dengan merge auto-detect + manual-mark
  const manualMap = new Map(
    progressRows
      .filter((r) => r.flowKey === FLOW_SETUP && r.completedAt && !SPECIAL_STEPS.has(r.stepKey))
      .map((r) => [r.stepKey, r]),
  );

  const steps = SETUP_STEPS.map((key) => {
    const auto = autoMap[key];
    const manualRow = manualMap.get(key);
    const done = auto || !!manualRow;
    const source: "auto" | "manual" | null = auto ? "auto" : manualRow ? "manual" : null;
    const completedAt = manualRow?.completedAt
      ? manualRow.completedAt
      : null;

    // Cek lock: semua dependency harus done
    const deps = STEP_DEPENDENCIES[key];
    const locked = deps.some((dep) => !(autoMap[dep] || manualMap.has(dep)));

    return {
      key,
      done,
      source,
      completedAt,
      locked,
      lockedReason: locked ? STEP_LOCK_REASON[key] : "",
    };
  });

  const completedCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;

  return c.json({
    success: true,
    data: {
      isAdvertiser,
      flows: {
        advertiser_tour: {
          done: !!tourRow,
          dismissed: !!tourRow && tourRow.stepKey === "__flow__",
        },
        advertiser_setup: {
          steps,
          completedCount,
          totalCount,
          dismissed: !!setupDismissRow,
        },
      },
    },
  });
});

// ─────────────────────────────────────────────────────
// POST /onboarding/progress
// ─────────────────────────────────────────────────────

const progressPayload = z.object({
  flowKey: z.string().min(1).max(64),
  stepKey: z.string().min(1).max(64),
  action: z.enum(["complete", "dismiss"]),
  manual: z.boolean().optional(),
});

router.post("/progress", zValidator("json", progressPayload), async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);

  const body = c.req.valid("json");

  if (!KNOWN_FLOWS.has(body.flowKey)) {
    return c.json({ success: false, message: "Unknown flowKey" }, 400);
  }

  // Validasi stepKey
  const isSetupStep = (SETUP_STEPS as readonly string[]).includes(body.stepKey);
  const isSpecial = SPECIAL_STEPS.has(body.stepKey);
  if (!isSetupStep && !isSpecial) {
    return c.json({ success: false, message: "Unknown stepKey" }, 400);
  }

  const now = new Date();
  const completedAt = body.action === "complete" ? now : null;
  const dismissedAt = body.action === "dismiss" ? now : null;
  const manualFlag = body.action === "complete" && body.manual === true ? 1 : 0;

  await db
    .insert(userOnboardingProgress)
    .values({
      userId,
      flowKey: body.flowKey,
      stepKey: body.stepKey,
      manual: manualFlag,
      completedAt,
      dismissedAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        manual: manualFlag,
        completedAt,
        dismissedAt,
      },
    });

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────
// POST /onboarding/reset
// ─────────────────────────────────────────────────────

const resetPayload = z
  .object({
    flowKey: z.string().min(1).max(64).optional(),
  })
  .optional();

router.post("/reset", zValidator("json", resetPayload ?? z.any()), async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);

  const body = (await c.req.json().catch(() => ({}))) as { flowKey?: string };

  if (body.flowKey) {
    if (!KNOWN_FLOWS.has(body.flowKey)) {
      return c.json({ success: false, message: "Unknown flowKey" }, 400);
    }
    await db
      .delete(userOnboardingProgress)
      .where(
        and(
          eq(userOnboardingProgress.userId, userId),
          eq(userOnboardingProgress.flowKey, body.flowKey),
        ),
      );
  } else {
    await db
      .delete(userOnboardingProgress)
      .where(eq(userOnboardingProgress.userId, userId));
  }

  return c.json({ success: true });
});

export default router;
