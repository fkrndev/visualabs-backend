import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, like, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { positions } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().optional(),
  departmentId: z.coerce.number().int().optional(),
  level: z.coerce.number().int().optional(),
  sortBy: z.enum(["id", "name", "level"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const payloadSchema = z.object({
  name: z.string().min(1),
  departmentId: z.coerce.number().int().nullable().optional(),
  level: z.coerce.number().int().min(0).max(4).optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { page, limit, q, departmentId, level, sortBy, sortOrder } = c.req.valid("query");

  const filters: SQL[] = [];
  if (q) filters.push(like(positions.name, `%${q}%`));
  if (departmentId !== undefined) filters.push(eq(positions.departmentId, departmentId));
  if (level !== undefined) filters.push(eq(positions.level, level));

  const sortMap = { id: positions.id, name: positions.name, level: positions.level } as const;
  const sortCol = sortBy ? sortMap[sortBy] : positions.name;
  const orderBy = sortOrder === "desc" ? desc(sortCol) : asc(sortCol);

  const offset = (page - 1) * limit;
  const items = await db
    .select()
    .from(positions)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);
  return c.json({ success: true, data: items, page: { page, limit, hasNext: items.length === limit } });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const [row] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Position tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

router.post("/", zValidator("json", jsonBody(payloadSchema)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(positions).values({
    name: p.name,
    departmentId: p.departmentId ?? null,
    level: p.level ?? null,
  });
  const [row] = await db.select().from(positions).where(eq(positions.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payloadSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const p = c.req.valid("json");

  const setValues: Partial<typeof positions.$inferInsert> = {};
  if (p.name !== undefined) setValues.name = p.name;
  if (p.departmentId !== undefined) setValues.departmentId = p.departmentId;
  if (p.level !== undefined) setValues.level = p.level;

  if (Object.keys(setValues).length) {
    await db
      .update(positions)
      .set(setValues)
      .where(eq(positions.id, id));
  }
  const [row] = await db.select().from(positions).where(eq(positions.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  await db
    .delete(positions)
    .where(eq(positions.id, id));
  return c.json({ success: true, message: "Position dihapus" });
});

export default router;
