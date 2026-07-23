import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, count, eq, inArray, like, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import {
  approvalWorkflows,
  approvalWorkflowSteps,
  approvals,
} from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const stepSchema = z.object({
  stepOrder: z.number().int().min(1),
  approverType: z.number().int().min(0).max(3),
  approverId: z.number().int().nullable().optional(),
  role: z.number().int().nullable().optional(),
});

const payload = z.object({
  name: z.string().trim().min(1),
  module: z.number().int().min(0).max(5),
  steps: z.array(stepSchema).min(1),
});

const listQuery = z.object({
  module: z.coerce.number().int().min(0).max(5).optional(),
  q: z.string().trim().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { module, q } = c.req.valid("query");

  const filters: SQL[] = [];
  if (module !== undefined) filters.push(eq(approvalWorkflows.module, module));
  if (q) filters.push(like(approvalWorkflows.name, `%${q}%`));

  const rows = await db
    .select()
    .from(approvalWorkflows)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(approvalWorkflows.module), asc(approvalWorkflows.id));

  const ids = rows.map((r) => r.id);
  let stepsByWorkflow = new Map<number, typeof approvalWorkflowSteps.$inferSelect[]>();
  let approvalCountByWorkflow = new Map<number, number>();

  if (ids.length) {
    const stepRows = await db
      .select()
      .from(approvalWorkflowSteps)
      .where(inArray(approvalWorkflowSteps.approvalWorkflowId, ids))
      .orderBy(
        asc(approvalWorkflowSteps.approvalWorkflowId),
        asc(approvalWorkflowSteps.stepOrder),
      );
    for (const s of stepRows) {
      const list = stepsByWorkflow.get(s.approvalWorkflowId) ?? [];
      list.push(s);
      stepsByWorkflow.set(s.approvalWorkflowId, list);
    }

    const modules = Array.from(new Set(rows.map((r) => r.module)));
    if (modules.length) {
      const counts = await db
        .select({
          module: approvals.module,
          total: count(approvals.id),
        })
        .from(approvals)
        .where(inArray(approvals.module, modules))
        .groupBy(approvals.module);
      const totalByModule = new Map(counts.map((r) => [r.module, Number(r.total)]));
      for (const r of rows) {
        approvalCountByWorkflow.set(r.id, totalByModule.get(r.module) ?? 0);
      }
    }
  }

  const data = rows.map((r) => ({
    ...r,
    steps: stepsByWorkflow.get(r.id) ?? [],
    stepCount: (stepsByWorkflow.get(r.id) ?? []).length,
    approvalCount: approvalCountByWorkflow.get(r.id) ?? 0,
  }));

  return c.json({ success: true, data });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return c.json({ success: false, message: "ID tidak valid" }, 400);
  }
  const [row] = await db
    .select()
    .from(approvalWorkflows)
    .where(eq(approvalWorkflows.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Tidak ditemukan" }, 404);

  const steps = await db
    .select()
    .from(approvalWorkflowSteps)
    .where(eq(approvalWorkflowSteps.approvalWorkflowId, id))
    .orderBy(asc(approvalWorkflowSteps.stepOrder));

  return c.json({ success: true, data: { ...row, steps } });
});

router.post("/", zValidator("json", jsonBody(payload)), async (c) => {
  const p = c.req.valid("json");

  const [res] = await db.insert(approvalWorkflows).values({
    name: p.name,
    module: p.module,
  });
  const id = Number(res.insertId);

  if (p.steps.length) {
    await db.insert(approvalWorkflowSteps).values(
      p.steps.map((s) => ({
        approvalWorkflowId: id,
        stepOrder: s.stepOrder,
        approverType: s.approverType,
        approverId: s.approverId ?? null,
        role: s.role ?? null,
      })),
    );
  }

  const [row] = await db
    .select()
    .from(approvalWorkflows)
    .where(eq(approvalWorkflows.id, id))
    .limit(1);
  const steps = await db
    .select()
    .from(approvalWorkflowSteps)
    .where(eq(approvalWorkflowSteps.approvalWorkflowId, id))
    .orderBy(asc(approvalWorkflowSteps.stepOrder));
  return c.json({ success: true, data: { ...row, steps } }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payload.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return c.json({ success: false, message: "ID tidak valid" }, 400);
  }
  const p = c.req.valid("json");

  const setValues: Record<string, unknown> = {};
  if (p.name !== undefined) setValues.name = p.name;
  if (p.module !== undefined) setValues.module = p.module;

  if (Object.keys(setValues).length) {
    await db
      .update(approvalWorkflows)
      .set(setValues)
      .where(eq(approvalWorkflows.id, id));
  }

  if (p.steps) {
    await db
      .delete(approvalWorkflowSteps)
      .where(eq(approvalWorkflowSteps.approvalWorkflowId, id));
    if (p.steps.length) {
      await db.insert(approvalWorkflowSteps).values(
        p.steps.map((s) => ({
          approvalWorkflowId: id,
          stepOrder: s.stepOrder,
          approverType: s.approverType,
          approverId: s.approverId ?? null,
          role: s.role ?? null,
        })),
      );
    }
  }

  const [row] = await db
    .select()
    .from(approvalWorkflows)
    .where(eq(approvalWorkflows.id, id))
    .limit(1);
  const steps = await db
    .select()
    .from(approvalWorkflowSteps)
    .where(eq(approvalWorkflowSteps.approvalWorkflowId, id))
    .orderBy(asc(approvalWorkflowSteps.stepOrder));
  return c.json({ success: true, data: { ...row, steps } });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return c.json({ success: false, message: "ID tidak valid" }, 400);
  }
  await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, id));
  return c.json({ success: true });
});

export default router;
