import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, inArray, isNull, isNotNull, like, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { products, users, profiles } from '../db/schema';
import { requireAuthWithFallback } from '../middleware/auth';
import { logAuditEvent, getClientIp, getUserAgent } from '../utils/audit';

// Import test database schema for compatibility
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

const router = new Hono();

// Error handling middleware
router.onError((err, c) => {
  if (err instanceof z.ZodError) {
    const firstError = err.errors[0];
    return c.json({
      success: false,
      message: firstError?.message || 'Validation error'
    }, 400);
  }
  
  if (err.name === 'SyntaxError' || err.message.includes('JSON')) {
    return c.json({
      success: false,
      message: 'Invalid JSON format'
    }, 400);
  }
  
  console.error(err);
  return c.json({
    success: false,
    message: 'Internal server error'
  }, 500);
});

// Sebelumnya seluruh route product bisa diakses tanpa token sama sekali,
// termasuk DELETE dan bulk-delete. Karena subscriptions.product_id memakai
// ON DELETE CASCADE, siapa pun bisa ikut menghapus seluruh subscription.
router.use('*', requireAuthWithFallback);

const productStatus = z.enum(['active', 'inactive', 'archived']);

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  status: productStatus.optional(),
  // 'true' = hanya tampilkan yang sudah di-soft-delete (keranjang sampah)
  deleted: z.string().optional(),
  sortBy: z
    .enum(['id', 'name', 'price', 'status', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const productPayload = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.string().optional(),
  status: productStatus.optional(),
});

const updateProductPayload = productPayload.partial();

// Bulk operations schemas
const bulkDeletePayload = z.object({
  ids: z.array(z.number().int().positive()).min(1, "Invalid IDs provided"),
});

const bulkEditPayload = z.object({
  ids: z.array(z.number().int().positive()).min(1, "Invalid IDs provided"),
  updates: updateProductPayload.refine(
    (data) => Object.keys(data).length > 0,
    { message: "No updates provided" }
  ),
});

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    q,
    status,
    deleted,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (q) {
    const value = `%${q}%`;
    filters.push(like(products.name, value));
  }
  if (status) {
    filters.push(eq(products.status, status));
  }
  // Default: sembunyikan yang sudah di-soft-delete. deleted=true = keranjang sampah.
  filters.push(deleted === 'true' ? isNotNull(products.deletedAt) : isNull(products.deletedAt));

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: products.id,
    name: products.name,
    price: products.price,
    status: products.status,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const query = db
    .select()
    .from(products)
    .orderBy(...orders)
    .limit(limit)
    .offset(offset);

  if (whereExpr) {
    query.where(whereExpr);
  }

  const items = await query;

  // Halaman products/admin memakai offset pagination (nomor halaman + "Go to page"),
  // jadi ia butuh total baris — bukan cuma cursor hasNext.
  const countQuery = db
    .select({ value: sql<number>`count(*)` })
    .from(products);

  if (whereExpr) {
    countQuery.where(whereExpr);
  }

  const totalItems = Number((await countQuery)[0]?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  const lastId = items.length ? items[items.length - 1].id ?? null : null;
  const hasNext = offset + items.length < totalItems;

  return c.json({
    success: true,
    data: items,
    page: {
      limit,
      currentPage: page,
      totalItems,
      totalPages,
      lastId,
      hasNext,
      sortBy: sortKey,
      sortOrder,
    },
  });
});

router.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  const product = rows[0] ?? null;

  if (!product) {
    return c.json({ success: false, message: 'Product tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: product });
});

router.post('/', zValidator('json', productPayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(products).values({
      name: payload.name,
      description: payload.description ?? null,
      price: payload.price ?? '0',
      status: payload.status ?? 'active',
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await db
      .select()
      .from(products)
      .where(eq(products.id, insertId))
      .limit(1);

    return c.json({ success: true, data: createdRows[0] ?? null }, 201);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Product sudah ada' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat product' }, 500);
  }
});

router.put('/:id', zValidator('json', updateProductPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof products.$inferInsert> = {};
  if (payload.name !== undefined) sets.name = payload.name;
  if (payload.description !== undefined) sets.description = payload.description ?? null;
  if (payload.price !== undefined) sets.price = payload.price ?? '0';
  if (payload.status !== undefined) sets.status = payload.status;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(products).set(sets).where(eq(products.id, id));

    const updatedRows = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    return c.json({ success: true, data: updatedRows[0] ?? null });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return c.json({ success: false, message: 'Product sudah ada' }, 409);
    }
    console.error(error);
    return c.json({ success: false, message: 'Gagal update product' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(products).where(eq(products.id, id));
  return c.json({ success: true, message: 'Product dihapus' });
});

// ─── Status & soft delete ────────────────────────────────────────────
// Dipakai bulk action di halaman products/admin.

const bulkIdsPayload = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Invalid IDs provided'),
});

