import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { extname, join } from "path";

import { db } from "../db/client";
import {
  clientProducts,
  clientTalents,
  customerProfiles,
  customers,
  subscriptions,
  users,
  videoRequests,
} from "../db/schema";
import { requireCustomer } from "../middleware/customerAuth";
import { requireAuth } from "../middleware/auth";
import { resolveCustomerScope } from "../utils/scope/customerScope";
import {
  resolveAdvertiserScope,
  type AdvertiserScope,
} from "../utils/scope/advertiserScope";
import {
  buildVideoPrompts,
  CONTENT_STYLE_KEYS,
  PLATFORM_KEYS,
} from "../lib/videoPrompt";
import { UPLOAD_DIR } from "./uploads";

/**
 * Request Video AI.
 *  - clientVideoRoutes  → JWT customer (requireCustomer), difilter resolveCustomerScope.
 *  - adminVideoRoutes   → JWT staff (requireAuth), difilter resolveAdvertiserScope.
 * Kuota 50 video/bulan PER BRAND (subscription).
 */

const MONTHLY_VIDEO_QUOTA = Number(process.env.MONTHLY_VIDEO_QUOTA || "50");
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const VIDEO_STATUSES = ["submitted", "processing", "delivered", "cancelled"] as const;

// ───────────────────────── Helpers ─────────────────────────

/** Awal bulan berjalan (WIB, karena process.env.TZ = Asia/Jakarta). */
function monthStartDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/** ISO awal bulan depan → kapan kuota reset. */
function monthResetISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0).toISOString();
}

/** SUM(requested_count) brand ini bulan ini, status != cancelled. */
async function quotaUsed(subscriptionId: number): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`COALESCE(SUM(${videoRequests.requestedCount}), 0)`,
    })
    .from(videoRequests)
    .where(
      and(
        eq(videoRequests.subscriptionId, subscriptionId),
        sql`${videoRequests.status} <> 'cancelled'`,
        gte(videoRequests.createdAt, monthStartDate()),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

const insertId = (res: unknown): number => Number((res as any)?.insertId ?? 0);

// ════════════════════════════════════════════════════════════════════
//  CLIENT ROUTER  (/api/client/*)
// ════════════════════════════════════════════════════════════════════

const clientRouter = new Hono();
clientRouter.use("*", requireCustomer);

// ───────── POST /uploads — simpan foto ke disk, balikan url ─────────
clientRouter.post("/uploads", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    return c.json({ success: false, message: "Body tidak valid (multipart)" }, 400);
  }
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json({ success: false, message: "Field 'file' wajib diisi" }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ success: false, message: "Ukuran file maksimal 5 MB" }, 413);
  }
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    return c.json(
      { success: false, message: "Format harus JPG, PNG, atau WEBP" },
      415,
    );
  }
  const name = `${crypto.randomUUID()}${ext || extname(file.name) || ".jpg"}`;
  await Bun.write(join(UPLOAD_DIR, name), file);
  return c.json({
    success: true,
    message: "Foto diunggah",
    data: { url: `/api/uploads/${name}`, name },
  });
});

// ───────── Produk (reusable) ─────────
clientRouter.get("/products", async (c) => {
  const customerId = c.get("customerId") as number;
  const rows = await db
    .select()
    .from(clientProducts)
    .where(and(eq(clientProducts.customerId, customerId), eq(clientProducts.archived, 0)))
    .orderBy(desc(clientProducts.updatedAt));
  return c.json({ success: true, data: rows });
});

const productBody = z.object({
  name: z.string().min(1).max(255),
  primaryPhotoUrl: z.string().min(1).max(512),
  galleryJson: z.array(z.string()).optional(),
  description: z.string().optional(),
  benefits: z.string().optional(),
});

