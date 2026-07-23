import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, between, desc, eq, inArray, SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { attendances, attendanceApprovals, employees, departments } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
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
  branchId: z.coerce.number().int().optional(),
  departmentId: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const filters: SQL[] = [];
  if (q.from && q.to) filters.push(between(attendances.date, q.from, q.to));
  if (q.employeeId) filters.push(eq(attendances.employeeId, q.employeeId));
  if (q.status !== undefined) filters.push(eq(attendances.status, q.status));

  // Branch/dept filter: pre-resolve employees first
  if (q.branchId || q.departmentId) {
    const empFilters: SQL[] = [];
    if (q.branchId) empFilters.push(eq(employees.branchId, q.branchId));
    if (q.departmentId) empFilters.push(eq(employees.departmentId, q.departmentId));
    const emps = await db.select({ id: employees.id }).from(employees).where(and(...empFilters));
    const ids = emps.map((e) => e.id);
    if (ids.length === 0) {
      return c.json({ success: true, data: [], page: { page: q.page, limit: q.limit, hasNext: false } });
    }
    filters.push(inArray(attendances.employeeId, ids));
  }

  const offset = (q.page - 1) * q.limit;
  const orderFn = q.sortOrder === "asc" ? asc(attendances.date) : desc(attendances.date);
  const items = await db
    .select({ attendance: attendances, employee: employees })
    .from(attendances)
    .leftJoin(employees, eq(employees.id, attendances.employeeId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(orderFn)
    .limit(q.limit)
    .offset(offset);

  return c.json({
    success: true,
    data: items.map((r) => ({ ...r.attendance, employee: r.employee })),
    page: { page: q.page, limit: q.limit, hasNext: items.length === q.limit },
  });
});

// ============================================================
// /today — snapshot operasional hari ini
// Returns:
//   - totalEmployees: jumlah karyawan aktif
//   - presentCount, lateCount, absentCount, leaveCount, sickCount, holidayCount, offCount
//   - notCheckedIn: list karyawan yg belum check-in tapi diharapkan hadir
//   - lateToday: list karyawan yg telat hari ini (sort by lateMinutes desc)
// ============================================================
router.get("/today", async (c) => {
  const today = c.req.query("date") || new Date().toISOString().slice(0, 10);

  // Active employees
  const activeEmployees = await db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      photo: employees.photo,
      departmentId: employees.departmentId,
    })
    .from(employees)
    .where(eq(employees.employmentStatus, 0));

  // Today attendances
  const todayRows = await db
    .select()
    .from(attendances)
    .where(eq(attendances.date, today));

  const attMap = new Map<number, (typeof todayRows)[number]>();
  for (const a of todayRows) attMap.set(a.employeeId, a);

  // Counts
  const counts = { present: 0, late: 0, absent: 0, leave: 0, sick: 0, holiday: 0, off: 0 };
  let overtimeMinutes = 0;

  // Not checked in & late
  const notCheckedIn: { id: number; fullName: string; photo: string | null }[] = [];
  const lateToday: { id: number; fullName: string; photo: string | null; lateMinutes: number; checkInAt: string | null }[] = [];

  for (const emp of activeEmployees) {
    const att = attMap.get(emp.id);
    if (!att || !att.checkInAt) {
      // belum check-in (kalau ada record tapi blm check-in, atau ga ada record sama sekali)
      const status = att?.status ?? null;
      if (status === 2) counts.absent++;
      else if (status === 3) counts.leave++;
      else if (status === 4) counts.sick++;
      else if (status === 5) counts.holiday++;
      else if (status === 6) counts.off++;
      else {
        notCheckedIn.push({ id: emp.id, fullName: emp.fullName, photo: emp.photo });
      }
      continue;
    }
    // Has check-in
    if (att.status === 0) counts.present++;
    else if (att.status === 1) {
      counts.late++;
      lateToday.push({
        id: emp.id,
        fullName: emp.fullName,
        photo: emp.photo,
        lateMinutes: att.lateMinutes ?? 0,
        checkInAt: att.checkInAt instanceof Date ? att.checkInAt.toISOString() : (att.checkInAt as unknown as string),
      });
    } else if (att.status === 3) counts.leave++;
    else if (att.status === 4) counts.sick++;
    else if (att.status === 5) counts.holiday++;
    else if (att.status === 6) counts.off++;
    overtimeMinutes += att.overtimeMinutes ?? 0;
  }

  lateToday.sort((a, b) => b.lateMinutes - a.lateMinutes);

  return c.json({
    success: true,
    data: {
      date: today,
      totalEmployees: activeEmployees.length,
      counts,
      overtimeMinutes,
      notCheckedIn: notCheckedIn.slice(0, 50),
      lateToday: lateToday.slice(0, 50),
    },
  });
});

