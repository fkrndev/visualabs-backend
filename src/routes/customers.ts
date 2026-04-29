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
import { logAuditEvent, getClientIp, getUserAgent } from '../utils/audit';
import { requirePermission, requireAuthWithFallback } from '../middleware/auth';
import { PERMISSION } from '../utils/auth/permissions';
import { rateLimit } from '../middleware/rateLimit';
import { csrfProtection } from '../middleware/csrf';
import { sanitizeString, sanitizeEmail, sanitizePhone, sanitizeUsername } from '../utils/sanitize';
import { cache } from '../utils/cache';
import {
  validateUniqueEmail,
  validateUniqueUsername,
  validateUniquePhone,
  fetchEntityWithProfile,
  checkBulkExistence,
  softDeleteEntity,
  restoreEntity,
  buildSearchFilter
} from '../utils/db-helpers';

const router = new Hono();

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

const paginationQuery = z.object({
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
  includeDeleted: z.coerce.boolean().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  fields: z.string().optional(), // Comma-separated list of fields to return
});

const customerPayload = z.object({
  email: z.string().email('Format email tidak valid').optional(),
  username: z.string().min(3, 'Username minimal 3 karakter').max(50, 'Username maksimal 50 karakter').optional(),
  phone: z.string().min(10, 'Nomor telepon minimal 10 digit').max(20, 'Nomor telepon maksimal 20 digit').regex(/^[0-9+\-\s()]+$/, 'Nomor telepon hanya boleh berisi angka, +, -, spasi, dan ()').optional(),
  password: z.string().min(8, 'Password minimal 8 karakter').regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password harus mengandung huruf kecil, huruf besar, dan angka').optional(),
  name: z.string().min(1, 'Nama tidak boleh kosong').max(150, 'Nama maksimal 150 karakter').optional(),
  fbid: z.string().optional(),
  googleId: z.string().optional(),
  dataJson: z.record(z.string(), z.any()).optional(),
});

const customerUpdatePayload = z.object({
  email: z.string().email('Format email tidak valid').optional(),
  username: z.string().min(3, 'Username minimal 3 karakter').max(50, 'Username maksimal 50 karakter').optional(),
  phone: z.string().min(10, 'Nomor telepon minimal 10 digit').max(20, 'Nomor telepon maksimal 20 digit').regex(/^[0-9+\-\s()]+$/, 'Nomor telepon hanya boleh berisi angka, +, -, spasi, dan ()').optional(),
  password: z.string().min(8, 'Password minimal 8 karakter').regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password harus mengandung huruf kecil, huruf besar, dan angka').optional(),
  name: z.string().max(150, 'Nama maksimal 150 karakter').optional(),
  fbid: z.string().optional(),
  googleId: z.string().optional(),
  dataJson: z.record(z.string(), z.any()).optional(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.number().int().min(1)).min(1),
});

