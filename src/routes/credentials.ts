import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, like, or, type SQL } from 'drizzle-orm';

import { db } from '../db/client';
import {
  credentials,
  credentialShares,
  credentialAccessLogs,
  users,
  profiles,
  CREDENTIAL_VISIBILITY,
  CREDENTIAL_PRINCIPAL,
  CREDENTIAL_ACTION,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import type { JwtPayload } from '../middleware/auth';
import { TYPE_CUSTOMER } from '../constants/auth';
import {
  canView,
  canEdit,
  canManageShares,
  canDelete,
  type AccessUser,
} from '../utils/auth/credentialAccess';
import { isManagementLevel } from '../utils/auth/permissions';
import {
  encryptSecretObject,
  decryptSecretObject,
} from '../utils/crypto/credentialCipher';

const router = new Hono();

// All vault endpoints require a logged-in user.
router.use('*', requireAuth);

// Customers (client portal tokens) must never reach the internal team vault.
router.use('*', async (c, next) => {
  const payload = c.get('jwtPayload') as JwtPayload | undefined;
  if (!payload || payload.typ === TYPE_CUSTOMER) {
    return c.json({ success: false, message: 'Akses ditolak' }, 403);
  }
  await next();
});

// ─── Helpers ─────────────────────────────────────────────────────────

function getAuthUser(c: any): AccessUser {
  const payload = c.get('jwtPayload') as JwtPayload | undefined;
  let role: number | null | undefined;
  if (payload && typeof payload.rol === 'string') {
    try {
      role = JSON.parse(payload.rol);
    } catch {
      role = undefined;
    }
  } else {
    role = payload?.rol as number | null | undefined;
  }
  return { id: Number(payload?.sub), role: role ?? null };
}

async function fetchSharesFor(credentialIds: number[]) {
  if (!credentialIds.length) return [] as (typeof credentialShares.$inferSelect)[];
  return db
    .select()
    .from(credentialShares)
    .where(inArray(credentialShares.credentialId, credentialIds));
}

async function logAccess(credentialId: number, userId: number, action: number) {
  try {
    await db.insert(credentialAccessLogs).values({ credentialId, userId, action });
  } catch (error) {
    console.error('Failed to write credential access log', error);
  }
}

function metaRow(row: any, user: AccessUser, shares: (typeof credentialShares.$inferSelect)[]) {
  const cred = row.credential;
  return {
    id: cred.id,
    title: cred.title,
    type: cred.type,
    visibility: cred.visibility,
    category: cred.category,
    url: cred.url,
    username: cred.username,
    owner: row.owner ? { id: row.owner.id, name: row.ownerProfile?.name ?? null } : null,
    sharedCount: shares.length,
    canEdit: canEdit(user, cred, shares),
    canManageShares: canManageShares(user, cred),
    canDelete: canDelete(user, cred),
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
  };
}

function baseSelect() {
  return db
    .select({
      credential: credentials,
      owner: users,
      ownerProfile: profiles,
    })
    .from(credentials)
    .leftJoin(users, eq(users.id, credentials.ownerId))
    .leftJoin(profiles, eq(profiles.userId, users.id));
}

// ─── Validation ──────────────────────────────────────────────────────

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().optional(),
  type: z.coerce.number().int().optional(),
  category: z.string().optional(),
});

const secretSchema = z
  .object({
    password: z.string().optional(),
    token: z.string().optional(),
    apiKey: z.string().optional(),
    secret: z.string().optional(),
    endpoint: z.string().optional(),
    notes: z.string().optional(),
    extra: z.record(z.string()).optional(),
  })
  .optional();

const credentialPayload = z.object({
  title: z.string().min(1),
  type: z.coerce.number().int().min(0).max(2).default(0),
  visibility: z.coerce.number().int().min(0).max(2).default(0),
  category: z.string().optional(),
  url: z.string().optional(),
  username: z.string().optional(),
  secret: secretSchema,
});

