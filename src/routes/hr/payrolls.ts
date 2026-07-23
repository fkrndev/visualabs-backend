import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  bpjsSettings,
  employees,
  payrollBpjsDetails,
  payrollComponents,
  payrollPeriods,
  payrolls,
  payrollSettings,
  payslipSettings,
  ptkpSettings,
  taxBrackets,
  taxSettings,
} from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requirePayroll, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";
import { generatePeriod } from "../../services/payroll";

// BPJS type codes (numeric tinyint values in DB). Mirror of hr-backend enums.
const BpjsType = { KESEHATAN: 0, JHT: 1, JP: 2, JKK: 3, JKM: 4 } as const;

const router = new Hono();
router.use("*", requireAuth, requirePayroll);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ============================================================
// SETTINGS  (mount before /:id-style routes to avoid clashes)
// ============================================================
const settings = new Hono();
settings.use("*", requireAuth, requirePayroll);

settings.get("/", async (c) => {
  const [pay] = await db.select().from(payrollSettings).limit(1);
  const [slip] = await db.select().from(payslipSettings).limit(1);
  const [tax] = await db.select().from(taxSettings).limit(1);
  const bpjs = await db.select().from(bpjsSettings);
  return c.json({ success: true, data: { payroll: pay ?? null, payslip: slip ?? null, tax: tax ?? null, bpjs } });
});

const settingsPayload = z.object({
  payroll: z.object({
    payrollCutoffDate: z.coerce.number().int().min(1).max(31).optional(),
    paymentDate: z.coerce.number().int().min(1).max(31).optional(),
    roundingType: z.coerce.number().int().min(0).max(3).optional(),
    roundingValue: z.coerce.number().int().optional(),
  }).optional(),
  tax: z.object({
    calculationMethod: z.coerce.number().int().min(0).max(2).optional(),
    terEnabled: z.coerce.number().int().min(0).max(1).optional(),
  }).optional(),
});

settings.put("/", zValidator("json", jsonBody(settingsPayload)), async (c) => {
  const p = c.req.valid("json");
  // Single-tenant: settings = 1 baris. Update baris pertama kalau ada, else insert.
  if (p.payroll) {
    const [ex] = await db.select({ id: payrollSettings.id }).from(payrollSettings).limit(1);
    if (ex) await db.update(payrollSettings).set(p.payroll).where(eq(payrollSettings.id, ex.id));
    else await db.insert(payrollSettings).values({ ...p.payroll });
  }
  if (p.tax) {
    const [ex] = await db.select({ id: taxSettings.id }).from(taxSettings).limit(1);
    if (ex) await db.update(taxSettings).set(p.tax).where(eq(taxSettings.id, ex.id));
    else await db.insert(taxSettings).values({ ...p.tax });
  }
  return c.json({ success: true });
});

const bpjsPayload = z.object({
  items: z.array(
    z.object({
      bpjsType: z.coerce.number().int().min(0).max(4),
      employerRate: z.union([z.string(), z.number()]),
      employeeRate: z.union([z.string(), z.number()]),
      salaryCap: z.union([z.string(), z.number()]).nullable().optional(),
      jkkRiskLevel: z.coerce.number().int().optional(),
    }),
  ),
});

settings.put("/bpjs", zValidator("json", jsonBody(bpjsPayload)), async (c) => {
  const { items } = c.req.valid("json");
  await db.delete(bpjsSettings);
  if (items.length) {
    await db.insert(bpjsSettings).values(
      items.map((i) => ({
        bpjsType: i.bpjsType,
        employerRate: String(i.employerRate),
        employeeRate: String(i.employeeRate),
        salaryCap: i.salaryCap != null ? String(i.salaryCap) : null,
        jkkRiskLevel: i.jkkRiskLevel ?? null,
        effectiveDate: `${new Date().getFullYear()}-01-01`,
      })),
    );
  }
  return c.json({ success: true });
});

