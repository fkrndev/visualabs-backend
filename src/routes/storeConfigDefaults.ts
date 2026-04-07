import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, eq, like } from "drizzle-orm";

import { db } from "../db/client";
import { storeConfigDefaults } from "../db/schema";

const router = new Hono();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  key: z.string().trim().optional(),
  sortBy: z.enum(["id", "key", "value", "createdAt", "updatedAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const payloadSchema = z.object({
  key: z.string().trim().min(1).max(191),
  value: z.string().optional(),
});

const updatePayloadSchema = payloadSchema.partial();

router.get("/", zValidator("query", paginationQuery), async (c) => {
  const {
    page,
    limit,
    q,
    key,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid("query");

  const offset = (page - 1) * limit;

  const filters = [];
  if (q) {
    const value = `%${q}%`;
    filters.push(like(storeConfigDefaults.key, value));
  }
  if (key) {
    filters.push(eq(storeConfigDefaults.key, key));
  }

  const data = await db.query.storeConfigDefaults.findMany({
    where: and(...filters),
    limit,
    offset,
    orderBy: (storeConfigDefaults, { asc, desc }) => {
      const sortBy = sortByParam ?? "createdAt";
      const sortOrder = sortOrderParam ?? "desc";

      if (sortBy === "id") {
        return sortOrder === "asc"
          ? asc(storeConfigDefaults.id)
          : desc(storeConfigDefaults.id);
      } else if (sortBy === "key") {
        return sortOrder === "asc"
          ? asc(storeConfigDefaults.key)
          : desc(storeConfigDefaults.key);
      } else if (sortBy === "value") {
        return sortOrder === "asc"
          ? asc(storeConfigDefaults.value)
          : desc(storeConfigDefaults.value);
      } else if (sortBy === "createdAt") {
        return sortOrder === "asc"
          ? asc(storeConfigDefaults.createdAt)
          : desc(storeConfigDefaults.createdAt);
      } else {
        return sortOrder === "asc"
          ? asc(storeConfigDefaults.updatedAt)
          : desc(storeConfigDefaults.updatedAt);
      }
    },
  });

  const totalCount = await db.query.storeConfigDefaults
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

router.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (isNaN(id) || id <= 0) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const data = await db.query.storeConfigDefaults.findFirst({
    where: eq(storeConfigDefaults.id, id),
  });

  if (!data) {
    return c.json({ error: "Store config default not found" }, 404);
  }

  return c.json({ data });
});

router.post("/", zValidator("json", payloadSchema), async (c) => {
  const payload = c.req.valid("json");
  const { key } = payload;

  const existing = await db.query.storeConfigDefaults.findFirst({
    columns: { id: true },
    where: eq(storeConfigDefaults.key, key),
  });

  if (existing) {
    return c.json({ error: "Key already exists" }, 409);
  }

  const [insertResult] = await db.insert(storeConfigDefaults).values(payload);

  const insertId = Number((insertResult as any).insertId ?? 0);

  const record = await db.query.storeConfigDefaults.findFirst({
    where: eq(storeConfigDefaults.id, insertId),
  });

  return c.json({ data: record }, 201);
});

router.put("/:id", zValidator("json", updatePayloadSchema), async (c) => {
  const id = parseInt(c.req.param("id"));
  const payload = c.req.valid("json");

  if (isNaN(id) || id <= 0) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const existingRecord = await db.query.storeConfigDefaults.findFirst({
    where: eq(storeConfigDefaults.id, id),
  });

  if (!existingRecord) {
    return c.json({ error: "Store config default not found" }, 404);
  }

  const sets: Partial<typeof storeConfigDefaults.$inferInsert> = {};

  if (payload.key !== undefined) {
    // Check if new key already exists
    const keyExists = await db.query.storeConfigDefaults.findFirst({
      columns: { id: true },
      where: eq(storeConfigDefaults.key, payload.key),
    });

    if (keyExists) {
      return c.json({ error: "Key already exists" }, 409);
    }

    sets.key = payload.key;
  }

  if (payload.value !== undefined) {
    sets.value = payload.value;
  }

  await db
    .update(storeConfigDefaults)
    .set(sets)
    .where(eq(storeConfigDefaults.id, id));

  const updatedRecord = await db.query.storeConfigDefaults.findFirst({
    where: eq(storeConfigDefaults.id, id),
  });

  return c.json({ data: updatedRecord });
});

router.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (isNaN(id) || id <= 0) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const existingRecord = await db.query.storeConfigDefaults.findFirst({
    where: eq(storeConfigDefaults.id, id),
  });

  if (!existingRecord) {
    return c.json({ error: "Store config default not found" }, 404);
  }

  await db.delete(storeConfigDefaults).where(eq(storeConfigDefaults.id, id));

  return c.json({ data: existingRecord });
});

export default router;