const updatePayload = credentialPayload.partial();

const sharesPayload = z.object({
  visibility: z.coerce.number().int().min(0).max(2),
  shares: z
    .array(
      z.object({
        principalType: z.coerce.number().int().min(0).max(1),
        principalId: z.coerce.number().int(),
        permission: z.coerce.number().int().min(0).max(1).default(0),
      }),
    )
    .default([]),
});

// ─── Routes ──────────────────────────────────────────────────────────

// GET / — list items the user is allowed to see (no secrets)
router.get('/', zValidator('query', listQuery), async (c) => {
  const user = getAuthUser(c);
  const { page, limit, q, type, category } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const isMgmt = isManagementLevel(user.role);

  const filters: SQL[] = [];
  if (type !== undefined) filters.push(eq(credentials.type, type));
  if (category) filters.push(eq(credentials.category, category));
  if (q) {
    const term = `%${q}%`;
    filters.push(
      or(
        like(credentials.title, term),
        like(credentials.username, term),
        like(credentials.url, term),
        like(credentials.category, term),
      ) as SQL,
    );
  }

  // Access filter for non-management users.
  if (!isMgmt) {
    const shareRows = await db
      .select({ credentialId: credentialShares.credentialId })
      .from(credentialShares)
      .where(
        or(
          and(
            eq(credentialShares.principalType, CREDENTIAL_PRINCIPAL.USER),
            eq(credentialShares.principalId, user.id),
          ),
          and(
            eq(credentialShares.principalType, CREDENTIAL_PRINCIPAL.ROLE),
            eq(credentialShares.principalId, user.role ?? -1),
          ),
        ),
      );
    const sharedIds = [...new Set(shareRows.map((r) => r.credentialId))];

    const accessClauses: SQL[] = [
      eq(credentials.ownerId, user.id),
      eq(credentials.visibility, CREDENTIAL_VISIBILITY.TEAM),
    ];
    if (sharedIds.length) accessClauses.push(inArray(credentials.id, sharedIds));
    filters.push(or(...accessClauses) as SQL);
  }

  const whereExpr = filters.length ? and(...filters) : undefined;

  const query = baseSelect()
    .orderBy(desc(credentials.updatedAt))
    .limit(limit)
    .offset(offset);
  if (whereExpr) query.where(whereExpr);

  const rows = await query;
  const ids = rows.map((r) => r.credential.id);
  const allShares = await fetchSharesFor(ids);
  const sharesByCred = new Map<number, (typeof credentialShares.$inferSelect)[]>();
  for (const s of allShares) {
    const list = sharesByCred.get(s.credentialId) ?? [];
    list.push(s);
    sharesByCred.set(s.credentialId, list);
  }

  const items = rows.map((r) => metaRow(r, user, sharesByCred.get(r.credential.id) ?? []));
  const hasNext = rows.length === limit;

  return c.json({ success: true, data: items, page: { limit, hasNext } });
});

// GET /share/users — minimal user list for the share picker.
// Any logged-in (non-customer) user may call this; returns ONLY id + display name
// (no email/phone), so it doesn't expose the sensitive /users endpoint.
const shareUserQuery = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
router.get('/share/users', zValidator('query', shareUserQuery), async (c) => {
  const { q, limit } = c.req.valid('query');

  const query = db
    .select({ id: users.id, name: profiles.name, username: users.username })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .limit(limit);

  if (q) {
    const term = `%${q}%`;
    query.where(or(like(profiles.name, term), like(users.username, term)));
  }

  const rows = await query;
  return c.json({
    success: true,
    data: rows.map((r) => ({ id: r.id, name: r.name || r.username || `User #${r.id}` })),
  });
});

