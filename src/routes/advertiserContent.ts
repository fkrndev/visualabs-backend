import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  assetRequests,
  clientUpdates,
  customerProfiles,
  customers,
  platformDailyMetrics,
  profiles,
  subscriptions,
  users,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import {
  resolveAdvertiserScope,
  type AdvertiserScope,
} from "../utils/scope/advertiserScope";
import { normalizePlatform } from "../utils/scope/customerScope";
import { computeMetricSnapshot } from "../utils/metrics/snapshot";

/**
 * Authoring konten untuk aplikasi client (v-auto-client).
 *
 * Dipakai oleh tim advertiser di v-auto-frontend. Semua endpoint pakai JWT staff
 * (`requireAuth`). Akses:
 *  - management (Dev/Admin/Owner/Head-Advertiser) → semua client.
 *  - advertiser (role 4) → hanya client yang berelasi (subscriptions.advertiserId == userId).
 * Aturan ini persis perilaku `resolveAdvertiserScope`.
 */
const router = new Hono();

router.use("*", requireAuth);

// ───────────────────────── Scope helpers ─────────────────────────

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function canCustomer(scope: AdvertiserScope, customerId: number): boolean {
  return scope.kind === "admin" || scope.customerIds.includes(customerId);
}

function canSub(scope: AdvertiserScope, subscriptionId: number): boolean {
  return scope.kind === "admin" || scope.subscriptionIds.includes(subscriptionId);
}

const forbidden = (c: any) =>
  c.json({ success: false, message: "Tidak punya akses ke client ini" }, 403);

/** Customer id dari sebuah client_update / asset_request (untuk cek scope by :id). */
async function updateCustomerId(id: number): Promise<number | null> {
  const r = await db
    .select({ customerId: clientUpdates.customerId })
    .from(clientUpdates)
    .where(eq(clientUpdates.id, id))
    .limit(1);
  return r[0]?.customerId ?? null;
}

async function assetCustomerId(id: number): Promise<number | null> {
  const r = await db
    .select({ customerId: assetRequests.customerId })
    .from(assetRequests)
    .where(eq(assetRequests.id, id))
    .limit(1);
  return r[0]?.customerId ?? null;
}

async function metricSubId(id: number): Promise<number | null> {
  const r = await db
    .select({ subscriptionId: platformDailyMetrics.subscriptionId })
    .from(platformDailyMetrics)
    .where(eq(platformDailyMetrics.id, id))
    .limit(1);
  return r[0]?.subscriptionId ?? null;
}

// ───────────────────────── GET /content/overview ─────────────────────────

const overviewQuery = z.object({ customerId: z.coerce.number().int() });

router.get("/content/overview", zValidator("query", overviewQuery), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const { customerId } = c.req.valid("query");
  if (!canCustomer(r.scope, customerId)) return forbidden(c);

  const cust = await db
    .select({ id: customers.id, name: customerProfiles.name })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!cust[0]) return c.json({ success: false, message: "Client tidak ditemukan" }, 404);

  const subs = await db
    .select({
      id: subscriptions.id,
      brand: subscriptions.brand,
      platform: subscriptions.platform,
      phase: subscriptions.phase,
      phaseNote: subscriptions.phaseNote,
      phaseUpdatedAt: subscriptions.phaseUpdatedAt,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.customerId, customerId));

  const subIds = subs.map((s) => s.id);

  // last metric date per non-meta subscription
  let lastMetric: Record<number, string> = {};
  if (subIds.length > 0) {
    const rows = await db
      .select({
        subscriptionId: platformDailyMetrics.subscriptionId,
        maxDate: sql<string>`MAX(${platformDailyMetrics.date})`,
      })
      .from(platformDailyMetrics)
      .where(inArray(platformDailyMetrics.subscriptionId, subIds))
      .groupBy(platformDailyMetrics.subscriptionId);
    for (const r2 of rows) lastMetric[r2.subscriptionId] = r2.maxDate;
  }

  const [updCount] = await db
    .select({ n: sql<number>`COUNT(*)`, last: sql<string>`MAX(${clientUpdates.publishedAt})` })
    .from(clientUpdates)
    .where(eq(clientUpdates.customerId, customerId));

  const [assetOpen] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(assetRequests)
    .where(
      and(
        eq(assetRequests.customerId, customerId),
        inArray(assetRequests.status, ["requested", "in_progress"]),
      ),
    );

  return c.json({
    success: true,
    data: {
      customer: { id: cust[0].id, name: cust[0].name },
      subscriptions: subs.map((s) => ({
        ...s,
        platformKey: normalizePlatform(s.platform),
        lastMetricDate: lastMetric[s.id] ?? null,
      })),
      updateCount: num(updCount?.n),
      lastUpdateAt: updCount?.last ?? null,
      assetOpenCount: num(assetOpen?.n),
    },
  });
});

