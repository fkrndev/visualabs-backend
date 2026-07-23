import { and, between, eq, inArray, desc } from "drizzle-orm";

import { db } from "../db/client";
import {
  allowances,
  bpjsSettings,
  cashAdvanceRepayments,
  cashAdvances,
  employeeAllowances,
  employees,
  employeeTaxProfiles,
  overtimes,
  payrollBpjsDetails,
  payrollComponents,
  payrollPeriods,
  payrolls,
  payrollSettings,
  ptkpSettings,
  salaryStructures,
  taxBrackets,
  taxSettings,
} from "../db/schema";

// ---- Payroll enum codes (numeric tinyint values in DB) ----------------------
// Diadopsi dari hr-backend `src/constants/enums.ts`. Didefinisikan lokal karena
// enum payroll belum ada di `src/constants/hrEnums.ts` (single-tenant port).
const BpjsType = { KESEHATAN: 0, JHT: 1, JP: 2, JKK: 3, JKM: 4 } as const;
const CashAdvanceStatus = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
  DISBURSED: 3,
  REPAYING: 4,
  PAID_OFF: 5,
} as const;
const OvertimeStatus = { PENDING: 0, APPROVED: 1, REJECTED: 2, PAID: 3 } as const;
// PayrollComponentCategory
const Cat = {
  BASIC: 0,
  ALLOWANCE: 1,
  OVERTIME: 2,
  BONUS: 3,
  THR: 4,
  TAX: 5,
  BPJS: 6,
  LOAN: 7,
  OTHER: 8,
} as const;
// PayrollComponentType
const CType = { EARNING: 0, DEDUCTION: 1 } as const;
const PayrollStatus = { DRAFT: 0, APPROVED: 1, PAID: 2 } as const;
const RoundingType = { NONE: 0, UP: 1, DOWN: 2, NEAREST: 3 } as const;

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const money = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);

// Standard month divisor for hourly rate (Kepmenaker: 173).
const HOURS_PER_MONTH = 173;

export type PeriodRow = typeof payrollPeriods.$inferSelect;

type ComponentDraft = {
  componentType: number;
  category: number;
  name: string;
  amount: number;
  notes?: string | null;
};

type EmployeeResult = {
  employeeId: number;
  values: {
    basicSalary: number;
    totalAllowance: number;
    totalOvertime: number;
    totalBonus: number;
    totalBpjs: number;
    totalTax: number;
    totalDeduction: number;
    grossSalary: number;
    netSalary: number;
  };
  components: ComponentDraft[];
  bpjsDetails: Array<{ bpjsType: number; baseSalary: number; employeeAmount: number; employerAmount: number }>;
  loanRepayments: Array<{ cashAdvanceId: number; amount: number }>;
};

/** Round a nominal per rounding settings (applied to net salary). */
function applyRounding(value: number, type: number | null | undefined, nominal: number | null | undefined): number {
  const step = nominal && nominal > 0 ? nominal : 1;
  if (step <= 1) return Math.round(value * 100) / 100;
  switch (type) {
    case RoundingType.UP:
      return Math.ceil(value / step) * step;
    case RoundingType.DOWN:
      return Math.floor(value / step) * step;
    case RoundingType.NEAREST:
      return Math.round(value / step) * step;
    default:
      return Math.round(value * 100) / 100;
  }
}

/**
 * Progressive annual PPh21 (metode disetahunkan / gross), driven entirely by the
 * `tax_brackets` + `ptkp_settings` tables plus the employee's own tax columns
 * (`tax_status_code` = PTKP code, `npwp` presence = NPWP holder). Returns 0 when
 * those tables are not yet configured — so payroll works tax-free until enabled.
 */