// GET /:id — single item metadata (+ shares if manager)
router.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const rows = await baseSelect().where(eq(credentials.id, id)).limit(1);
  if (!rows[0]) return c.json({ success: false, message: 'Data tidak ditemukan' }, 404);

  const shares = await fetchSharesFor([id]);
  if (!canView(user, rows[0].credential, shares)) {
    return c.json({ success: false, message: 'Tidak punya akses' }, 403);
  }

  const data: any = metaRow(rows[0], user, shares);
  if (canManageShares(user, rows[0].credential)) {
    // Resolve display names for USER principals so the share dialog can render them
    // without calling the management-only /users endpoint.
    const userIds = shares
      .filter((s) => s.principalType === CREDENTIAL_PRINCIPAL.USER)
      .map((s) => s.principalId);
    const nameById = new Map<number, string>();
    if (userIds.length) {
      const urows = await db
        .select({ id: users.id, name: profiles.name, username: users.username })
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .where(inArray(users.id, userIds));
      for (const u of urows) nameById.set(u.id, u.name || u.username || `User #${u.id}`);
    }
    data.shares = shares.map((s) => ({
      principalType: s.principalType,
      principalId: s.principalId,
      permission: s.permission,
      principalName:
        s.principalType === CREDENTIAL_PRINCIPAL.USER
          ? (nameById.get(s.principalId) ?? `User #${s.principalId}`)
          : null,
    }));
  }
  return c.json({ success: true, data });
});

// GET /:id/reveal — decrypt & return the secret (audited)
router.get('/:id/reveal', async (c) => {
  const user = getAuthUser(c);
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const rows = await db.select().from(credentials).where(eq(credentials.id, id)).limit(1);
  const cred = rows[0];
  if (!cred) return c.json({ success: false, message: 'Data tidak ditemukan' }, 404);

  const shares = await fetchSharesFor([id]);
  if (!canView(user, cred, shares)) {
    return c.json({ success: false, message: 'Tidak punya akses' }, 403);
  }

  await logAccess(id, user.id, CREDENTIAL_ACTION.REVEAL);
  return c.json({ success: true, data: { secret: decryptSecretObject(cred.secretEnc) } });
});

// POST / — create
router.post('/', zValidator('json', credentialPayload), async (c) => {
  const user = getAuthUser(c);
  const payload = c.req.valid('json');

  try {
    const [result] = await db.insert(credentials).values({
      ownerId: user.id,
      title: payload.title,
      type: payload.type ?? 0,
      visibility: payload.visibility ?? 0,
      category: payload.category ?? null,
      url: payload.url ?? null,
      username: payload.username ?? null,
      secretEnc: encryptSecretObject(payload.secret),
    });

    const insertId = Number(result.insertId);
    await logAccess(insertId, user.id, CREDENTIAL_ACTION.CREATE);

    const rows = await baseSelect().where(eq(credentials.id, insertId)).limit(1);
    return c.json({ success: true, data: metaRow(rows[0], user, []) }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal menyimpan data' }, 500);
  }
});

// PUT /:id — update metadata + (optionally) secret
router.put('/:id', zValidator('json', updatePayload), async (c) => {
  const user = getAuthUser(c);
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);
  const payload = c.req.valid('json');

  const rows = await db.select().from(credentials).where(eq(credentials.id, id)).limit(1);
  const cred = rows[0];
  if (!cred) return c.json({ success: false, message: 'Data tidak ditemukan' }, 404);

  const shares = await fetchSharesFor([id]);
  if (!canEdit(user, cred, shares)) {
    return c.json({ success: false, message: 'Tidak punya akses untuk mengubah' }, 403);
  }

  const sets: Partial<typeof credentials.$inferInsert> = {};
  if (payload.title !== undefined) sets.title = payload.title;
  if (payload.type !== undefined) sets.type = payload.type;
  if (payload.visibility !== undefined) sets.visibility = payload.visibility;
  if (payload.category !== undefined) sets.category = payload.category ?? null;
  if (payload.url !== undefined) sets.url = payload.url ?? null;
  if (payload.username !== undefined) sets.username = payload.username ?? null;
  if (payload.secret !== undefined) sets.secretEnc = encryptSecretObject(payload.secret);

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(credentials).set(sets).where(eq(credentials.id, id));
    await logAccess(id, user.id, CREDENTIAL_ACTION.UPDATE);

    const updated = await baseSelect().where(eq(credentials.id, id)).limit(1);
    const freshShares = await fetchSharesFor([id]);
    return c.json({ success: true, data: metaRow(updated[0], user, freshShares) });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update data' }, 500);
  }
});

