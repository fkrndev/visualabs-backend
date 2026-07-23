import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";

import { db } from "../../db/client";
import {
  thrSettings,
  thrDisbursements,
  employees,
  salaryStructures,
  allowances,
  employeeAllowances,
} from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireFinance } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

// ============================================================
// Local enum codes (numeric tinyint values in DB).
// ============================================================
/** Status pembayaran THR. */
const ThrStatus = { UNPAID: 0, PAID: 1 } as const;
/** Jenis tunjangan tetap (allowances.type). FIXED ikut dihitung sebagai upah. */
const AllowanceType = { FIXED: 0 } as const;
/** Hari raya keagamaan acuan THR (thr_disbursements.religion_holiday). */
const ReligionHoliday = {
  IDUL_FITRI: 0,
  NATAL: 1,
  NYEPI: 2,
  WAISAK: 3,
  IMLEK: 4,
} as const;

const router = new Hono();
router.use("*", requireAuth, requireFinance);

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Tanggal hari ini sebagai string `YYYY-MM-DD` (UTC). */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Jumlah bulan penuh dari `from` (YYYY-MM-DD) sampai tanggal `to`.
 * Belum genap sebulan (tanggal `to` < tanggal `from`) tidak dihitung.
 */
function fullMonthsBetween(from: string, to: Date): number {
  const f = new Date(from + "T00:00:00Z");
  if (Number.isNaN(f.getTime())) return 0;
  let months =
    (to.getUTCFullYear() - f.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - f.getUTCMonth());
  if (to.getUTCDate() < f.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Upah sebulan = gaji pokok (salary_structures) + total tunjangan FIXED
 * (employee_allowances → allowances.type = FIXED), yang berlaku pada `asOf`.
 * Return `null` kalau karyawan belum punya struktur gaji.
 */
async function calcMonthlyWage(employeeId: number, asOf: string): Promise<number | null> {
  const [struct] = await db
    .select({ basicSalary: salaryStructures.basicSalary })
    .from(salaryStructures)
    .where(
      and(
        eq(salaryStructures.employeeId, employeeId),
        lte(salaryStructures.effectiveDate, asOf),
        or(isNull(salaryStructures.endDate), gte(salaryStructures.endDate, asOf)),
      ),
    )
    .orderBy(desc(salaryStructures.effectiveDate))
    .limit(1);
  if (!struct) return null;

  let wage = Number(struct.basicSalary ?? "0");

  const rows = await db
    .select({ amount: employeeAllowances.amount })
    .from(employeeAllowances)
    .innerJoin(allowances, eq(allowances.id, employeeAllowances.allowanceId))
    .where(
      and(
        eq(employeeAllowances.employeeId, employeeId),
        eq(allowances.type, AllowanceType.FIXED),
        lte(employeeAllowances.effectiveDate, asOf),
        or(isNull(employeeAllowances.endDate), gte(employeeAllowances.endDate, asOf)),
      ),
    );
  for (const r of rows) wage += Number(r.amount ?? "0");

  return wage;
}

// ============================================================
// SETTINGS (singleton) — mount sebelum route /:id
// ============================================================
const settings = new Hono();
settings.use("*", requireAuth, requireFinance);

settings.get("/", async (c) => {
  const [row] = await db.select().from(thrSettings).limit(1);
  return c.json({ success: true, data: row ?? null });
});

const settingsPayload = z.object({
  calculationType: z.coerce.number().int().min(0).optional(),
  minWorkingMonths: z.coerce.number().int().min(0).optional(),
  paymentBeforeHolidayDays: z.coerce.number().int().min(0).optional(),
});

settings.put("/", zValidator("json", jsonBody(settingsPayload)), async (c) => {
  const p = c.req.valid("json");
  const setValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) setValues[k] = v;

  const [ex] = await db.select({ id: thrSettings.id }).from(thrSettings).limit(1);
  if (ex) {
    if (Object.keys(setValues).length) {
      await db.update(thrSettings).set(setValues).where(eq(thrSettings.id, ex.id));
    }
  } else {
    await db.insert(thrSettings).values({ ...setValues });
  }
  const [row] = await db.select().from(thrSettings).limit(1);
  return c.json({ success: true, data: row ?? null });
});

router.route("/settings", settings);

// ============================================================
// LIST
// ============================================================
const listQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { year } = c.req.valid("query");
  const rows = await db
    .select({ thr: thrDisbursements, employee: employees })
    .from(thrDisbursements)
    .leftJoin(employees, eq(employees.id, thrDisbursements.employeeId))
    .where(year !== undefined ? eq(thrDisbursements.year, year) : undefined)
    .orderBy(desc(thrDisbursements.year), desc(thrDisbursements.id));
  return c.json({
    success: true,
    data: rows.map((r) => ({ ...r.thr, employee: r.employee })),
  });
});

// ============================================================
// GENERATE — hitung THR seluruh karyawan aktif (Permenaker 6/2016)
// ============================================================
const generatePayload = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  religionHoliday: z.coerce.number().int().min(0).max(9).default(ReligionHoliday.IDUL_FITRI),
});

router.post("/generate", zValidator("json", jsonBody(generatePayload)), async (c) => {
  const { year, religionHoliday } = c.req.valid("json");
  const now = new Date();
  const asOf = todayStr();

  const [setting] = await db.select().from(thrSettings).limit(1);
  const minMonths = setting?.minWorkingMonths ?? 1;

  // EmploymentStatus.ACTIVE = 0
  const staff = await db
    .select({ id: employees.id, joinDate: employees.joinDate })
    .from(employees)
    .where(eq(employees.employmentStatus, 0));

  let generated = 0;
  for (const emp of staff) {
    if (!emp.joinDate) continue;

    const workingMonths = fullMonthsBetween(emp.joinDate, now);
    if (workingMonths < minMonths) continue;

    const monthlyWage = await calcMonthlyWage(emp.id, asOf);
    if (monthlyWage == null) continue; // belum ada struktur gaji → skip

    // Permenaker 6/2016: >= 12 bulan → 1x upah; < 12 bulan → proporsional.
    // (verifikasi ke regulasi terbaru)
    const amount =
      workingMonths >= 12
        ? Math.round(monthlyWage)
        : Math.round((monthlyWage * workingMonths) / 12);

    // UPSERT by unique (employeeId, year, religionHoliday)
    await db
      .insert(thrDisbursements)
      .values({
        employeeId: emp.id,
        year,
        religionHoliday,
        amount: String(amount),
        status: ThrStatus.UNPAID,
      })
      .onDuplicateKeyUpdate({
        set: { amount: String(amount), status: ThrStatus.UNPAID },
      });
    generated++;
  }

  return c.json({ success: true, data: { generated, total: staff.length } });
});

// ============================================================
// MARK PAID / DELETE
// ============================================================
router.post("/:id/mark-paid", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select().from(thrDisbursements).where(eq(thrDisbursements.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "THR tidak ditemukan" }, 404);
  await db
    .update(thrDisbursements)
    .set({ status: ThrStatus.PAID, paidAt: new Date() })
    .where(eq(thrDisbursements.id, id));
  const [updated] = await db.select().from(thrDisbursements).where(eq(thrDisbursements.id, id)).limit(1);
  return c.json({ success: true, data: updated });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select({ id: thrDisbursements.id }).from(thrDisbursements).where(eq(thrDisbursements.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "THR tidak ditemukan" }, 404);
  await db.delete(thrDisbursements).where(eq(thrDisbursements.id, id));
  return c.json({ success: true });
});

export default router;