async function computeMonthlyTax(opts: {
  employeeId: number;
  year: number;
  monthlyGross: number;
  monthlyDeductibleIuran: number; // JHT+JP employee portions
}): Promise<number> {
  const [taxCfg] = await db.select().from(taxSettings).limit(1);
  if (!taxCfg) return 0; // tax not configured -> no PPh21

  const brackets = await db.select().from(taxBrackets).where(eq(taxBrackets.effectiveYear, opts.year));
  if (brackets.length === 0) return 0;

  // Utamakan profil pajak per-tahun (`employee_tax_profiles`); kalau belum ada,
  // fallback ke kolom di tabel `employees` (`tax_status_code` + `npwp`).
  const [taxProfile] = await db
    .select({ ptkpCode: employeeTaxProfiles.ptkpCode, isNpwpHolder: employeeTaxProfiles.isNpwpHolder })
    .from(employeeTaxProfiles)
    .where(and(eq(employeeTaxProfiles.employeeId, opts.employeeId), eq(employeeTaxProfiles.year, opts.year)))
    .limit(1);
  const [emp] = await db
    .select({ taxStatusCode: employees.taxStatusCode, npwp: employees.npwp })
    .from(employees)
    .where(eq(employees.id, opts.employeeId))
    .limit(1);
  const ptkpCode = taxProfile?.ptkpCode ?? emp?.taxStatusCode ?? 0; // default TK/0
  const isNpwp = taxProfile
    ? taxProfile.isNpwpHolder === 1
    : !!(emp?.npwp && String(emp.npwp).trim().length > 0);

  const [ptkp] = await db
    .select()
    .from(ptkpSettings)
    .where(and(eq(ptkpSettings.effectiveYear, opts.year), eq(ptkpSettings.code, ptkpCode)))
    .limit(1);
  if (!ptkp) return 0;

  // Netto sebulan = bruto - biaya jabatan (5%, max 500rb) - iuran
  const biayaJabatan = Math.min(opts.monthlyGross * 0.05, 500000);
  const nettoMonth = opts.monthlyGross - biayaJabatan - opts.monthlyDeductibleIuran;
  const nettoYear = nettoMonth * 12;
  let pkp = nettoYear - n(ptkp.amount);
  if (pkp <= 0) return 0;
  pkp = Math.floor(pkp / 1000) * 1000; // pembulatan ke bawah ribuan

  // Progressive over brackets (ordered by minIncome)
  const sorted = [...brackets].sort((a, b) => n(a.minIncome) - n(b.minIncome));
  let taxYear = 0;
  for (const b of sorted) {
    const lo = n(b.minIncome);
    const hi = b.maxIncome == null ? Infinity : n(b.maxIncome);
    if (pkp > lo) {
      const taxable = Math.min(pkp, hi) - lo;
      if (taxable > 0) taxYear += taxable * (n(b.rate) / 100);
    }
  }
  let monthly = taxYear / 12;
  if (!isNpwp) monthly *= 1.2; // non-NPWP surcharge +20%
  return Math.max(0, Math.round(monthly));
}

