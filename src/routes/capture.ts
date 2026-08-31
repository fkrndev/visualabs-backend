import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, sql } from 'drizzle-orm';
import { verify } from 'hono/jwt';

import { db } from '../db/client';
import { captureEndpoints, capturePayloads, chromeProfiles } from '../db/schema';
import { requireAuth, requireManagement, JWT_SECRET } from '../middleware/auth';
import { PLATFORM_BY_HOST, parseCaptureUrl, sha256, shouldStoreBody } from '../utils/capture';

/**
 * Menyimpan data marketplace yang dilihat tim. Rencana: docs/vbox/capture-plan.md
 *
 *   POST  /api/capture             ← extension, batch hasil sadapan
 *   GET   /api/capture/rules       ← extension, host yang disadap + endpoint yang isinya disimpan
 *   GET   /api/capture/endpoints   ← katalog, untuk memilih endpoint mana yang disimpan
 *   PATCH /api/capture/endpoints/:id
 *
 * Rancangannya dua lapis. Katalog selalu menyala dan hanya mencatat metadata,
 * jadi kita bisa melihat endpoint apa saja yang dipakai tim tanpa seorang pun
 * membuka DevTools. Isi response baru disimpan untuk endpoint yang sengaja
 * dinyalakan. Menambah sumber data karena itu tidak perlu ubah kode.
 */

const router = new Hono();

const captureItem = z.object({
	url: z.string().min(1),
	method: z.string().min(1).max(8).default('GET'),
	status: z.coerce.number().int().optional(),
	body: z.string().optional(),
	requestBody: z.string().optional(),
	// Shopee tidak menaruh shop_id di query, jadi extension membacanya sekali dari
	// /api/framework/selleraccount/shop_info lalu menitipkannya di sini.
	shopId: z.string().max(64).optional(),
	shopName: z.string().max(255).optional(),
});

const capturePayload = z.object({
	browserUuid: z.string().min(1),
	items: z.array(captureItem).min(1).max(200),
});

/** Sama seperti /chrome-histories/track: extension memakai JWT dari injected-config. */
const verifyExtensionToken = async (authHeader?: string): Promise<boolean> => {
	if (!authHeader?.startsWith('Bearer ')) return false;
	try {
		await verify(authHeader.slice(7), JWT_SECRET);
		return true;
	} catch {
		return false;
	}
};

// POST / — dipanggil extension, satu batch berisi banyak response sekaligus
router.post('/', zValidator('json', capturePayload), async (c) => {
	if (!(await verifyExtensionToken(c.req.header('Authorization')))) {
		return c.json({ success: false, message: 'Unauthorized' }, 401);
	}

	const { browserUuid, items } = c.req.valid('json');

	// Identitas akun ikut profil Chrome, bukan isi response. Satu profil dipakai
	// untuk satu klien, dan uuid-nya selalu ada — sementara 90% response Shopee
	// tidak memuat shop_id sama sekali.
	const [profile] = await db
		.select()
		.from(chromeProfiles)
		.where(eq(chromeProfiles.uuid, browserUuid))
		.limit(1);

	if (!profile) return c.json({ success: false, message: 'Browser belum terdaftar' }, 404);

	// Saklar penyimpanan dibaca dari server, bukan dipercayakan ke extension:
	// daftar aturan di extension bisa basi beberapa menit setelah kita mematikan
	// sebuah endpoint, dan selama jeda itu isinya tidak boleh terlanjur masuk.
	const enabledRows = await db
		.select({ platform: captureEndpoints.platform, endpointKey: captureEndpoints.endpointKey })
		.from(captureEndpoints)
		.where(eq(captureEndpoints.captureBody, 1));
	const enabled = new Set(enabledRows.map((r) => `${r.platform} ${r.endpointKey}`));

	let cataloged = 0;
	let stored = 0;
	let skipped = 0;

	for (const item of items) {
		const parsed = parseCaptureUrl(item.url);
		if (!parsed) {
			skipped++;
			continue;
		}
		const { platform, endpointKey, query, shopId: shopIdFromQuery } = parsed;

		await db
			.insert(captureEndpoints)
			.values({ platform, endpointKey, sampleUrl: item.url, hitCount: 1 })
			.onDuplicateKeyUpdate({
				set: {
					hitCount: sql`${captureEndpoints.hitCount} + 1`,
					lastSeenAt: new Date(),
				},
			});
		cataloged++;

		if (!shouldStoreBody(item.body, platform, endpointKey, enabled)) {
			if (item.body) skipped++;
			continue;
		}

		await db
			.insert(capturePayloads)
			.values({
				platform,
				endpointKey,
				chromeProfileUuid: browserUuid,
				customerId: profile.customerId ?? null,
				userId: profile.userId,
				shopId: shopIdFromQuery ?? item.shopId ?? null,
				shopName: item.shopName ?? null,
				method: item.method,
				queryJson: query,
				requestBody: item.requestBody ?? null,
				payloadHash: sha256(item.body!),
				payload: item.body!,
			})
			// Tim menyegarkan halaman berkali-kali dengan data yang sama. Baris kembar
			// diabaikan diam-diam; yang isinya berubah tetap masuk sebagai baris baru,
			// jadi pergerakan dalam satu hari ikut terekam gratis.
			.onDuplicateKeyUpdate({ set: { id: sql`${capturePayloads.id}` } });
		stored++;
	}

	return c.json({ success: true, cataloged, stored, skipped });
});

