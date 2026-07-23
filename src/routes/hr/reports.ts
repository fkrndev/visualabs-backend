import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  reportTemplates,
  reportLogs,
  attendances,
  leaves,
  payrolls,
  payrollPeriods,
  pettyCashTransactions,
  employees,
} from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireFinance, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

// module: 0=attendance, 1=payroll, 2=leave, 3=finance
const Module = { ATTENDANCE: 0, PAYROLL: 1, LEAVE: 2, FINANCE: 3 } as const;
const LEAVE_APPROVED = 1;
const PETTY_IN = 0; // transactionType 0=masuk, 1=keluar

const router = new Hono();
router.use("*", requireAuth, requireFinance);

// ============================================================
// TEMPLATES
// ============================================================
const templatePayload = z.object({
  name: z.string().min(1),
  module: z.coerce.number().int().min(0).max(3),
  config: z.record(z.string(), z.any()).optional(),
});

router.get("/templates", async (c) => {
  const rows = await db.select().from(reportTemplates).orderBy(desc(reportTemplates.id));
  return c.json({ success: true, data: rows });
});

router.post("/templates", zValidator("json", jsonBody(templatePayload)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(reportTemplates).values({
    name: p.name,
    module: p.module,
    config: p.config ?? null,
    createdBy: getHrUserId(c),
  });
  const [row] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/templates/:id", zValidator("json", jsonBody(templatePayload.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const p = c.req.valid("json");

  const setValues: Partial<typeof reportTemplates.$inferInsert> = {};
  if (p.name !== undefined) setValues.name = p.name;
  if (p.module !== undefined) setValues.module = p.module;
  if (p.config !== undefined) setValues.config = p.config ?? null;

  if (Object.keys(setValues).length) {
    await db.update(reportTemplates).set(setValues).where(eq(reportTemplates.id, id));
  }
  const [row] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

router.delete("/templates/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  await db.delete(reportTemplates).where(eq(reportTemplates.id, id));
  return c.json({ success: true, message: "Template laporan dihapus" });
});

// ============================================================
// LOGS
// ============================================================
router.get("/logs", async (c) => {
  const rows = await db
    .select({ log: reportLogs, templateName: reportTemplates.name })
    .from(reportLogs)
    .leftJoin(reportTemplates, eq(reportTemplates.id, reportLogs.reportTemplateId))
    .orderBy(desc(reportLogs.id));
  return c.json({ success: true, data: rows.map((r) => ({ ...r.log, templateName: r.templateName })) });
});

// ============================================================
// GENERATE
// ============================================================
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const generateSchema = z.object({
  module: z.coerce.number().int().min(0).max(3),
  from: dateStr,
  to: dateStr,
});

router.post("/generate", zValidator("json", jsonBody(generateSchema)), async (c) => {
  const { module, from, to } = c.req.valid("json");

  let summary: unknown;

  if (module === Module.ATTENDANCE) {
    // Rekap absensi per karyawan dalam rentang tanggal.
    summary = await db
      .select({
        employeeId: attendances.employeeId,
        employeeName: employees.fullName,
        daysPresent: sql<number>`count(${attendances.id})`,
        totalLateMinutes: sql<number>`coalesce(sum(${attendances.lateMinutes}),0)`,
        totalOvertimeMinutes: sql<number>`coalesce(sum(${attendances.overtimeMinutes}),0)`,
      })
      .from(attendances)
      .leftJoin(employees, eq(employees.id, attendances.employeeId))
      .where(and(gte(attendances.date, from), lte(attendances.date, to)))
      .groupBy(attendances.employeeId, employees.fullName);
  } else if (module === Module.LEAVE) {
    // Cuti approved yang overlap rentang, total hari per karyawan.
    summary = await db
      .select({
        employeeId: leaves.employeeId,
        employeeName: employees.fullName,
        totalLeaveDays: sql<string>`coalesce(sum(${leaves.totalDays}),0)`,
        leaveCount: sql<number>`count(${leaves.id})`,
      })
      .from(leaves)
      .leftJoin(employees, eq(employees.id, leaves.employeeId))
      .where(and(eq(leaves.status, LEAVE_APPROVED), lte(leaves.startDate, to), gte(leaves.endDate, from)))
      .groupBy(leaves.employeeId, employees.fullName);
  } else if (module === Module.PAYROLL) {
    // Payroll dari periode yang overlap rentang, total gross & net per karyawan.
    summary = await db
      .select({
        employeeId: payrolls.employeeId,
        employeeName: employees.fullName,
        totalGross: sql<string>`coalesce(sum(${payrolls.grossSalary}),0)`,
        totalNet: sql<string>`coalesce(sum(${payrolls.netSalary}),0)`,
        payrollCount: sql<number>`count(${payrolls.id})`,
      })
      .from(payrolls)
      .innerJoin(payrollPeriods, eq(payrollPeriods.id, payrolls.payrollPeriodId))
      .leftJoin(employees, eq(employees.id, payrolls.employeeId))
      .where(and(lte(payrollPeriods.startDate, to), gte(payrollPeriods.endDate, from)))
      .groupBy(payrolls.employeeId, employees.fullName);
  } else {
    // FINANCE — total masuk vs keluar petty cash dalam rentang.
    const [agg] = await db
      .select({
        totalIn: sql<string>`coalesce(sum(case when ${pettyCashTransactions.transactionType} = ${PETTY_IN} then ${pettyCashTransactions.amount} else 0 end),0)`,
        totalOut: sql<string>`coalesce(sum(case when ${pettyCashTransactions.transactionType} <> ${PETTY_IN} then ${pettyCashTransactions.amount} else 0 end),0)`,
        transactionCount: sql<number>`count(${pettyCashTransactions.id})`,
      })
      .from(pettyCashTransactions)
      .where(and(gte(pettyCashTransactions.transactionDate, from), lte(pettyCashTransactions.transactionDate, to)));
    summary = {
      totalIn: agg?.totalIn ?? "0",
      totalOut: agg?.totalOut ?? "0",
      transactionCount: Number(agg?.transactionCount ?? 0),
    };
  }

  await db.insert(reportLogs).values({
    reportTemplateId: null,
    params: { module, from, to },
    format: 0,
  });

  return c.json({ success: true, data: { module, from, to, summary } });
});

export default router;