clientRouter.post("/products", zValidator("json", productBody), async (c) => {
  const customerId = c.get("customerId") as number;
  const b = c.req.valid("json");
  const res = await db.insert(clientProducts).values({
    customerId,
    name: b.name,
    primaryPhotoUrl: b.primaryPhotoUrl,
    galleryJson: b.galleryJson ?? null,
    description: b.description ?? null,
    benefits: b.benefits ?? null,
  });
  const id = insertId(res);
  const row = await db.select().from(clientProducts).where(eq(clientProducts.id, id)).limit(1);
  return c.json({ success: true, message: "Produk disimpan", data: row[0] });
});

const productPatch = z.object({
  name: z.string().min(1).max(255).optional(),
  primaryPhotoUrl: z.string().min(1).max(512).optional(),
  galleryJson: z.array(z.string()).optional(),
  description: z.string().optional(),
  benefits: z.string().optional(),
  archived: z.boolean().optional(),
});

clientRouter.patch(
  "/products/:id",
  zValidator("json", productPatch),
  async (c) => {
    const customerId = c.get("customerId") as number;
    const id = Number(c.req.param("id"));
    const owned = await db
      .select({ id: clientProducts.id })
      .from(clientProducts)
      .where(and(eq(clientProducts.id, id), eq(clientProducts.customerId, customerId)))
      .limit(1);
    if (!owned.length) {
      return c.json({ success: false, message: "Produk tidak ditemukan" }, 404);
    }
    const b = c.req.valid("json");
    await db
      .update(clientProducts)
      .set({
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.primaryPhotoUrl !== undefined ? { primaryPhotoUrl: b.primaryPhotoUrl } : {}),
        ...(b.galleryJson !== undefined ? { galleryJson: b.galleryJson } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.benefits !== undefined ? { benefits: b.benefits } : {}),
        ...(b.archived !== undefined ? { archived: b.archived ? 1 : 0 } : {}),
      })
      .where(eq(clientProducts.id, id));
    return c.json({ success: true, message: "Produk diperbarui" });
  },
);

// ───────── Talent (reusable, opsional) ─────────
clientRouter.get("/talents", async (c) => {
  const customerId = c.get("customerId") as number;
  const rows = await db
    .select()
    .from(clientTalents)
    .where(and(eq(clientTalents.customerId, customerId), eq(clientTalents.archived, 0)))
    .orderBy(desc(clientTalents.updatedAt));
  return c.json({ success: true, data: rows });
});

const talentBody = z.object({
  name: z.string().max(255).optional(),
  photoUrl: z.string().min(1).max(512),
  note: z.string().max(512).optional(),
});

clientRouter.post("/talents", zValidator("json", talentBody), async (c) => {
  const customerId = c.get("customerId") as number;
  const b = c.req.valid("json");
  const res = await db.insert(clientTalents).values({
    customerId,
    name: b.name ?? null,
    photoUrl: b.photoUrl,
    note: b.note ?? null,
  });
  const id = insertId(res);
  const row = await db.select().from(clientTalents).where(eq(clientTalents.id, id)).limit(1);
  return c.json({ success: true, message: "Talent disimpan", data: row[0] });
});

// ───────── Kuota per brand ─────────
const quotaQuery = z.object({ subscriptionId: z.coerce.number().int() });

clientRouter.get("/video/quota", zValidator("query", quotaQuery), async (c) => {
  const customerId = c.get("customerId") as number;
  const { subscriptionId } = c.req.valid("query");
  const scope = await resolveCustomerScope(customerId);
  if (!scope.subscriptionIds.includes(subscriptionId)) {
    return c.json({ success: false, message: "Brand tidak ditemukan" }, 403);
  }
  const used = await quotaUsed(subscriptionId);
  return c.json({
    success: true,
    data: {
      used,
      limit: MONTHLY_VIDEO_QUOTA,
      remaining: Math.max(0, MONTHLY_VIDEO_QUOTA - used),
      resetsAt: monthResetISO(),
    },
  });
});

// ───────── Daftar request milik klien ─────────
const listQuery = z.object({
  subscriptionId: z.coerce.number().int().optional(),
});