// ───────────────────────── UPDATES ─────────────────────────

const UPDATE_TYPES = ["info", "attention", "milestone", "request", "education"] as const;

router.get(
  "/updates",
  zValidator("query", z.object({ customerId: z.coerce.number().int(), cursor: z.coerce.number().int().optional() })),
  async (c) => {
    const r = await resolveAdvertiserScope(c);
    if (!r.ok) return r.response;
    const { customerId, cursor } = c.req.valid("query");
    if (!canCustomer(r.scope, customerId)) return forbidden(c);

    const conds = [eq(clientUpdates.customerId, customerId)];
    if (cursor) conds.push(lte(clientUpdates.id, cursor - 1));

    const rows = await db
      .select({
        id: clientUpdates.id,
        subscriptionId: clientUpdates.subscriptionId,
        type: clientUpdates.type,
        title: clientUpdates.title,
        body: clientUpdates.body,
        metricSnapshot: clientUpdates.metricSnapshot,
        publishedAt: clientUpdates.publishedAt,
        authorName: profiles.name,
      })
      .from(clientUpdates)
      .leftJoin(users, eq(users.id, clientUpdates.authorUserId))
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(and(...conds))
      .orderBy(desc(clientUpdates.id))
      .limit(21);

    const hasMore = rows.length > 20;
    const items = rows.slice(0, 20);
    return c.json({
      success: true,
      data: { items, nextCursor: hasMore ? items[items.length - 1]?.id : null },
    });
  },
);

const updateBody = z.object({
  customerId: z.number().int(),
  subscriptionId: z.number().int().nullable().optional(),
  type: z.enum(UPDATE_TYPES),
  title: z.string().min(1).max(255),
  body: z.string().optional(),
  attachMetric: z.boolean().optional(),
});

router.post("/updates", zValidator("json", updateBody), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const b = c.req.valid("json");
  if (!canCustomer(r.scope, b.customerId)) return forbidden(c);
  if (b.subscriptionId && !canSub(r.scope, b.subscriptionId)) return forbidden(c);

  let snapshot = null;
  if (b.attachMetric) {
    snapshot = await computeMetricSnapshot({
      customerId: b.customerId,
      subscriptionId: b.subscriptionId ?? null,
    });
  }

  const res = await db.insert(clientUpdates).values({
    customerId: b.customerId,
    subscriptionId: b.subscriptionId ?? null,
    authorUserId: r.scope.userId,
    type: b.type,
    title: b.title,
    body: b.body ?? null,
    metricSnapshot: snapshot as any,
  });

  return c.json({ success: true, message: "Update terkirim ke client", data: { id: (res as any).insertId } });
});

const updateEdit = z.object({
  type: z.enum(UPDATE_TYPES).optional(),
  title: z.string().min(1).max(255).optional(),
  body: z.string().nullable().optional(),
});

router.put("/updates/:id", zValidator("json", updateEdit), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const id = Number(c.req.param("id"));
  const cid = await updateCustomerId(id);
  if (cid == null) return c.json({ success: false, message: "Update tidak ditemukan" }, 404);
  if (!canCustomer(r.scope, cid)) return forbidden(c);

  const b = c.req.valid("json");
  await db.update(clientUpdates).set({
    ...(b.type ? { type: b.type } : {}),
    ...(b.title ? { title: b.title } : {}),
    ...(b.body !== undefined ? { body: b.body } : {}),
  }).where(eq(clientUpdates.id, id));
  return c.json({ success: true, message: "Update diperbarui" });
});

router.delete("/updates/:id", async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const id = Number(c.req.param("id"));
  const cid = await updateCustomerId(id);
  if (cid == null) return c.json({ success: false, message: "Update tidak ditemukan" }, 404);
  if (!canCustomer(r.scope, cid)) return forbidden(c);
  await db.delete(clientUpdates).where(eq(clientUpdates.id, id));
  return c.json({ success: true, message: "Update dihapus" });
});

// ───────────────────────── ASSET REQUESTS ─────────────────────────

const ASSET_TYPES = ["video", "image", "copywriting", "product_info", "other"] as const;
const ASSET_STATUS = ["requested", "in_progress", "delivered", "approved"] as const;

