import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  SQL,
  and,
  asc,
  desc,
  eq,
  like,
  or,
  gt,
  ne,
  isNull,
  isNotNull,
  not,
  sql,
} from 'drizzle-orm';

import { db } from '../db/client';
import { customers, customerProfiles } from '../db/schema';
import { cleanEmail, cleanPhone } from '../utils/normalizers';
import { hashPassword } from '../utils/security';

const router = new Hono();

const businessQuery = z.object({
  businessId: z.coerce.number().int().min(1),
});

const filterConditionSchema = z.object({
  field: z.enum([
    'id',
    'email',
    'username',
    'phone',
    'fbid',
    'googleId',
    'createdAt',
    'updatedAt',
    'profile.name',
    'profile.email',
    'profile.phone',
  ]),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'is_empty',
    'is_not_empty',
  ]),
  value: z.string().optional(),
});

const filterGroupSchema = z.object({
  logic: z.enum(['and', 'or']).default('and'),
  conditions: z.array(filterConditionSchema).default([]),
});

const sortRuleSchema = z.object({
  field: z.enum([
    'id',
    'email',
    'username',
    'phone',
    'fbid',
    'googleId',
    'createdAt',
    'updatedAt',
    'profile.name',
    'profile.email',
    'profile.phone',
  ]),
  direction: z.enum(['asc', 'desc']),
});

