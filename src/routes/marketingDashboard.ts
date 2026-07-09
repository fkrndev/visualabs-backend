import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { fbAct, fbToken } from "../db/schema";
import {
  fetchInsights,
  fetchInsightsPerDay,
  fetchInsightsByCampaign,
  fetchInsightsByAd,
  fetchInsightsByBreakdown,
  fetchAdPreview,
  type TimeRange,
} from "../services/metaApi";
import { requireAuth } from "../middleware/auth";
import {
  resolveAdvertiserScope,
  type AdvertiserScope,
} from "../utils/scope/advertiserScope";

/**
 * Dashboard performa Meta Ads untuk staff/advertiser (v-auto-frontend).
 * Semua endpoint pakai JWT staff (`requireAuth`); non-management dibatasi ke
 * fb_act milik client yang berelasi (`resolveAdvertiserScope` — sama persis
 * dengan `advertiserContent.ts`). Sebelumnya route ini TIDAK punya auth sama
 * sekali — fbActId dipercaya mentah-mentah dari client.
 */
const router = new Hono();

router.use("*", requireAuth);

const basePayload = z.object({
  fbActId: z.number().int().positive(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  compDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function canFbAct(scope: AdvertiserScope, fbActId: number): boolean {
  return scope.kind === "admin" || scope.fbActIds.includes(fbActId);
}

const forbidden = (c: any) =>
  c.json({ success: false, message: "Tidak punya akses ke akun iklan ini" }, 403);

async function resolveActAndToken(fbActId: number) {
  const act = await db.query.fbAct.findFirst({ where: eq(fbAct.id, fbActId) });
  if (!act) throw new Error("FB Act tidak ditemukan");

  if (!act.tokenId) throw new Error("Token belum dikonfigurasi untuk akun ini");

  const token = await db.query.fbToken.findFirst({ where: eq(fbToken.id, act.tokenId) });
  if (!token) throw new Error("FB Token tidak ditemukan");

  return { act, token: token.token };
}

// POST /marketing-dashboard/overview
router.post("/overview", zValidator("json", basePayload), async (c) => {
  const { fbActId, dateFrom, dateTo, compDateFrom, compDateTo } = c.req.valid("json");

  const scopeResult = await resolveAdvertiserScope(c);
  if (!scopeResult.ok) return scopeResult.response;
  if (!canFbAct(scopeResult.scope, fbActId)) return forbidden(c);

  try {
    const { act, token } = await resolveActAndToken(fbActId);
    const actId = act.actId.replace(/^act_/, "");
    const timeRange: TimeRange = { since: dateFrom, until: dateTo };

    const [current, perDay] = await Promise.all([
      fetchInsights(actId, token, timeRange),
      fetchInsightsPerDay(actId, token, timeRange),
    ]);

    let comparison = null;
    let compPerDay = null;
    if (compDateFrom && compDateTo) {
      const compRange: TimeRange = { since: compDateFrom, until: compDateTo };
      [comparison, compPerDay] = await Promise.all([
        fetchInsights(actId, token, compRange),
        fetchInsightsPerDay(actId, token, compRange),
      ]);
    }

    return c.json({
      success: true,
      data: {
        account: {
          id: act.id,
          actId: act.actId,
          actName: act.actName,
          name: act.name,
          dataJson: typeof act.dataJson === 'string' ? JSON.parse(act.dataJson) : (act.dataJson ?? null),
        },
        current: current?.data?.[0] ?? null,
        perDay: perDay?.data ?? [],
        comparison: comparison?.data?.[0] ?? null,
        compPerDay: compPerDay?.data ?? [],
      },
    });
  } catch (error: any) {
    console.error("[marketing/overview]", error);
    return c.json({ success: false, message: error?.message || "Gagal mengambil data" }, 500);
  }
});

// POST /marketing-dashboard/campaign
router.post("/campaign", zValidator("json", basePayload), async (c) => {
  const { fbActId, dateFrom, dateTo } = c.req.valid("json");

  const scopeResult = await resolveAdvertiserScope(c);
  if (!scopeResult.ok) return scopeResult.response;
  if (!canFbAct(scopeResult.scope, fbActId)) return forbidden(c);

  try {
    const { act, token } = await resolveActAndToken(fbActId);
    const actId = act.actId.replace(/^act_/, "");
    const timeRange: TimeRange = { since: dateFrom, until: dateTo };

    const result = await fetchInsightsByCampaign(actId, token, timeRange);

    return c.json({ success: true, data: result?.data ?? [] });
  } catch (error: any) {
    console.error("[marketing/campaign]", error);
    return c.json({ success: false, message: error?.message || "Gagal mengambil data campaign" }, 500);
  }
});

// POST /marketing-dashboard/ad
router.post("/ad", zValidator("json", basePayload), async (c) => {
  const { fbActId, dateFrom, dateTo } = c.req.valid("json");

  const scopeResult = await resolveAdvertiserScope(c);
  if (!scopeResult.ok) return scopeResult.response;
  if (!canFbAct(scopeResult.scope, fbActId)) return forbidden(c);

  try {
    const { act, token } = await resolveActAndToken(fbActId);
    const actId = act.actId.replace(/^act_/, "");
    const timeRange: TimeRange = { since: dateFrom, until: dateTo };

    const result = await fetchInsightsByAd(actId, token, timeRange) as { data: unknown[] };

    return c.json({ success: true, data: result?.data ?? [] });
  } catch (error: any) {
    console.error("[marketing/ad]", error);
    return c.json({ success: false, message: error?.message || "Gagal mengambil data ad" }, 500);
  }
});

// POST /marketing-dashboard/breakdown/age
router.post("/breakdown/age", zValidator("json", basePayload), async (c) => {
  const { fbActId, dateFrom, dateTo } = c.req.valid("json");

  const scopeResult = await resolveAdvertiserScope(c);
  if (!scopeResult.ok) return scopeResult.response;
  if (!canFbAct(scopeResult.scope, fbActId)) return forbidden(c);

  try {
    const { act, token } = await resolveActAndToken(fbActId);
    const actId = act.actId.replace(/^act_/, "");
    const result = await fetchInsightsByBreakdown(actId, token, { since: dateFrom, until: dateTo }, "age");

    return c.json({ success: true, data: result?.data ?? [] });
  } catch (error: any) {
    console.error("[marketing/breakdown/age]", error);
    return c.json({ success: false, message: error?.message || "Gagal mengambil data" }, 500);
  }
});

// POST /marketing-dashboard/breakdown/gender
router.post("/breakdown/gender", zValidator("json", basePayload), async (c) => {
  const { fbActId, dateFrom, dateTo } = c.req.valid("json");

  const scopeResult = await resolveAdvertiserScope(c);
  if (!scopeResult.ok) return scopeResult.response;
  if (!canFbAct(scopeResult.scope, fbActId)) return forbidden(c);

  try {
    const { act, token } = await resolveActAndToken(fbActId);
    const actId = act.actId.replace(/^act_/, "");
    const result = await fetchInsightsByBreakdown(actId, token, { since: dateFrom, until: dateTo }, "gender");

    return c.json({ success: true, data: result?.data ?? [] });
  } catch (error: any) {
    console.error("[marketing/breakdown/gender]", error);
    return c.json({ success: false, message: error?.message || "Gagal mengambil data" }, 500);
  }
});

// POST /marketing-dashboard/breakdown/device
router.post("/breakdown/device", zValidator("json", basePayload), async (c) => {
  const { fbActId, dateFrom, dateTo } = c.req.valid("json");

  const scopeResult = await resolveAdvertiserScope(c);
  if (!scopeResult.ok) return scopeResult.response;
  if (!canFbAct(scopeResult.scope, fbActId)) return forbidden(c);

  try {
    const { act, token } = await resolveActAndToken(fbActId);
    const actId = act.actId.replace(/^act_/, "");
    const result = await fetchInsightsByBreakdown(actId, token, { since: dateFrom, until: dateTo }, "impression_device");

    return c.json({ success: true, data: result?.data ?? [] });
  } catch (error: any) {
    console.error("[marketing/breakdown/device]", error);
    return c.json({ success: false, message: error?.message || "Gagal mengambil data" }, 500);
  }
});

// POST /marketing-dashboard/ad-preview
const adPreviewPayload = z.object({
  fbActId: z.number().int().positive(),
  adId: z.string().min(1),
});

router.post("/ad-preview", zValidator("json", adPreviewPayload), async (c) => {
  const { fbActId, adId } = c.req.valid("json");

  const scopeResult = await resolveAdvertiserScope(c);
  if (!scopeResult.ok) return scopeResult.response;
  if (!canFbAct(scopeResult.scope, fbActId)) return forbidden(c);

  try {
    const { token } = await resolveActAndToken(fbActId);
    const result = await fetchAdPreview(adId, token);

    return c.json({ success: true, data: result?.data ?? [] });
  } catch (error: any) {
    console.error("[marketing/ad-preview]", error);
    return c.json({ success: false, message: error?.message || "Gagal mengambil preview" }, 500);
  }
});

// PUT /marketing-dashboard/config — simpan dataJson ke fb_act
const configPayload = z.object({
  fbActId: z.number().int().positive(),
  dataJson: z.record(z.string(), z.unknown()),
});

router.put("/config", zValidator("json", configPayload), async (c) => {
  const { fbActId, dataJson } = c.req.valid("json");

  const scopeResult = await resolveAdvertiserScope(c);
  if (!scopeResult.ok) return scopeResult.response;
  if (!canFbAct(scopeResult.scope, fbActId)) return forbidden(c);

  try {
    const act = await db.query.fbAct.findFirst({ where: eq(fbAct.id, fbActId) });
    if (!act) return c.json({ success: false, message: "FB Act tidak ditemukan" }, 404);

    const existing = typeof act.dataJson === 'string'
      ? JSON.parse(act.dataJson)
      : (act.dataJson ?? {});
    const merged = { ...(existing as object), ...dataJson };
    await db.update(fbAct).set({ dataJson: merged }).where(eq(fbAct.id, fbActId));

    return c.json({ success: true, message: "Konfigurasi disimpan" });
  } catch (error: any) {
    console.error("[marketing/config]", error);
    return c.json({ success: false, message: error?.message || "Gagal menyimpan konfigurasi" }, 500);
  }
});

export default router;
