// Coretax — Record-keeping saja. Integrasi API Coretax DJP belum diimplementasi.
// Endpoint di sini hanya mencatat status pengajuan (submit/accept/reject) secara
// manual; tidak ada pemanggilan API resmi Direktorat Jenderal Pajak.

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";

import { db } from "../../db/client";
import { coretaxSubmissions } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireFinance } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

// status: 0=draft, 1=submitted, 2=accepted, 3=rejected
const STATUS = { SUBMITTED: 1, ACCEPTED: 2, REJECTED: 3 } as const;

const router = new Hono();
router.use("*", requireAuth, requireFinance);

const listQuery = z.object({
  year: z.coerce.number().int().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { year } = c.req.valid("query");
  const rows = await db
    .select()
    .from(coretaxSubmissions)
    .where(year !== undefined ? eq(coretaxSubmissions.periodYear, year) : undefined)
    .orderBy(desc(coretaxSubmissions.periodYear), desc(coretaxSubmissions.id));
  return c.json({ success: true, data: rows });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const [row] = await db.select().from(coretaxSubmissions).where(eq(coretaxSubmissions.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

const payloadSchema = z.object({
  periodMonth: z.coerce.number().int().min(1).max(12).optional(),
  periodYear: z.coerce.number().int().min(2000).max(2100),
  submissionType: z.coerce.number().int(),
  totalSlips: z.coerce.number().int().optional(),
  totalTaxAmount: z.union([z.string(), z.number()]).optional(),
  fileUrl: z.string().optional(),
});

router.post("/", zValidator("json", jsonBody(payloadSchema)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(coretaxSubmissions).values({
    periodMonth: p.periodMonth ?? null,
    periodYear: p.periodYear,
    submissionType: p.submissionType,
    totalSlips: p.totalSlips ?? 0,
    totalTaxAmount: p.totalTaxAmount != null ? String(p.totalTaxAmount) : "0",
    fileUrl: p.fileUrl ?? null,
    status: 0,
  });
  const [row] = await db.select().from(coretaxSubmissions).where(eq(coretaxSubmissions.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payloadSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const p = c.req.valid("json");

  const setValues: Partial<typeof coretaxSubmissions.$inferInsert> = {};
  if (p.periodMonth !== undefined) setValues.periodMonth = p.periodMonth;
  if (p.periodYear !== undefined) setValues.periodYear = p.periodYear;
  if (p.submissionType !== undefined) setValues.submissionType = p.submissionType;
  if (p.totalSlips !== undefined) setValues.totalSlips = p.totalSlips;
  if (p.totalTaxAmount !== undefined) setValues.totalTaxAmount = String(p.totalTaxAmount);
  if (p.fileUrl !== undefined) setValues.fileUrl = p.fileUrl;

  if (Object.keys(setValues).length) {
    await db.update(coretaxSubmissions).set(setValues).where(eq(coretaxSubmissions.id, id));
  }
  const [row] = await db.select().from(coretaxSubmissions).where(eq(coretaxSubmissions.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  await db.delete(coretaxSubmissions).where(eq(coretaxSubmissions.id, id));
  return c.json({ success: true, message: "Pengajuan Coretax dihapus" });
});

// --- Transisi status (record-keeping, tanpa panggilan API DJP) ---

router.post("/:id/submit", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const [row] = await db.select().from(coretaxSubmissions).where(eq(coretaxSubmissions.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  await db
    .update(coretaxSubmissions)
    .set({ status: STATUS.SUBMITTED, submittedAt: new Date() })
    .where(eq(coretaxSubmissions.id, id));
  const [updated] = await db.select().from(coretaxSubmissions).where(eq(coretaxSubmissions.id, id)).limit(1);
  return c.json({ success: true, data: updated });
});

router.post("/:id/accept", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const [row] = await db.select().from(coretaxSubmissions).where(eq(coretaxSubmissions.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);

  // ntpnBatch opsional dari body (body boleh kosong).
  let ntpnBatch: string | undefined;
  try {
    const body = (await c.req.json()) as { ntpnBatch?: string } | undefined;
    if (body?.ntpnBatch) ntpnBatch = String(body.ntpnBatch);
  } catch {
    // body kosong / bukan JSON — abaikan
  }

  await db
    .update(coretaxSubmissions)
    .set({ status: STATUS.ACCEPTED, acceptedAt: new Date(), ...(ntpnBatch ? { ntpnBatch } : {}) })
    .where(eq(coretaxSubmissions.id, id));
  const [updated] = await db.select().from(coretaxSubmissions).where(eq(coretaxSubmissions.id, id)).limit(1);
  return c.json({ success: true, data: updated });
});

const rejectSchema = z.object({ rejectionReason: z.string().min(1) });

router.post("/:id/reject", zValidator("json", jsonBody(rejectSchema)), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const { rejectionReason } = c.req.valid("json");
  const [row] = await db.select().from(coretaxSubmissions).where(eq(coretaxSubmissions.id, id)).limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);
  await db
    .update(coretaxSubmissions)
    .set({ status: STATUS.REJECTED, rejectionReason })
    .where(eq(coretaxSubmissions.id, id));
  const [updated] = await db.select().from(coretaxSubmissions).where(eq(coretaxSubmissions.id, id)).limit(1);
  return c.json({ success: true, data: updated });
});

export default router;
