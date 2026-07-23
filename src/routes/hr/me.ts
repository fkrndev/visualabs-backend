import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, between, desc, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { db } from "../../db/client";
import {
  announcements,
  attendanceApprovals,
  attendances,
  branches,
  cashAdvances,
  departments,
  employees,
  leaveBalances,
  leaveTypes,
  leaves,
  notifications,
  overtimes,
  payrollComponents,
  payrollPeriods,
  payrolls,
  positions,
  reimbursements,
  settings,
  workSchedules,
  employeeSchedules,
} from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import type { JwtPayload } from "../../middleware/auth";
import { getHrUserId } from "../../middleware/hrAccess";
import { requireEmployeeContext, getEmployee, isApprover } from "../../middleware/employee";
import {
  ActivityAction,
  ApprovalStatus,
  AttendanceStatus,
  NotificationType,
} from "../../constants/hrEnums";
import { logActivity, notify } from "../../utils/activity";
import { haversineMeters } from "../../utils/geo";
import { jsonBody } from "../../utils/zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Jakarta-local (WIB, UTC+7) date string YYYY-MM-DD. */
function jakartaDateStr(d = new Date()): string {
  const jkt = new Date(d.getTime() + 7 * 3600000);
  return jkt.toISOString().slice(0, 10);
}

/** Parse a "HH:MM[:SS]" schedule time onto a given date, returning a Date (local). */
function timeOnDate(dateISO: string, hhmmss: string | null): Date | null {
  if (!hhmmss) return null;
  const [h = "0", m = "0", s = "0"] = hhmmss.split(":");
  return new Date(`${dateISO}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}+07:00`);
}

/** Resolve the numeric role from the signed JWT payload. Must run after `requireAuth`. */
function getRole(c: Context): number | null | undefined {
  const jwtPayload = c.get("jwtPayload") as JwtPayload | undefined;
  if (!jwtPayload) return undefined;
  if (typeof jwtPayload.rol === "string") {
    try {
      return JSON.parse(jwtPayload.rol);
    } catch {
      return undefined;
    }
  }
  return jwtPayload.rol as unknown as number | null | undefined;
}

// ============================================================
// Parent router: auth + linked-employee context for everything under /me
// ============================================================
const router = new Hono();
router.use("*", requireAuth, requireEmployeeContext);

// ---- Profile ------------------------------------------------
router.get("/profile", async (c) => {
  const { employee } = getEmployee(c);
  const [extra] = await db
    .select({
      departmentName: departments.name,
      positionName: positions.name,
      branchName: branches.name,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(positions, eq(positions.id, employees.positionId))
    .leftJoin(branches, eq(branches.id, employees.branchId))
    .where(eq(employees.id, employee.id))
    .limit(1);
  return c.json({ success: true, data: { ...employee, ...extra } });
});

// ---- Company profile (read-only, single-tenant via settings) ----
router.get("/company", async (c) => {
  const [row] = await db.select().from(settings).where(eq(settings.key, "company_profile")).limit(1);
  return c.json({ success: true, data: row?.dataJson ?? null });
});

// ---- Announcements -----------------------------------------
router.get("/announcements", async (c) => {
  const items = await db
    .select()
    .from(announcements)
    .where(eq(announcements.status, 1))
    .orderBy(desc(announcements.publishedAt))
    .limit(50);
  return c.json({ success: true, data: items });
});

// ============================================================
// Attendance (self)
// ============================================================
async function resolveTodaySchedule(employeeId: number, defaultScheduleId: number | null, dateISO: string) {
  // Prefer an explicitly assigned schedule for the date, else the employee default.
  const [assigned] = await db
    .select({ schedule: workSchedules })
    .from(employeeSchedules)
    .leftJoin(workSchedules, eq(workSchedules.id, employeeSchedules.workScheduleId))
    .where(and(eq(employeeSchedules.employeeId, employeeId), eq(employeeSchedules.date, dateISO)))
    .limit(1);
  if (assigned?.schedule) return assigned.schedule;
  if (defaultScheduleId) {
    const [def] = await db.select().from(workSchedules).where(eq(workSchedules.id, defaultScheduleId)).limit(1);
    if (def) return def;
  }
  return null;
}

router.get("/attendances/today", async (c) => {
  const { employee } = getEmployee(c);
  const today = jakartaDateStr();

  const [row] = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.employeeId, employee.id), eq(attendances.date, today)))
    .limit(1);

  const schedule = await resolveTodaySchedule(employee.id, employee.defaultWorkScheduleId ?? null, today);

  // Office geofence from the employee's branch (if any).
  let geofence: { latitude: number; longitude: number; radius: number; name: string } | null = null;
  if (employee.branchId) {
    const [br] = await db.select().from(branches).where(eq(branches.id, employee.branchId)).limit(1);
    if (br?.latitude && br?.longitude) {
      geofence = {
        latitude: Number(br.latitude),
        longitude: Number(br.longitude),
        radius: br.radius ?? 100,
        name: br.name,
      };
    }
  }

  return c.json({
    success: true,
    data: {
      date: today,
      attendance: row ?? null,
      schedule,
      geofence,
      serverTime: new Date().toISOString(),
    },
  });
});