clientRouter.get("/video-requests", zValidator("query", listQuery), async (c) => {
  const customerId = c.get("customerId") as number;
  const { subscriptionId } = c.req.valid("query");
  const where = subscriptionId
    ? and(
        eq(videoRequests.customerId, customerId),
        eq(videoRequests.subscriptionId, subscriptionId),
      )
    : eq(videoRequests.customerId, customerId);
  const rows = await db
    .select({
      id: videoRequests.id,
      subscriptionId: videoRequests.subscriptionId,
      brand: subscriptions.brand,
      productId: videoRequests.productId,
      productName: clientProducts.name,
      productPhoto: clientProducts.primaryPhotoUrl,
      requestedCount: videoRequests.requestedCount,
      status: videoRequests.status,
      contentStyle: videoRequests.contentStyle,
      platform: videoRequests.platform,
      deliveredUrls: videoRequests.deliveredUrls,
      createdAt: videoRequests.createdAt,
      deliveredAt: videoRequests.deliveredAt,
    })
    .from(videoRequests)
    .leftJoin(clientProducts, eq(clientProducts.id, videoRequests.productId))
    .leftJoin(subscriptions, eq(subscriptions.id, videoRequests.subscriptionId))
    .where(where)
    .orderBy(desc(videoRequests.createdAt));
  return c.json({ success: true, data: rows });
});

// ───────── Detail satu request ─────────
clientRouter.get("/video-requests/:id", async (c) => {
  const customerId = c.get("customerId") as number;
  const id = Number(c.req.param("id"));
  const row = await db
    .select()
    .from(videoRequests)
    .where(and(eq(videoRequests.id, id), eq(videoRequests.customerId, customerId)))
    .limit(1);
  if (!row.length) {
    return c.json({ success: false, message: "Request tidak ditemukan" }, 404);
  }
  const product = await db
    .select()
    .from(clientProducts)
    .where(eq(clientProducts.id, row[0].productId))
    .limit(1);
  return c.json({ success: true, data: { ...row[0], product: product[0] ?? null } });
});

// ───────── Buat request (cek kuota per brand) ─────────
const createBody = z.object({
  subscriptionId: z.number().int(),
  productId: z.number().int(),
  talentId: z.number().int().nullable().optional(),
  talentBrief: z
    .object({
      gender: z.string().optional(),
      age: z.union([z.string(), z.number()]).optional(),
      setting: z.string().optional(),
    })
    .nullable()
    .optional(),
  description: z.string().optional(),
  benefits: z.string().optional(),
  audience: z
    .object({
      ageRanges: z.array(z.string()).optional(),
      gender: z.string().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
    })
    .nullable()
    .optional(),
  contentStyle: z.enum(CONTENT_STYLE_KEYS as [string, ...string[]]).default("grwm"),
  platform: z.enum(PLATFORM_KEYS as [string, ...string[]]).default("tiktok"),
  requestedCount: z.number().int().min(1).max(50),
});