router.get(
  "/asset-requests",
  zValidator("query", z.object({ customerId: z.coerce.number().int() })),
  async (c) => {
    const r = await resolveAdvertiserScope(c);
    if (!r.ok) return r.response;
    const { customerId } = c.req.valid("query");
    if (!canCustomer(r.scope, customerId)) return forbidden(c);

    const rows = await db
      .select()
      .from(assetRequests)
      .where(eq(assetRequests.customerId, customerId))
      .orderBy(desc(assetRequests.createdAt))
      .limit(200);
    return c.json({ success: true, data: rows });
  },
);

const assetBody = z.object({
  customerId: z.number().int(),
  subscriptionId: z.number().int().nullable().optional(),
  type: z.enum(ASSET_TYPES),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  dueDate: z.string().nullable().optional(), // YYYY-MM-DD
  alsoNotify: z.boolean().optional(), // sekalian kirim Update "request" ke client
});

router.post("/asset-requests", zValidator("json", assetBody), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const b = c.req.valid("json");
  if (!canCustomer(r.scope, b.customerId)) return forbidden(c);
  if (b.subscriptionId && !canSub(r.scope, b.subscriptionId)) return forbidden(c);

  const res = await db.insert(assetRequests).values({
    customerId: b.customerId,
    subscriptionId: b.subscriptionId ?? null,
    requestedBy: r.scope.userId,
    type: b.type,
    title: b.title,
    description: b.description ?? null,
    dueDate: b.dueDate ?? null,
    status: "requested",
  });

  if (b.alsoNotify) {
    await db.insert(clientUpdates).values({
      customerId: b.customerId,
      subscriptionId: b.subscriptionId ?? null,
      authorUserId: r.scope.userId,
      type: "request",
      title: `Permintaan aset: ${b.title}`,
      body: b.description ?? "Tim membutuhkan aset baru. Lihat detail di tab Tugas.",
    });
  }

  return c.json({ success: true, message: "Permintaan aset dibuat", data: { id: (res as any).insertId } });
});

const assetPatch = z.object({
  status: z.enum(ASSET_STATUS).optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

router.patch("/asset-requests/:id", zValidator("json", assetPatch), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const id = Number(c.req.param("id"));
  const cid = await assetCustomerId(id);
  if (cid == null) return c.json({ success: false, message: "Aset tidak ditemukan" }, 404);
  if (!canCustomer(r.scope, cid)) return forbidden(c);

  const b = c.req.valid("json");
  await db.update(assetRequests).set({
    ...(b.status ? { status: b.status, deliveredAt: b.status === "delivered" ? new Date() : undefined } : {}),
    ...(b.title ? { title: b.title } : {}),
    ...(b.description !== undefined ? { description: b.description } : {}),
    ...(b.dueDate !== undefined ? { dueDate: b.dueDate } : {}),
  }).where(eq(assetRequests.id, id));
  return c.json({ success: true, message: "Permintaan aset diperbarui" });
});

router.delete("/asset-requests/:id", async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const id = Number(c.req.param("id"));
  const cid = await assetCustomerId(id);
  if (cid == null) return c.json({ success: false, message: "Aset tidak ditemukan" }, 404);
  if (!canCustomer(r.scope, cid)) return forbidden(c);
  await db.delete(assetRequests).where(eq(assetRequests.id, id));
  return c.json({ success: true, message: "Permintaan aset dihapus" });
});

// ───────────────────────── PHASE ─────────────────────────

const PHASES = ["learning", "optimization", "scaling", "steady"] as const;

router.patch(
  "/subscriptions/:id/phase",
  zValidator("json", z.object({ phase: z.enum(PHASES), phaseNote: z.string().max(255).nullable().optional() })),
  async (c) => {
    const r = await resolveAdvertiserScope(c);
    if (!r.ok) return r.response;
    const id = Number(c.req.param("id"));
    if (!canSub(r.scope, id)) return forbidden(c);

    const exists = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);
    if (!exists[0]) return c.json({ success: false, message: "Subscription tidak ditemukan" }, 404);

    const b = c.req.valid("json");
    await db.update(subscriptions).set({
      phase: b.phase,
      phaseNote: b.phaseNote ?? null,
      phaseUpdatedAt: new Date(),
    }).where(eq(subscriptions.id, id));
    return c.json({ success: true, message: "Fase iklan diperbarui" });
  },
);

// ───────────────────────── PLATFORM METRICS (TikTok/Shopee) ─────────────────────────