// Seed sensible Indonesian defaults (BPJS + PTKP + tax brackets + payroll/tax settings).
// Idempotent. NOTE: verify against the latest DJP/BPJS regulation before production use.
settings.post("/seed-defaults", async (c) => {
  const year = new Date().getFullYear();
  const effDate = `${year}-01-01`;

  // payroll_settings (singleton)
  {
    const defaults = { payrollCutoffDate: 25, paymentDate: 28, roundingType: 2, roundingValue: 100 };
    const [ex] = await db.select({ id: payrollSettings.id }).from(payrollSettings).limit(1);
    if (ex) await db.update(payrollSettings).set(defaults).where(eq(payrollSettings.id, ex.id));
    else await db.insert(payrollSettings).values(defaults);
  }
  // tax_settings (singleton)
  {
    const defaults = { calculationMethod: 0, terEnabled: 1 };
    const [ex] = await db.select({ id: taxSettings.id }).from(taxSettings).limit(1);
    if (ex) await db.update(taxSettings).set(defaults).where(eq(taxSettings.id, ex.id));
    else await db.insert(taxSettings).values(defaults);
  }

  // bpjs_settings (replace)
  await db.delete(bpjsSettings);
  await db.insert(bpjsSettings).values([
    { bpjsType: BpjsType.KESEHATAN, employerRate: "4", employeeRate: "1", salaryCap: "12000000", effectiveDate: effDate },
    { bpjsType: BpjsType.JHT, employerRate: "3.7", employeeRate: "2", salaryCap: null, effectiveDate: effDate },
    { bpjsType: BpjsType.JP, employerRate: "2", employeeRate: "1", salaryCap: "10042300", effectiveDate: effDate },
    { bpjsType: BpjsType.JKK, employerRate: "0.24", employeeRate: "0", salaryCap: null, jkkRiskLevel: 0, effectiveDate: effDate },
    { bpjsType: BpjsType.JKM, employerRate: "0.3", employeeRate: "0", salaryCap: null, effectiveDate: effDate },
  ]);

  // ptkp_settings (UU HPP 2022, annual). Global by effectiveYear+code.
  await db.delete(ptkpSettings).where(eq(ptkpSettings.effectiveYear, year));
  const ptkp: Array<[number, number]> = [
    [0, 54000000], [1, 58500000], [2, 63000000], [3, 67500000],
    [4, 58500000], [5, 63000000], [6, 67500000], [7, 72000000],
    [8, 112500000], [9, 117000000], [10, 121500000], [11, 126000000],
  ];
  await db.insert(ptkpSettings).values(ptkp.map(([code, amount]) => ({ code, amount: String(amount), effectiveYear: year })));

  // tax_brackets (UU HPP progressive). Global by effectiveYear.
  await db.delete(taxBrackets).where(eq(taxBrackets.effectiveYear, year));
  await db.insert(taxBrackets).values([
    { minIncome: "0", maxIncome: "60000000", rate: "5", effectiveYear: year },
    { minIncome: "60000000", maxIncome: "250000000", rate: "15", effectiveYear: year },
    { minIncome: "250000000", maxIncome: "500000000", rate: "25", effectiveYear: year },
    { minIncome: "500000000", maxIncome: "5000000000", rate: "30", effectiveYear: year },
    { minIncome: "5000000000", maxIncome: null, rate: "35", effectiveYear: year },
  ]);

  return c.json({ success: true, message: `Default BPJS, PTKP & tarif pajak ${year} berhasil diisi. Harap verifikasi ke regulasi terbaru.` });
});

router.route("/settings", settings);

// ============================================================
// PERIODS
// ============================================================
const periods = new Hono();
periods.use("*", requireAuth, requirePayroll);

periods.get("/", async (c) => {
  const rows = await db
    .select({
      period: payrollPeriods,
      count: sql<number>`count(${payrolls.id})`,
      gross: sql<string>`coalesce(sum(${payrolls.grossSalary}),0)`,
      net: sql<string>`coalesce(sum(${payrolls.netSalary}),0)`,
    })
    .from(payrollPeriods)
    .leftJoin(payrolls, eq(payrolls.payrollPeriodId, payrollPeriods.id))
    .groupBy(payrollPeriods.id)
    .orderBy(desc(payrollPeriods.periodYear), desc(payrollPeriods.periodMonth));
  return c.json({
    success: true,
    data: rows.map((r) => ({ ...r.period, employeeCount: Number(r.count), totalGross: r.gross, totalNet: r.net })),
  });
});

const periodPayload = z.object({
  periodMonth: z.coerce.number().int().min(1).max(12),
  periodYear: z.coerce.number().int().min(2000).max(2100),
  startDate: dateStr,
  endDate: dateStr,
  paymentDate: dateStr.optional(),
});