// ============================================================
// /monthly-summary — agregasi per karyawan untuk payroll review
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId&departmentId
// Returns per employee: hadir, telat, absen, cuti, sakit, off, totalLateMin, totalOvertimeMin, totalWorkMin, expectedDays, attendanceRate
// ============================================================
router.get(
  "/monthly-summary",
  zValidator(
    "query",
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      branchId: z.coerce.number().int().optional(),
      departmentId: z.coerce.number().int().optional(),
    }),
  ),
  async (c) => {
    const { from, to, branchId, departmentId } = c.req.valid("query");

    const empFilters: SQL[] = [
      eq(employees.employmentStatus, 0),
    ];
    if (branchId) empFilters.push(eq(employees.branchId, branchId));
    if (departmentId) empFilters.push(eq(employees.departmentId, departmentId));

    const empRows = await db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        nik: employees.nik,
        photo: employees.photo,
        departmentId: employees.departmentId,
        departmentName: departments.name,
      })
      .from(employees)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(and(...empFilters));

    if (empRows.length === 0) return c.json({ success: true, data: [] });

    const empIds = empRows.map((e) => e.id);

    const attRows = await db
      .select()
      .from(attendances)
      .where(
        and(
          inArray(attendances.employeeId, empIds),
          between(attendances.date, from, to),
        ),
      );

    // Hitung expected working days antar from-to (asumsi sederhana: semua hari kerja)
    const fromDt = new Date(from + "T00:00:00Z");
    const toDt = new Date(to + "T00:00:00Z");
    let expectedDays = 0;
    for (let d = new Date(fromDt); d <= toDt; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) expectedDays++; // simple: senin–jumat
    }

    const map = new Map<number, {
      present: number;
      late: number;
      absent: number;
      leave: number;
      sick: number;
      holiday: number;
      off: number;
      totalLateMin: number;
      totalEarlyLeaveMin: number;
      totalOvertimeMin: number;
      totalWorkMin: number;
    }>();
    for (const id of empIds)
      map.set(id, {
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        sick: 0,
        holiday: 0,
        off: 0,
        totalLateMin: 0,
        totalEarlyLeaveMin: 0,
        totalOvertimeMin: 0,
        totalWorkMin: 0,
      });

    for (const a of attRows) {
      const s = map.get(a.employeeId);
      if (!s) continue;
      if (a.status === 0) s.present++;
      else if (a.status === 1) {
        s.late++;
        s.present++; // telat tetap hadir
      } else if (a.status === 2) s.absent++;
      else if (a.status === 3) s.leave++;
      else if (a.status === 4) s.sick++;
      else if (a.status === 5) s.holiday++;
      else if (a.status === 6) s.off++;
      s.totalLateMin += a.lateMinutes ?? 0;
      s.totalEarlyLeaveMin += a.earlyLeaveMinutes ?? 0;
      s.totalOvertimeMin += a.overtimeMinutes ?? 0;
      s.totalWorkMin += a.workMinutes ?? 0;
    }

    const data = empRows.map((e) => {
      const s = map.get(e.id)!;
      const rate = expectedDays > 0 ? Math.round((s.present / expectedDays) * 100) : 0;
      return {
        employeeId: e.id,
        fullName: e.fullName,
        nik: e.nik,
        photo: e.photo,
        departmentId: e.departmentId,
        departmentName: e.departmentName,
        ...s,
        expectedDays,
        attendanceRate: Math.min(100, rate),
      };
    });

    return c.json({ success: true, data });
  },
);