/** Compute one employee's payroll for a period. Pure computation + reads; no writes. */
async function computeEmployeePayroll(
  period: PeriodRow,
  employeeId: number,
  bpjsCfg: Array<typeof bpjsSettings.$inferSelect>,
): Promise<EmployeeResult> {
  const components: ComponentDraft[] = [];

  // ---- Gaji pokok: struktur gaji berlaku pada akhir periode ----
  const structs = await db
    .select()
    .from(salaryStructures)
    .where(eq(salaryStructures.employeeId, employeeId))
    .orderBy(desc(salaryStructures.effectiveDate));
  const activeStruct = structs.find(
    (s) => s.effectiveDate <= period.endDate && (!s.endDate || s.endDate >= period.startDate),
  );
  const basic = n(activeStruct?.basicSalary);
  if (basic > 0) components.push({ componentType: CType.EARNING, category: Cat.BASIC, name: "Gaji Pokok", amount: basic });

  // ---- Tunjangan ----
  const empAllowRows = await db
    .select({ ea: employeeAllowances, a: allowances })
    .from(employeeAllowances)
    .leftJoin(allowances, eq(allowances.id, employeeAllowances.allowanceId))
    .where(eq(employeeAllowances.employeeId, employeeId));
  let totalAllowance = 0;
  for (const r of empAllowRows) {
    if (r.ea.effectiveDate > period.endDate) continue;
    if (r.ea.endDate && r.ea.endDate < period.startDate) continue;
    const amt = n(r.ea.amount);
    if (amt <= 0) continue;
    totalAllowance += amt;
    components.push({ componentType: CType.EARNING, category: Cat.ALLOWANCE, name: r.a?.name ?? "Tunjangan", amount: amt });
  }

  // ---- Lembur (APPROVED dalam periode) ----
  const otRows = await db
    .select()
    .from(overtimes)
    .where(
      and(
        eq(overtimes.employeeId, employeeId),
        eq(overtimes.status, OvertimeStatus.APPROVED),
        between(overtimes.date, period.startDate, period.endDate),
      ),
    );
  let totalOvertime = 0;
  for (const ot of otRows) {
    let amt = n(ot.amount);
    if (amt <= 0 && basic > 0) {
      // Fallback simple government-style: hourlyRate * 1.5 * hours
      const hourly = basic / HOURS_PER_MONTH;
      amt = Math.round(hourly * 1.5 * n(ot.totalHours));
    }
    totalOvertime += amt;
  }
  if (totalOvertime > 0) components.push({ componentType: CType.EARNING, category: Cat.OVERTIME, name: "Lembur", amount: totalOvertime });

  const totalBonus = 0;
  const grossSalary = basic + totalAllowance + totalOvertime + totalBonus;

  // ---- BPJS (potongan karyawan) ----
  const bpjsBase = basic + totalAllowance; // upah pokok + tunjangan tetap
  let totalBpjs = 0;
  let iuranDeductible = 0; // JHT+JP employee for tax netto
  const bpjsDetails: EmployeeResult["bpjsDetails"] = [];
  for (const s of bpjsCfg) {
    const cap = s.salaryCap != null ? n(s.salaryCap) : Infinity;
    const base = Math.min(bpjsBase, cap);
    const empAmt = Math.round(base * (n(s.employeeRate) / 100));
    const erAmt = Math.round(base * (n(s.employerRate) / 100));
    bpjsDetails.push({ bpjsType: s.bpjsType, baseSalary: base, employeeAmount: empAmt, employerAmount: erAmt });
    if (empAmt > 0) {
      totalBpjs += empAmt;
      const label = BPJS_LABEL[s.bpjsType] ?? "BPJS";
      components.push({ componentType: CType.DEDUCTION, category: Cat.BPJS, name: `${label} (karyawan)`, amount: empAmt });
      if (s.bpjsType === BpjsType.JHT || s.bpjsType === BpjsType.JP) iuranDeductible += empAmt;
    }
  }

  // ---- PPh 21 ----
  const totalTax = await computeMonthlyTax({
    employeeId,
    year: period.periodYear,
    monthlyGross: grossSalary,
    monthlyDeductibleIuran: iuranDeductible,
  });
  if (totalTax > 0) components.push({ componentType: CType.DEDUCTION, category: Cat.TAX, name: "PPh 21", amount: totalTax });

  // ---- Cicilan kas bon ----
  const advances = await db
    .select()
    .from(cashAdvances)
    .where(
      and(
        eq(cashAdvances.employeeId, employeeId),
        inArray(cashAdvances.status, [CashAdvanceStatus.DISBURSED, CashAdvanceStatus.REPAYING, CashAdvanceStatus.APPROVED]),
      ),
    );
  const loanRepayments: EmployeeResult["loanRepayments"] = [];
  let totalLoan = 0;
  for (const adv of advances) {
    // amount already fully repaid?
    const paid = await db
      .select({ amount: cashAdvanceRepayments.amount })
      .from(cashAdvanceRepayments)
      .where(eq(cashAdvanceRepayments.cashAdvanceId, adv.id));
    const paidSum = paid.reduce((s, p) => s + n(p.amount), 0);
    const remaining = n(adv.amount) - paidSum;
    if (remaining <= 0) continue;
    const installment = n(adv.installmentAmount) > 0 ? n(adv.installmentAmount) : n(adv.amount);
    const cut = Math.min(installment, remaining);
    if (cut <= 0) continue;
    totalLoan += cut;
    loanRepayments.push({ cashAdvanceId: adv.id, amount: cut });
    components.push({ componentType: CType.DEDUCTION, category: Cat.LOAN, name: "Cicilan Kas Bon", amount: cut });
  }

  const totalDeduction = totalBpjs + totalTax + totalLoan;
  const netSalary = grossSalary - totalDeduction;

  return {
    employeeId,
    values: { basicSalary: basic, totalAllowance, totalOvertime, totalBonus, totalBpjs, totalTax, totalDeduction, grossSalary, netSalary },
    components,
    bpjsDetails,
    loanRepayments,
  };
}