periods.post("/", zValidator("json", jsonBody(periodPayload)), async (c) => {
  const p = c.req.valid("json");
  const [dupe] = await db
    .select({ id: payrollPeriods.id })
    .from(payrollPeriods)
    .where(and(eq(payrollPeriods.periodYear, p.periodYear), eq(payrollPeriods.periodMonth, p.periodMonth)))
    .limit(1);
  if (dupe) return c.json({ success: false, message: "Periode untuk bulan ini sudah ada" }, 409);
  const [res] = await db.insert(payrollPeriods).values({
    periodMonth: p.periodMonth,
    periodYear: p.periodYear,
    startDate: p.startDate,
    endDate: p.endDate,
    paymentDate: p.paymentDate ?? null,
    status: 0,
    createdBy: getHrUserId(c),
  });
  const [row] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

periods.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [period] = await db
    .select()
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, id))
    .limit(1);
  if (!period) return c.json({ success: false, message: "Periode tidak ditemukan" }, 404);
  const [agg] = await db
    .select({
      count: sql<number>`count(${payrolls.id})`,
      gross: sql<string>`coalesce(sum(${payrolls.grossSalary}),0)`,
      net: sql<string>`coalesce(sum(${payrolls.netSalary}),0)`,
      bpjs: sql<string>`coalesce(sum(${payrolls.totalBpjs}),0)`,
      tax: sql<string>`coalesce(sum(${payrolls.totalTax}),0)`,
      deduction: sql<string>`coalesce(sum(${payrolls.totalDeduction}),0)`,
    })
    .from(payrolls)
    .where(eq(payrolls.payrollPeriodId, id));
  return c.json({
    success: true,
    data: {
      ...period,
      summary: {
        employeeCount: Number(agg?.count ?? 0),
        totalGross: agg?.gross ?? "0",
        totalNet: agg?.net ?? "0",
        totalBpjs: agg?.bpjs ?? "0",
        totalTax: agg?.tax ?? "0",
        totalDeduction: agg?.deduction ?? "0",
      },
    },
  });
});

periods.post("/:id/generate", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    const result = await generatePeriod(id);
    return c.json({ success: true, data: result, message: `${result.count} payroll dihasilkan` });
  } catch (e: any) {
    return c.json({ success: false, message: e?.message ?? "Gagal generate payroll" }, 400);
  }
});

periods.post("/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, id)).limit(1);
  if (!period) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  await db.update(payrollPeriods).set({ status: 2, approvedBy: getHrUserId(c) }).where(eq(payrollPeriods.id, id));
  await db.update(payrolls).set({ status: 1 }).where(eq(payrolls.payrollPeriodId, id));
  return c.json({ success: true });
});

periods.post("/:id/mark-paid", async (c) => {
  const id = Number(c.req.param("id"));
  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, id)).limit(1);
  if (!period) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  if (period.status < 2) return c.json({ success: false, message: "Setujui periode dulu sebelum menandai dibayar" }, 400);
  await db.update(payrollPeriods).set({ status: 3 }).where(eq(payrollPeriods.id, id));
  await db.update(payrolls).set({ status: 2, paidAt: new Date() }).where(eq(payrolls.payrollPeriodId, id));
  return c.json({ success: true });
});

periods.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, id)).limit(1);
  if (!period) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  if (period.status >= 3) return c.json({ success: false, message: "Periode sudah dibayar, tidak bisa dihapus" }, 400);
  await db.delete(payrollPeriods).where(eq(payrollPeriods.id, id)); // cascade drops payrolls+components
  return c.json({ success: true });
});

router.route("/periods", periods);

// ============================================================
// PAYROLLS (per employee, within a period)
// ============================================================
router.get("/", async (c) => {
  const periodId = Number(c.req.query("periodId"));
  if (!Number.isFinite(periodId)) return c.json({ success: false, message: "periodId wajib" }, 400);
  const rows = await db
    .select({ payroll: payrolls, employee: employees })
    .from(payrolls)
    .leftJoin(employees, eq(employees.id, payrolls.employeeId))
    .where(eq(payrolls.payrollPeriodId, periodId))
    .orderBy(employees.fullName);
  return c.json({ success: true, data: rows.map((r) => ({ ...r.payroll, employee: r.employee })) });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db
    .select({ payroll: payrolls, employee: employees, period: payrollPeriods })
    .from(payrolls)
    .leftJoin(employees, eq(employees.id, payrolls.employeeId))
    .leftJoin(payrollPeriods, eq(payrollPeriods.id, payrolls.payrollPeriodId))
    .where(eq(payrolls.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  const components = await db.select().from(payrollComponents).where(eq(payrollComponents.payrollId, id));
  const bpjs = await db.select().from(payrollBpjsDetails).where(eq(payrollBpjsDetails.payrollId, id));
  return c.json({ success: true, data: { ...row.payroll, employee: row.employee, period: row.period, components, bpjsDetails: bpjs } });
});

export default router;