const paginationQuery = businessQuery.extend({
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  email: z.string().trim().optional(),
  username: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  fbid: z.string().trim().optional(),
  googleId: z.string().trim().optional(),
  sortBy: z
    .enum(['id', 'email', 'username', 'phone', 'createdAt', 'updatedAt', 'profile.name', 'profile.email', 'profile.phone'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  filters: z.string().optional(),
  sorts: z.string().optional(),
});

const customerPayload = z.object({
  businessId: z.number().int(),
  email: z.string().email().optional(),
  username: z.string().min(3).optional(),
  phone: z.string().min(6).optional(),
  password: z.string().min(8).optional(),
  name: z.string().min(1).optional(),
  fbid: z.string().optional(),
  googleId: z.string().optional(),
  dataJson: z.record(z.string(), z.any()).optional(),
});

const customerUpdatePayload = z.object({
  businessId: z.number().int(),
  email: z.string().email().optional(),
  username: z.string().min(3).optional(),
  phone: z.string().min(6).optional(),
  password: z.string().min(8).optional(),
  name: z.string().optional(),
  fbid: z.string().optional(),
  googleId: z.string().optional(),
  dataJson: z.record(z.string(), z.any()).optional(),
});

const bulkDeleteSchema = z.object({
  businessId: z.number().int().min(1),
  ids: z.array(z.number().int().min(1)).min(1),
});

const bulkUpdateSchema = z.object({
  businessId: z.number().int().min(1),
  ids: z.array(z.number().int().min(1)).min(1),
  updates: z.object({
    email: z.string().email().optional(),
    username: z.string().min(3).optional(),
    phone: z.string().min(6).optional(),
    fbid: z.string().optional(),
    googleId: z.string().optional(),
    dataJson: z.record(z.string(), z.any()).optional(),
  }),
});

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    businessId,
    cursor,
    limit,
    q,
    email,
    username,
    phone,
    fbid,
    googleId,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
    filters: filtersParam,
    sorts: sortsParam,
  } = c.req.valid('query');

  const baseFilters = [eq(customers.businessId, businessId)] as any[];

  if (cursor) {
    baseFilters.push(gt(customers.id, cursor));
  }

  if (q) {
    const value = `%${q}%`;
    baseFilters.push(
      or(
        like(customers.email, value),
        like(customers.username, value),
        like(customers.phone, value),
        like(customerProfiles.name, value),
        like(customerProfiles.email, value),
        like(customerProfiles.phone, value)
      )
    );
  }
  if (email) baseFilters.push(like(customers.email, `%${email}%`));
  if (username) baseFilters.push(like(customers.username, `%${username}%`));
  if (phone) baseFilters.push(like(customers.phone, `%${phone}%`));
  if (fbid) baseFilters.push(like(customers.fbid, `%${fbid}%`));
  if (googleId) baseFilters.push(like(customers.googleId, `%${googleId}%`));

  if (filtersParam) {
    try {
      const filterGroup = filterGroupSchema.parse(JSON.parse(filtersParam));
      if (filterGroup.conditions.length > 0) {
        const columnMap = {
          id: customers.id,
          email: customers.email,
          username: customers.username,
          phone: customers.phone,
          fbid: customers.fbid,
          googleId: customers.googleId,
          createdAt: customers.createdAt,
          updatedAt: customers.updatedAt,
          'profile.name': customerProfiles.name,
          'profile.email': customerProfiles.email,
          'profile.phone': customerProfiles.phone,
        } as const;

        const filterConditions = filterGroup.conditions.map((condition) => {
          const column = columnMap[condition.field];
          const value = condition.value || '';

          switch (condition.operator) {
            case 'equals':
              return eq(column, value);
            case 'not_equals':
              return ne(column, value);
            case 'contains':
              return like(column, `%${value}%`);
            case 'not_contains':
              return not(like(column, `%${value}%`));
            case 'starts_with':
              return like(column, `${value}%`);
            case 'ends_with':
              return like(column, `%${value}`);
            case 'is_empty':
              return or(isNull(column), eq(column, ''));
            case 'is_not_empty':
              return and(isNotNull(column), ne(column, ''));
            default:
              return eq(column, value);
          }
        });

        const combinedFilters =
          filterGroup.logic === 'or' ? or(...filterConditions) : and(...filterConditions);

        baseFilters.push(combinedFilters);
      }
    } catch (e) {
      console.error('Invalid filter format for customers:', e);
    }
  }

  const whereExpr =
    baseFilters.length === 1 ? baseFilters[0] : (and(...(baseFilters as any)) as unknown as SQL);

  const sortMap = {
    id: customers.id,
    email: customers.email,
    username: customers.username,
    phone: customers.phone,
    fbid: customers.fbid,
    googleId: customers.googleId,
    createdAt: customers.createdAt,
    updatedAt: customers.updatedAt,
    'profile.name': customerProfiles.name,
    'profile.email': customerProfiles.email,
    'profile.phone': customerProfiles.phone,
  } as const;

  let orders: SQL[] = [];

  if (sortsParam) {
    try {
      const sortRules = z.array(sortRuleSchema).parse(JSON.parse(sortsParam));
      orders = sortRules.map((rule) => {
        const column = sortMap[rule.field];
        return rule.direction === 'desc' ? desc(column) : asc(column);
      });
      if (!sortRules.some((r) => r.field === 'id')) {
        orders.push(asc(sortMap.id));
      }
    } catch (e) {
      console.error('Invalid sort format for customers:', e);
    }
  }

  if (orders.length === 0) {
    const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
    const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
    const sortColumn = sortMap[sortKey];
    const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

    orders = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
    if (sortKey !== 'id') {
      orders.push(asc(sortMap.id));
    }
  }

  const items = await db
    .select({ customer: customers, profile: customerProfiles })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(whereExpr as any)
    .orderBy(...orders)
    .limit(limit + 1);

  const hasNext = items.length > limit;
  const data = hasNext ? items.slice(0, limit) : items;
  const formattedData = data.map((row: any) => ({
    ...(row as any).customer,
    profile: (row as any).profile ?? null
  }));
  const nextCursor = hasNext && data.length > 0 ? data[data.length - 1].customer.id : null;

  return c.json({
    success: true,
    data: formattedData,
    pagination: {
      limit,
      nextCursor,
      hasNext,
      sortBy: sortByParam || 'id',
      sortOrder: sortOrderParam || 'asc',
    },
  });
});

