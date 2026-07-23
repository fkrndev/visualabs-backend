import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, between, desc, eq, inArray, SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { locationTracks, employees } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const listQuery = z.object({
  employeeId: z.coerce.number().int().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const filters: SQL[] = [];
  if (q.employeeId) filters.push(eq(locationTracks.employeeId, q.employeeId));
  if (q.from && q.to)
    filters.push(between(locationTracks.trackedAt, new Date(q.from), new Date(q.to)));
  const items = await db
    .select()
    .from(locationTracks)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(locationTracks.trackedAt))
    .limit(q.limit);
  return c.json({ success: true, data: items });
});

// Latest position per employee — for "live" view
router.get("/latest", async (c) => {
  // Sub-select: get max tracked_at per employee
  const rows = await db.execute(sql`
    SELECT lt.* FROM location_tracks lt
    INNER JOIN (
      SELECT employee_id, MAX(tracked_at) AS max_at
      FROM location_tracks
      GROUP BY employee_id
    ) latest ON latest.employee_id = lt.employee_id AND latest.max_at = lt.tracked_at
    ORDER BY lt.tracked_at DESC
    LIMIT 200
  `);
  // mysql2 returns [rows, fields] sometimes; normalize
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = Array.isArray((rows as any)[0]) ? (rows as any)[0] : rows;
  return c.json({ success: true, data });
});

const bulkInsert = z.object({
  employeeId: z.coerce.number().int(),
  points: z
    .array(
      z.object({
        latitude: z.union([z.string(), z.number()]),
        longitude: z.union([z.string(), z.number()]),
        accuracy: z.union([z.string(), z.number()]).optional(),
        address: z.string().optional(),
        batteryLevel: z.coerce.number().int().optional(),
        isMockLocation: z.coerce.number().int().min(0).max(1).optional(),
        trackedAt: z.string(),
      }),
    )
    .min(1),
});

router.post("/", zValidator("json", jsonBody(bulkInsert)), async (c) => {
  const p = c.req.valid("json");
  // Verify employee exists
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, p.employeeId))
    .limit(1);
  if (!emp) return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);

  const rows = p.points.map((pt) => ({
    employeeId: p.employeeId,
    latitude: String(pt.latitude),
    longitude: String(pt.longitude),
    accuracy: pt.accuracy != null ? String(pt.accuracy) : null,
    address: pt.address ?? null,
    batteryLevel: pt.batteryLevel ?? null,
    isMockLocation: pt.isMockLocation ?? 0,
    trackedAt: new Date(pt.trackedAt),
  }));
  await db.insert(locationTracks).values(rows);
  return c.json({ success: true, data: { inserted: rows.length } }, 201);
});

export default router;