const bulkUpdateSchema = z.object({
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

router.get('/', csrfProtection, rateLimit({ windowMs: 60000, maxRequests: 100 }), requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_VIEW), zValidator('query', paginationQuery), async (c) => {
  const {
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
    includeDeleted,
    dateFrom,
    dateTo,
    fields: fieldsParam,
  } = c.req.valid('query');

  const baseFilters = [] as any[];

  // Filter out deleted records by default unless explicitly requested
  if (!includeDeleted) {
    baseFilters.push(isNull(customers.deletedAt));
  }

  // Date range filter
  if (dateFrom || dateTo) {
    const dateConditions = [];
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      if (!isNaN(fromDate.getTime())) {
        dateConditions.push(sql`${customers.createdAt} >= ${fromDate}`);
      }
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      if (!isNaN(toDate.getTime())) {
        // Include the entire end date by setting to end of day
        toDate.setHours(23, 59, 59, 999);
        dateConditions.push(sql`${customers.createdAt} <= ${toDate}`);
      }
    }
    if (dateConditions.length > 0) {
      baseFilters.push(and(...dateConditions));
    }
  }

  if (cursor) {
    baseFilters.push(gt(customers.id, cursor));
  }

  if (q) {
    baseFilters.push(
      buildSearchFilter(customers, ['email', 'username', 'phone'], q)
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

  // Apply field selection if requested
  let finalData = formattedData;
  if (fieldsParam) {
    const requestedFields = fieldsParam.split(',').map(f => f.trim());
    finalData = formattedData.map((item: any) => {
      const filtered: any = {};
      for (const field of requestedFields) {
        if (field.includes('.')) {
          // Handle nested fields like profile.name
          const [parent, child] = field.split('.');
          if (item[parent] && item[parent][child] !== undefined) {
            if (!filtered[parent]) filtered[parent] = {};
            filtered[parent][child] = item[parent][child];
          }
        } else if (item[field] !== undefined) {
          filtered[field] = item[field];
        }
      }
      // Always include id for reference
      if (item.id !== undefined) filtered.id = item.id;
      return filtered;
    });
  }

  const nextCursor = hasNext && data.length > 0 ? data[data.length - 1].customer.id : null;

  return c.json({
    success: true,
    data: finalData,
    pagination: {
      limit,
      nextCursor,
      hasNext,
      sortBy: sortByParam || 'id',
      sortOrder: sortOrderParam || 'asc',
    },
  });
});

router.get('/:id', requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_VIEW), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  // Try to get from cache first
  const cacheKey = `customer:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return c.json({ success: true, data: cached, cached: true });
  }

  const rows = await db
    .select({ customer: customers, profile: customerProfiles })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(eq(customers.id, id))
    .limit(1);

  const row = rows[0];
  const customer = row
    ? { ...(row as any).customer, profile: (row as any).profile ?? null }
    : null;

  if (!customer) {
    return c.json({ success: false, message: 'Customer tidak ditemukan' }, 404);
  }

  // Cache the result for 5 minutes
  cache.set(cacheKey, customer, 5 * 60 * 1000);

  return c.json({ success: true, data: customer, cached: false });
});

// Helper to invalidate customer cache
function invalidateCustomerCache(id: number) {
  cache.delete(`customer:${id}`);
}

router.post('/', rateLimit({ windowMs: 60000, maxRequests: 20 }), csrfProtection, requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_CREATE), zValidator('json', customerPayload), async (c) => {
  const payload = c.req.valid('json');

  const {
    email: rawEmail,
    username: rawUsername,
    phone: rawPhone,
    password,
    name,
    fbid,
    googleId,
    dataJson,
  } = payload;

  // Sanitize inputs
  const email = rawEmail ? sanitizeEmail(cleanEmail(rawEmail)) : null;
  const username = rawUsername ? sanitizeUsername(rawUsername.trim()) : null;
  const phone = rawPhone ? sanitizePhone(cleanPhone(rawPhone)) : null;
  const sanitizedName = name ? sanitizeString(name) : null;
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
    if (email && !(await validateUniqueEmail(email, undefined, customers))) {
      return c.json({ success: false, message: 'Email sudah digunakan' }, 409);
    }

    if (username && !(await validateUniqueUsername(username, undefined, customers))) {
      return c.json({ success: false, message: 'Username sudah digunakan' }, 409);
    }

    if (phone && !(await validateUniquePhone(phone, undefined, customers))) {
      return c.json({ success: false, message: 'Nomor telepon sudah digunakan' }, 409);
    }

    if (fbid) {
      const existingFbid = await db.query.customers.findFirst({
        columns: { id: true },
        where: eq(customers.fbid, fbid),
      });
      if (existingFbid) {
        return c.json({ success: false, message: 'FBID sudah digunakan' }, 409);
      }
    }

    if (googleId) {
      const existingGoogleId = await db.query.customers.findFirst({
        columns: { id: true },
        where: eq(customers.googleId, googleId),
      });
      if (existingGoogleId) {
        return c.json({ success: false, message: 'Google ID sudah digunakan' }, 409);
      }
    }

    const [insertResult] = await db.insert(customers).values({
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
      customerId: insertId,
      name: sanitizedName,
      email: rawEmail ?? null,
      phone: rawPhone ?? null,
    });

    const createdRows = await db
      .select({ customer: customers, profile: customerProfiles })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(eq(customers.id, insertId))
      .limit(1);
    const createdRow = createdRows[0];
    const created = createdRow
      ? { ...(createdRow as any).customer, profile: (createdRow as any).profile ?? null }
      : null;

    // Log audit event
    await logAuditEvent({
      action: 'CREATE',
      entityType: 'customer',
      entityId: insertId,
      customerId: insertId,
      changes: { email, username, phone, name },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Data customer sudah ada' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat customer' }, 500);
  }
});

router.put('/:id', rateLimit({ windowMs: 60000, maxRequests: 50 }), csrfProtection, requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_UPDATE), zValidator('json', customerUpdatePayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const payload = c.req.valid('json');

  const existingCustomerRows = await db
    .select({ customer: customers, profile: customerProfiles })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(eq(customers.id, id))
    .limit(1);

  const existingCustomerRow = existingCustomerRows[0];
  const existingCustomer = existingCustomerRow
    ? { ...(existingCustomerRow as any).customer, profile: (existingCustomerRow as any).profile ?? null }
    : null;

  if (!existingCustomer) {
    return c.json({ success: false, message: 'Customer tidak ditemukan' }, 404);
  }

  const sets: Partial<typeof customers.$inferInsert> = {};
  const profileUpdates: Partial<typeof customerProfiles.$inferInsert> = {};
  const changes: Record<string, { before: any; after: any }> = {};

  if (payload.email !== undefined) {
    const email = cleanEmail(payload.email);
    if (!(await validateUniqueEmail(email, id, customers))) {
      return c.json({ success: false, message: 'Email sudah digunakan' }, 409);
    }
    changes.email = { before: existingCustomer.email, after: email };
    sets.email = email;
    profileUpdates.email = payload.email;
  }

  if (payload.username !== undefined) {
    const username = payload.username.trim();
    if (!(await validateUniqueUsername(username, id, customers))) {
      return c.json({ success: false, message: 'Username sudah digunakan' }, 409);
    }
    changes.username = { before: existingCustomer.username, after: username };
    sets.username = username;
  }

  if (payload.phone !== undefined) {
    const phone = cleanPhone(payload.phone);
    if (!(await validateUniquePhone(phone, id, customers))) {
      return c.json({ success: false, message: 'Nomor telepon sudah digunakan' }, 409);
    }
    changes.phone = { before: existingCustomer.phone, after: phone };
    sets.phone = phone;
    profileUpdates.phone = payload.phone;
  }

  if (payload.name !== undefined) {
    changes.name = { before: (existingCustomer as any).profile?.name, after: payload.name };
    profileUpdates.name = payload.name ?? null;
  }

  if (payload.fbid !== undefined) {
    const fbid = payload.fbid ?? null;
    if (fbid) {
      const existing = await db.query.customers.findFirst({
        columns: { id: true },
        where: eq(customers.fbid, fbid),
      });
      if (existing && existing.id !== id) {
        return c.json({ success: false, message: 'FBID sudah digunakan' }, 409);
      }
    }
    changes.fbid = { before: existingCustomer.fbid, after: fbid };
    sets.fbid = fbid;
  }

  if (payload.googleId !== undefined) {
    const google = payload.googleId ?? null;
    if (google) {
      const existing = await db.query.customers.findFirst({
        columns: { id: true },
        where: eq(customers.googleId, google),
      });
      if (existing && existing.id !== id) {
        return c.json({ success: false, message: 'Google ID sudah digunakan' }, 409);
      }
    }
    changes.googleId = { before: existingCustomer.googleId, after: google };
    sets.googleId = google;
  }

  if (payload.dataJson !== undefined) {
    changes.dataJson = { before: existingCustomer.dataJson, after: payload.dataJson };
    sets.dataJson = payload.dataJson ?? null;
  }

  if (payload.password) {
    changes.password = { before: '***', after: '***' };
    sets.password = await hashPassword(payload.password);
  }

  try {
    if (Object.keys(sets).length) {
      await db
        .update(customers)
        .set(sets)
        .where(eq(customers.id, id));
    }

    if (Object.keys(profileUpdates).length) {
      const existingProfile = await db
        .select()
        .from(customerProfiles)
        .where(eq(customerProfiles.customerId, id))
        .limit(1);

      if (existingProfile.length) {
        await db
          .update(customerProfiles)
          .set(profileUpdates)
          .where(eq(customerProfiles.customerId, id));
      } else {
        await db.insert(customerProfiles).values({
          customerId: id,
          ...profileUpdates,
        });
      }
    }

    const updatedRows = await db
      .select({ customer: customers, profile: customerProfiles })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(eq(customers.id, id))
      .limit(1);
    const updatedRow = updatedRows[0];
    const updated = updatedRow
      ? { ...(updatedRow as any).customer, profile: (updatedRow as any).profile ?? null }
      : null;

    // Log audit event
    await logAuditEvent({
      action: 'UPDATE',
      entityType: 'customer',
      entityId: id,
      customerId: id,
      changes,
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });

    // Invalidate cache for this customer
    invalidateCustomerCache(id);

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Data customer bentrok' }, 409);
    }

    console.error(error);
    return c.json({ success: false, message: 'Gagal update customer' }, 500);
  }
});

router.delete('/:id', rateLimit({ windowMs: 60000, maxRequests: 30 }), csrfProtection, requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_DELETE), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const existing = await db.query.customers.findFirst({
    columns: { id: true, deletedAt: true },
    where: eq(customers.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: 'Customer tidak ditemukan' }, 404);
  }

  if (existing.deletedAt) {
    return c.json({ success: false, message: 'Customer sudah dihapus' }, 400);
  }

  await softDeleteEntity(customers, id);

  // Invalidate cache for this customer
  invalidateCustomerCache(id);

  // Log audit event
  await logAuditEvent({
    action: 'DELETE',
    entityType: 'customer',
    entityId: id,
    customerId: id,
    changes: { deletedAt: { before: null, after: new Date().toISOString() } },
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  return c.json({ success: true, message: 'Customer dihapus' });
});

// Preview bulk delete - show summary before actual delete
router.post('/bulk-delete/preview', rateLimit({ windowMs: 60000, maxRequests: 20 }), requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_BULK_DELETE), zValidator('json', bulkDeleteSchema), async (c) => {
  const { ids } = c.req.valid('json');

  if (ids.length === 0) {
    return c.json({ success: false, message: 'Tidak ada ID yang dipilih' }, 400);
  }

  const existing = await db
    .select({ customer: customers, profile: customerProfiles })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(sql`${customers.id} IN ${ids}`);

  if (existing.length === 0) {
    return c.json({ success: false, message: 'Customer tidak ditemukan' }, 404);
  }

  const alreadyDeleted = existing.filter((row) => (row as any).customer.deletedAt !== null);
  if (alreadyDeleted.length > 0) {
    return c.json({
      success: false,
      message: 'Beberapa customer sudah dihapus',
      alreadyDeletedCount: alreadyDeleted.length,
    }, 400);
  }

  const summary = existing.map((row) => ({
    id: (row as any).customer.id,
    name: (row as any).profile?.name || 'N/A',
    email: (row as any).customer.email || 'N/A',
    username: (row as any).customer.username || 'N/A',
  }));

  return c.json({
    success: true,
    preview: {
      total: summary.length,
      customers: summary,
    },
  });
});

router.post('/bulk-delete', rateLimit({ windowMs: 60000, maxRequests: 100 }), csrfProtection, requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_BULK_DELETE), zValidator('json', bulkDeleteSchema), async (c) => {
  const { ids } = c.req.valid('json');

  if (ids.length === 0) {
    return c.json({ success: false, message: 'Tidak ada ID yang dipilih' }, 400);
  }

  const existing = await db.query.customers.findMany({
    columns: { id: true, deletedAt: true },
    where: sql`${customers.id} IN ${ids}`,
  });

  if (existing.length !== ids.length) {
    return c.json({ success: false, message: 'Beberapa customer tidak ditemukan' }, 404);
  }

  const alreadyDeleted = existing.filter((c) => c.deletedAt !== null);
  if (alreadyDeleted.length > 0) {
    return c.json({ success: false, message: 'Beberapa customer sudah dihapus' }, 400);
  }

  await db
    .update(customers)
    .set({ deletedAt: new Date() })
    .where(sql`${customers.id} IN ${ids}`);

  // Log audit event for bulk delete
  await logAuditEvent({
    action: 'BULK_DELETE',
    entityType: 'customer',
    changes: { ids, count: ids.length },
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  return c.json({
    success: true,
    message: `${ids.length} customer berhasil dihapus`,
    deletedCount: ids.length,
  });
});

router.post('/bulk-update', rateLimit({ windowMs: 60000, maxRequests: 100 }), csrfProtection, requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_BULK_UPDATE), zValidator('json', bulkUpdateSchema), async (c) => {
  const { ids, updates } = c.req.valid('json');

  if (ids.length === 0) {
    return c.json({ success: false, message: 'Tidak ada ID yang dipilih' }, 400);
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ success: false, message: 'Tidak ada perubahan yang diberikan' }, 400);
  }

  const existing = await db.query.customers.findMany({
    where: sql`${customers.id} IN ${ids}`,
  });

  if (existing.length !== ids.length) {
    return c.json({ success: false, message: 'Beberapa customer tidak ditemukan' }, 404);
  }

  if (updates.email) {
    const email = cleanEmail(updates.email);
    const duplicate = await db.query.customers.findFirst({
      columns: { id: true },
      where: and(
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
    .where(sql`${customers.id} IN ${ids}`);

  const updatedRecords = await db.query.customers.findMany({
    where: sql`${customers.id} IN ${ids}`,
  });

  return c.json({
    success: true,
    message: `${ids.length} customer berhasil diupdate`,
    data: updatedRecords,
    updatedCount: ids.length,
  });
});

// Export customers with permission check and audit logging
router.post('/export', rateLimit({ windowMs: 60000, maxRequests: 100 }), csrfProtection, requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_EXPORT), zValidator('json', z.object({ ids: z.array(z.number()).optional() })), async (c) => {
  const { ids } = c.req.valid('json');

  let query = db
    .select({ customer: customers, profile: customerProfiles })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(isNull(customers.deletedAt));

  if (ids && ids.length > 0) {
    query = query.where(sql`${customers.id} IN ${ids}`);
  }

  const results = await query.limit(1000); // Limit to 1000 records for export

  // Log audit event for export
  await logAuditEvent({
    action: 'EXPORT',
    entityType: 'customer',
    changes: { count: results.length, filtered: !!ids },
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  return c.json({
    success: true,
    data: results.map((row) => ({
      ...(row as any).customer,
      profile: (row as any).profile ?? null,
    })),
  });
});

// Restore deleted customer
router.post('/:id/restore', requireAuthWithFallback, requirePermission(PERMISSION.CUSTOMER_RESTORE), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const existing = await db.query.customers.findFirst({
    columns: { id: true, deletedAt: true },
    where: eq(customers.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: 'Customer tidak ditemukan' }, 404);
  }

  if (!existing.deletedAt) {
    return c.json({ success: false, message: 'Customer tidak dihapus' }, 400);
  }

  await restoreEntity(customers, id);

  // Log audit event
  await logAuditEvent({
    action: 'RESTORE',
    entityType: 'customer',
    entityId: id,
    customerId: id,
    changes: { deletedAt: { before: existing.deletedAt?.toISOString(), after: null } },
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  return c.json({ success: true, message: 'Customer berhasil dipulihkan' });
});

export default router;
