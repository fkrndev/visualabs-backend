import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, between, desc, eq, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { clientVisits, clients, employees } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  from: dateStr.optional(),
  to: dateStr.optional(),
  employeeId: z.coerce.number().int().optional(),
  clientId: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const filters: SQL[] = [];
  if (q.from && q.to) filters.push(between(clientVisits.visitDate, q.from, q.to));
  if (q.employeeId) filters.push(eq(clientVisits.employeeId, q.employeeId));
  if (q.clientId) filters.push(eq(clientVisits.clientId, q.clientId));
  if (q.status !== undefined) filters.push(eq(clientVisits.status, q.status));

  const offset = (q.page - 1) * q.limit;
  const items = await db
    .select({ visit: clientVisits, client: clients, employee: employees })
    .from(clientVisits)
    .leftJoin(clients, eq(clients.id, clientVisits.clientId))
    .leftJoin(employees, eq(employees.id, clientVisits.employeeId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(clientVisits.visitDate))
    .limit(q.limit)
    .offset(offset);

  return c.json({
    success: true,
    data: items.map((r) => ({ ...r.visit, client: r.client, employee: r.employee })),
    page: { page: q.page, limit: q.limit, hasNext: items.length === q.limit },
  });
});

const payload = z.object({
  employeeId: z.coerce.number().int(),
  clientId: z.coerce.number().int(),
  visitDate: dateStr,
  checkInAt: z.string().optional(),
  checkOutAt: z.string().optional(),
  latitude: z.union([z.string(), z.number()]).optional(),
  longitude: z.union([z.string(), z.number()]).optional(),
  address: z.string().optional(),
  photo: z.string().optional(),
  purpose: z.string().optional(),
  notes: z.string().optional(),
  status: z.coerce.number().int().min(0).max(3).default(0),
});

router.post("/", zValidator("json", jsonBody(payload)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(clientVisits).values({
    employeeId: p.employeeId,
    clientId: p.clientId,
    visitDate: p.visitDate,
    checkInAt: p.checkInAt ? new Date(p.checkInAt) : null,
    checkOutAt: p.checkOutAt ? new Date(p.checkOutAt) : null,
    latitude: p.latitude != null ? String(p.latitude) : null,
    longitude: p.longitude != null ? String(p.longitude) : null,
    address: p.address ?? null,
    photo: p.photo ?? null,
    purpose: p.purpose ?? null,
    notes: p.notes ?? null,
    status: p.status ?? 0,
  });
  const [row] = await db.select().from(clientVisits).where(eq(clientVisits.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payload.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  const p = c.req.valid("json");
  const setValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    if (k === "checkInAt" || k === "checkOutAt") setValues[k] = v ? new Date(v as string) : null;
    else if (k === "latitude" || k === "longitude") setValues[k] = v == null ? null : String(v);
    else setValues[k] = v;
  }
  if (Object.keys(setValues).length) {
    await db
      .update(clientVisits)
      .set(setValues)
      .where(eq(clientVisits.id, id));
  }
  const [row] = await db.select().from(clientVisits).where(eq(clientVisits.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db
    .delete(clientVisits)
    .where(eq(clientVisits.id, id));
  return c.json({ success: true });
});

export default router;