// GET /rules — dibaca extension secara berkala
router.get('/rules', async (c) => {
	if (!(await verifyExtensionToken(c.req.header('Authorization')))) {
		return c.json({ success: false, message: 'Unauthorized' }, 401);
	}

	const rows = await db
		.select({ platform: captureEndpoints.platform, endpointKey: captureEndpoints.endpointKey })
		.from(captureEndpoints)
		.where(eq(captureEndpoints.captureBody, 1));

	// Daftar host ikut dikirim supaya menambah marketplace baru cukup di server.
	return c.json({ success: true, hosts: Object.keys(PLATFORM_BY_HOST), captureBody: rows });
});

const endpointQuery = z.object({
	platform: z.string().optional(),
	onlyEnabled: z.coerce.boolean().optional(),
	limit: z.coerce.number().int().min(1).max(500).default(200),
});

// GET /endpoints — katalog hasil Lapis 1, urut dari yang paling sering muncul
router.get('/endpoints', requireAuth, requireManagement, zValidator('query', endpointQuery), async (c) => {
	const { platform, onlyEnabled, limit } = c.req.valid('query');

	const conditions = [];
	if (platform) conditions.push(eq(captureEndpoints.platform, platform));
	if (onlyEnabled) conditions.push(eq(captureEndpoints.captureBody, 1));

	const rows = await db
		.select()
		.from(captureEndpoints)
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(captureEndpoints.hitCount))
		.limit(limit);

	return c.json({ success: true, data: rows });
});

const endpointUpdate = z.object({
	captureBody: z.boolean().optional(),
	unitNote: z.string().max(255).nullable().optional(),
	note: z.string().nullable().optional(),
});

// PATCH /endpoints/:id — menyalakan penyimpanan isi untuk satu endpoint
router.patch(
	'/endpoints/:id',
	requireAuth,
	requireManagement,
	zValidator('json', endpointUpdate),
	async (c) => {
		const id = Number(c.req.param('id'));
		if (!Number.isInteger(id) || id < 1) {
			return c.json({ success: false, message: 'id tidak valid' }, 400);
		}
		const body = c.req.valid('json');

		const set: Record<string, unknown> = {};
		if (body.captureBody !== undefined) set.captureBody = body.captureBody ? 1 : 0;
		if (body.unitNote !== undefined) set.unitNote = body.unitNote;
		if (body.note !== undefined) set.note = body.note;
		if (!Object.keys(set).length) {
			return c.json({ success: false, message: 'Tidak ada yang diubah' }, 400);
		}

		await db.update(captureEndpoints).set(set).where(eq(captureEndpoints.id, id));

		const [row] = await db
			.select()
			.from(captureEndpoints)
			.where(eq(captureEndpoints.id, id))
			.limit(1);

		if (!row) return c.json({ success: false, message: 'Endpoint tidak ditemukan' }, 404);
		return c.json({ success: true, data: row });
	}
);

export default router;