const PLATFORMS = ["tiktok", "shopee", "meta"] as const;

router.get(
  "/platform-metrics",
  zValidator(
    "query",
    z.object({
      subscriptionId: z.coerce.number().int(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  ),
  async (c) => {
    const r = await resolveAdvertiserScope(c);
    if (!r.ok) return r.response;
    const { subscriptionId, from, to } = c.req.valid("query");
    if (!canSub(r.scope, subscriptionId)) return forbidden(c);

    const conds = [eq(platformDailyMetrics.subscriptionId, subscriptionId)];
    if (from) conds.push(gte(platformDailyMetrics.date, from));
    if (to) conds.push(lte(platformDailyMetrics.date, to));

    const rows = await db
      .select()
      .from(platformDailyMetrics)
      .where(and(...conds))
      .orderBy(desc(platformDailyMetrics.date))
      .limit(400);
    return c.json({ success: true, data: rows });
  },
);

const metricRow = z.object({
  date: z.string(), // YYYY-MM-DD
  spend: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  orders: z.number().int().nullable().optional(),
  clicks: z.number().int().nullable().optional(),
  impressions: z.number().int().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

const dec = (v: number | null | undefined): string | null =>
  v == null ? null : String(v);

router.post(
  "/platform-metrics",
  zValidator(
    "json",
    metricRow.extend({
      subscriptionId: z.number().int(),
      platform: z.enum(PLATFORMS),
      source: z.enum(["manual", "csv", "api"]).optional(),
    }),
  ),
  async (c) => {
    const r = await resolveAdvertiserScope(c);
    if (!r.ok) return r.response;
    const b = c.req.valid("json");
    if (!canSub(r.scope, b.subscriptionId)) return forbidden(c);

    await db
      .insert(platformDailyMetrics)
      .values({
        subscriptionId: b.subscriptionId,
        platform: b.platform,
        date: b.date,
        spend: dec(b.spend),
        revenue: dec(b.revenue),
        orders: b.orders ?? null,
        clicks: b.clicks ?? null,
        impressions: b.impressions ?? null,
        note: b.note ?? null,
        source: b.source ?? "manual",
      })
      .onDuplicateKeyUpdate({
        set: {
          spend: dec(b.spend),
          revenue: dec(b.revenue),
          orders: b.orders ?? null,
          clicks: b.clicks ?? null,
          impressions: b.impressions ?? null,
          note: b.note ?? null,
          source: b.source ?? "manual",
        },
      });
    return c.json({ success: true, message: "Data tersimpan" });
  },
);

router.post(
  "/platform-metrics/bulk",
  zValidator(
    "json",
    z.object({
      subscriptionId: z.number().int(),
      platform: z.enum(PLATFORMS),
      source: z.enum(["manual", "csv", "api"]).optional(),
      rows: z.array(metricRow).min(1).max(400),
    }),
  ),
  async (c) => {
    const r = await resolveAdvertiserScope(c);
    if (!r.ok) return r.response;
    const b = c.req.valid("json");
    if (!canSub(r.scope, b.subscriptionId)) return forbidden(c);

    const source = b.source ?? "csv";
    const values = b.rows.map((row) => ({
      subscriptionId: b.subscriptionId,
      platform: b.platform,
      date: row.date,
      spend: dec(row.spend),
      revenue: dec(row.revenue),
      orders: row.orders ?? null,
      clicks: row.clicks ?? null,
      impressions: row.impressions ?? null,
      note: row.note ?? null,
      source,
    }));

    await db
      .insert(platformDailyMetrics)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          spend: sql`VALUES(spend)`,
          revenue: sql`VALUES(revenue)`,
          orders: sql`VALUES(orders)`,
          clicks: sql`VALUES(clicks)`,
          impressions: sql`VALUES(impressions)`,
          note: sql`VALUES(note)`,
          source: sql`VALUES(source)`,
        },
      });
    return c.json({ success: true, message: `${values.length} baris diimpor`, data: { count: values.length } });
  },
);

router.delete("/platform-metrics/:id", async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const id = Number(c.req.param("id"));
  const sid = await metricSubId(id);
  if (sid == null) return c.json({ success: false, message: "Data tidak ditemukan" }, 404);
  if (!canSub(r.scope, sid)) return forbidden(c);
  await db.delete(platformDailyMetrics).where(eq(platformDailyMetrics.id, id));
  return c.json({ success: true, message: "Data dihapus" });
});

export default router;
