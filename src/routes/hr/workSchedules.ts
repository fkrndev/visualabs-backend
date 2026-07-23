import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, like, sql, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { employees, workSchedules } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

const payloadSchema = z.object({
  name: z.string().min(1),
  type: z.coerce.number().int().min(0).max(2).default(0),
  startTime: timeStr.optional(),
  endTime: timeStr.optional(),
  breakDuration: z.coerce.number().int().optional(),
  lateTolerance: z.coerce.number().int().optional(),
  earlyLeaveTolerance: z.coerce.number().int().optional(),
  workingDays: z.record(z.string(), z.any()).optional(),
});

// GET /default — get-or-create single default Jadwal Tetap (type=0) per business
// Lebih sederhana: pengaturan global, tidak perlu assign per karyawan.
router.get("/default", async (c) => {
  const [existing] = await db
    .select()
    .from(workSchedules)
    .where(eq(workSchedules.type, 0))
    .orderBy(asc(workSchedules.id))
    .limit(1);
  if (existing) return c.json({ success: true, data: existing });

  // Auto-create default
  const [res] = await db.insert(workSchedules).values({
    name: "Jadwal Kantor Standar",
    type: 0,
    startTime: "08:00:00",
    endTime: "17:00:00",
    breakDuration: 60,
    lateTolerance: 15,
    earlyLeaveTolerance: 0,
    workingDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  });
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row });
});

// PUT /default — update single default Jadwal Tetap
const defaultPayload = z.object({
  name: z.string().min(1).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  breakDuration: z.coerce.number().int().optional(),
  lateTolerance: z.coerce.number().int().optional(),
  earlyLeaveTolerance: z.coerce.number().int().optional(),
  workingDays: z.record(z.string(), z.any()).optional(),
});

router.put("/default", zValidator("json", jsonBody(defaultPayload)), async (c) => {
  const p = c.req.valid("json");
  // Get-or-create first
  const [existing] = await db
    .select()
    .from(workSchedules)
    .where(eq(workSchedules.type, 0))
    .orderBy(asc(workSchedules.id))
    .limit(1);

  let id: number;
  if (existing) {
    id = existing.id;
    const setValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) if (v !== undefined) setValues[k] = v;
    if (Object.keys(setValues).length) {
      await db.update(workSchedules).set(setValues).where(eq(workSchedules.id, id));
    }
  } else {
    const [res] = await db.insert(workSchedules).values({
      name: p.name ?? "Jadwal Kantor Standar",
      type: 0,
      startTime: p.startTime ?? "08:00:00",
      endTime: p.endTime ?? "17:00:00",
      breakDuration: p.breakDuration ?? 60,
      lateTolerance: p.lateTolerance ?? 15,
      earlyLeaveTolerance: p.earlyLeaveTolerance ?? 0,
      workingDays: p.workingDays ?? {
        mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false
      },
    });
    id = res.insertId;
  }
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.get("/", async (c) => {
  const q = c.req.query("q");
  const typeStr = c.req.query("type");
  const filters: SQL[] = [];
  if (q) filters.push(like(workSchedules.name, `%${q}%`));
  if (typeStr !== undefined && typeStr !== "") {
    filters.push(eq(workSchedules.type, Number(typeStr)));
  }

  // Join count assigned employees per schedule
  const items = await db
    .select({
      schedule: workSchedules,
      assignedCount: sql<number>`(SELECT COUNT(*) FROM ${employees}
        WHERE ${employees.defaultWorkScheduleId} = ${workSchedules.id})`.as("assigned_count"),
    })
    .from(workSchedules)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(workSchedules.id));

  return c.json({
    success: true,
    data: items.map((r) => ({ ...r.schedule, assignedCount: Number(r.assignedCount) })),
  });
});

// Bulk assign default schedule to employees
const bulkAssignSchema = z.object({
  workScheduleId: z.coerce.number().int().nullable(),
  employeeIds: z.array(z.coerce.number().int()).min(1),
});

router.post("/assign", zValidator("json", jsonBody(bulkAssignSchema)), async (c) => {
  const { workScheduleId, employeeIds } = c.req.valid("json");

  // Verify schedule belongs to business (if not null)
  if (workScheduleId !== null) {
    const [s] = await db
      .select({ id: workSchedules.id })
      .from(workSchedules)
      .where(eq(workSchedules.id, workScheduleId))
      .limit(1);
    if (!s) return c.json({ success: false, message: "Jadwal tidak valid" }, 400);
  }

  // Update employees
  let updated = 0;
  for (const empId of employeeIds) {
    const res = await db
      .update(employees)
      .set({ defaultWorkScheduleId: workScheduleId })
      .where(eq(employees.id, empId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updated += (res as any)?.[0]?.affectedRows ?? 0;
  }
  return c.json({ success: true, data: { updated } });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db
    .select()
    .from(workSchedules)
    .where(eq(workSchedules.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

router.post("/", zValidator("json", jsonBody(payloadSchema)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(workSchedules).values({
    name: p.name,
    type: p.type,
    startTime: p.startTime ?? null,
    endTime: p.endTime ?? null,
    breakDuration: p.breakDuration ?? null,
    lateTolerance: p.lateTolerance ?? null,
    earlyLeaveTolerance: p.earlyLeaveTolerance ?? null,
    workingDays: p.workingDays ?? null,
  });
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payloadSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  const p = c.req.valid("json");
  const setValues: Partial<typeof workSchedules.$inferInsert> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined) (setValues as Record<string, unknown>)[k] = v;
  }
  if (Object.keys(setValues).length) {
    await db
      .update(workSchedules)
      .set(setValues)
      .where(eq(workSchedules.id, id));
  }
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db
    .delete(workSchedules)
    .where(eq(workSchedules.id, id));
  return c.json({ success: true, message: "Dihapus" });
});

export default router;
