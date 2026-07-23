import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, between, eq, inArray, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { employeeSchedules, employees } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuery = z.object({
  from: dateStr,
  to: dateStr,
  employeeId: z.coerce.number().int().optional(),
  branchId: z.coerce.number().int().optional(),
  departmentId: z.coerce.number().int().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { from, to, employeeId, branchId, departmentId } = c.req.valid("query");

  // Resolve employee list filter
  const empFilters: SQL[] = [];
  if (employeeId) empFilters.push(eq(employees.id, employeeId));
  if (branchId) empFilters.push(eq(employees.branchId, branchId));
  if (departmentId) empFilters.push(eq(employees.departmentId, departmentId));

  const empRows = await db
    .select({ id: employees.id, fullName: employees.fullName })
    .from(employees)
    .where(empFilters.length ? and(...empFilters) : undefined);
  const empIds = empRows.map((e) => e.id);

  if (empIds.length === 0) return c.json({ success: true, data: { schedules: [], employees: [] } });

  const schedules = await db
    .select()
    .from(employeeSchedules)
    .where(and(inArray(employeeSchedules.employeeId, empIds), between(employeeSchedules.date, from, to)))
    .orderBy(asc(employeeSchedules.date));

  return c.json({ success: true, data: { schedules, employees: empRows } });
});

const upsertSchema = z.object({
  employeeId: z.coerce.number().int(),
  workScheduleId: z.coerce.number().int(),
  date: dateStr,
});

router.post("/", zValidator("json", jsonBody(upsertSchema)), async (c) => {
  const p = c.req.valid("json");
  // Verify employee exists
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, p.employeeId))
    .limit(1);
  if (!emp) return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);

  // Upsert: delete existing for same employee+date then insert
  await db
    .delete(employeeSchedules)
    .where(and(eq(employeeSchedules.employeeId, p.employeeId), eq(employeeSchedules.date, p.date)));
  const [res] = await db.insert(employeeSchedules).values({
    employeeId: p.employeeId,
    workScheduleId: p.workScheduleId,
    date: p.date,
  });
  const [row] = await db.select().from(employeeSchedules).where(eq(employeeSchedules.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

const bulkSchema = z.object({
  workScheduleId: z.coerce.number().int(),
  employeeIds: z.array(z.coerce.number().int()).min(1),
  from: dateStr,
  to: dateStr,
  daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).optional(), // 0=Sun..6=Sat
});

router.post("/bulk", zValidator("json", jsonBody(bulkSchema)), async (c) => {
  const p = c.req.valid("json");
  // Ensure all employeeIds exist
  const valid = await db
    .select({ id: employees.id })
    .from(employees)
    .where(inArray(employees.id, p.employeeIds));
  const validIds = valid.map((e) => e.id);
  if (validIds.length === 0) return c.json({ success: false, message: "Karyawan tidak valid" }, 400);

  const allDays = p.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
  const fromDate = new Date(p.from + "T00:00:00Z");
  const toDate = new Date(p.to + "T00:00:00Z");
  const rows: { employeeId: number; workScheduleId: number; date: string }[] = [];
  for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!allDays.includes(d.getUTCDay())) continue;
    const dateStrVal = d.toISOString().slice(0, 10);
    for (const eid of validIds) {
      rows.push({ employeeId: eid, workScheduleId: p.workScheduleId, date: dateStrVal });
    }
  }
  if (rows.length === 0) return c.json({ success: true, data: { inserted: 0 } });

  // Bulk: delete existing then insert new
  for (const r of rows) {
    await db
      .delete(employeeSchedules)
      .where(and(eq(employeeSchedules.employeeId, r.employeeId), eq(employeeSchedules.date, r.date)));
  }
  await db.insert(employeeSchedules).values(rows);
  return c.json({ success: true, data: { inserted: rows.length } });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  // Verify
  const [row] = await db
    .select({ employeeId: employeeSchedules.employeeId })
    .from(employeeSchedules)
    .where(eq(employeeSchedules.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, row.employeeId))
    .limit(1);
  if (!emp) return c.json({ success: false, message: "Forbidden" }, 403);
  await db.delete(employeeSchedules).where(eq(employeeSchedules.id, id));
  return c.json({ success: true });
});

export default router;
