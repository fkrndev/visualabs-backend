import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";

import { db } from "../../db/client";
import { companyBankAccounts } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireFinance } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireFinance);

const payloadSchema = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  accountHolder: z.string().min(1),
  branch: z.string().optional(),
  isPrimary: z.coerce.number().int().min(0).max(1).optional(),
});

router.get("/", async (c) => {
  const items = await db.select().from(companyBankAccounts).orderBy(companyBankAccounts.id);
  return c.json({ success: true, data: items });
});

router.post("/", zValidator("json", jsonBody(payloadSchema)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(companyBankAccounts).values({
    bankName: p.bankName,
    accountNumber: p.accountNumber,
    accountHolder: p.accountHolder,
    branch: p.branch ?? null,
    isPrimary: p.isPrimary ?? 0,
  });
  const [row] = await db.select().from(companyBankAccounts).where(eq(companyBankAccounts.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payloadSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const p = c.req.valid("json");
  const setValues: Partial<typeof companyBankAccounts.$inferInsert> = {};
  if (p.bankName !== undefined) setValues.bankName = p.bankName;
  if (p.accountNumber !== undefined) setValues.accountNumber = p.accountNumber;
  if (p.accountHolder !== undefined) setValues.accountHolder = p.accountHolder;
  if (p.branch !== undefined) setValues.branch = p.branch;
  if (p.isPrimary !== undefined) setValues.isPrimary = p.isPrimary;
  if (Object.keys(setValues).length) {
    await db.update(companyBankAccounts).set(setValues).where(eq(companyBankAccounts.id, id));
  }
  const [row] = await db.select().from(companyBankAccounts).where(eq(companyBankAccounts.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  await db.delete(companyBankAccounts).where(eq(companyBankAccounts.id, id));
  return c.json({ success: true, message: "Rekening dihapus" });
});

export default router;