const checkInSchema = z.object({
  latitude: z.union([z.string(), z.number()]).optional(),
  longitude: z.union([z.string(), z.number()]).optional(),
  address: z.string().optional(),
  photo: z.string().optional(),
  type: z.coerce.number().int().min(0).max(3).optional(),
  notes: z.string().optional(),
});

router.post("/attendances/check-in", zValidator("json", jsonBody(checkInSchema)), async (c) => {
  const { employee } = getEmployee(c);
  const userId = getHrUserId(c);
  const today = jakartaDateStr();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.employeeId, employee.id), eq(attendances.date, today)))
    .limit(1);
  if (existing?.checkInAt) {
    return c.json({ success: false, message: "Anda sudah absen masuk hari ini" }, 409);
  }

  const schedule = await resolveTodaySchedule(employee.id, employee.defaultWorkScheduleId ?? null, today);

  // Late computation vs schedule start + tolerance.
  let lateMinutes = 0;
  let status: number = AttendanceStatus.PRESENT;
  if (schedule?.startTime) {
    const start = timeOnDate(today, schedule.startTime as unknown as string);
    if (start) {
      const tolerance = schedule.lateTolerance ?? 0;
      const diffMin = Math.floor((now.getTime() - start.getTime()) / 60000) - tolerance;
      if (diffMin > 0) {
        lateMinutes = diffMin;
        status = AttendanceStatus.LATE;
      }
    }
  }

  const p = c.req.valid("json");
  const values = {
    checkInAt: now,
    checkInLatitude: p.latitude != null ? String(p.latitude) : null,
    checkInLongitude: p.longitude != null ? String(p.longitude) : null,
    checkInPhoto: p.photo ?? null,
    checkInAddress: p.address ?? null,
    checkInType: p.type ?? 0,
    lateMinutes,
    status,
    workScheduleId: schedule?.id ?? null,
    notes: p.notes ?? null,
  };

  let attendanceId: number;
  if (existing) {
    await db.update(attendances).set(values).where(eq(attendances.id, existing.id));
    attendanceId = existing.id;
  } else {
    const [res] = await db.insert(attendances).values({
      employeeId: employee.id,
      date: today,
      ...values,
    });
    attendanceId = res.insertId;
  }

  await logActivity({
    userId,
    action: ActivityAction.CREATE,
    module: "attendance",
    referenceId: attendanceId,
    newValue: { type: "check-in", lateMinutes, status },
  });

  const [row] = await db.select().from(attendances).where(eq(attendances.id, attendanceId)).limit(1);
  return c.json({ success: true, data: row, meta: { lateMinutes, status } }, 201);
});

const checkOutSchema = z.object({
  latitude: z.union([z.string(), z.number()]).optional(),
  longitude: z.union([z.string(), z.number()]).optional(),
  address: z.string().optional(),
  photo: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/attendances/check-out", zValidator("json", jsonBody(checkOutSchema)), async (c) => {
  const { employee } = getEmployee(c);
  const userId = getHrUserId(c);
  const today = jakartaDateStr();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.employeeId, employee.id), eq(attendances.date, today)))
    .limit(1);
  if (!existing || !existing.checkInAt) {
    return c.json({ success: false, message: "Anda belum absen masuk hari ini" }, 409);
  }
  if (existing.checkOutAt) {
    return c.json({ success: false, message: "Anda sudah absen pulang hari ini" }, 409);
  }

  const checkIn = existing.checkInAt instanceof Date ? existing.checkInAt : new Date(existing.checkInAt as unknown as string);
  const workMinutes = Math.max(0, Math.floor((now.getTime() - checkIn.getTime()) / 60000));

  // Early leave / overtime vs schedule end.
  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;
  if (existing.workScheduleId) {
    const [sched] = await db.select().from(workSchedules).where(eq(workSchedules.id, existing.workScheduleId)).limit(1);
    if (sched?.endTime) {
      const end = timeOnDate(today, sched.endTime as unknown as string);
      if (end) {
        const diffMin = Math.floor((now.getTime() - end.getTime()) / 60000);
        if (diffMin < 0) earlyLeaveMinutes = Math.abs(diffMin) - (sched.earlyLeaveTolerance ?? 0);
        else overtimeMinutes = diffMin;
        if (earlyLeaveMinutes < 0) earlyLeaveMinutes = 0;
      }
    }
  }

  const p = c.req.valid("json");
  await db
    .update(attendances)
    .set({
      checkOutAt: now,
      checkOutLatitude: p.latitude != null ? String(p.latitude) : null,
      checkOutLongitude: p.longitude != null ? String(p.longitude) : null,
      checkOutPhoto: p.photo ?? null,
      checkOutAddress: p.address ?? null,
      checkOutType: existing.checkInType ?? 0,
      workMinutes,
      earlyLeaveMinutes,
      overtimeMinutes,
      notes: p.notes ?? existing.notes ?? null,
    })
    .where(eq(attendances.id, existing.id));

  await logActivity({
    userId,
    action: ActivityAction.UPDATE,
    module: "attendance",
    referenceId: existing.id,
    newValue: { type: "check-out", workMinutes },
  });

  const [row] = await db.select().from(attendances).where(eq(attendances.id, existing.id)).limit(1);
  return c.json({ success: true, data: row, meta: { workMinutes, overtimeMinutes, earlyLeaveMinutes } });
});

const attListQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
});

router.get("/attendances", zValidator("query", attListQuery), async (c) => {
  const { employee } = getEmployee(c);
  const q = c.req.valid("query");
  const filters: SQL[] = [eq(attendances.employeeId, employee.id)];
  if (q.from && q.to) filters.push(between(attendances.date, q.from, q.to));
  const items = await db
    .select()
    .from(attendances)
    .where(and(...filters))
    .orderBy(desc(attendances.date))
    .limit(q.limit);
  return c.json({ success: true, data: items });
});

router.get("/attendances/summary", zValidator("query", z.object({ from: dateStr, to: dateStr })), async (c) => {
  const { employee } = getEmployee(c);
  const { from, to } = c.req.valid("query");
  const rows = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.employeeId, employee.id), between(attendances.date, from, to)));
  const s = { present: 0, late: 0, absent: 0, leave: 0, sick: 0, holiday: 0, off: 0, totalLateMin: 0, totalOvertimeMin: 0, totalWorkMin: 0 };
  for (const a of rows) {
    if (a.status === 0) s.present++;
    else if (a.status === 1) { s.late++; s.present++; }
    else if (a.status === 2) s.absent++;
    else if (a.status === 3) s.leave++;
    else if (a.status === 4) s.sick++;
    else if (a.status === 5) s.holiday++;
    else if (a.status === 6) s.off++;
    s.totalLateMin += a.lateMinutes ?? 0;
    s.totalOvertimeMin += a.overtimeMinutes ?? 0;
    s.totalWorkMin += a.workMinutes ?? 0;
  }
  return c.json({ success: true, data: s });
});

// ---- Attendance correction requests (my own) ---------------
router.get("/attendances/corrections", async (c) => {
  const { employee } = getEmployee(c);
  const items = await db
    .select()
    .from(attendanceApprovals)
    .where(eq(attendanceApprovals.employeeId, employee.id))
    .orderBy(desc(attendanceApprovals.id))
    .limit(50);
  return c.json({ success: true, data: items });
});

const correctionSchema = z.object({
  attendanceId: z.coerce.number().int().optional(),
  requestType: z.coerce.number().int().min(0).max(3),
  requestedCheckIn: z.string().optional(),
  requestedCheckOut: z.string().optional(),
  reason: z.string().optional(),
  attachment: z.string().optional(),
});

