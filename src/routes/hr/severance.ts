import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";

import { db } from "../../db/client";
import {
  severanceSettings,
  severancePayments,
  employees,
  salaryStructures,
  allowances,
  employeeAllowances,
  type JsonRecord,
} from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireFinance } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

// ============================================================
// Local enum codes (numeric tinyint values in DB).
// ============================================================
/** Status pembayaran pesangon. */
const SeveranceStatus = { UNPAID: 0, PAID: 1 } as const;
/** Jenis tunjangan tetap (allowances.type). FIXED ikut dihitung sebagai upah. */
const AllowanceType = { FIXED: 0 } as const;
/** Alasan PHK (severance_payments.termination_reason). Multiplier UP mengacu ini. */
const TerminationReason = {
  RESIGN: 0,
  EFFICIENCY: 1, // efisiensi
  RETIREMENT: 2, // pensiun
  DEATH: 3, // meninggal
  CONTRACT_END: 4, // habis kontrak
  MISCONDUCT: 5, // pelanggaran berat
  BANKRUPTCY: 6, // pailit
  MERGER: 7, // penggabungan/akuisisi
  OTHER: 8,
} as const;

const router = new Hono();
router.use("*", requireAuth, requireFinance);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Upah sebulan = gaji pokok (salary_structures) + total tunjangan FIXED
 * (employee_allowances → allowances.type = FIXED), berlaku pada `asOf`.
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

/** Masa kerja dalam tahun desimal antara dua tanggal `YYYY-MM-DD`. */
function yearsBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return (b - a) / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * Uang Pesangon (UP) — pengali upah menurut masa kerja (PP 35/2021 Pasal 40).
 * (verifikasi ke regulasi terbaru)
 */
function upMonths(years: number): number {
  const y = Math.floor(years);
  if (y < 1) return 1;
  if (y < 2) return 2;
  if (y < 3) return 3;
  if (y < 4) return 4;
  if (y < 5) return 5;
  if (y < 6) return 6;
  if (y < 7) return 7;
  if (y < 8) return 8;
  return 9;
}

/**
 * Uang Penghargaan Masa Kerja (UPMK) — pengali upah (PP 35/2021 Pasal 40).
 * (verifikasi ke regulasi terbaru)
 */
function upmkMonths(years: number): number {
  const y = Math.floor(years);
  if (y < 3) return 0;
  if (y < 6) return 2;
  if (y < 9) return 3;
  if (y < 12) return 4;
  if (y < 15) return 5;
  if (y < 18) return 6;
  if (y < 21) return 7;
  if (y < 24) return 8;
  return 10;
}

/**
 * Baca faktor pengali dari kolom JSON settings (map by terminationReason).
 * Default 1 kalau tidak ada / tidak valid.
 */
function readMultiplier(map: JsonRecord | undefined, reason: number): number {
  if (!map || typeof map !== "object") return 1;
  const raw = (map as Record<string, unknown>)[String(reason)];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

type SeveranceComputeInput = {
  employeeId: number;
  terminationDate: string;
  terminationReason: number;
};

type SeverancePreview = {
  workingYears: number;
  monthlyWage: number;
  severanceAmount: number;
  serviceAwardAmount: number;
  compensationAmount: number;
  totalAmount: number;
};

/**
 * Hitung pesangon (tidak menyimpan). Return `{ data }` atau `{ error }`.
 * Rumus PP 35/2021 (verifikasi ke regulasi terbaru).
 */
async function computeSeverance(
  input: SeveranceComputeInput,
): Promise<{ data: SeverancePreview } | { error: string }> {
  const [emp] = await db
    .select({ id: employees.id, joinDate: employees.joinDate })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!emp) return { error: "Karyawan tidak ditemukan" };
  if (!emp.joinDate) return { error: "Karyawan belum punya tanggal masuk (joinDate)" };

  const monthlyWage = await calcMonthlyWage(emp.id, input.terminationDate);
  if (monthlyWage == null) return { error: "Karyawan belum punya struktur gaji" };

  const workingYears = yearsBetween(emp.joinDate, input.terminationDate);
  const upM = upMonths(workingYears);
  const upmkM = upmkMonths(workingYears);

  const [setting] = await db.select().from(severanceSettings).limit(1);
  const multiplier = readMultiplier(setting?.severanceMultiplier, input.terminationReason);

  // UP = pengali * upah * multiplier alasan PHK; UPMK = pengali * upah.
  const severanceAmount = Math.round(upM * monthlyWage * multiplier);
  const serviceAwardAmount = Math.round(upmkM * monthlyWage);
  const compensationAmount = 0; // UPH — hak lain, dibiarkan 0 (verifikasi ke regulasi terbaru)
  const totalAmount = severanceAmount + serviceAwardAmount + compensationAmount;

  return {
    data: {
      workingYears: Math.round(workingYears * 100) / 100,
      monthlyWage: Math.round(monthlyWage),
      severanceAmount,
      serviceAwardAmount,
      compensationAmount,
      totalAmount,
    },
  };
}

