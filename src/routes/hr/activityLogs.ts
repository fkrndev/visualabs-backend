import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { activityLogs, users } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR } from "../../middleware/hrAccess";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  module: z.string().trim().optional(),
  action: z.coerce.number().int().optional(),
  userId: z.coerce.number().int().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { page, limit, module, action, userId } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const filters: SQL[] = [];
  if (module) filters.push(eq(activityLogs.module, module));
  if (action !== undefined) filters.push(eq(activityLogs.action, action));
  if (userId !== undefined) filters.push(eq(activityLogs.userId, userId));

  const items = await db
    .select({
      log: activityLogs,
      username: users.username,
      email: users.email,
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.userId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(activityLogs.id))
    .limit(limit)
    .offset(offset);

  return c.json({
    success: true,
    data: items.map((r) => ({ ...r.log, username: r.username, email: r.email })),
    page: { page, limit, hasNext: items.length === limit },
  });
});

export default router;
