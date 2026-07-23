import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { taxWithholdingSlips, payrolls, payrollPeriods, employees } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireFinance } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

// slip_type: 5 = FORM_1721_A1 (bukti potong tahunan pegawai tetap).
const SLIP_TYPE_1721_A1 = 5;

const router = new Hono();
router.use("*", requireAuth, requireFinance);

const listQuery = z.object({
  year: z.coerce.number().int().optional(),
  employeeId: z.coerce.number().int().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { year, employeeId } = c.req.valid("query");

  const filters: SQL[] = [];
  if (year !== undefined) filters.push(eq(taxWithholdingSlips.periodYear, year));
  if (employeeId !== undefined) filters.push(eq(taxWithholdingSlips.employeeId, employeeId));

  const rows = await db
    .select({ slip: taxWithholdingSlips, employeeName: employees.fullName })
    .from(taxWithholdingSlips)
    .leftJoin(employees, eq(employees.id, taxWithholdingSlips.employeeId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(taxWithholdingSlips.periodYear), desc(taxWithholdingSlips.id));

  return c.json({ success: true, data: rows.map((r) => ({ ...r.slip, employeeName: r.employeeName })) });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const [row] = await db
    .select({ slip: taxWithholdingSlips, employeeName: employees.fullName })
    .from(taxWithholdingSlips)
    .leftJoin(employees, eq(employees.id, taxWithholdingSlips.employeeId))
    .where(eq(taxWithholdingSlips.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({ success: true, data: { ...row.slip, employeeName: row.employeeName } });
});

const generateSchema = z.object({
  payrollPeriodId: z.coerce.number().int(),
  isAnnual: z.coerce.number().int().min(0).max(1).optional(),
});

// Generate bukti potong PPh 21 untuk setiap payroll dalam sebuah periode.
// grossIncome diambil dari payrolls.grossSalary, taxAmount dari payrolls.totalTax.
// taxableIncome / ptkpAmount / taxRate belum ada sumber kolomnya di payrolls → 0.
router.post("/generate", zValidator("json", jsonBody(generateSchema)), async (c) => {
  const { payrollPeriodId, isAnnual } = c.req.valid("json");

  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, payrollPeriodId)).limit(1);
  if (!period) return c.json({ success: false, message: "Periode payroll tidak ditemukan" }, 404);

  const rows = await db.select().from(payrolls).where(eq(payrolls.payrollPeriodId, payrollPeriodId));
  if (!rows.length) return c.json({ success: false, message: "Belum ada payroll di periode ini" }, 400);

  // Idempoten: hapus slip lama untuk periode ini sebelum generate ulang.
  await db.delete(taxWithholdingSlips).where(eq(taxWithholdingSlips.payrollPeriodId, payrollPeriodId));

  const annual = isAnnual ?? 0;
  const values = rows.map((p) => ({
    employeeId: p.employeeId,
    payrollPeriodId,
    slipType: SLIP_TYPE_1721_A1,
    documentNumber: `1721A1/${period.periodYear}/${p.employeeId}-${payrollPeriodId}`,
    periodMonth: period.periodMonth,
    periodYear: period.periodYear,
    isAnnual: annual,
    grossIncome: p.grossSalary ?? "0",
    ptkpAmount: "0",
    taxableIncome: "0",
    taxRate: "0",
    taxAmount: p.totalTax ?? "0",
    status: 0,
  }));

  await db.insert(taxWithholdingSlips).values(values);
  return c.json({ success: true, data: { generated: values.length } });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  await db.delete(taxWithholdingSlips).where(eq(taxWithholdingSlips.id, id));
  return c.json({ success: true, message: "Bukti potong dihapus" });
});

export default router;