// ============================================================
// SETTINGS (singleton) — mount sebelum route /:id
// ============================================================
const settings = new Hono();
settings.use("*", requireAuth, requireFinance);

settings.get("/", async (c) => {
  const [row] = await db.select().from(severanceSettings).limit(1);
  return c.json({ success: true, data: row ?? null });
});

const multiplierMap = z.record(z.string(), z.union([z.string(), z.number()]));
const settingsPayload = z.object({
  severanceMultiplier: multiplierMap.nullable().optional(),
  serviceAwardMultiplier: multiplierMap.nullable().optional(),
  compensationMultiplier: multiplierMap.nullable().optional(),
});

settings.put("/", zValidator("json", jsonBody(settingsPayload)), async (c) => {
  const p = c.req.valid("json");
  const setValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) setValues[k] = v;

  const [ex] = await db.select({ id: severanceSettings.id }).from(severanceSettings).limit(1);
  if (ex) {
    if (Object.keys(setValues).length) {
      await db.update(severanceSettings).set(setValues).where(eq(severanceSettings.id, ex.id));
    }
  } else {
    await db.insert(severanceSettings).values({ ...setValues });
  }
  const [row] = await db.select().from(severanceSettings).limit(1);
  return c.json({ success: true, data: row ?? null });
});

router.route("/settings", settings);

// ============================================================
// LIST
// ============================================================
router.get("/", async (c) => {
  const rows = await db
    .select({ severance: severancePayments, employee: employees })
    .from(severancePayments)
    .leftJoin(employees, eq(employees.id, severancePayments.employeeId))
    .orderBy(desc(severancePayments.id));
  return c.json({
    success: true,
    data: rows.map((r) => ({ ...r.severance, employee: r.employee })),
  });
});

// ============================================================
// COMPUTE (preview) & CREATE (simpan)
// ============================================================
const computePayload = z.object({
  employeeId: z.coerce.number().int(),
  terminationDate: dateStr,
  terminationReason: z.coerce.number().int().min(0).max(9),
});

router.post("/compute", zValidator("json", jsonBody(computePayload)), async (c) => {
  const p = c.req.valid("json");
  const res = await computeSeverance(p);
  if ("error" in res) return c.json({ success: false, message: res.error }, 400);
  return c.json({ success: true, data: res.data });
});

router.post("/", zValidator("json", jsonBody(computePayload)), async (c) => {
  const p = c.req.valid("json");
  const res = await computeSeverance(p);
  if ("error" in res) return c.json({ success: false, message: res.error }, 400);
  const d = res.data;

  const [inserted] = await db.insert(severancePayments).values({
    employeeId: p.employeeId,
    terminationDate: p.terminationDate,
    terminationReason: p.terminationReason,
    workingYears: String(d.workingYears),
    severanceAmount: String(d.severanceAmount),
    serviceAwardAmount: String(d.serviceAwardAmount),
    compensationAmount: String(d.compensationAmount),
    totalAmount: String(d.totalAmount),
    status: SeveranceStatus.UNPAID,
  });
  const [row] = await db
    .select()
    .from(severancePayments)
    .where(eq(severancePayments.id, inserted.insertId))
    .limit(1);
  return c.json({ success: true, data: row }, 201);
});

// ============================================================
// MARK PAID / DELETE
// ============================================================
router.post("/:id/mark-paid", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select().from(severancePayments).where(eq(severancePayments.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Pesangon tidak ditemukan" }, 404);
  await db
    .update(severancePayments)
    .set({ status: SeveranceStatus.PAID, paidAt: new Date() })
    .where(eq(severancePayments.id, id));
  const [updated] = await db.select().from(severancePayments).where(eq(severancePayments.id, id)).limit(1);
  return c.json({ success: true, data: updated });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select({ id: severancePayments.id }).from(severancePayments).where(eq(severancePayments.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Pesangon tidak ditemukan" }, 404);
  await db.delete(severancePayments).where(eq(severancePayments.id, id));
  return c.json({ success: true });
});

export default router;