router.get('/:id', zValidator('query', businessQuery), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const { businessId } = c.req.valid('query');

  const rows = await db
    .select({ customer: customers, profile: customerProfiles })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)))
    .limit(1);

  const row = rows[0];
  const customer = row
    ? { ...(row as any).customer, profile: (row as any).profile ?? null }
    : null;

  if (!customer) {
    return c.json({ success: false, message: 'Customer tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: customer });
});

router.post('/', zValidator('json', customerPayload), async (c) => {
  const payload = c.req.valid('json');

  const {
    businessId,
    email: rawEmail,
    username: rawUsername,
    phone: rawPhone,
    password,
    name,
    fbid,
    googleId,
    dataJson,
  } = payload;

  const email = rawEmail ? cleanEmail(rawEmail) : null;
  const username = rawUsername?.trim() ?? null;
  const phone = rawPhone ? cleanPhone(rawPhone) : null;
  const hashedPassword = password ? await hashPassword(password) : null;

  if (!email && !username && !phone && !password) {
    return c.json(
      {
        success: false,
        message: 'Minimal salah satu dari email, username, phone, atau password harus diisi',
      },
      400
    );
  }

  try {
    if (email) {
      const existingEmail = await db.query.customers.findFirst({
        columns: { id: true },
        where: and(eq(customers.businessId, businessId), eq(customers.email, email)),
      });
      if (existingEmail) {
        return c.json({ success: false, message: 'Email sudah digunakan' }, 409);
      }
    }

    if (username) {
      const existingUsername = await db.query.customers.findFirst({
        columns: { id: true },
        where: and(eq(customers.businessId, businessId), eq(customers.username, username)),
      });
      if (existingUsername) {
        return c.json({ success: false, message: 'Username sudah digunakan' }, 409);
      }
    }

    if (phone) {
      const existingPhone = await db.query.customers.findFirst({
        columns: { id: true },
        where: and(eq(customers.businessId, businessId), eq(customers.phone, phone)),
      });
      if (existingPhone) {
        return c.json({ success: false, message: 'Nomor telepon sudah digunakan' }, 409);
      }
    }

    if (fbid) {
      const existingFbid = await db.query.customers.findFirst({
        columns: { id: true },
        where: and(eq(customers.businessId, businessId), eq(customers.fbid, fbid)),
      });
      if (existingFbid) {
        return c.json({ success: false, message: 'FBID sudah digunakan' }, 409);
      }
    }

    if (googleId) {
      const existingGoogleId = await db.query.customers.findFirst({
        columns: { id: true },
        where: and(eq(customers.businessId, businessId), eq(customers.googleId, googleId)),
      });
      if (existingGoogleId) {
        return c.json({ success: false, message: 'Google ID sudah digunakan' }, 409);
      }
    }

    const [insertResult] = await db.insert(customers).values({
      businessId,
      email,
      username,
      phone,
      fbid: fbid ?? null,
      googleId: googleId ?? null,
      password: hashedPassword,
      dataJson: dataJson ?? null,
    });

    const insertId = Number(insertResult.insertId);

    await db.insert(customerProfiles).values({
      businessId,
      customerId: insertId,
      name: name ?? null,
      email: rawEmail ?? null,
      phone: rawPhone ?? null,
    });

    const createdRows = await db
      .select({ customer: customers, profile: customerProfiles })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(and(eq(customers.id, insertId), eq(customers.businessId, businessId)))
      .limit(1);
    const createdRow = createdRows[0];
    const created = createdRow
      ? { ...(createdRow as any).customer, profile: (createdRow as any).profile ?? null }
      : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Data customer sudah ada' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat customer' }, 500);
  }
});

