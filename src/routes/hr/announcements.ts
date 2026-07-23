import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, like, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { announcements } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  status: z.coerce.number().int().optional(),
  category: z.coerce.number().int().optional(),
});

const dateOrNull = z.string().datetime().nullable().optional();

const payloadSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  category: z.coerce.number().int().min(0).max(3).optional(),
  target: z.coerce.number().int().min(0).max(3).optional(),
  targetIds: z.any().optional(),
  attachment: z.string().optional(),
  publishedAt: dateOrNull,
  expiredAt: dateOrNull,
  status: z.coerce.number().int().min(0).max(2).optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { page, limit, q, status, category } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const filters: SQL[] = [];
  if (q) filters.push(like(announcements.title, `%${q}%`));
  if (status !== undefined) filters.push(eq(announcements.status, status));
  if (category !== undefined) filters.push(eq(announcements.category, category));

  const items = await db
    .select()
    .from(announcements)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(announcements.id))
    .limit(limit)
    .offset(offset);

  return c.json({
    success: true,
    data: items,
    page: { page, limit, hasNext: items.length === limit },
  });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const [row] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

router.post("/", zValidator("json", jsonBody(payloadSchema)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(announcements).values({
    title: p.title,
    content: p.content ?? null,
    category: p.category ?? 0,
    target: p.target ?? 0,
    targetIds: p.targetIds ?? null,
    attachment: p.attachment ?? null,
    publishedAt: p.publishedAt ? new Date(p.publishedAt) : null,
    expiredAt: p.expiredAt ? new Date(p.expiredAt) : null,
    createdBy: getHrUserId(c),
    status: p.status ?? 0,
  });
  const [row] = await db.select().from(announcements).where(eq(announcements.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payloadSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const p = c.req.valid("json");

  const setValues: Partial<typeof announcements.$inferInsert> = {};
  if (p.title !== undefined) setValues.title = p.title;
  if (p.content !== undefined) setValues.content = p.content;
  if (p.category !== undefined) setValues.category = p.category;
  if (p.target !== undefined) setValues.target = p.target;
  if (p.targetIds !== undefined) setValues.targetIds = p.targetIds;
  if (p.attachment !== undefined) setValues.attachment = p.attachment;
  if (p.publishedAt !== undefined) setValues.publishedAt = p.publishedAt ? new Date(p.publishedAt) : null;
  if (p.expiredAt !== undefined) setValues.expiredAt = p.expiredAt ? new Date(p.expiredAt) : null;
  if (p.status !== undefined) setValues.status = p.status;

  if (Object.keys(setValues).length) {
    await db.update(announcements).set(setValues).where(eq(announcements.id, id));
  }
  const [row] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  await db.delete(announcements).where(eq(announcements.id, id));
  return c.json({ success: true, message: "Pengumuman dihapus" });
});

export default router;
