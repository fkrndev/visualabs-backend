import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, like, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { leaveBalances, leaveTypes, leaves, employees } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ============== Leave Types ==============
const leaveTypeRouter = new Hono();
leaveTypeRouter.use("*", requireAuth, requireHR);

leaveTypeRouter.get("/", async (c) => {
  const items = await db
    .select()
    .from(leaveTypes)
    .orderBy(asc(leaveTypes.id));
  return c.json({ success: true, data: items });
});

const leaveTypePayload = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  maxDaysPerYear: z.coerce.number().int().optional(),
  isPaid: z.coerce.number().int().min(0).max(1).default(1),
  requiresAttachment: z.coerce.number().int().min(0).max(1).default(0),
  gender: z.coerce.number().int().min(0).max(2).default(0),
});

leaveTypeRouter.post("/", zValidator("json", jsonBody(leaveTypePayload)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(leaveTypes).values({ ...p });
  const [row] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

leaveTypeRouter.put("/:id", zValidator("json", jsonBody(leaveTypePayload.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  const p = c.req.valid("json");
  const setValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) setValues[k] = v;
  if (Object.keys(setValues).length) {
    await db
      .update(leaveTypes)
      .set(setValues)
      .where(eq(leaveTypes.id, id));
  }
  const [row] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

leaveTypeRouter.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db
    .delete(leaveTypes)
    .where(eq(leaveTypes.id, id));
  return c.json({ success: true });
});

router.route("/types", leaveTypeRouter);

// ============== Leave Balances ==============
const balanceRouter = new Hono();
balanceRouter.use("*", requireAuth, requireHR);

balanceRouter.get("/", async (c) => {
  const employeeId = c.req.query("employeeId");
  const year = c.req.query("year") ?? String(new Date().getFullYear());
  const filters: SQL[] = [
    eq(leaveBalances.year, Number(year)),
  ];
  if (employeeId) filters.push(eq(leaveBalances.employeeId, Number(employeeId)));
  const items = await db
    .select({ balance: leaveBalances, leaveType: leaveTypes })
    .from(leaveBalances)
    .leftJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
    .where(and(...filters));
  return c.json({
    success: true,
    data: items.map((r) => ({ ...r.balance, leaveType: r.leaveType })),
  });
});

const balanceUpsert = z.object({
  employeeId: z.coerce.number().int(),
  leaveTypeId: z.coerce.number().int(),
  year: z.coerce.number().int(),
  totalQuota: z.union([z.string(), z.number()]),
});

balanceRouter.post("/", zValidator("json", jsonBody(balanceUpsert)), async (c) => {
  const p = c.req.valid("json");
  // Upsert
  await db
    .delete(leaveBalances)
    .where(
      and(
        eq(leaveBalances.employeeId, p.employeeId),
        eq(leaveBalances.leaveTypeId, p.leaveTypeId),
        eq(leaveBalances.year, p.year),
      ),
    );
  const [res] = await db.insert(leaveBalances).values({
    employeeId: p.employeeId,
    leaveTypeId: p.leaveTypeId,
    year: p.year,
    totalQuota: String(p.totalQuota),
    used: "0",
    remaining: String(p.totalQuota),
  });
  const [row] = await db.select().from(leaveBalances).where(eq(leaveBalances.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.route("/balances", balanceRouter);

// ============== Leaves (main) ==============
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const filters: SQL[] = [];
  if (q.employeeId) filters.push(eq(leaves.employeeId, q.employeeId));
  if (q.status !== undefined) filters.push(eq(leaves.status, q.status));

  const offset = (q.page - 1) * q.limit;
  const items = await db
    .select({ leave: leaves, employee: employees, leaveType: leaveTypes })
    .from(leaves)
    .leftJoin(employees, eq(employees.id, leaves.employeeId))
    .leftJoin(leaveTypes, eq(leaveTypes.id, leaves.leaveTypeId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(leaves.id))
    .limit(q.limit)
    .offset(offset);

  return c.json({
    success: true,
    data: items.map((r) => ({ ...r.leave, employee: r.employee, leaveType: r.leaveType })),
    page: { page: q.page, limit: q.limit, hasNext: items.length === q.limit },
  });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db
    .select({ leave: leaves, employee: employees, leaveType: leaveTypes })
    .from(leaves)
    .leftJoin(employees, eq(employees.id, leaves.employeeId))
    .leftJoin(leaveTypes, eq(leaveTypes.id, leaves.leaveTypeId))
    .where(eq(leaves.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({
    success: true,
    data: { ...row.leave, employee: row.employee, leaveType: row.leaveType },
  });
});

const leavePayload = z.object({
  employeeId: z.coerce.number().int(),
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

router.post("/", zValidator("json", jsonBody(leavePayload)), async (c) => {
  const p = c.req.valid("json");
  const total = p.totalDays != null ? String(p.totalDays) : String(daysBetween(p.startDate, p.endDate));
  const [res] = await db.insert(leaves).values({
    employeeId: p.employeeId,
    leaveTypeId: p.leaveTypeId,
    startDate: p.startDate,
    endDate: p.endDate,
    totalDays: total,
    reason: p.reason ?? null,
    attachment: p.attachment ?? null,
    status: 0,
  });
  const [row] = await db.select().from(leaves).where(eq(leaves.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.post("/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  // Get leave
  const [leave] = await db
    .select()
    .from(leaves)
    .where(eq(leaves.id, id))
    .limit(1);
  if (!leave) return c.json({ success: false, message: "Tidak ditemukan" }, 404);

  await db
    .update(leaves)
    .set({ status: 1, approverId: getHrUserId(c), approvedAt: new Date() })
    .where(eq(leaves.id, id));

  // Deduct balance kalau ada
  const year = new Date(leave.startDate).getFullYear();
  const [bal] = await db
    .select()
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.employeeId, leave.employeeId),
        eq(leaveBalances.leaveTypeId, leave.leaveTypeId),
        eq(leaveBalances.year, year),
      ),
    )
    .limit(1);
  if (bal) {
    const used = Number(bal.used ?? "0") + Number(leave.totalDays ?? "0");
    const remaining = Number(bal.totalQuota ?? "0") - used;
    await db
      .update(leaveBalances)
      .set({ used: String(used), remaining: String(remaining) })
      .where(eq(leaveBalances.id, bal.id));
  }
  const [row] = await db.select().from(leaves).where(eq(leaves.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.post(
  "/:id/reject",
  zValidator("json", jsonBody(z.object({ rejectionReason: z.string().optional() }))),
  async (c) => {
    const id = Number(c.req.param("id"));
    const { rejectionReason } = c.req.valid("json");
    await db
      .update(leaves)
      .set({
        status: 2,
        approverId: getHrUserId(c),
        approvedAt: new Date(),
        rejectionReason: rejectionReason ?? null,
      })
      .where(eq(leaves.id, id));
    const [row] = await db.select().from(leaves).where(eq(leaves.id, id)).limit(1);
    return c.json({ success: true, data: row });
  },
);

router.post("/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  await db
    .update(leaves)
    .set({ status: 3 })
    .where(eq(leaves.id, id));
  const [row] = await db.select().from(leaves).where(eq(leaves.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.delete(leaves).where(eq(leaves.id, id));
  return c.json({ success: true });
});

export default router;
