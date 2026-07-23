import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";

import { db } from "../../db/client";
import { allowances, employeeAllowances, salaryStructures } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requirePayroll } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requirePayroll);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ============================================================
// Salary structures (gaji pokok per karyawan, ber-effective date)
// ============================================================
const salary = new Hono();
salary.use("*", requireAuth, requirePayroll);

salary.get("/", async (c) => {
  const employeeId = Number(c.req.query("employeeId"));
  if (!Number.isFinite(employeeId)) return c.json({ success: false, message: "employeeId wajib" }, 400);
  const rows = await db
    .select()
    .from(salaryStructures)
    .where(eq(salaryStructures.employeeId, employeeId))
    .orderBy(desc(salaryStructures.effectiveDate));
  return c.json({ success: true, data: rows });
});

const salaryPayload = z.object({
  employeeId: z.coerce.number().int(),
  basicSalary: z.union([z.string(), z.number()]),
  effectiveDate: dateStr,
  endDate: dateStr.nullable().optional(),
});

salary.post("/", zValidator("json", jsonBody(salaryPayload)), async (c) => {
  const p = c.req.valid("json");
  // Close any currently-open structure (endDate null) the day before the new one.
  const [open] = await db
    .select()
    .from(salaryStructures)
    .where(eq(salaryStructures.employeeId, p.employeeId))
    .orderBy(desc(salaryStructures.effectiveDate))
    .limit(1);
  if (open && !open.endDate && open.effectiveDate < p.effectiveDate) {
    const dayBefore = new Date(new Date(p.effectiveDate + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    await db.update(salaryStructures).set({ endDate: dayBefore }).where(eq(salaryStructures.id, open.id));
  }
  const [res] = await db.insert(salaryStructures).values({
    employeeId: p.employeeId,
    basicSalary: String(p.basicSalary),
    effectiveDate: p.effectiveDate,
    endDate: p.endDate ?? null,
  });
  const [row] = await db.select().from(salaryStructures).where(eq(salaryStructures.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

salary.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.delete(salaryStructures).where(eq(salaryStructures.id, id));
  return c.json({ success: true });
});

router.route("/salary-structures", salary);

// ============================================================
// Allowances master (jenis tunjangan perusahaan)
// ============================================================
const allowance = new Hono();
allowance.use("*", requireAuth, requirePayroll);

allowance.get("/", async (c) => {
  const rows = await db.select().from(allowances).orderBy(allowances.name);
  return c.json({ success: true, data: rows });
});

const allowancePayload = z.object({
  name: z.string().min(1),
  type: z.coerce.number().int().min(0).max(2).default(0),
  amount: z.union([z.string(), z.number()]).optional(),
  isTaxable: z.coerce.number().int().min(0).max(1).default(1),
});

allowance.post("/", zValidator("json", jsonBody(allowancePayload)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(allowances).values({
    name: p.name,
    type: p.type,
    amount: p.amount != null ? String(p.amount) : "0",
    isTaxable: p.isTaxable,
  });
  const [row] = await db.select().from(allowances).where(eq(allowances.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

allowance.put("/:id", zValidator("json", jsonBody(allowancePayload.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  const p = c.req.valid("json");
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) set[k] = k === "amount" ? String(v) : v;
  if (Object.keys(set).length) {
    await db.update(allowances).set(set).where(eq(allowances.id, id));
  }
  const [row] = await db.select().from(allowances).where(eq(allowances.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

allowance.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.delete(allowances).where(eq(allowances.id, id));
  return c.json({ success: true });
});

router.route("/allowances", allowance);

// ============================================================
// Employee allowances (tunjangan yang menempel ke karyawan)
// ============================================================
const empAllowance = new Hono();
empAllowance.use("*", requireAuth, requirePayroll);

empAllowance.get("/", async (c) => {
  const employeeId = Number(c.req.query("employeeId"));
  if (!Number.isFinite(employeeId)) return c.json({ success: false, message: "employeeId wajib" }, 400);
  const rows = await db
    .select({ ea: employeeAllowances, allowance: allowances })
    .from(employeeAllowances)
    .leftJoin(allowances, eq(allowances.id, employeeAllowances.allowanceId))
    .where(eq(employeeAllowances.employeeId, employeeId));
  return c.json({ success: true, data: rows.map((r) => ({ ...r.ea, allowance: r.allowance })) });
});

const empAllowancePayload = z.object({
  employeeId: z.coerce.number().int(),
  allowanceId: z.coerce.number().int(),
  amount: z.union([z.string(), z.number()]),
  effectiveDate: dateStr,
  endDate: dateStr.nullable().optional(),
});

empAllowance.post("/", zValidator("json", jsonBody(empAllowancePayload)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(employeeAllowances).values({
    employeeId: p.employeeId,
    allowanceId: p.allowanceId,
    amount: String(p.amount),
    effectiveDate: p.effectiveDate,
    endDate: p.endDate ?? null,
  });
  const [row] = await db.select().from(employeeAllowances).where(eq(employeeAllowances.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

empAllowance.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.delete(employeeAllowances).where(eq(employeeAllowances.id, id));
  return c.json({ success: true });
});

router.route("/employee-allowances", empAllowance);

export default router;