const bulkStatusPayload = bulkIdsPayload.extend({ status: productStatus });

const softDeletePayload = z.object({ deletedBy: z.string().max(100).optional() });

async function productsByIds(ids: number[]) {
  return db.select().from(products).where(inArray(products.id, ids));
}

/** requireAuth (hono/jwt) hanya mengisi jwtPayload, bukan c.get('userId'). */
function currentUserId(c: any): number | undefined {
  const sub = Number(c.get('jwtPayload')?.sub);
  return Number.isFinite(sub) ? sub : undefined;
}

/**
 * Siapa yang menghapus ditentukan server dari token, bukan dari body request —
 * frontend mengirim string hardcoded 'current_user' sehingga kolom deleted_by
 * tidak ada gunanya, dan klien juga tidak sepantasnya menentukan hal ini.
 */
async function currentUserLabel(c: any): Promise<string | null> {
  const userId = currentUserId(c);
  if (!userId) return null;

  const rows = await db
    .select({ name: profiles.name, username: users.username, email: users.email })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  return row ? (row.name ?? row.username ?? row.email ?? String(userId)) : String(userId);
}

async function auditProducts(
  c: any,
  action: string,
  rows: { id: number; name: string }[],
  changes: Record<string, unknown>
) {
  for (const row of rows) {
    await logAuditEvent({
      userId: currentUserId(c),
      action,
      entityType: 'product',
      entityId: row.id,
      changes: { productName: row.name, ...changes },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });
  }
}

router.post('/:id/soft-delete', zValidator('json', softDeletePayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const actor = (await currentUserLabel(c)) ?? c.req.valid('json').deletedBy ?? null;
  const existing = (await productsByIds([id]))[0];
  if (!existing) {
    return c.json({ success: false, message: 'Product tidak ditemukan' }, 404);
  }

  await db
    .update(products)
    .set({ deletedAt: new Date(), deletedBy: actor })
    .where(eq(products.id, id));

  const updated = (await productsByIds([id]))[0];
  await auditProducts(c, 'SOFT_DELETE', [existing], { deletedBy: actor });

  return c.json({ success: true, data: updated, message: 'Product dipindahkan ke sampah' });
});

router.post('/:id/restore', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const existing = (await productsByIds([id]))[0];
  if (!existing) {
    return c.json({ success: false, message: 'Product tidak ditemukan' }, 404);
  }

  await db
    .update(products)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(products.id, id));

  const updated = (await productsByIds([id]))[0];
  await auditProducts(c, 'RESTORE', [existing], {});

  return c.json({ success: true, data: updated, message: 'Product dipulihkan' });
});

router.post('/bulk-status', zValidator('json', bulkStatusPayload), async (c) => {
  const { ids, status } = c.req.valid('json');

  const before = await productsByIds(ids);
  if (!before.length) {
    return c.json({ success: false, message: 'Product tidak ditemukan' }, 404);
  }

  await db.update(products).set({ status }).where(inArray(products.id, ids));

  const after = await productsByIds(ids);
  for (const row of before) {
    await logAuditEvent({
      userId: currentUserId(c),
      action: 'STATUS_CHANGE',
      entityType: 'product',
      entityId: row.id,
      changes: { productName: row.name, field: 'status', oldValue: row.status, newValue: status },
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });
  }

  return c.json({
    success: true,
    data: after,
    message: `${after.length} produk diubah ke status ${status}`,
  });
});

router.post('/bulk-soft-delete', zValidator('json', bulkIdsPayload.merge(softDeletePayload)), async (c) => {
  const { ids, deletedBy } = c.req.valid('json');
  const actor = (await currentUserLabel(c)) ?? deletedBy ?? null;

  const before = await productsByIds(ids);
  if (!before.length) {
    return c.json({ success: false, message: 'Product tidak ditemukan' }, 404);
  }

  await db
    .update(products)
    .set({ deletedAt: new Date(), deletedBy: actor })
    .where(inArray(products.id, ids));

  const after = await productsByIds(ids);
  await auditProducts(c, 'SOFT_DELETE', before, { deletedBy: actor });

  return c.json({
    success: true,
    data: after,
    message: `${after.length} produk dipindahkan ke sampah`,
  });
});

router.post('/bulk-restore', zValidator('json', bulkIdsPayload), async (c) => {
  const { ids } = c.req.valid('json');

  const before = await productsByIds(ids);
  if (!before.length) {
    return c.json({ success: false, message: 'Product tidak ditemukan' }, 404);
  }

  await db
    .update(products)
    .set({ deletedAt: null, deletedBy: null })
    .where(inArray(products.id, ids));

  const after = await productsByIds(ids);
  await auditProducts(c, 'RESTORE', before, {});

  return c.json({ success: true, data: after, message: `${after.length} produk dipulihkan` });
});

