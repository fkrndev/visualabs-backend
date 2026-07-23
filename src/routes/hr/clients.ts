import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, like, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { clients } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().optional(),
  category: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const filters: SQL[] = [];
  if (q.q) filters.push(like(clients.name, `%${q.q}%`));
  if (q.category !== undefined) filters.push(eq(clients.category, q.category));
  if (q.status !== undefined) filters.push(eq(clients.status, q.status));
  const offset = (q.page - 1) * q.limit;
  const items = await db
    .select()
    .from(clients)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(clients.name))
    .limit(q.limit)
    .offset(offset);
  return c.json({
    success: true,
    data: items,
    page: { page: q.page, limit: q.limit, hasNext: items.length === q.limit },
  });
});

const payload = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  latitude: z.union([z.string(), z.number()]).optional(),
  longitude: z.union([z.string(), z.number()]).optional(),
  category: z.coerce.number().int().min(0).max(2).optional(),
  picEmployeeId: z.coerce.number().int().nullable().optional(),
  notes: z.string().optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
});

router.post("/", zValidator("json", jsonBody(payload)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(clients).values({
    name: p.name,
    code: p.code ?? null,
    contactPerson: p.contactPerson ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    address: p.address ?? null,
    latitude: p.latitude != null ? String(p.latitude) : null,
    longitude: p.longitude != null ? String(p.longitude) : null,
    category: p.category ?? null,
    picEmployeeId: p.picEmployeeId ?? null,
    notes: p.notes ?? null,
    status: p.status ?? 0,
  });
  const [row] = await db.select().from(clients).where(eq(clients.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payload.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  const p = c.req.valid("json");
  const setValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    if (k === "latitude" || k === "longitude") setValues[k] = v == null ? null : String(v);
    else setValues[k] = v;
  }
  if (Object.keys(setValues).length) {
    await db
      .update(clients)
      .set(setValues)
      .where(eq(clients.id, id));
  }
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.delete(clients).where(eq(clients.id, id));
  return c.json({ success: true });
});

export default router;