const BPJS_LABEL: Record<number, string> = {
  [BpjsType.KESEHATAN]: "BPJS Kesehatan",
  [BpjsType.JHT]: "BPJS JHT",
  [BpjsType.JP]: "BPJS JP",
  [BpjsType.JKK]: "BPJS JKK",
  [BpjsType.JKM]: "BPJS JKM",
};

/**
 * (Re)generate all payrolls for a period. Idempotent: wipes existing DRAFT payrolls
 * (and their components / bpjs details / loan repayments) for the period, then recomputes.
 * Refuses to touch a period whose status is PAID/CLOSED.
 */
export async function generatePeriod(periodId: number): Promise<{ count: number; totals: Record<string, number> }> {
  const [period] = await db
    .select()
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, periodId))
    .limit(1);
  if (!period) throw new Error("Periode tidak ditemukan");
  if (period.status >= 3) throw new Error("Periode sudah dibayar/ditutup, tidak bisa di-generate ulang");

  // Wipe previous results for this period.
  const existing = await db.select({ id: payrolls.id }).from(payrolls).where(eq(payrolls.payrollPeriodId, periodId));
  const existingIds = existing.map((e) => e.id);
  if (existingIds.length) {
    await db.delete(cashAdvanceRepayments).where(inArray(cashAdvanceRepayments.payrollId, existingIds));
    await db.delete(payrollComponents).where(inArray(payrollComponents.payrollId, existingIds));
    await db.delete(payrollBpjsDetails).where(inArray(payrollBpjsDetails.payrollId, existingIds));
    await db.delete(payrolls).where(inArray(payrolls.id, existingIds));
  }

  // Settings.
  const bpjsCfg = await db.select().from(bpjsSettings);
  const [payCfg] = await db.select().from(payrollSettings).limit(1);

  // Active employees.
  const emps = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.employmentStatus, 0));

  const totals = { count: 0, gross: 0, net: 0, bpjs: 0, tax: 0 };

  for (const emp of emps) {
    const r = await computeEmployeePayroll(period, emp.id, bpjsCfg);
    // Skip employees with nothing to pay (no salary structure).
    if (r.values.grossSalary <= 0) continue;

    const net = applyRounding(r.values.netSalary, payCfg?.roundingType ?? null, payCfg?.roundingValue ?? null);

    const [res] = await db.insert(payrolls).values({
      payrollPeriodId: periodId,
      employeeId: emp.id,
      basicSalary: money(r.values.basicSalary),
      totalAllowance: money(r.values.totalAllowance),
      totalOvertime: money(r.values.totalOvertime),
      totalBonus: money(r.values.totalBonus),
      totalDeduction: money(r.values.totalDeduction),
      totalTax: money(r.values.totalTax),
      totalBpjs: money(r.values.totalBpjs),
      grossSalary: money(r.values.grossSalary),
      netSalary: money(net),
      status: PayrollStatus.DRAFT,
    });
    const payrollId = res.insertId;

    if (r.components.length) {
      await db.insert(payrollComponents).values(
        r.components.map((c) => ({
          payrollId,
          componentType: c.componentType,
          category: c.category,
          name: c.name,
          amount: money(c.amount),
          notes: c.notes ?? null,
        })),
      );
    }
    if (r.bpjsDetails.length) {
      await db.insert(payrollBpjsDetails).values(
        r.bpjsDetails.map((d) => ({
          payrollId,
          employeeId: emp.id,
          bpjsType: d.bpjsType,
          baseSalary: money(d.baseSalary),
          employeeAmount: money(d.employeeAmount),
          employerAmount: money(d.employerAmount),
          totalAmount: money(d.employeeAmount + d.employerAmount),
        })),
      );
    }
    for (const lr of r.loanRepayments) {
      await db.insert(cashAdvanceRepayments).values({ cashAdvanceId: lr.cashAdvanceId, payrollId, amount: money(lr.amount) });
      // Move the advance into REPAYING state.
      await db.update(cashAdvances).set({ status: CashAdvanceStatus.REPAYING }).where(eq(cashAdvances.id, lr.cashAdvanceId));
    }

    totals.count++;
    totals.gross += r.values.grossSalary;
    totals.net += net;
    totals.bpjs += r.values.totalBpjs;
    totals.tax += r.values.totalTax;
  }

  // Mark period as processing.
  await db.update(payrollPeriods).set({ status: 1 }).where(eq(payrollPeriods.id, periodId));

  return { count: totals.count, totals };
}
