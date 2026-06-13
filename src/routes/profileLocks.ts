import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, eq, gt, inArray, isNotNull } from 'drizzle-orm';

import { db } from '../db/client';
import { chromeProfiles, profiles, users } from '../db/schema';

const router = new Hono();

// TTL lock dalam detik. Aplikasi heartbeat tiap 30 detik, jadi 90 detik
// memberi toleransi ~3 kali heartbeat gagal sebelum lock dianggap kedaluwarsa.
const LOCK_TTL_SECONDS = 90;

function lockExpiry(): Date {
  return new Date(Date.now() + LOCK_TTL_SECONDS * 1000);
}

// Ambil userId dari JWT Bearer token (pola sama dengan routes/chromeProfiles.ts).
function getUserId(c: any): number | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const parts = authHeader.slice(7).split('.');
    const decoded = JSON.parse(atob(parts[1]));
    const userId = Number(decoded.sub);
    return userId || null;
  } catch {
    return null;
  }
}

// Identifikasi profile via numeric id ATAU browserUuid.
async function resolveProfile(profileId?: number, browserUuid?: string) {
  if (profileId) {
    const rows = await db
      .select()
      .from(chromeProfiles)
      .where(eq(chromeProfiles.id, profileId))
      .limit(1);
    return rows[0] ?? null;
  }
  if (browserUuid) {
    const rows = await db
      .select()
      .from(chromeProfiles)
      .where(eq(chromeProfiles.uuid, browserUuid))
      .limit(1);
    return rows[0] ?? null;
  }
  return null;
}

function isActive(profile: { lockExpiresAt: Date | null }): boolean {
  return !!profile.lockExpiresAt && profile.lockExpiresAt.getTime() > Date.now();
}

const lockBody = z
  .object({
    profileId: z.coerce.number().int().optional(),
    browserUuid: z.string().optional(),
    deviceId: z.string().min(1),
  })
  .refine((v) => v.profileId || v.browserUuid, {
    message: 'profileId atau browserUuid wajib diisi',
  });

const releaseBody = z
  .object({
    profileId: z.coerce.number().int().optional(),
    browserUuid: z.string().optional(),
    deviceId: z.string().optional(),
  })
  .refine((v) => v.profileId || v.browserUuid, {
    message: 'profileId atau browserUuid wajib diisi',
  });

const statusQuery = z.object({
  // Filter opsional: "1,2,3". Kosong = semua profile.
  profileIds: z.string().optional(),
});

// GET /locks — daftar lock yang sedang aktif untuk semua profile.
router.get('/locks', async (c) => {
  const rows = await db
    .select({
      id: chromeProfiles.id,
      uuid: chromeProfiles.uuid,
      lockedBy: chromeProfiles.lockedBy,
      deviceId: chromeProfiles.lockDeviceId,
      lockedAt: chromeProfiles.lockedAt,
      lockExpiresAt: chromeProfiles.lockExpiresAt,
      lockedByName: profiles.name,
    })
    .from(chromeProfiles)
    .leftJoin(users, eq(users.id, chromeProfiles.lockedBy))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        isNotNull(chromeProfiles.lockExpiresAt),
        gt(chromeProfiles.lockExpiresAt, new Date())
      )
    );

  const data = rows.map((r) => ({
    id: r.id,
    profileId: r.uuid,
    lockedBy: r.lockedBy,
    lockedByName: r.lockedByName ?? null,
    deviceId: r.deviceId,
    lockedAt: r.lockedAt,
    expiresAt: r.lockExpiresAt,
    status: 'locked' as const,
  }));

  return c.json({ success: true, data });
});

