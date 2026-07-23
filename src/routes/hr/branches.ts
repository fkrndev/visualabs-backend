import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, like, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { branches } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();

router.use("*", requireAuth, requireHR);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  status: z.coerce.number().int().optional(),
  sortBy: z.enum(["id", "name", "code", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const payloadSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  address: z.string().optional(),
  latitude: z.union([z.string(), z.number()]).optional(),
  longitude: z.union([z.string(), z.number()]).optional(),
  radius: z.coerce.number().int().optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { page, limit, q, status, sortBy, sortOrder } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const filters: SQL[] = [];
  if (q) filters.push(like(branches.name, `%${q}%`));
  if (status !== undefined) filters.push(eq(branches.status, status));

  const sortMap = { id: branches.id, name: branches.name, code: branches.code, status: branches.status } as const;
  const sortCol = sortBy ? sortMap[sortBy] : branches.id;
  const orderBy = sortOrder === "desc" ? desc(sortCol) : asc(sortCol);

  const items = await db
    .select()
    .from(branches)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(orderBy)
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

  const [row] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, id))
    .limit(1);

  if (!row) return c.json({ success: false, message: "Branch tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

router.post("/", zValidator("json", jsonBody(payloadSchema)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(branches).values({
    name: p.name,
    code: p.code ?? null,
    address: p.address ?? null,
    latitude: p.latitude !== undefined ? String(p.latitude) : null,
    longitude: p.longitude !== undefined ? String(p.longitude) : null,
    radius: p.radius ?? null,
    status: p.status ?? 0,
  });
  const [row] = await db.select().from(branches).where(eq(branches.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payloadSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const p = c.req.valid("json");

  const setValues: Partial<typeof branches.$inferInsert> = {};
  if (p.name !== undefined) setValues.name = p.name;
  if (p.code !== undefined) setValues.code = p.code;
  if (p.address !== undefined) setValues.address = p.address;
  if (p.latitude !== undefined) setValues.latitude = String(p.latitude);
  if (p.longitude !== undefined) setValues.longitude = String(p.longitude);
  if (p.radius !== undefined) setValues.radius = p.radius;
  if (p.status !== undefined) setValues.status = p.status;

  if (Object.keys(setValues).length) {
    await db
      .update(branches)
      .set(setValues)
      .where(eq(branches.id, id));
  }

  const [row] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  await db
    .delete(branches)
    .where(eq(branches.id, id));
  return c.json({ success: true, message: "Branch dihapus" });
});

export default router;
