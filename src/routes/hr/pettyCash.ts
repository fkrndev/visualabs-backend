import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { pettyCash, pettyCashTransactions } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireFinance, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireFinance);

const cashPayload = z.object({
  branchId: z.coerce.number().int().nullable().optional(),
  holderEmployeeId: z.coerce.number().int().nullable().optional(),
  balance: z.union([z.string(), z.number()]).optional(),
});

// List petty cash accounts (with balance)
router.get("/", async (c) => {
  const items = await db.select().from(pettyCash).orderBy(pettyCash.id);
  return c.json({ success: true, data: items });
});

router.post("/", zValidator("json", jsonBody(cashPayload)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(pettyCash).values({
    branchId: p.branchId ?? null,
    holderEmployeeId: p.holderEmployeeId ?? null,
    balance: p.balance !== undefined ? String(p.balance) : "0",
  });
  const [row] = await db.select().from(pettyCash).where(eq(pettyCash.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

// Transactions of a petty cash account
router.get("/:id/transactions", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const items = await db
    .select()
    .from(pettyCashTransactions)
    .where(eq(pettyCashTransactions.pettyCashId, id))
    .orderBy(desc(pettyCashTransactions.id));
  return c.json({ success: true, data: items });
});

const txPayload = z.object({
  transactionType: z.coerce.number().int().min(0).max(1), // 0=in, 1=out
  category: z.coerce.number().int().min(0),
  amount: z.union([z.string(), z.number()]),
  description: z.string().optional(),
  attachment: z.string().optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post("/:id/transactions", zValidator("json", jsonBody(txPayload)), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);

  const [cash] = await db.select().from(pettyCash).where(eq(pettyCash.id, id)).limit(1);
  if (!cash) return c.json({ success: false, message: "Petty cash tidak ditemukan" }, 404);

  const p = c.req.valid("json");
  const amount = String(p.amount);
  const [res] = await db.insert(pettyCashTransactions).values({
    pettyCashId: id,
    transactionType: p.transactionType,
    category: p.category,
    amount,
    description: p.description ?? null,
    attachment: p.attachment ?? null,
    transactionDate: p.transactionDate,
    createdBy: getHrUserId(c),
  });

  // Update balance: in (+) / out (-)
  const delta = p.transactionType === 0 ? sql`${pettyCash.balance} + ${amount}` : sql`${pettyCash.balance} - ${amount}`;
  await db.update(pettyCash).set({ balance: delta }).where(eq(pettyCash.id, id));

  const [row] = await db.select().from(pettyCashTransactions).where(eq(pettyCashTransactions.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

export default router;