// PUT /:id/shares — set visibility + replace shares
router.put('/:id/shares', zValidator('json', sharesPayload), async (c) => {
  const user = getAuthUser(c);
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);
  const payload = c.req.valid('json');

  const rows = await db.select().from(credentials).where(eq(credentials.id, id)).limit(1);
  const cred = rows[0];
  if (!cred) return c.json({ success: false, message: 'Data tidak ditemukan' }, 404);
  if (!canManageShares(user, cred)) {
    return c.json({ success: false, message: 'Tidak punya akses untuk mengatur berbagi' }, 403);
  }

  try {
    await db.update(credentials).set({ visibility: payload.visibility }).where(eq(credentials.id, id));
    await db.delete(credentialShares).where(eq(credentialShares.credentialId, id));

    // Only persist shares when the item is RESTRICTED.
    if (payload.visibility === CREDENTIAL_VISIBILITY.RESTRICTED && payload.shares.length) {
      // Dedupe by (principalType, principalId) to respect the unique index.
      const seen = new Set<string>();
      const values = payload.shares
        .filter((s) => {
          const key = `${s.principalType}:${s.principalId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((s) => ({
          credentialId: id,
          principalType: s.principalType,
          principalId: s.principalId,
          permission: s.permission ?? 0,
        }));
      if (values.length) await db.insert(credentialShares).values(values);
    }

    await logAccess(id, user.id, CREDENTIAL_ACTION.SHARE);
    return c.json({ success: true, message: 'Akses diperbarui' });
  } catch (error) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal mengatur berbagi' }, 500);
  }
});

// DELETE /:id
router.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const rows = await db.select().from(credentials).where(eq(credentials.id, id)).limit(1);
  const cred = rows[0];
  if (!cred) return c.json({ success: false, message: 'Data tidak ditemukan' }, 404);
  if (!canDelete(user, cred)) {
    return c.json({ success: false, message: 'Tidak punya akses untuk menghapus' }, 403);
  }

  await db.delete(credentials).where(eq(credentials.id, id));
  await logAccess(id, user.id, CREDENTIAL_ACTION.DELETE);
  return c.json({ success: true, message: 'Data dihapus' });
});

// GET /:id/logs — audit log (owner / management only)
router.get('/:id/logs', async (c) => {
  const user = getAuthUser(c);
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ success: false, message: 'ID tidak valid' }, 400);

  const rows = await db.select().from(credentials).where(eq(credentials.id, id)).limit(1);
  const cred = rows[0];
  if (!cred) return c.json({ success: false, message: 'Data tidak ditemukan' }, 404);
  if (!canManageShares(user, cred)) {
    return c.json({ success: false, message: 'Tidak punya akses' }, 403);
  }

  const logs = await db
    .select({
      id: credentialAccessLogs.id,
      action: credentialAccessLogs.action,
      createdAt: credentialAccessLogs.createdAt,
      userId: credentialAccessLogs.userId,
      userName: profiles.name,
    })
    .from(credentialAccessLogs)
    .leftJoin(profiles, eq(profiles.userId, credentialAccessLogs.userId))
    .where(eq(credentialAccessLogs.credentialId, id))
    .orderBy(desc(credentialAccessLogs.createdAt))
    .limit(100);

  return c.json({ success: true, data: logs });
});

export default router;
