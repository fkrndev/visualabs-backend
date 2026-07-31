import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, like, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { departments } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().optional(),
  parentId: z.coerce.number().int().optional(),
  sortBy: z.enum(["id", "name", "code"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  tree: z.coerce.boolean().optional(),
});

const payloadSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  parentId: z.coerce.number().int().nullable().optional(),
  headEmployeeId: z.coerce.number().int().nullable().optional(),
});

type DeptRow = typeof departments.$inferSelect;
type DeptTreeNode = DeptRow & { children: DeptTreeNode[] };

const buildTree = (rows: DeptRow[]): DeptTreeNode[] => {
  const map = new Map<number, DeptTreeNode>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: DeptTreeNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};

router.get("/", zValidator("query", listQuery), async (c) => {
  const { page, limit, q, parentId, sortBy, sortOrder, tree } = c.req.valid("query");

  const filters: SQL[] = [];
  if (q) filters.push(like(departments.name, `%${q}%`));
  if (parentId !== undefined) filters.push(eq(departments.parentId, parentId));

  const sortMap = { id: departments.id, name: departments.name, code: departments.code } as const;
  const sortCol = sortBy ? sortMap[sortBy] : departments.name;
  const orderBy = sortOrder === "desc" ? desc(sortCol) : asc(sortCol);

  if (tree) {
    const all = await db.select().from(departments).where(filters.length ? and(...filters) : undefined).orderBy(orderBy);
    return c.json({ success: true, data: buildTree(all) });
  }

  const offset = (page - 1) * limit;
  const items = await db
    .select()
    .from(departments)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  return c.json({ success: true, data: items, page: { page, limit, hasNext: items.length === limit } });
});

router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const [row] = await db
    .select()
    .from(departments)
    .where(eq(departments.id, id))
    .limit(1);
  if (!row) return c.json({ success: false, message: "Department tidak ditemukan" }, 404);
  return c.json({ success: true, data: row });
});

router.post("/", zValidator("json", jsonBody(payloadSchema)), async (c) => {
  const p = c.req.valid("json");
  const [res] = await db.insert(departments).values({
    name: p.name,
    code: p.code ?? null,
    parentId: p.parentId ?? null,
    headEmployeeId: p.headEmployeeId ?? null,
  });
  const [row] = await db.select().from(departments).where(eq(departments.id, res.insertId)).limit(1);
  return c.json({ success: true, data: row }, 201);
});

router.put("/:id", zValidator("json", jsonBody(payloadSchema.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);
  const p = c.req.valid("json");

  const setValues: Partial<typeof departments.$inferInsert> = {};
  if (p.name !== undefined) setValues.name = p.name;
  if (p.code !== undefined) setValues.code = p.code;
  if (p.parentId !== undefined) setValues.parentId = p.parentId;
  if (p.headEmployeeId !== undefined) setValues.headEmployeeId = p.headEmployeeId;

  if (Object.keys(setValues).length) {
    await db
      .update(departments)
      .set(setValues)
      .where(eq(departments.id, id));
  }

  const [row] = await db.select().from(departments).where(eq(departments.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, message: "ID tidak valid" }, 400);

  // Restrict: tidak boleh hapus departemen yang masih punya child
  const [child] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.parentId, id))
    .limit(1);
  if (child) {
    return c.json(
      { success: false, message: "Tidak dapat menghapus departemen yang masih memiliki sub-departemen. Hapus atau pindahkan sub-departemen terlebih dahulu." },
      409,
    );
  }

  await db
    .delete(departments)
    .where(eq(departments.id, id));
  return c.json({ success: true, message: "Department dihapus" });
});

export default router;
