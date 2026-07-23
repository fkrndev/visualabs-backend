import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client";
import {
  employeeDocuments,
  employeeEducations,
  employeeEmergencyContacts,
  employeeExperiences,
  employeeFamilies,
  employees,
} from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const ensureEmployeeExists = async (employeeId: number): Promise<boolean> => {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return !!row;
};

// ============ Families ============
const familyPayload = z.object({
  name: z.string().min(1),
  relationship: z.coerce.number().int().min(0).max(4),
  gender: z.coerce.number().int().min(0).max(1).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nikKtp: z.string().optional(),
  isDependent: z.coerce.number().int().min(0).max(1).optional(),
});

router.get("/:employeeId/families", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const rows = await db
    .select()
    .from(employeeFamilies)
    .where(eq(employeeFamilies.employeeId, employeeId));
  return c.json({ success: true, data: rows });
});

router.post("/:employeeId/families", zValidator("json", jsonBody(familyPayload)), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const p = c.req.valid("json");
  const [res] = await db.insert(employeeFamilies).values({
    employeeId,
    name: p.name,
    relationship: p.relationship,
    gender: p.gender ?? null,
    birthDate: p.birthDate ?? null,
    nikKtp: p.nikKtp ?? null,
    isDependent: p.isDependent ?? 0,
  });
  const [row] = await db.select().from(employeeFamilies).where(eq(employeeFamilies.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:employeeId/families/:id", zValidator("json", jsonBody(familyPayload.partial())), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const id = Number(c.req.param("id"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const p = c.req.valid("json");
  const setValues: Partial<typeof employeeFamilies.$inferInsert> = {};
  for (const key of Object.keys(p) as (keyof typeof p)[]) {
    if (p[key] !== undefined) (setValues as Record<string, unknown>)[key] = p[key];
  }
  if (Object.keys(setValues).length) {
    await db
      .update(employeeFamilies)
      .set(setValues)
      .where(and(eq(employeeFamilies.id, id), eq(employeeFamilies.employeeId, employeeId)));
  }
  const [row] = await db.select().from(employeeFamilies).where(eq(employeeFamilies.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:employeeId/families/:id", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const id = Number(c.req.param("id"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  await db
    .delete(employeeFamilies)
    .where(and(eq(employeeFamilies.id, id), eq(employeeFamilies.employeeId, employeeId)));
  return c.json({ success: true, message: "Dihapus" });
});

// ============ Documents ============
const documentPayload = z.object({
  documentType: z.coerce.number().int().min(0).max(6),
  documentNumber: z.string().optional(),
  fileUrl: z.string().optional(),
  expiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get("/:employeeId/documents", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const rows = await db.select().from(employeeDocuments).where(eq(employeeDocuments.employeeId, employeeId));
  return c.json({ success: true, data: rows });
});

router.post("/:employeeId/documents", zValidator("json", jsonBody(documentPayload)), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const p = c.req.valid("json");
  const [res] = await db.insert(employeeDocuments).values({
    employeeId,
    documentType: p.documentType,
    documentNumber: p.documentNumber ?? null,
    fileUrl: p.fileUrl ?? null,
    expiredAt: p.expiredAt ?? null,
  });
  const [row] = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.delete("/:employeeId/documents/:id", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const id = Number(c.req.param("id"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  await db
    .delete(employeeDocuments)
    .where(and(eq(employeeDocuments.id, id), eq(employeeDocuments.employeeId, employeeId)));
  return c.json({ success: true, message: "Dihapus" });
});

// ============ Educations ============
const educationPayload = z.object({
  level: z.coerce.number().int().min(0).max(6).optional(),
  institution: z.string().optional(),
  major: z.string().optional(),
  startYear: z.coerce.number().int().optional(),
  endYear: z.coerce.number().int().optional(),
  gpa: z.union([z.string(), z.number()]).optional(),
});

router.get("/:employeeId/educations", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const rows = await db.select().from(employeeEducations).where(eq(employeeEducations.employeeId, employeeId));
  return c.json({ success: true, data: rows });
});

router.post("/:employeeId/educations", zValidator("json", jsonBody(educationPayload)), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const p = c.req.valid("json");
  const [res] = await db.insert(employeeEducations).values({
    employeeId,
    level: p.level ?? null,
    institution: p.institution ?? null,
    major: p.major ?? null,
    startYear: p.startYear ?? null,
    endYear: p.endYear ?? null,
    gpa: p.gpa !== undefined ? String(p.gpa) : null,
  });
  const [row] = await db.select().from(employeeEducations).where(eq(employeeEducations.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.delete("/:employeeId/educations/:id", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const id = Number(c.req.param("id"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  await db
    .delete(employeeEducations)
    .where(and(eq(employeeEducations.id, id), eq(employeeEducations.employeeId, employeeId)));
  return c.json({ success: true, message: "Dihapus" });
});

// ============ Experiences ============
const experiencePayload = z.object({
  companyName: z.string().optional(),
  position: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
});

router.get("/:employeeId/experiences", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const rows = await db.select().from(employeeExperiences).where(eq(employeeExperiences.employeeId, employeeId));
  return c.json({ success: true, data: rows });
});

router.post("/:employeeId/experiences", zValidator("json", jsonBody(experiencePayload)), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const p = c.req.valid("json");
  const [res] = await db.insert(employeeExperiences).values({
    employeeId,
    companyName: p.companyName ?? null,
    position: p.position ?? null,
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    description: p.description ?? null,
  });
  const [row] = await db.select().from(employeeExperiences).where(eq(employeeExperiences.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.delete("/:employeeId/experiences/:id", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const id = Number(c.req.param("id"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  await db
    .delete(employeeExperiences)
    .where(and(eq(employeeExperiences.id, id), eq(employeeExperiences.employeeId, employeeId)));
  return c.json({ success: true, message: "Dihapus" });
});

// ============ Emergency Contacts ============
const emergencyPayload = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

router.get("/:employeeId/emergency-contacts", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const rows = await db.select().from(employeeEmergencyContacts).where(eq(employeeEmergencyContacts.employeeId, employeeId));
  return c.json({ success: true, data: rows });
});

router.post("/:employeeId/emergency-contacts", zValidator("json", jsonBody(emergencyPayload)), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  const p = c.req.valid("json");
  const [res] = await db.insert(employeeEmergencyContacts).values({
    employeeId,
    name: p.name,
    relationship: p.relationship ?? null,
    phone: p.phone ?? null,
    address: p.address ?? null,
  });
  const [row] = await db.select().from(employeeEmergencyContacts).where(eq(employeeEmergencyContacts.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.delete("/:employeeId/emergency-contacts/:id", async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const id = Number(c.req.param("id"));
  if (!(await ensureEmployeeExists(employeeId))) {
    return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  }
  await db
    .delete(employeeEmergencyContacts)
    .where(and(eq(employeeEmergencyContacts.id, id), eq(employeeEmergencyContacts.employeeId, employeeId)));
  return c.json({ success: true, message: "Dihapus" });
});

export default router;
