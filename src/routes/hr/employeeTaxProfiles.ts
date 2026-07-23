import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { employeeTaxProfiles, employees } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireFinance } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireFinance);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuery = z.object({
  employeeId: z.coerce.number().int().optional(),
  year: z.coerce.number().int().optional(),
});

const payloadSchema = z.object({
  employeeId: z.coerce.number().int(),
  year: z.coerce.number().int().min(2000).max(2100),
  npwp: z.string().optional(),
  ptkpCode: z.coerce.number().int().optional(),
  taxStatus: z.coerce.number().int().optional(),
  isNpwpHolder: z.coerce.number().int().min(0).max(1).optional(),
  foreignCountryCode: z.string().optional(),
  startPeriod: dateStr.optional(),
  endPeriod: dateStr.optional(),
  effectiveDate: dateStr.optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { employeeId, year } = c.req.valid("query");

  const filters: SQL[] = [];
  if (employeeId !== undefined) filters.push(eq(employeeTaxProfiles.employeeId, employeeId));
  if (year !== undefined) filters.push(eq(employeeTaxProfiles.year, year));

  const rows = await db
    .select({ profile: employeeTaxProfiles, employeeName: employees.fullName })
    .from(employeeTaxProfiles)
    .leftJoin(employees, eq(employees.id, employeeTaxProfiles.employeeId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(employeeTaxProfiles.year), desc(employeeTaxProfiles.id));

  return c.json({ success: true, data: rows.map((r) => ({ ...r.profile, employeeName: r.employeeName })) });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const [row] = await db
    .select({ profile: employeeTaxProfiles, employeeName: employees.fullName })
    .from(employeeTaxProfiles)
    .leftJoin(employees, eq(employees.id, employeeTaxProfiles.employeeId))
    .where(eq(employeeTaxProfiles.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({ success: true, data: { ...row.profile, employeeName: row.employeeName } });
});

router.post("/", zValidator("json", jsonBody(payloadSchema)), async (c) => {
  const p = c.req.valid("json");

  const [dupe] = await db
    .select({ id: employeeTaxProfiles.id })
    .from(employeeTaxProfiles)
    .where(and(eq(employeeTaxProfiles.employeeId, p.employeeId), eq(employeeTaxProfiles.year, p.year)))
    .limit(1);
  if (dupe) return c.json({ success: false, message: "Profil pajak untuk karyawan & tahun ini sudah ada" }, 409);

  const [res] = await db.insert(employeeTaxProfiles).values({
    employeeId: p.employeeId,
    year: p.year,
    npwp: p.npwp ?? null,
    ptkpCode: p.ptkpCode ?? null,
    taxStatus: p.taxStatus ?? 0,
    isNpwpHolder: p.isNpwpHolder ?? 1,
    foreignCountryCode: p.foreignCountryCode ?? null,
    startPeriod: p.startPeriod ?? null,
    endPeriod: p.endPeriod ?? null,
    effectiveDate: p.effectiveDate ?? null,
  });
  const [row] = await db.select().from(employeeTaxProfiles).where(eq(employeeTaxProfiles.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payloadSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const p = c.req.valid("json");

  const setValues: Partial<typeof employeeTaxProfiles.$inferInsert> = {};
  if (p.employeeId !== undefined) setValues.employeeId = p.employeeId;
  if (p.year !== undefined) setValues.year = p.year;
  if (p.npwp !== undefined) setValues.npwp = p.npwp;
  if (p.ptkpCode !== undefined) setValues.ptkpCode = p.ptkpCode;
  if (p.taxStatus !== undefined) setValues.taxStatus = p.taxStatus;
  if (p.isNpwpHolder !== undefined) setValues.isNpwpHolder = p.isNpwpHolder;
  if (p.foreignCountryCode !== undefined) setValues.foreignCountryCode = p.foreignCountryCode;
  if (p.startPeriod !== undefined) setValues.startPeriod = p.startPeriod;
  if (p.endPeriod !== undefined) setValues.endPeriod = p.endPeriod;
  if (p.effectiveDate !== undefined) setValues.effectiveDate = p.effectiveDate;

  if (Object.keys(setValues).length) {
    await db.update(employeeTaxProfiles).set(setValues).where(eq(employeeTaxProfiles.id, id));
  }
  const [row] = await db.select().from(employeeTaxProfiles).where(eq(employeeTaxProfiles.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  await db.delete(employeeTaxProfiles).where(eq(employeeTaxProfiles.id, id));
  return c.json({ success: true, message: "Profil pajak dihapus" });
});

export default router;