// GET /get-profile-status — status lock ringkas per profile.
router.get('/get-profile-status', zValidator('query', statusQuery), async (c) => {
  const { profileIds } = c.req.valid('query');

  const ids = profileIds
    ? profileIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    : null;

  const base = db
    .select({
      id: chromeProfiles.id,
      lockExpiresAt: chromeProfiles.lockExpiresAt,
    })
    .from(chromeProfiles);

  const rows = ids && ids.length ? await base.where(inArray(chromeProfiles.id, ids)) : await base;

  const data = rows.map((r) => ({
    id: r.id,
    locked: !!r.lockExpiresAt && r.lockExpiresAt.getTime() > Date.now(),
    expiresAt: r.lockExpiresAt,
  }));

  return c.json({ success: true, data });
});

// POST /profile-lock — kunci profile untuk device pemanggil.
router.post('/profile-lock', zValidator('json', lockBody), async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ success: false, message: 'Token tidak valid' }, 401);

  const { profileId, browserUuid, deviceId } = c.req.valid('json');
  const profile = await resolveProfile(profileId, browserUuid);
  if (!profile) return c.json({ success: false, message: 'Profile tidak ditemukan' }, 404);

  // Konflik bila ada lock aktif yang dipegang device LAIN.
  if (isActive(profile) && profile.lockDeviceId !== deviceId) {
    return c.json(
      {
        success: false,
        message: 'Profile sedang dikunci oleh device lain',
        data: {
          id: profile.id,
          lockedBy: profile.lockedBy,
          deviceId: profile.lockDeviceId,
          expiresAt: profile.lockExpiresAt,
        },
      },
      409
    );
  }

  await db
    .update(chromeProfiles)
    .set({
      lockedBy: userId,
      lockDeviceId: deviceId,
      lockedAt: new Date(),
      lockExpiresAt: lockExpiry(),
    })
    .where(eq(chromeProfiles.id, profile.id));

  return c.json({
    success: true,
    data: {
      id: profile.id,
      profileId: profile.uuid,
      lockedBy: userId,
      deviceId,
      expiresAt: lockExpiry(),
      status: 'locked',
    },
  });
});

// PUT /heartbeat-profile-lock — perpanjang lock (dipanggil tiap 30 detik).
router.put('/heartbeat-profile-lock', zValidator('json', lockBody), async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ success: false, message: 'Token tidak valid' }, 401);

  const { profileId, browserUuid, deviceId } = c.req.valid('json');
  const profile = await resolveProfile(profileId, browserUuid);
  if (!profile) return c.json({ success: false, message: 'Profile tidak ditemukan' }, 404);

  // Hanya device pemegang lock yang masih aktif yang boleh heartbeat.
  if (!isActive(profile) || profile.lockDeviceId !== deviceId) {
    return c.json({ success: false, message: 'Lock tidak aktif atau bukan milik device ini' }, 409);
  }

  const expiresAt = lockExpiry();
  await db
    .update(chromeProfiles)
    .set({ lockExpiresAt: expiresAt })
    .where(eq(chromeProfiles.id, profile.id));

  return c.json({ success: true, data: { id: profile.id, expiresAt } });
});

// DELETE /release-profile-lock — lepas lock (oleh device pemegang atau user pemilik lock).
router.delete('/release-profile-lock', zValidator('json', releaseBody), async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ success: false, message: 'Token tidak valid' }, 401);

  const { profileId, browserUuid, deviceId } = c.req.valid('json');
  const profile = await resolveProfile(profileId, browserUuid);
  if (!profile) return c.json({ success: false, message: 'Profile tidak ditemukan' }, 404);

  // Boleh release bila device cocok ATAU user adalah pemegang lock.
  const deviceMatches = deviceId ? profile.lockDeviceId === deviceId : false;
  const ownerMatches = profile.lockedBy === userId;
  if (profile.lockExpiresAt && !deviceMatches && !ownerMatches) {
    return c.json({ success: false, message: 'Tidak berhak melepas lock ini' }, 403);
  }

  await db
    .update(chromeProfiles)
    .set({
      lockedBy: null,
      lockDeviceId: null,
      lockedAt: null,
      lockExpiresAt: null,
    })
    .where(eq(chromeProfiles.id, profile.id));

  return c.json({ success: true, data: { id: profile.id } });
});

export default router;