router.post("/attendances/corrections", zValidator("json", jsonBody(correctionSchema)), async (c) => {
  const { employee } = getEmployee(c);
  const p = c.req.valid("json");
  const [res] = await db.insert(attendanceApprovals).values({
    attendanceId: p.attendanceId ?? null,
    employeeId: employee.id,
    requestType: p.requestType,
    requestedCheckIn: p.requestedCheckIn ? new Date(p.requestedCheckIn) : null,
    requestedCheckOut: p.requestedCheckOut ? new Date(p.requestedCheckOut) : null,
    reason: p.reason ?? null,
    attachment: p.attachment ?? null,
    status: 0,
  });
  const [row] = await db.select().from(attendanceApprovals).where(eq(attendanceApprovals.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

// ============================================================
// Leaves (self)
// ============================================================
router.get("/leave-types", async (c) => {
  const items = await db.select().from(leaveTypes);
  return c.json({ success: true, data: items });
});

router.get("/leave-balances", async (c) => {
  const { employee } = getEmployee(c);
  const year = Number(c.req.query("year") ?? new Date().getFullYear());
  const items = await db
    .select({ balance: leaveBalances, leaveType: leaveTypes })
    .from(leaveBalances)
    .leftJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
    .where(and(eq(leaveBalances.employeeId, employee.id), eq(leaveBalances.year, year)));
  return c.json({ success: true, data: items.map((r) => ({ ...r.balance, leaveType: r.leaveType })) });
});

router.get("/leaves", async (c) => {
  const { employee } = getEmployee(c);
  const items = await db
    .select({ leave: leaves, leaveType: leaveTypes })
    .from(leaves)
    .leftJoin(leaveTypes, eq(leaveTypes.id, leaves.leaveTypeId))
    .where(eq(leaves.employeeId, employee.id))
    .orderBy(desc(leaves.id))
    .limit(60);
  return c.json({ success: true, data: items.map((r) => ({ ...r.leave, leaveType: r.leaveType })) });
});

const leaveCreateSchema = z.object({
  leaveTypeId: z.coerce.number().int(),
  startDate: dateStr,
  endDate: dateStr,
  totalDays: z.union([z.string(), z.number()]).optional(),
  reason: z.string().optional(),
  attachment: z.string().optional(),
});

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24)) + 1;
}

router.post("/leaves", zValidator("json", jsonBody(leaveCreateSchema)), async (c) => {
  const { employee } = getEmployee(c);
  const userId = getHrUserId(c);
  const p = c.req.valid("json");
  const total = p.totalDays != null ? String(p.totalDays) : String(daysBetween(p.startDate, p.endDate));
  const [res] = await db.insert(leaves).values({
    employeeId: employee.id,
    leaveTypeId: p.leaveTypeId,
    startDate: p.startDate,
    endDate: p.endDate,
    totalDays: total,
    reason: p.reason ?? null,
    attachment: p.attachment ?? null,
    status: 0,
  });
  await logActivity({ userId, action: ActivityAction.CREATE, module: "leave", referenceId: res.insertId });
  const [row] = await db.select().from(leaves).where(eq(leaves.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.post("/leaves/:id/cancel", async (c) => {
  const { employee } = getEmployee(c);
  const id = Number(c.req.param("id"));
  const [leave] = await db
    .select()
    .from(leaves)
    .where(and(eq(leaves.id, id), eq(leaves.employeeId, employee.id)))
    .limit(1);
  if (!leave) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  if (leave.status !== 0) return c.json({ success: false, message: "Hanya pengajuan menunggu yang bisa dibatalkan" }, 400);
  await db.update(leaves).set({ status: ApprovalStatus.CANCELLED }).where(eq(leaves.id, id));
  const [row] = await db.select().from(leaves).where(eq(leaves.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

// ============================================================
// Schedule (self)
// ============================================================
router.get("/schedules", zValidator("query", z.object({ from: dateStr, to: dateStr })), async (c) => {
  const { employee } = getEmployee(c);
  const { from, to } = c.req.valid("query");
  const items = await db
    .select({ schedule: employeeSchedules, workSchedule: workSchedules })
    .from(employeeSchedules)
    .leftJoin(workSchedules, eq(workSchedules.id, employeeSchedules.workScheduleId))
    .where(and(eq(employeeSchedules.employeeId, employee.id), between(employeeSchedules.date, from, to)))
    .orderBy(employeeSchedules.date);

  let defaultSchedule = null;
  if (employee.defaultWorkScheduleId) {
    const [def] = await db.select().from(workSchedules).where(eq(workSchedules.id, employee.defaultWorkScheduleId)).limit(1);
    defaultSchedule = def ?? null;
  }
  return c.json({
    success: true,
    data: {
      defaultSchedule,
      dates: items.map((r) => ({ ...r.schedule, workSchedule: r.workSchedule })),
    },
  });
});

// ============================================================
// Overtime / Cash Advance / Reimbursement (self create + list)
// ============================================================
router.get("/overtimes", async (c) => {
  const { employee } = getEmployee(c);
  const items = await db.select().from(overtimes).where(eq(overtimes.employeeId, employee.id)).orderBy(desc(overtimes.id)).limit(60);
  return c.json({ success: true, data: items });
});

const overtimeCreate = z.object({
  date: dateStr,
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  totalHours: z.union([z.string(), z.number()]).optional(),
  reason: z.string().optional(),
});

router.post("/overtimes", zValidator("json", jsonBody(overtimeCreate)), async (c) => {
  const { employee } = getEmployee(c);
  const userId = getHrUserId(c);
  const p = c.req.valid("json");
  const [res] = await db.insert(overtimes).values({
    employeeId: employee.id,
    date: p.date,
    startTime: p.startTime ?? null,
    endTime: p.endTime ?? null,
    totalHours: p.totalHours != null ? String(p.totalHours) : null,
    reason: p.reason ?? null,
    status: 0,
  });
  await logActivity({ userId, action: ActivityAction.CREATE, module: "overtime", referenceId: res.insertId });
  const [row] = await db.select().from(overtimes).where(eq(overtimes.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.post("/overtimes/:id/cancel", async (c) => {
  const { employee } = getEmployee(c);
  const id = Number(c.req.param("id"));
  const [row0] = await db.select().from(overtimes).where(and(eq(overtimes.id, id), eq(overtimes.employeeId, employee.id))).limit(1);
  if (!row0) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  if (row0.status !== 0) return c.json({ success: false, message: "Hanya pengajuan menunggu yang bisa dibatalkan" }, 400);
  await db.update(overtimes).set({ status: ApprovalStatus.REJECTED }).where(eq(overtimes.id, id));
  const [row] = await db.select().from(overtimes).where(eq(overtimes.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.get("/cash-advances", async (c) => {
  const { employee } = getEmployee(c);
  const items = await db.select().from(cashAdvances).where(eq(cashAdvances.employeeId, employee.id)).orderBy(desc(cashAdvances.id)).limit(60);
  return c.json({ success: true, data: items });
});

const cashAdvanceCreate = z.object({
  amount: z.union([z.string(), z.number()]),
  requestDate: dateStr,
  reason: z.string().optional(),
  repaymentMethod: z.coerce.number().int().min(0).max(1).default(0),
  installmentCount: z.coerce.number().int().optional(),
});

router.post("/cash-advances", zValidator("json", jsonBody(cashAdvanceCreate)), async (c) => {
  const { employee } = getEmployee(c);
  const userId = getHrUserId(c);
  const p = c.req.valid("json");
  const installmentAmount =
    p.repaymentMethod === 1 && p.installmentCount && p.installmentCount > 0
      ? String(Math.round(Number(p.amount) / p.installmentCount))
      : null;
  const [res] = await db.insert(cashAdvances).values({
    employeeId: employee.id,
    amount: String(p.amount),
    reason: p.reason ?? null,
    requestDate: p.requestDate,
    repaymentMethod: p.repaymentMethod,
    installmentCount: p.installmentCount ?? null,
    installmentAmount,
    status: 0,
  });
  await logActivity({ userId, action: ActivityAction.CREATE, module: "cash_advance", referenceId: res.insertId });
  const [row] = await db.select().from(cashAdvances).where(eq(cashAdvances.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.post("/cash-advances/:id/cancel", async (c) => {
  const { employee } = getEmployee(c);
  const id = Number(c.req.param("id"));
  const [row0] = await db.select().from(cashAdvances).where(and(eq(cashAdvances.id, id), eq(cashAdvances.employeeId, employee.id))).limit(1);
  if (!row0) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  if (row0.status !== 0) return c.json({ success: false, message: "Hanya pengajuan menunggu yang bisa dibatalkan" }, 400);
  await db.update(cashAdvances).set({ status: ApprovalStatus.REJECTED }).where(eq(cashAdvances.id, id));
  const [row] = await db.select().from(cashAdvances).where(eq(cashAdvances.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.get("/reimbursements", async (c) => {
  const { employee } = getEmployee(c);
  const items = await db.select().from(reimbursements).where(eq(reimbursements.employeeId, employee.id)).orderBy(desc(reimbursements.id)).limit(60);
  return c.json({ success: true, data: items });
});

const reimbursementCreate = z.object({
  category: z.coerce.number().int().min(0).max(4),
  title: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  transactionDate: dateStr,
  description: z.string().optional(),
  attachment: z.string().optional(),
});

router.post("/reimbursements", zValidator("json", jsonBody(reimbursementCreate)), async (c) => {
  const { employee } = getEmployee(c);
  const userId = getHrUserId(c);
  const p = c.req.valid("json");
  const [res] = await db.insert(reimbursements).values({
    employeeId: employee.id,
    category: p.category,
    title: p.title,
    amount: String(p.amount),
    transactionDate: p.transactionDate,
    description: p.description ?? null,
    attachment: p.attachment ?? null,
    status: 0,
  });
  await logActivity({ userId, action: ActivityAction.CREATE, module: "reimbursement", referenceId: res.insertId });
  const [row] = await db.select().from(reimbursements).where(eq(reimbursements.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.post("/reimbursements/:id/cancel", async (c) => {
  const { employee } = getEmployee(c);
  const id = Number(c.req.param("id"));
  const [row0] = await db.select().from(reimbursements).where(and(eq(reimbursements.id, id), eq(reimbursements.employeeId, employee.id))).limit(1);
  if (!row0) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  if (row0.status !== 0) return c.json({ success: false, message: "Hanya pengajuan menunggu yang bisa dibatalkan" }, 400);
  await db.update(reimbursements).set({ status: ApprovalStatus.REJECTED }).where(eq(reimbursements.id, id));
  const [row] = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

// ============================================================
// Payroll / Slip Gaji (self, read-only)
// ============================================================
router.get("/payrolls", async (c) => {
  const { employee } = getEmployee(c);
  const items = await db
    .select({ payroll: payrolls, period: payrollPeriods })
    .from(payrolls)
    .leftJoin(payrollPeriods, eq(payrollPeriods.id, payrolls.payrollPeriodId))
    .where(eq(payrolls.employeeId, employee.id))
    .orderBy(desc(payrolls.id))
    .limit(36);
  // Only expose payslips that have been approved/paid to the employee.
  const visible = items.filter((r) => (r.payroll.status ?? 0) >= 1);
  return c.json({ success: true, data: visible.map((r) => ({ ...r.payroll, period: r.period })) });
});

router.get("/payrolls/:id", async (c) => {
  const { employee } = getEmployee(c);
  const id = Number(c.req.param("id"));
  const [row] = await db
    .select({ payroll: payrolls, period: payrollPeriods })
    .from(payrolls)
    .leftJoin(payrollPeriods, eq(payrollPeriods.id, payrolls.payrollPeriodId))
    .where(and(eq(payrolls.id, id), eq(payrolls.employeeId, employee.id)))
    .limit(1);
  if (!row || (row.payroll.status ?? 0) < 1) return c.json({ success: false, message: "Slip gaji tidak ditemukan" }, 404);
  const components = await db.select().from(payrollComponents).where(eq(payrollComponents.payrollId, id));
  return c.json({ success: true, data: { ...row.payroll, period: row.period, components } });
});

// ============================================================
// Notifications (self)
// ============================================================
router.get("/notifications", async (c) => {
  const userId = getHrUserId(c);
  const items = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.id))
    .limit(50);
  const unread = items.filter((n) => n.isRead === 0).length;
  return c.json({ success: true, data: items, meta: { unread } });
});

router.post("/notifications/:id/read", async (c) => {
  const userId = getHrUserId(c);
  const id = Number(c.req.param("id"));
  await db.update(notifications).set({ isRead: 1, readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  return c.json({ success: true });
});

router.post("/notifications/read-all", async (c) => {
  const userId = getHrUserId(c);
  await db.update(notifications).set({ isRead: 1, readAt: new Date() }).where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)));
  return c.json({ success: true });
});

// ============================================================
// Timeline: merged personal + company feed
// ============================================================
router.get("/timeline", async (c) => {
  const { employee } = getEmployee(c);
  const userId = getHrUserId(c);

  type Item = { type: string; title: string; detail?: string | null; at: string; status?: number };
  const items: Item[] = [];

  // My recent attendances
  const att = await db.select().from(attendances).where(eq(attendances.employeeId, employee.id)).orderBy(desc(attendances.date)).limit(15);
  for (const a of att) {
    if (a.checkInAt) items.push({ type: "attendance", title: "Absen masuk", detail: a.status === 1 ? "Telat" : "Tepat waktu", at: (a.checkInAt as Date).toISOString(), status: a.status });
    if (a.checkOutAt) items.push({ type: "attendance", title: "Absen pulang", at: (a.checkOutAt as Date).toISOString() });
  }
  // My recent leaves
  const lv = await db.select({ leave: leaves, leaveType: leaveTypes }).from(leaves).leftJoin(leaveTypes, eq(leaveTypes.id, leaves.leaveTypeId)).where(eq(leaves.employeeId, employee.id)).orderBy(desc(leaves.id)).limit(10);
  for (const r of lv) {
    items.push({ type: "leave", title: `Pengajuan ${r.leaveType?.name ?? "cuti"}`, detail: `${r.leave.startDate} s/d ${r.leave.endDate}`, at: (r.leave.createdAt as Date).toISOString(), status: r.leave.status });
  }
  // Company announcements
  const anns = await db.select().from(announcements).where(eq(announcements.status, 1)).orderBy(desc(announcements.publishedAt)).limit(10);
  for (const a of anns) {
    items.push({ type: "announcement", title: a.title, detail: null, at: (a.publishedAt ?? a.createdAt) instanceof Date ? ((a.publishedAt ?? a.createdAt) as Date).toISOString() : String(a.publishedAt ?? a.createdAt) });
  }
  // My notifications
  const notifs = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.id)).limit(15);
  for (const n of notifs) {
    items.push({ type: "notification", title: n.title, detail: n.message, at: (n.createdAt as Date).toISOString() });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return c.json({ success: true, data: items.slice(0, 60) });
});

// ============================================================
// Dashboard summary
// ============================================================
router.get("/summary", async (c) => {
  const { employee } = getEmployee(c);
  const userId = getHrUserId(c);
  const today = jakartaDateStr();
  const year = new Date().getFullYear();

  const [todayAtt] = await db.select().from(attendances).where(and(eq(attendances.employeeId, employee.id), eq(attendances.date, today))).limit(1);

  const balances = await db.select().from(leaveBalances).where(and(eq(leaveBalances.employeeId, employee.id), eq(leaveBalances.year, year)));
  const leaveRemaining = balances.reduce((sum, b) => sum + Number(b.remaining ?? 0), 0);

  // Pending counts across my submissions
  const countPending = async (table: any, col: any) =>
    (await db.select({ id: table.id }).from(table).where(and(eq(col, employee.id), eq(table.status, 0)))).length;
  const [pendingLeaves, pendingOvertime, pendingCash, pendingReimb] = await Promise.all([
    countPending(leaves, leaves.employeeId),
    countPending(overtimes, overtimes.employeeId),
    countPending(cashAdvances, cashAdvances.employeeId),
    countPending(reimbursements, reimbursements.employeeId),
  ]);

  const latestAnnouncements = await db
    .select()
    .from(announcements)
    .where(eq(announcements.status, 1))
    .orderBy(desc(announcements.publishedAt))
    .limit(3);

  const [unreadNotif] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)))
    .limit(1);

  return c.json({
    success: true,
    data: {
      employee: { id: employee.id, fullName: employee.fullName, photo: employee.photo },
      today: { date: today, attendance: todayAtt ?? null },
      leaveRemaining,
      pending: {
        leave: pendingLeaves,
        overtime: pendingOvertime,
        cashAdvance: pendingCash,
        reimbursement: pendingReimb,
        total: pendingLeaves + pendingOvertime + pendingCash + pendingReimb,
      },
      hasUnreadNotif: Boolean(unreadNotif),
      announcements: latestAnnouncements,
      isApprover: isApprover(getRole(c)),
    },
  });
});

// ============================================================
// APPROVALS inbox sub-router (approver roles only)
// ============================================================
const approvals = new Hono();
approvals.use("*", async (c, next) => {
  if (!isApprover(getRole(c))) {
    return c.json({ success: false, message: "Akses ditolak: bukan approver" }, 403);
  }
  await next();
});

// Aggregated pending list across modules.
approvals.get("/", async (c) => {
  const pendingLeaves = await db
    .select({ leave: leaves, employee: employees, leaveType: leaveTypes })
    .from(leaves)
    .leftJoin(employees, eq(employees.id, leaves.employeeId))
    .leftJoin(leaveTypes, eq(leaveTypes.id, leaves.leaveTypeId))
    .where(eq(leaves.status, 0))
    .orderBy(desc(leaves.id))
    .limit(100);

  const pendingOvertime = await db
    .select({ overtime: overtimes, employee: employees })
    .from(overtimes)
    .leftJoin(employees, eq(employees.id, overtimes.employeeId))
    .where(eq(overtimes.status, 0))
    .orderBy(desc(overtimes.id))
    .limit(100);

  const pendingCash = await db
    .select({ cashAdvance: cashAdvances, employee: employees })
    .from(cashAdvances)
    .leftJoin(employees, eq(employees.id, cashAdvances.employeeId))
    .where(eq(cashAdvances.status, 0))
    .orderBy(desc(cashAdvances.id))
    .limit(100);

  const pendingReimb = await db
    .select({ reimbursement: reimbursements, employee: employees })
    .from(reimbursements)
    .leftJoin(employees, eq(employees.id, reimbursements.employeeId))
    .where(eq(reimbursements.status, 0))
    .orderBy(desc(reimbursements.id))
    .limit(100);

  const pendingAttendance = await db
    .select({ correction: attendanceApprovals, employee: employees })
    .from(attendanceApprovals)
    .leftJoin(employees, eq(employees.id, attendanceApprovals.employeeId))
    .where(eq(attendanceApprovals.status, 0))
    .orderBy(desc(attendanceApprovals.id))
    .limit(100);

  return c.json({
    success: true,
    data: {
      leave: pendingLeaves.map((r) => ({ ...r.leave, employee: r.employee, leaveType: r.leaveType })),
      overtime: pendingOvertime.map((r) => ({ ...r.overtime, employee: r.employee })),
      cashAdvance: pendingCash.map((r) => ({ ...r.cashAdvance, employee: r.employee })),
      reimbursement: pendingReimb.map((r) => ({ ...r.reimbursement, employee: r.employee })),
      attendance: pendingAttendance.map((r) => ({ ...r.correction, employee: r.employee })),
    },
    counts: {
      leave: pendingLeaves.length,
      overtime: pendingOvertime.length,
      cashAdvance: pendingCash.length,
      reimbursement: pendingReimb.length,
      attendance: pendingAttendance.length,
      total: pendingLeaves.length + pendingOvertime.length + pendingCash.length + pendingReimb.length + pendingAttendance.length,
    },
  });
});

const MODULE_TABLE: Record<string, any> = {
  leave: leaves,
  overtime: overtimes,
  "cash-advance": cashAdvances,
  reimbursement: reimbursements,
  attendance: attendanceApprovals,
};

async function notifyEmployeeOfDecision(employeeId: number, title: string, message: string, type: number) {
  const [emp] = await db.select({ userId: employees.userId }).from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (emp?.userId) await notify({ userId: emp.userId, title, message, type, module: "approval" });
}

approvals.post("/:module/:id/approve", async (c) => {
  const userId = getHrUserId(c);
  const mod = c.req.param("module");
  const id = Number(c.req.param("id"));
  const table = MODULE_TABLE[mod];
  if (!table) return c.json({ success: false, message: "Modul tidak dikenal" }, 400);

  const [row0] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  if (!row0) return c.json({ success: false, message: "Tidak ditemukan" }, 404);

  await db.update(table).set({ status: 1, approverId: userId, approvedAt: new Date() }).where(eq(table.id, id));

  // Leave: deduct balance + apply attendance correction handled below.
  if (mod === "leave") {
    const leave = row0 as typeof leaves.$inferSelect;
    const year = new Date(leave.startDate).getFullYear();
    const [bal] = await db
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, leave.employeeId), eq(leaveBalances.leaveTypeId, leave.leaveTypeId), eq(leaveBalances.year, year)))
      .limit(1);
    if (bal) {
      const used = Number(bal.used ?? "0") + Number(leave.totalDays ?? "0");
      await db.update(leaveBalances).set({ used: String(used), remaining: String(Number(bal.totalQuota ?? "0") - used) }).where(eq(leaveBalances.id, bal.id));
    }
  }
  if (mod === "attendance") {
    const corr = row0 as typeof attendanceApprovals.$inferSelect;
    if (corr.attendanceId && (corr.requestedCheckIn || corr.requestedCheckOut)) {
      const setValues: Record<string, unknown> = {};
      if (corr.requestedCheckIn) setValues.checkInAt = corr.requestedCheckIn;
      if (corr.requestedCheckOut) setValues.checkOutAt = corr.requestedCheckOut;
      await db.update(attendances).set(setValues).where(eq(attendances.id, corr.attendanceId));
    }
  }

  await logActivity({ userId, action: ActivityAction.APPROVE, module: mod, referenceId: id });
  if (typeof row0.employeeId === "number") {
    await notifyEmployeeOfDecision(row0.employeeId, "Pengajuan disetujui", `Pengajuan ${mod} Anda telah disetujui.`, NotificationType.SUCCESS);
  }

  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

approvals.post("/:module/:id/reject", zValidator("json", jsonBody(z.object({ rejectionReason: z.string().optional() }))), async (c) => {
  const userId = getHrUserId(c);
  const mod = c.req.param("module");
  const id = Number(c.req.param("id"));
  const { rejectionReason } = c.req.valid("json");
  const table = MODULE_TABLE[mod];
  if (!table) return c.json({ success: false, message: "Modul tidak dikenal" }, 400);

  const [row0] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  if (!row0) return c.json({ success: false, message: "Tidak ditemukan" }, 404);

  // Not every table has a rejectionReason column (overtime/cashAdvance don't).
  const setValues: Record<string, unknown> = { status: 2, approverId: userId, approvedAt: new Date() };
  if (mod === "leave" || mod === "reimbursement" || mod === "attendance") setValues.rejectionReason = rejectionReason ?? null;
  await db.update(table).set(setValues).where(eq(table.id, id));

  await logActivity({ userId, action: ActivityAction.REJECT, module: mod, referenceId: id });
  if (typeof row0.employeeId === "number") {
    await notifyEmployeeOfDecision(row0.employeeId, "Pengajuan ditolak", rejectionReason ? `Alasan: ${rejectionReason}` : `Pengajuan ${mod} Anda ditolak.`, NotificationType.WARNING);
  }

  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

// Mount approvals sub-router.
router.route("/approvals", approvals);

export default router;