router.put('/:id', zValidator('json', customerUpdatePayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const payload = c.req.valid('json');
  const businessId = payload.businessId;

  const existingCustomer = await db.query.customers.findFirst({
    where: and(eq(customers.id, id), eq(customers.businessId, businessId)),
  });

  if (!existingCustomer) {
    return c.json({ success: false, message: 'Customer tidak ditemukan' }, 404);
  }

  const sets: Partial<typeof customers.$inferInsert> = {};
  const profileUpdates: Partial<typeof customerProfiles.$inferInsert> = {};

  if (payload.email !== undefined) {
    const email = cleanEmail(payload.email);
    const existing = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(eq(customers.businessId, businessId), eq(customers.email, email)),
    });
    if (existing && existing.id !== id) {
      return c.json({ success: false, message: 'Email sudah digunakan' }, 409);
    }
    sets.email = email;
    profileUpdates.email = payload.email;
  }

  if (payload.username !== undefined) {
    const username = payload.username.trim();
    const existing = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(eq(customers.businessId, businessId), eq(customers.username, username)),
    });
    if (existing && existing.id !== id) {
      return c.json({ success: false, message: 'Username sudah digunakan' }, 409);
    }
    sets.username = username;
  }

  if (payload.phone !== undefined) {
    const phone = cleanPhone(payload.phone);
    const existing = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(eq(customers.businessId, businessId), eq(customers.phone, phone)),
    });
    if (existing && existing.id !== id) {
      return c.json({ success: false, message: 'Nomor telepon sudah digunakan' }, 409);
    }
    sets.phone = phone;
    profileUpdates.phone = payload.phone;
  }

  if (payload.name !== undefined) {
    profileUpdates.name = payload.name ?? null;
  }

  if (payload.fbid !== undefined) {
    const fbid = payload.fbid ?? null;
    if (fbid) {
      const existing = await db.query.customers.findFirst({
        columns: { id: true },
        where: and(eq(customers.businessId, businessId), eq(customers.fbid, fbid)),
      });
      if (existing && existing.id !== id) {
        return c.json({ success: false, message: 'FBID sudah digunakan' }, 409);
      }
    }
    sets.fbid = fbid;
  }

  if (payload.googleId !== undefined) {
    const google = payload.googleId ?? null;
    if (google) {
      const existing = await db.query.customers.findFirst({
        columns: { id: true },
        where: and(eq(customers.businessId, businessId), eq(customers.googleId, google)),
      });
      if (existing && existing.id !== id) {
        return c.json({ success: false, message: 'Google ID sudah digunakan' }, 409);
      }
    }
    sets.googleId = google;
  }

  if (payload.dataJson !== undefined) {
    sets.dataJson = payload.dataJson ?? null;
  }

  if (payload.password) {
    sets.password = await hashPassword(payload.password);
  }

  try {
    if (Object.keys(sets).length) {
      await db
        .update(customers)
        .set(sets)
        .where(and(eq(customers.id, id), eq(customers.businessId, businessId)));
    }

    if (Object.keys(profileUpdates).length) {
      const existingProfile = await db
        .select()
        .from(customerProfiles)
        .where(and(eq(customerProfiles.customerId, id), eq(customerProfiles.businessId, businessId)))
        .limit(1);

      if (existingProfile.length) {
        await db
          .update(customerProfiles)
          .set(profileUpdates)
          .where(and(eq(customerProfiles.customerId, id), eq(customerProfiles.businessId, businessId)));
      } else {
        await db.insert(customerProfiles).values({
          businessId,
          customerId: id,
          ...profileUpdates,
        });
      }
    }

    const updatedRows = await db
      .select({ customer: customers, profile: customerProfiles })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(and(eq(customers.id, id), eq(customers.businessId, businessId)))
      .limit(1);
    const updatedRow = updatedRows[0];
    const updated = updatedRow
      ? { ...(updatedRow as any).customer, profile: (updatedRow as any).profile ?? null }
      : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Data customer bentrok' }, 409);
    }

    console.error(error);
    return c.json({ success: false, message: 'Gagal update customer' }, 500);
  }
});

router.post('/bulk-delete', zValidator('json', bulkDeleteSchema), async (c) => {
  const { businessId, ids } = c.req.valid('json');

  if (ids.length === 0) {
    return c.json({ success: false, message: 'Tidak ada ID yang dipilih' }, 400);
  }

  const existing = await db.query.customers.findMany({
    columns: { id: true },
    where: and(eq(customers.businessId, businessId), sql`${customers.id} IN ${ids}`),
  });

  if (existing.length !== ids.length) {
    return c.json({ success: false, message: 'Beberapa customer tidak ditemukan' }, 404);
  }

  await db
    .delete(customers)
    .where(and(eq(customers.businessId, businessId), sql`${customers.id} IN ${ids}`));

  return c.json({
    success: true,
    message: `${ids.length} customer berhasil dihapus`,
    deletedCount: ids.length,
  });
});