clientRouter.post("/video-requests", zValidator("json", createBody), async (c) => {
  const customerId = c.get("customerId") as number;
  const b = c.req.valid("json");
  const scope = await resolveCustomerScope(customerId);

  // Validasi kepemilikan brand & produk.
  if (!scope.subscriptionIds.includes(b.subscriptionId)) {
    return c.json({ success: false, message: "Brand tidak ditemukan" }, 403);
  }
  const product = await db
    .select()
    .from(clientProducts)
    .where(and(eq(clientProducts.id, b.productId), eq(clientProducts.customerId, customerId)))
    .limit(1);
  if (!product.length) {
    return c.json({ success: false, message: "Produk tidak ditemukan" }, 404);
  }
  let talent: typeof clientTalents.$inferSelect | null = null;
  if (b.talentId) {
    const t = await db
      .select()
      .from(clientTalents)
      .where(and(eq(clientTalents.id, b.talentId), eq(clientTalents.customerId, customerId)))
      .limit(1);
    if (!t.length) {
      return c.json({ success: false, message: "Talent tidak ditemukan" }, 404);
    }
    talent = t[0];
  }

  // Enforcement kuota per brand.
  const used = await quotaUsed(b.subscriptionId);
  const remaining = MONTHLY_VIDEO_QUOTA - used;
  if (b.requestedCount > remaining) {
    return c.json(
      {
        success: false,
        message: `Kuota brand ini bulan ini tersisa ${Math.max(0, remaining)} video`,
      },
      422,
    );
  }

  const prompts = buildVideoPrompts({
    productName: product[0].name,
    contentStyle: b.contentStyle,
    platform: b.platform,
    hasTalentPhoto: !!talent,
    talentBrief: b.talentBrief ?? null,
    audience: b.audience ?? null,
    benefits: b.benefits ?? product[0].benefits,
  });

  const res = await db.insert(videoRequests).values({
    customerId,
    subscriptionId: b.subscriptionId,
    productId: b.productId,
    talentId: b.talentId ?? null,
    talentBriefJson: b.talentBrief ?? null,
    description: b.description ?? product[0].description ?? null,
    benefits: b.benefits ?? product[0].benefits ?? null,
    audienceJson: b.audience ?? null,
    contentStyle: b.contentStyle,
    platform: b.platform,
    requestedCount: b.requestedCount,
    status: "submitted",
    promptsJson: prompts,
  });
  const id = insertId(res);
  return c.json({ success: true, message: "Request video dikirim", data: { id } });
});

// ───────── Batalkan request (hanya saat submitted) ─────────
clientRouter.patch("/video-requests/:id", async (c) => {
  const customerId = c.get("customerId") as number;
  const id = Number(c.req.param("id"));
  const row = await db
    .select({ status: videoRequests.status })
    .from(videoRequests)
    .where(and(eq(videoRequests.id, id), eq(videoRequests.customerId, customerId)))
    .limit(1);
  if (!row.length) {
    return c.json({ success: false, message: "Request tidak ditemukan" }, 404);
  }
  if (row[0].status !== "submitted") {
    return c.json(
      { success: false, message: "Hanya request yang belum diproses bisa dibatalkan" },
      409,
    );
  }
  await db
    .update(videoRequests)
    .set({ status: "cancelled" })
    .where(eq(videoRequests.id, id));
  return c.json({ success: true, message: "Request dibatalkan" });
});

// ════════════════════════════════════════════════════════════════════
//  ADMIN ROUTER  (/api/video-requests/*)
// ════════════════════════════════════════════════════════════════════

const adminRouter = new Hono();
adminRouter.use("*", requireAuth);

function canCustomer(scope: AdvertiserScope, customerId: number): boolean {
  return scope.kind === "admin" || scope.customerIds.includes(customerId);
}

// ───────── Antrian ─────────
const adminListQuery = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  lastId: z.coerce.number().int().optional(),
});

adminRouter.get("/", zValidator("query", adminListQuery), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const scope = r.scope;
  const q = c.req.valid("query");

  const conds = [];
  if (q.status) conds.push(eq(videoRequests.status, q.status));
  if (q.lastId) conds.push(lt(videoRequests.id, q.lastId));
  if (scope.kind === "advertiser") {
    if (scope.customerIds.length === 0) {
      return c.json({ success: true, data: [], page: { limit: q.limit, hasNext: false } });
    }
    conds.push(inArray(videoRequests.customerId, scope.customerIds));
  }

  const rows = await db
    .select({
      id: videoRequests.id,
      customerId: videoRequests.customerId,
      customerName: customerProfiles.name,
      customerEmail: customers.email,
      subscriptionId: videoRequests.subscriptionId,
      brand: subscriptions.brand,
      productName: clientProducts.name,
      productPhoto: clientProducts.primaryPhotoUrl,
      requestedCount: videoRequests.requestedCount,
      status: videoRequests.status,
      contentStyle: videoRequests.contentStyle,
      platform: videoRequests.platform,
      createdAt: videoRequests.createdAt,
      deliveredAt: videoRequests.deliveredAt,
    })
    .from(videoRequests)
    .leftJoin(clientProducts, eq(clientProducts.id, videoRequests.productId))
    .leftJoin(subscriptions, eq(subscriptions.id, videoRequests.subscriptionId))
    .leftJoin(customers, eq(customers.id, videoRequests.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, videoRequests.customerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(videoRequests.id))
    .limit(q.limit + 1);

  const hasNext = rows.length > q.limit;
  const data = hasNext ? rows.slice(0, q.limit) : rows;
  return c.json({
    success: true,
    data,
    page: { limit: q.limit, hasNext, lastId: data.length ? data[data.length - 1].id : null },
  });
});