// Manual create / catat presensi (HR)
const upsertSchema = z.object({
  employeeId: z.coerce.number().int(),
  date: dateStr,
  workScheduleId: z.coerce.number().int().optional(),
  checkInAt: z.string().optional(),
  checkOutAt: z.string().optional(),
  checkInLatitude: z.union([z.string(), z.number()]).optional(),
  checkInLongitude: z.union([z.string(), z.number()]).optional(),
  checkOutLatitude: z.union([z.string(), z.number()]).optional(),
  checkOutLongitude: z.union([z.string(), z.number()]).optional(),
  checkInPhoto: z.string().optional(),
  checkOutPhoto: z.string().optional(),
  checkInAddress: z.string().optional(),
  checkOutAddress: z.string().optional(),
  checkInType: z.coerce.number().int().min(0).max(3).optional(),
  checkOutType: z.coerce.number().int().min(0).max(3).optional(),
  lateMinutes: z.coerce.number().int().optional(),
  earlyLeaveMinutes: z.coerce.number().int().optional(),
  overtimeMinutes: z.coerce.number().int().optional(),
  workMinutes: z.coerce.number().int().optional(),
  status: z.coerce.number().int().min(0).max(6).optional(),
  notes: z.string().optional(),
});

router.post("/", zValidator("json", jsonBody(upsertSchema)), async (c) => {
  const p = c.req.valid("json");
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, p.employeeId))
    .limit(1);
  if (!emp) return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);

  const values: typeof attendances.$inferInsert = {
    employeeId: p.employeeId,
    date: p.date,
    workScheduleId: p.workScheduleId ?? null,
    checkInAt: p.checkInAt ? new Date(p.checkInAt) : null,
    checkOutAt: p.checkOutAt ? new Date(p.checkOutAt) : null,
    checkInLatitude: p.checkInLatitude != null ? String(p.checkInLatitude) : null,
    checkInLongitude: p.checkInLongitude != null ? String(p.checkInLongitude) : null,
    checkOutLatitude: p.checkOutLatitude != null ? String(p.checkOutLatitude) : null,
    checkOutLongitude: p.checkOutLongitude != null ? String(p.checkOutLongitude) : null,
    checkInPhoto: p.checkInPhoto ?? null,
    checkOutPhoto: p.checkOutPhoto ?? null,
    checkInAddress: p.checkInAddress ?? null,
    checkOutAddress: p.checkOutAddress ?? null,
    checkInType: p.checkInType ?? null,
    checkOutType: p.checkOutType ?? null,
    lateMinutes: p.lateMinutes ?? 0,
    earlyLeaveMinutes: p.earlyLeaveMinutes ?? 0,
    overtimeMinutes: p.overtimeMinutes ?? 0,
    workMinutes: p.workMinutes ?? 0,
    status: p.status ?? 0,
    notes: p.notes ?? null,
  };

  const [res] = await db.insert(attendances).values(values);
  const [row] = await db.select().from(attendances).where(eq(attendances.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

// ============================================================
// Approval Routes (mounted under same /api/attendances/approvals)
// Must be registered BEFORE /:id routes so "approvals" is not
// matched as the :id param.
// ============================================================
const approvalRouter = new Hono();
approvalRouter.use("*", requireAuth, requireHR);

approvalRouter.get("/", async (c) => {
  const status = c.req.query("status");
  const filters: SQL[] = [];
  if (status !== undefined && status !== "") filters.push(eq(attendanceApprovals.status, Number(status)));
  const items = await db
    .select({ approval: attendanceApprovals, employee: employees })
    .from(attendanceApprovals)
    .leftJoin(employees, eq(employees.id, attendanceApprovals.employeeId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(attendanceApprovals.id))
    .limit(200);
  return c.json({
    success: true,
    data: items.map((r) => ({ ...r.approval, employee: r.employee })),
  });
});

const requestSchema = z.object({
  attendanceId: z.coerce.number().int().optional(),
  employeeId: z.coerce.number().int(),
  requestType: z.coerce.number().int().min(0).max(3),
  requestedCheckIn: z.string().optional(),
  requestedCheckOut: z.string().optional(),
  reason: z.string().optional(),
  attachment: z.string().optional(),
});

approvalRouter.post("/", zValidator("json", jsonBody(requestSchema)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(attendanceApprovals).values({
    attendanceId: p.attendanceId ?? null,
    employeeId: p.employeeId,
    requestType: p.requestType,
    requestedCheckIn: p.requestedCheckIn ? new Date(p.requestedCheckIn) : null,
    requestedCheckOut: p.requestedCheckOut ? new Date(p.requestedCheckOut) : null,
    reason: p.reason ?? null,
    attachment: p.attachment ?? null,
    status: 0,
  });
  const [row] = await db
    .select()
    .from(attendanceApprovals)
    .where(eq(attendanceApprovals.id, res.insertId))
    .limit(1);
  return c.json({ success: true, data: row }, 201);
});

approvalRouter.post("/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  await db
    .update(attendanceApprovals)
    .set({ status: 1, approverId: getHrUserId(c), approvedAt: new Date() })
    .where(eq(attendanceApprovals.id, id));
  const [row] = await db
    .select()
    .from(attendanceApprovals)
    .where(eq(attendanceApprovals.id, id))
    .limit(1);
  // Apply correction if accepted
  if (row?.attendanceId && (row.requestedCheckIn || row.requestedCheckOut)) {
    const setValues: Record<string, unknown> = {};
    if (row.requestedCheckIn) setValues.checkInAt = row.requestedCheckIn;
    if (row.requestedCheckOut) setValues.checkOutAt = row.requestedCheckOut;
    await db.update(attendances).set(setValues).where(eq(attendances.id, row.attendanceId));
  }
  return c.json({ success: true, data: row });
});

approvalRouter.post(
  "/:id/reject",
  zValidator("json", jsonBody(z.object({ rejectionReason: z.string().optional() }))),
  async (c) => {
    const id = Number(c.req.param("id"));
    const { rejectionReason } = c.req.valid("json");
    await db
      .update(attendanceApprovals)
      .set({
        status: 2,
        approverId: getHrUserId(c),
        approvedAt: new Date(),
        rejectionReason: rejectionReason ?? null,
      })
      .where(eq(attendanceApprovals.id, id));
    const [row] = await db
      .select()
      .from(attendanceApprovals)
      .where(eq(attendanceApprovals.id, id))
      .limit(1);
    return c.json({ success: true, data: row });
  },
);

router.route("/approvals", approvalRouter);

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db
    .select({ attendance: attendances, employee: employees })
    .from(attendances)
    .leftJoin(employees, eq(employees.id, attendances.employeeId))
    .where(eq(attendances.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({ success: true, data: { ...row.attendance, employee: row.employee } });
});

router.put("/:id", zValidator("json", jsonBody(upsertSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  const p = c.req.valid("json");
  const setValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    if (k === "checkInAt" || k === "checkOutAt") setValues[k] = v ? new Date(v as string) : null;
    else if (k.endsWith("Latitude") || k.endsWith("Longitude")) setValues[k] = v == null ? null : String(v);
    else setValues[k] = v;
  }
  if (Object.keys(setValues).length) {
    await db
      .update(attendances)
      .set(setValues)
      .where(eq(attendances.id, id));
  }
  const [row] = await db.select().from(attendances).where(eq(attendances.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db
    .delete(attendances)
    .where(eq(attendances.id, id));
  return c.json({ success: true });
});

export default router;
