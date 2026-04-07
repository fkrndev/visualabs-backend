import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, eq, like } from "drizzle-orm";

import { db } from "../db/client";
import { storeConfigMultiples } from "../db/schema";

const router = new Hono();

const businessQuery = z.object({
  businessId: z.coerce.number().int().min(1),
});

const paginationQuery = businessQuery.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  key: z.string().trim().optional(),
  sortBy: z.enum(["id", "key", "value", "createdAt", "updatedAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const payloadSchema = z.object({
  businessId: z.number().int().min(1),
  key: z.string().trim().min(1).max(191),
  value: z.string().optional(),
});

const updatePayloadSchema = payloadSchema.partial().extend({
  businessId: z.number().int().min(1),
});

router.get("/", zValidator("query", paginationQuery), async (c) => {
  const {
    businessId,
    page,
    limit,
    q,
    key,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid("query");

  const offset = (page - 1) * limit;

  const filters = [eq(storeConfigMultiples.businessId, businessId)];
  if (q) {
    const value = `%${q}%`;
    filters.push(like(storeConfigMultiples.key, value));
  }
  if (key) {
    filters.push(eq(storeConfigMultiples.key, key));
  }

  const data = await db.query.storeConfigMultiples.findMany({
    where: and(...filters),
    limit,
    offset,
    orderBy: (storeConfigMultiples, { asc, desc }) => {
      const sortBy = sortByParam ?? "createdAt";
      const sortOrder = sortOrderParam ?? "desc";

      if (sortBy === "id") {
        return sortOrder === "asc"
          ? asc(storeConfigMultiples.id)
          : desc(storeConfigMultiples.id);
      } else if (sortBy === "key") {
        return sortOrder === "asc"
          ? asc(storeConfigMultiples.key)
          : desc(storeConfigMultiples.key);
      } else if (sortBy === "value") {
        return sortOrder === "asc"
          ? asc(storeConfigMultiples.value)
          : desc(storeConfigMultiples.value);
      } else if (sortBy === "createdAt") {
        return sortOrder === "asc"
          ? asc(storeConfigMultiples.createdAt)
          : desc(storeConfigMultiples.createdAt);
      } else {
        return sortOrder === "asc"
          ? asc(storeConfigMultiples.updatedAt)
          : desc(storeConfigMultiples.updatedAt);
      }
    },
  });

  const totalCount = await db.query.storeConfigMultiples
    .findMany({
      where: and(...filters),
    })
    .then((result) => result.length);

  const totalPages = Math.ceil(totalCount / limit);

  return c.json({
    data,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  });
});

router.get("/:id", zValidator("query", businessQuery), async (c) => {
  const { businessId } = c.req.valid("query");
  const id = parseInt(c.req.param("id"));

  if (isNaN(id) || id <= 0) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const data = await db.query.storeConfigMultiples.findFirst({
    where: and(
      eq(storeConfigMultiples.id, id),
      eq(storeConfigMultiples.businessId, businessId),
    ),
  });

  if (!data) {
    return c.json({ error: "Store config multiple not found" }, 404);
  }

  return c.json({ data });
});

router.post("/", zValidator("json", payloadSchema), async (c) => {
  const payload = c.req.valid("json");

  const [insertResult] = await db.insert(storeConfigMultiples).values(payload);

  const insertId = Number((insertResult as any).insertId ?? 0);

  const record = await db.query.storeConfigMultiples.findFirst({
    where: eq(storeConfigMultiples.id, insertId),
  });

  return c.json({ data: record }, 201);
});

router.put(
  "/:id",
  zValidator("query", businessQuery),
  zValidator("json", updatePayloadSchema),
  async (c) => {
    const { businessId } = c.req.valid("query");
    const id = parseInt(c.req.param("id"));
    const payload = c.req.valid("json");

    if (isNaN(id) || id <= 0) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const existingRecord = await db.query.storeConfigMultiples.findFirst({
      where: and(
        eq(storeConfigMultiples.id, id),
        eq(storeConfigMultiples.businessId, businessId),
      ),
    });

    if (!existingRecord) {
      return c.json({ error: "Store config multiple not found" }, 404);
    }

    const sets: Partial<typeof storeConfigMultiples.$inferInsert> = {};

    if (payload.key !== undefined) {
      sets.key = payload.key;
    }

    if (payload.value !== undefined) {
      sets.value = payload.value;
    }

    await db
      .update(storeConfigMultiples)
      .set(sets)
      .where(
        and(
          eq(storeConfigMultiples.id, id),
          eq(storeConfigMultiples.businessId, businessId),
        ),
      );

    const updatedRecord = await db.query.storeConfigMultiples.findFirst({
      where: eq(storeConfigMultiples.id, id),
    });

    return c.json({ data: updatedRecord });
  },
);

router.delete("/:id", zValidator("query", businessQuery), async (c) => {
  const { businessId } = c.req.valid("query");
  const id = parseInt(c.req.param("id"));

  if (isNaN(id) || id <= 0) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const existingRecord = await db.query.storeConfigMultiples.findFirst({
    where: and(
      eq(storeConfigMultiples.id, id),
      eq(storeConfigMultiples.businessId, businessId),
    ),
  });

  if (!existingRecord) {
    return c.json({ error: "Store config multiple not found" }, 404);
  }

  await db
    .delete(storeConfigMultiples)
    .where(
      and(
        eq(storeConfigMultiples.id, id),
        eq(storeConfigMultiples.businessId, businessId),
      ),
    );

  return c.json({ data: existingRecord });
});

export default router;