// ───────── Detail + prompt siap-pakai ─────────
adminRouter.get("/:id", async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const id = Number(c.req.param("id"));
  const row = await db
    .select()
    .from(videoRequests)
    .where(eq(videoRequests.id, id))
    .limit(1);
  if (!row.length) {
    return c.json({ success: false, message: "Request tidak ditemukan" }, 404);
  }
  if (!canCustomer(r.scope, row[0].customerId)) {
    return c.json({ success: false, message: "Tidak punya akses ke client ini" }, 403);
  }

  const [product] = await db
    .select()
    .from(clientProducts)
    .where(eq(clientProducts.id, row[0].productId))
    .limit(1);
  const talent = row[0].talentId
    ? (
        await db
          .select()
          .from(clientTalents)
          .where(eq(clientTalents.id, row[0].talentId))
          .limit(1)
      )[0] ?? null
    : null;
  const [sub] = await db
    .select({ brand: subscriptions.brand, platform: subscriptions.platform })
    .from(subscriptions)
    .where(eq(subscriptions.id, row[0].subscriptionId))
    .limit(1);
  const [cust] = await db
    .select({ name: customerProfiles.name, email: customers.email })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(eq(customers.id, row[0].customerId))
    .limit(1);

  // Prompt: pakai snapshot; regenerate bila belum ada (data lama).
  const prompts =
    row[0].promptsJson ??
    buildVideoPrompts({
      productName: product?.name ?? "produk",
      contentStyle: row[0].contentStyle,
      platform: row[0].platform,
      hasTalentPhoto: !!talent,
      talentBrief: row[0].talentBriefJson,
      audience: row[0].audienceJson,
      benefits: row[0].benefits,
    });

  return c.json({
    success: true,
    data: {
      ...row[0],
      prompts,
      product: product ?? null,
      talent,
      brand: sub?.brand ?? null,
      customer: cust ?? null,
    },
  });
});

// ───────── Update status / catatan / tautan hasil ─────────
const adminPatch = z.object({
  status: z.enum(VIDEO_STATUSES).optional(),
  adminNote: z.string().optional(),
  deliveredUrls: z.array(z.string()).optional(),
});

adminRouter.patch("/:id", zValidator("json", adminPatch), async (c) => {
  const r = await resolveAdvertiserScope(c);
  if (!r.ok) return r.response;
  const id = Number(c.req.param("id"));
  const row = await db
    .select({ customerId: videoRequests.customerId, status: videoRequests.status })
    .from(videoRequests)
    .where(eq(videoRequests.id, id))
    .limit(1);
  if (!row.length) {
    return c.json({ success: false, message: "Request tidak ditemukan" }, 404);
  }
  if (!canCustomer(r.scope, row[0].customerId)) {
    return c.json({ success: false, message: "Tidak punya akses ke client ini" }, 403);
  }
  const b = c.req.valid("json");
  const set: Record<string, unknown> = { processedBy: r.scope.userId };
  if (b.status !== undefined) {
    set.status = b.status;
    if (b.status === "delivered") set.deliveredAt = new Date();
  }
  if (b.adminNote !== undefined) set.adminNote = b.adminNote;
  if (b.deliveredUrls !== undefined) set.deliveredUrls = b.deliveredUrls;
  await db.update(videoRequests).set(set).where(eq(videoRequests.id, id));
  return c.json({ success: true, message: "Request diperbarui" });
});

export const clientVideoRoutes = clientRouter;
export const adminVideoRoutes = adminRouter;
