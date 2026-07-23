import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, isNull, like, or, SQL } from "drizzle-orm";
import bcrypt from "bcrypt";

import { db } from "../../db/client";
import {
  branches,
  departments,
  employees,
  positions,
  profiles,
  users,
} from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  q: z.string().trim().optional(),
  branchId: z.coerce.number().int().optional(),
  departmentId: z.coerce.number().int().optional(),
  positionId: z.coerce.number().int().optional(),
  employmentStatus: z.coerce.number().int().optional(),
  employmentType: z.coerce.number().int().optional(),
  defaultWorkScheduleId: z.coerce.number().int().optional(),
  noSchedule: z.coerce.boolean().optional(),
  sortBy: z.enum(["id", "nik", "fullName", "joinDate"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
  .optional()
  .nullable();

const payloadSchema = z.object({
  branchId: z.coerce.number().int().nullable().optional(),
  departmentId: z.coerce.number().int().nullable().optional(),
  positionId: z.coerce.number().int().nullable().optional(),
  nik: z.string().optional(),
  nikKtp: z.string().optional(),
  fullName: z.string().min(1),
  nickname: z.string().optional(),
  gender: z.coerce.number().int().min(0).max(1).optional(),
  birthPlace: z.string().optional(),
  birthDate: dateStr,
  religion: z.coerce.number().int().min(0).max(5).optional(),
  maritalStatus: z.coerce.number().int().min(0).max(3).optional(),
  bloodType: z.coerce.number().int().min(0).max(3).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  photo: z.string().optional(),
  joinDate: dateStr,
  resignDate: dateStr,
  employmentType: z.coerce.number().int().min(0).max(4).optional(),
  employmentStatus: z.coerce.number().int().min(0).max(3).optional(),
  npwp: z.string().optional(),
  bpjsKesehatanNo: z.string().optional(),
  bpjsKetenagakerjaanNo: z.string().optional(),
  citizenship: z.coerce.number().int().min(0).max(1).optional(),
  identityType: z.coerce.number().int().min(0).max(3).optional(),
  landlinePhone: z.string().optional(),
  residentialAddress: z.string().optional(),
  taxStatusCode: z.coerce.number().int().min(0).max(11).optional(),
  taxWithholderNpwp: z.string().optional(),
  taxWithholderName: z.string().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const filters: SQL[] = [];
  if (q.q) {
    filters.push(
      or(
        like(employees.fullName, `%${q.q}%`),
        like(employees.nik, `%${q.q}%`),
        like(employees.email, `%${q.q}%`),
      )!,
    );
  }
  if (q.branchId !== undefined) filters.push(eq(employees.branchId, q.branchId));
  if (q.departmentId !== undefined) filters.push(eq(employees.departmentId, q.departmentId));
  if (q.positionId !== undefined) filters.push(eq(employees.positionId, q.positionId));
  if (q.employmentStatus !== undefined) filters.push(eq(employees.employmentStatus, q.employmentStatus));
  if (q.employmentType !== undefined) filters.push(eq(employees.employmentType, q.employmentType));
  if (q.defaultWorkScheduleId !== undefined)
    filters.push(eq(employees.defaultWorkScheduleId, q.defaultWorkScheduleId));
  if (q.noSchedule) {
    filters.push(isNull(employees.defaultWorkScheduleId));
  }

  const sortMap = {
    id: employees.id,
    nik: employees.nik,
    fullName: employees.fullName,
    joinDate: employees.joinDate,
  } as const;
  const sortCol = q.sortBy ? sortMap[q.sortBy] : employees.id;
  const orderBy = q.sortOrder === "desc" ? desc(sortCol) : asc(sortCol);

  const offset = (q.page - 1) * q.limit;
  const items = await db
    .select({
      employee: employees,
      branch: branches,
      department: departments,
      position: positions,
    })
    .from(employees)
    .leftJoin(branches, eq(branches.id, employees.branchId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(positions, eq(positions.id, employees.positionId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(orderBy)
    .limit(q.limit)
    .offset(offset);

  return c.json({
    success: true,
    data: items.map((r) => ({
      ...r.employee,
      branch: r.branch,
      department: r.department,
      position: r.position,
    })),
    page: { page: q.page, limit: q.limit, hasNext: items.length === q.limit },
  });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const [row] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

router.post("/", zValidator("json", jsonBody(payloadSchema)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(employees).values({
    branchId: p.branchId ?? null,
    departmentId: p.departmentId ?? null,
    positionId: p.positionId ?? null,
    nik: p.nik ?? null,
    nikKtp: p.nikKtp ?? null,
    fullName: p.fullName,
    nickname: p.nickname ?? null,
    gender: p.gender ?? null,
    birthPlace: p.birthPlace ?? null,
    birthDate: p.birthDate ?? null,
    religion: p.religion ?? null,
    maritalStatus: p.maritalStatus ?? null,
    bloodType: p.bloodType ?? null,
    address: p.address ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    photo: p.photo ?? null,
    joinDate: p.joinDate ?? null,
    resignDate: p.resignDate ?? null,
    employmentType: p.employmentType ?? null,
    employmentStatus: p.employmentStatus ?? 0,
    npwp: p.npwp ?? null,
    bpjsKesehatanNo: p.bpjsKesehatanNo ?? null,
    bpjsKetenagakerjaanNo: p.bpjsKetenagakerjaanNo ?? null,
    citizenship: p.citizenship ?? null,
    identityType: p.identityType ?? null,
    landlinePhone: p.landlinePhone ?? null,
    residentialAddress: p.residentialAddress ?? null,
    taxStatusCode: p.taxStatusCode ?? null,
    taxWithholderNpwp: p.taxWithholderNpwp ?? null,
    taxWithholderName: p.taxWithholderName ?? null,
  });
  const [row] = await db.select().from(employees).where(eq(employees.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payloadSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const p = c.req.valid("json");

  const setValues: Partial<typeof employees.$inferInsert> = {};
  for (const key of Object.keys(p) as (keyof typeof p)[]) {
    if (p[key] !== undefined) (setValues as Record<string, unknown>)[key] = p[key];
  }
  if (Object.keys(setValues).length) {
    await db
      .update(employees)
      .set(setValues)
      .where(eq(employees.id, id));
  }
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  await db
    .delete(employees)
    .where(eq(employees.id, id));
  return c.json({ success: true, message: "Karyawan dihapus" });
});

// Resign: set resign_date + employment_status=RESIGNED
const resignPayload = z.object({
  resignDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
router.post("/:id/resign", zValidator("json", jsonBody(resignPayload)), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const { resignDate } = c.req.valid("json");
  await db
    .update(employees)
    .set({ resignDate, employmentStatus: 1 })
    .where(eq(employees.id, id));
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

// Auto-create user account
const createAccountPayload = z.object({
  username: z.string().min(3),
  // Must be >= 8 to match the login endpoint's password policy — otherwise an
  // account could be created that can never actually log in.
  password: z.string().min(8),
  role: z.coerce.number().int().min(0).default(0),
});
router.post("/:id/create-user-account", zValidator("json", jsonBody(createAccountPayload)), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);

  const [emp] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  if (!emp) return c.json({ success: false, message: "Karyawan tidak ditemukan" }, 404);
  if (emp.userId) {
    return c.json({ success: false, message: "Karyawan sudah punya akun user" }, 409);
  }

  const { username, password, role } = c.req.valid("json");
  const hashed = await bcrypt.hash(password, 10);

  const [userRes] = await db.insert(users).values({
    username,
    email: emp.email,
    phone: emp.phone,
    password: hashed,
    role,
  });
  await db.update(employees).set({ userId: userRes.insertId }).where(eq(employees.id, id));

  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

// Sync: bikin baris employees untuk tiap user yang belum punya (staff = karyawan).
// Nama/email/phone diambil dari profiles, fallback ke users. Link via user_id.
router.post("/sync-from-users", async (c) => {
  const missing = await db
    .select({
      userId: users.id,
      username: users.username,
      uEmail: users.email,
      uPhone: users.phone,
      pName: profiles.name,
      pEmail: profiles.email,
      pPhone: profiles.phone,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(employees, eq(employees.userId, users.id))
    .where(isNull(employees.id));

  const rows = missing.map((m) => ({
    userId: m.userId,
    fullName: m.pName || m.username || m.uEmail || `User #${m.userId}`,
    email: m.pEmail || m.uEmail || null,
    phone: m.pPhone || m.uPhone || null,
    employmentStatus: 0,
  }));

  if (rows.length) await db.insert(employees).values(rows);

  return c.json({ success: true, data: { created: rows.length } });
});

export default router;