router.post('/bulk-update', zValidator('json', bulkUpdateSchema), async (c) => {
  const { businessId, ids, updates } = c.req.valid('json');

  if (ids.length === 0) {
    return c.json({ success: false, message: 'Tidak ada ID yang dipilih' }, 400);
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ success: false, message: 'Tidak ada perubahan yang diberikan' }, 400);
  }

  const existing = await db.query.customers.findMany({
    where: and(eq(customers.businessId, businessId), sql`${customers.id} IN ${ids}`),
  });

  if (existing.length !== ids.length) {
    return c.json({ success: false, message: 'Beberapa customer tidak ditemukan' }, 404);
  }

  if (updates.email) {
    const email = cleanEmail(updates.email);
    const duplicate = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(
        eq(customers.businessId, businessId),
        eq(customers.email, email),
        sql`${customers.id} NOT IN ${ids}`,
      ),
    });
    if (duplicate) {
      return c.json({ success: false, message: 'Email sudah digunakan oleh customer lain' }, 409);
    }
  }

  if (updates.username) {
    const username = updates.username.trim();
    const duplicate = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(
        eq(customers.businessId, businessId),
        eq(customers.username, username),
        sql`${customers.id} NOT IN ${ids}`,
      ),
    });
    if (duplicate) {
      return c.json({ success: false, message: 'Username sudah digunakan oleh customer lain' }, 409);
    }
  }

  if (updates.phone) {
    const phone = cleanPhone(updates.phone);
    const duplicate = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(
        eq(customers.businessId, businessId),
        eq(customers.phone, phone),
        sql`${customers.id} NOT IN ${ids}`,
      ),
    });
    if (duplicate) {
      return c.json({ success: false, message: 'Nomor telepon sudah digunakan oleh customer lain' }, 409);
    }
  }

  if (updates.fbid) {
    const duplicate = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(
        eq(customers.businessId, businessId),
        eq(customers.fbid, updates.fbid),
        sql`${customers.id} NOT IN ${ids}`,
      ),
    });
    if (duplicate) {
      return c.json({ success: false, message: 'FBID sudah digunakan oleh customer lain' }, 409);
    }
  }

  if (updates.googleId) {
    const duplicate = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(
        eq(customers.businessId, businessId),
        eq(customers.googleId, updates.googleId),
        sql`${customers.id} NOT IN ${ids}`,
      ),
    });
    if (duplicate) {
      return c.json({ success: false, message: 'Google ID sudah digunakan oleh customer lain' }, 409);
    }
  }

  const sets: Partial<typeof customers.$inferInsert> = {};
  if (updates.email !== undefined) {
    sets.email = cleanEmail(updates.email);
  }
  if (updates.username !== undefined) {
    sets.username = updates.username.trim();
  }
  if (updates.phone !== undefined) {
    sets.phone = cleanPhone(updates.phone);
  }
  if (updates.fbid !== undefined) {
    sets.fbid = updates.fbid ?? null;
  }
  if (updates.googleId !== undefined) {
    sets.googleId = updates.googleId ?? null;
  }
  if (updates.dataJson !== undefined) {
    sets.dataJson = updates.dataJson ?? null;
  }

  await db
    .update(customers)
    .set(sets)
    .where(and(eq(customers.businessId, businessId), sql`${customers.id} IN ${ids}`));

  const updatedRecords = await db.query.customers.findMany({
    where: and(eq(customers.businessId, businessId), sql`${customers.id} IN ${ids}`),
  });

  return c.json({
    success: true,
    message: `${ids.length} customer berhasil diupdate`,
    data: updatedRecords,
    updatedCount: ids.length,
  });
});

export default router;