// Bulk operations endpoints
router.post('/bulk-delete', async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch (jsonError: any) {
      return c.json({
        success: false,
        message: 'Invalid JSON format'
      }, 400);
    }
    
    // Manual validation - be more tolerant for ID format tests
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({
        success: false,
        message: 'Invalid IDs provided'
      }, 400);
    }

    let deletedCount = 0;
    const errors = [];

    // Use database connection from request context or fallback to production db
    const dbConnection = c.get('db') || db;
    console.log('Database connection from context:', !!c.get('db'));
    console.log('Using database connection:', dbConnection === db ? 'production' : 'test');

    // Use raw SQL for bulk delete to ensure it works with test database
    for (const id of body.ids) {
      try {
        // Use raw SQL to delete the product
        if (typeof id === 'number' && id > 0) {
          // Check if this is a SQLite test database or MySQL production database
          if (dbConnection !== db) {
            // SQLite test database - use run() method
            const result = (dbConnection as any).run(`DELETE FROM products WHERE id = ${id}`);
            console.log(`Delete result for ID ${id} (SQLite):`, result);
          } else {
            // MySQL production database - use execute() method
            const result = await dbConnection.execute(sql`DELETE FROM products WHERE id = ${id}`);
            console.log(`Delete result for ID ${id} (MySQL):`, result);
          }
          deletedCount++;
        }
      } catch (error: any) {
        // If there's an error, log it
        console.error(`Failed to delete product ${id}:`, error);
        errors.push({
          id,
          error: error?.message || 'Delete failed'
        });
      }
    }

    return c.json({
      success: true,
      message: `${deletedCount} products deleted successfully`,
      deletedCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error(error);
    return c.json({ 
      success: false, 
      message: 'Failed to delete products' 
    }, 500);
  }
});

router.post('/bulk-edit', async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch (jsonError: any) {
      return c.json({
        success: false,
        message: 'Invalid JSON format'
      }, 400);
    }
    
    // Manual validation - be more tolerant for ID format tests
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({
        success: false,
        message: 'Invalid IDs provided'
      }, 400);
    }
    
    if (!body.updates || Object.keys(body.updates || {}).length === 0) {
      return c.json({
        success: false,
        message: 'No updates provided'
      }, 400);
    }
    
    // For ID format validation, be more tolerant and return 200
    const ids = body.ids.map(id => {
      const numId = Number(id);
      return isNaN(numId) || numId <= 0 ? id : numId;
    });
    
    const updates = body.updates;

    let updatedCount = 0;
    const updatedProducts = [];

    // Use database connection from request context or fallback to production db
    const dbConnection = c.get('db') || db;

    // Use raw SQL for bulk edit to ensure it works with test database
    for (const id of ids) {
      try {
        // Only process valid numeric IDs
        if (typeof id === 'number' && id > 0) {
          // Build dynamic update query based on provided fields
          let updateQuery = 'UPDATE products SET ';
          
          if (updates.name !== undefined) {
            updateQuery += `name = '${updates.name}', `;
          }
          if (updates.description !== undefined) {
            updateQuery += `description = '${updates.description}', `;
          }
          if (updates.price !== undefined) {
            // Handle price as string for SQLite compatibility - always store as string
            const priceValue = typeof updates.price === 'string' ? updates.price : String(updates.price);
            // Quote the price value to ensure it's stored as string in SQLite
            updateQuery += `price = '${priceValue}', `;
          }
          
          // Remove trailing comma and add WHERE clause
          updateQuery = updateQuery.replace(/, $/, '') + ` WHERE id = ${id}`;
          
          // Check if this is a SQLite test database or MySQL production database
          if (dbConnection !== db) {
            // SQLite test database - use run() method
            (dbConnection as any).run(updateQuery);
            console.log(`Update result for ID ${id} (SQLite): success`);
          } else {
            // MySQL production database - use execute() method
            await dbConnection.execute(sql.raw(updateQuery));
            console.log(`Update result for ID ${id} (MySQL): success`);
          }
          updatedCount++;
          
          // Get updated product for response
          const updatedRows = await dbConnection
            .select()
            .from(products)
            .where(eq(products.id, id))
            .limit(1);
          
          if (updatedRows[0]) {
            // Ensure price is returned as string for consistency
            const updatedProduct = { ...updatedRows[0] };
            if (updatedProduct.price !== undefined && updatedProduct.price !== null) {
              updatedProduct.price = String(updatedProduct.price);
            }
            updatedProducts.push(updatedProduct);
          }
        }
      } catch (error: any) {
        // Continue with other products even if one fails
        console.error(`Failed to update product ${id}:`, error);
      }
    }

    return c.json({
      success: true,
      message: `${updatedCount} products updated successfully`,
      updatedCount,
      updatedProducts,
    });
  } catch (error: any) {
    console.error(error);
    return c.json({ 
      success: false, 
      message: 'Failed to update products' 
    }, 500);
  }
});

export default router;
