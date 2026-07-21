import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { SQL, and, asc, desc, eq, inArray, like, or } from 'drizzle-orm';

import { db } from '../db/client';
import { fbAct, fbToken, fbActDailyData, customers, customerProfiles, subscriptions, users, profiles } from '../db/schema';
import { syncFbActBalance } from '../jobs/syncFbActBalance';
import { requireAuth } from '../middleware/auth';

const router = new Hono();

/**
 * Route ini SEBELUMNYA tidak punya auth sama sekali, padahal responsnya ikut
 * membawa baris `fb_token` lengkap dengan access token Facebook mentah — siapa
 * pun tanpa login bisa menariknya, sekaligus mem-bypass `resolveAdvertiserScope`
 * yang dipasang di `marketingDashboard.ts`. Dua pengamanan sekarang:
 *   1. `requireAuth` di seluruh endpoint (di bawah), dan
 *   2. access token mentah dibuang dari respons (lihat `safeToken`).
 */
router.use('*', requireAuth);

const tokenUsers = users;
const tokenProfiles = profiles;

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  tokenId: z.coerce.number().int().optional(),
  q: z.string().trim().optional(),
  sortBy: z
    .enum(['id', 'actId', 'actName', 'name', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const fbActPayload = z.object({
  customerId: z.coerce.number().int(),
  subscriptionId: z.coerce.number().int(),
  tokenId: z.coerce.number().int().optional().nullable(),
  actId: z.string().min(1),
  actName: z.string().optional(),
  name: z.string().optional(),
  dataJson: z.any().optional(),
});

const updateFbActPayload = fbActPayload.partial();

/**
 * Metadata token TANPA nilai access token-nya.
 *
 * Konsumen yang ada hanya membaca `token.status` (badge status di
 * monitoring-ads & tabel akun) — nilai `token` mentah tidak pernah dipakai di
 * frontend, jadi tidak ada alasan mengirimkannya keluar.
 */
function safeToken(row: any) {
  if (!row) return null;
  const { token, ...meta } = row;
  return meta;
}

function formatRow(row: any) {
  return {
    ...row.fbAct,
    customer: row.customer
      ? { ...row.customer, profile: row.customerProfile ?? null }
      : null,
    subscription: row.subscription ?? null,
    token: safeToken(row.fbToken),
  };
}

function buildSelectQuery() {
  return db
    .select({
      fbAct: fbAct,
      customer: customers,
      customerProfile: customerProfiles,
      subscription: subscriptions,
      fbToken: fbToken,
    })
    .from(fbAct)
    .leftJoin(customers, eq(customers.id, fbAct.customerId))
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .leftJoin(subscriptions, eq(subscriptions.id, fbAct.subscriptionId))
    .leftJoin(fbToken, eq(fbToken.id, fbAct.tokenId));
}

router.get('/', zValidator('query', paginationQuery), async (c) => {
  const {
    page,
    limit,
    customerId,
    subscriptionId,
    tokenId,
    q,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  } = c.req.valid('query');

  const offset = (page - 1) * limit;

  const filters = [] as any[];
  if (customerId) filters.push(eq(fbAct.customerId, customerId));
  if (subscriptionId) filters.push(eq(fbAct.subscriptionId, subscriptionId));
  if (tokenId) filters.push(eq(fbAct.tokenId, tokenId));
  if (q) {
    const value = `%${q}%`;
    filters.push(or(like(fbAct.actName, value), like(fbAct.name, value), like(fbAct.actId, value)));
  }

  const whereExpr = filters.length ? and(...filters) : undefined;

  const sortMap = {
    id: fbAct.id,
    actId: fbAct.actId,
    actName: fbAct.actName,
    name: fbAct.name,
    createdAt: fbAct.createdAt,
    updatedAt: fbAct.updatedAt,
  } as const;

  const isValidSortKey = (key: string): key is keyof typeof sortMap => key in sortMap;
  const sortKey = sortByParam && isValidSortKey(sortByParam) ? sortByParam : 'id';
  const sortColumn = sortMap[sortKey];
  const sortOrder = sortOrderParam === 'desc' ? 'desc' : 'asc';

  const orders: SQL[] = [sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn)];
  if (sortKey !== 'id') {
    orders.push(asc(sortMap.id));
  }

  const query = buildSelectQuery()
    .orderBy(...orders)
    .limit(limit)
    .offset(offset);

  if (whereExpr) {
    query.where(whereExpr);
  }

  const rows = await query;
  const items = rows.map(formatRow);

  const lastId = items.length ? items[items.length - 1].id ?? null : null;
  const hasNext = items.length === limit;

  return c.json({
    success: true,
    data: items,
    page: { limit, lastId, hasNext, sortBy: sortKey, sortOrder },
  });
});

// Dashboard: list semua fb_act dengan latest daily data (balance, status, dll)
router.get('/dashboard', async (c) => {
  const acts = await buildSelectQuery().orderBy(asc(fbAct.id));
  const items = acts.map(formatRow);

  if (items.length === 0) {
    return c.json({ success: true, data: [] });
  }

  // Ambil latest daily data per fb_act_id (pakai subquery max date)
  const fbActIds = items.map((i: any) => i.id).filter((id: number | null) => id != null);

  if (fbActIds.length === 0) {
    return c.json({ success: true, data: items.map((i: any) => ({ ...i, latestDaily: null })) });
  }

  // Ambil semua daily data lalu pick latest per fbActId di JS (lebih simpel)
  const dailyRows = await db
    .select()
    .from(fbActDailyData)
    .where(inArray(fbActDailyData.fbActId, fbActIds as number[]))
    .orderBy(desc(fbActDailyData.date), desc(fbActDailyData.id));

  const latestByFbActId = new Map<number, typeof dailyRows[number]>();
  for (const row of dailyRows) {
    if (row.fbActId == null) continue;
    if (!latestByFbActId.has(row.fbActId)) {
      latestByFbActId.set(row.fbActId, row);
    }
  }

  const enriched = items.map((item: any) => ({
    ...item,
    latestDaily: latestByFbActId.get(item.id) ?? null,
    isActive: !!(item.token && item.token.status === 1),
  }));

  return c.json({ success: true, data: enriched });
});

// Sync balance on-demand untuk 1 fb_act
router.post('/:id/sync-balance', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const result = await syncFbActBalance(id);
  if (!result.success) {
    return c.json(result, 400);
  }
  return c.json(result);
});

router.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  const rows = await buildSelectQuery()
    .where(eq(fbAct.id, id))
    .limit(1);

  const item = rows[0] ? formatRow(rows[0]) : null;

  if (!item) {
    return c.json({ success: false, message: 'FB Act tidak ditemukan' }, 404);
  }

  return c.json({ success: true, data: item });
});

router.post('/', zValidator('json', fbActPayload), async (c) => {
  const payload = c.req.valid('json');

  try {
    const [insertResult] = await db.insert(fbAct).values({
      customerId: payload.customerId,
      subscriptionId: payload.subscriptionId,
      tokenId: payload.tokenId ?? null,
      actId: payload.actId,
      actName: payload.actName ?? null,
      name: payload.name ?? null,
      dataJson: payload.dataJson ?? null,
    });

    const insertId = Number(insertResult.insertId);

    const createdRows = await buildSelectQuery()
      .where(eq(fbAct.id, insertId))
      .limit(1);

    const created = createdRows[0] ? formatRow(createdRows[0]) : null;

    return c.json({ success: true, data: created }, 201);
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal membuat FB Act' }, 500);
  }
});

router.put('/:id', zValidator('json', updateFbActPayload), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }
  const payload = c.req.valid('json');

  const sets: Partial<typeof fbAct.$inferInsert> = {};
  if (payload.customerId !== undefined) sets.customerId = payload.customerId;
  if (payload.subscriptionId !== undefined) sets.subscriptionId = payload.subscriptionId;
  if (payload.tokenId !== undefined) sets.tokenId = payload.tokenId ?? null;
  if (payload.actId !== undefined) sets.actId = payload.actId;
  if (payload.actName !== undefined) sets.actName = payload.actName ?? null;
  if (payload.name !== undefined) sets.name = payload.name ?? null;
  if (payload.dataJson !== undefined) sets.dataJson = payload.dataJson ?? null;

  if (!Object.keys(sets).length) {
    return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
  }

  try {
    await db.update(fbAct).set(sets).where(eq(fbAct.id, id));

    const updatedRows = await buildSelectQuery()
      .where(eq(fbAct.id, id))
      .limit(1);

    const updated = updatedRows[0] ? formatRow(updatedRows[0]) : null;

    return c.json({ success: true, data: updated });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal update FB Act' }, 500);
  }
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ success: false, message: 'ID tidak valid' }, 400);
  }

  await db.delete(fbAct).where(eq(fbAct.id, id));
  return c.json({ success: true, message: 'FB Act dihapus' });
});

const validatePayload = z.object({
  token: z.string().min(1),
  actId: z.string().min(1),
});

router.post('/validate', zValidator('json', validatePayload), async (c) => {
  const { token, actId } = c.req.valid('json');

  const cleanActId = actId.trim().startsWith('act_') ? actId.trim() : `act_${actId.trim()}`;

  try {
    const url = new URL(`https://graph.facebook.com/v20.0/${cleanActId}`);
    url.searchParams.set(
      'fields',
      [
        'id',
        'account_id',
        'name',
        'currency',
        'account_status',
        'disable_reason',
        'amount_spent',
        'balance',
        'spend_cap',
        'timezone_name',
        'timezone_offset_hours_utc',
        'business{id,name}',
        'business_country_code',
        'funding_source_details',
        'owner',
        'created_time',
        'capabilities',
        'is_prepay_account',
        'is_personal',
        'tax_id_status',
        'min_daily_budget',
        'age',
      ].join(','),
    );
    url.searchParams.set('access_token', token);

    const res = await fetch(url.toString());
    const data: any = await res.json();

    if (data.error) {
      return c.json({
        success: false,
        message: data.error.message || 'Token atau Act ID tidak valid',
        error: data.error,
      });
    }

    const statusMap: Record<number, string> = {
      1: 'Aktif',
      2: 'Dinonaktifkan',
      3: 'Tagihan Belum Lunas',
      7: 'Menunggu Review Risiko',
      8: 'Menunggu Pelunasan',
      9: 'Masa Tenggang',
      100: 'Akan Ditutup',
      101: 'Ditutup',
      201: 'Aktif (Apapun)',
      202: 'Ditutup (Apapun)',
    };

    const disableReasonMap: Record<number, string> = {
      0: 'Tidak ada',
      1: 'Pelanggaran kebijakan iklan',
      2: 'Review IP iklan',
      3: 'Masalah pembayaran',
      4: 'Akun gray dimatikan',
      5: 'Review AFC iklan',
      6: 'Business Integrity RAR',
      7: 'Ditutup permanen',
      8: 'Reseller tidak terpakai',
      9: 'Akun tidak terpakai',
    };

    const taxStatusMap: Record<number, string> = {
      0: 'Tidak diketahui',
      1: 'VAT tidak diperlukan',
      2: 'Informasi VAT diperlukan',
      3: 'Informasi VAT terkirim',
      4: 'Validasi VAT offline gagal',
      5: 'VAT tidak didukung',
    };

    const fundingType = (() => {
      const fs = data.funding_source_details;
      if (!fs) return null;
      const t = typeof fs.type === 'number' ? fs.type : null;
      const typeMap: Record<number, string> = {
        1: 'Kartu Kredit',
        2: 'PayPal',
        3: 'Manual Deposit',
        4: 'Akun Bank',
        5: 'Kartu Debit',
        6: 'Pulsa Mobile',
        7: 'Voucher Promo',
        8: 'BoletoBancario',
        9: 'Direct Debit',
        10: 'Coupon',
      };
      return {
        id: fs.id ?? null,
        display: fs.display_string ?? null,
        type: t,
        typeLabel: t != null ? (typeMap[t] ?? `Tipe ${t}`) : null,
      };
    })();

    const accountStatus = Number(data.account_status);
    const disableReason = Number(data.disable_reason ?? 0);
    const isActive = accountStatus === 1;

    // Fetch purchase metrics (last 30d) — non-blocking failure
    const PURCHASE_ACTION_TYPES = new Set([
      'purchase',
      'omni_purchase',
      'web_in_store_purchase',
      'offsite_conversion.fb_pixel_purchase',
      'offline_conversion.purchase',
      'app_custom_event.fb_mobile_purchase',
    ]);
    let purchaseStats: {
      hasInsights: boolean;
      totalCount: number;
      totalValue: number;
      spend: number;
      roas: number | null;
      byType: Array<{ actionType: string; count: number; value: number }>;
    } | null = null;
    try {
      const insightsUrl = new URL(`https://graph.facebook.com/v20.0/${cleanActId}/insights`);
      insightsUrl.searchParams.set('fields', 'spend,actions,action_values');
      insightsUrl.searchParams.set('date_preset', 'last_30d');
      insightsUrl.searchParams.set('level', 'account');
      insightsUrl.searchParams.set('access_token', token);
      const insRes = await fetch(insightsUrl.toString());
      const insData: any = await insRes.json();
      if (!insData.error) {
        const rows: any[] = Array.isArray(insData.data) ? insData.data : [];
        const byTypeMap = new Map<string, { count: number; value: number }>();
        let totalSpend = 0;
        for (const row of rows) {
          totalSpend += Number(row.spend) || 0;
          const values = new Map<string, number>();
          for (const v of (row.action_values ?? [])) {
            if (v?.action_type) values.set(v.action_type, Number(v.value) || 0);
          }
          for (const a of (row.actions ?? [])) {
            if (!a?.action_type || !PURCHASE_ACTION_TYPES.has(a.action_type)) continue;
            const prev = byTypeMap.get(a.action_type) ?? { count: 0, value: 0 };
            prev.count += Number(a.value) || 0;
            prev.value += values.get(a.action_type) ?? 0;
            byTypeMap.set(a.action_type, prev);
          }
        }
        const byType = Array.from(byTypeMap.entries())
          .map(([t, v]) => ({ actionType: t, count: v.count, value: v.value }))
          .sort((a, b) => b.count - a.count);
        const totalCount = byType.reduce((s, x) => s + x.count, 0);
        const totalValue = byType.reduce((s, x) => s + x.value, 0);
        purchaseStats = {
          hasInsights: rows.length > 0,
          totalCount,
          totalValue,
          spend: totalSpend,
          roas: totalSpend > 0 ? totalValue / totalSpend : null,
          byType,
        };
      }
    } catch { /* silent — purchase stats best-effort */ }

    // Account Spending Limit + Remaining Amount
    // spend_cap = limit; amount_spent = sudah terpakai terhadap limit.
    // spend_cap "0"/kosong → tidak ada limit (unlimited).
    const spendCapNum = Number(data.spend_cap ?? 0);
    const amountSpentNum = Number(data.amount_spent ?? 0);
    const hasSpendingLimit = Number.isFinite(spendCapNum) && spendCapNum > 0;
    const spendingLimitRemaining = hasSpendingLimit
      ? String(Math.max(0, spendCapNum - amountSpentNum))
      : null;

    return c.json({
      success: true,
      data: {
        id: data.id,
        accountId: data.account_id,
        name: data.name,
        currency: data.currency,
        accountStatus,
        accountStatusLabel: statusMap[accountStatus] ?? `Status ${accountStatus}`,
        isActive,
        disableReason,
        disableReasonLabel: disableReason ? (disableReasonMap[disableReason] ?? `Alasan ${disableReason}`) : null,
        amountSpent: data.amount_spent,
        balance: data.balance,
        spendCap: data.spend_cap,
        hasSpendingLimit,
        spendingLimitRemaining,
        timezoneName: data.timezone_name,
        timezoneOffsetHours: data.timezone_offset_hours_utc,
        businessCountryCode: data.business_country_code,
        business: data.business ? { id: data.business.id, name: data.business.name } : null,
        fundingSource: fundingType,
        owner: data.owner,
        createdTime: data.created_time,
        ageDays: typeof data.age === 'number' ? Math.round(data.age) : null,
        capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
        isPrepayAccount: data.is_prepay_account ?? null,
        isPersonal: data.is_personal === 1 || data.is_personal === true,
        taxIdStatus: data.tax_id_status ?? null,
        taxIdStatusLabel: data.tax_id_status != null ? (taxStatusMap[Number(data.tax_id_status)] ?? null) : null,
        minDailyBudget: data.min_daily_budget,
        purchaseStats,
      },
    });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal menghubungi Meta API: ' + (error?.message || error) }, 500);
  }
});

const validateResultsPayload = z.object({
  token: z.string().min(1),
  actId: z.string().min(1),
  actionTypes: z.array(z.string()).min(1),
});

router.post('/validate-results', zValidator('json', validateResultsPayload), async (c) => {
  const { token, actId, actionTypes } = c.req.valid('json');
  const cleanActId = actId.trim().startsWith('act_') ? actId.trim().slice(4) : actId.trim();

  try {
    const url = new URL(`https://graph.facebook.com/v20.0/act_${cleanActId}/insights`);
    url.searchParams.set('fields', 'actions,action_values');
    url.searchParams.set('date_preset', 'last_30d');
    url.searchParams.set('level', 'account');
    url.searchParams.set('access_token', token);

    const res = await fetch(url.toString());
    const data: any = await res.json();

    if (data.error) {
      return c.json({
        success: false,
        message: data.error.message || 'Gagal ambil insights',
        error: data.error,
      });
    }

    const aggregated = new Map<string, { count: number; value: number }>();
    const rows: any[] = Array.isArray(data.data) ? data.data : [];
    for (const row of rows) {
      const actions: any[] = Array.isArray(row.actions) ? row.actions : [];
      const values: any[] = Array.isArray(row.action_values) ? row.action_values : [];
      const valueByType = new Map<string, number>();
      for (const v of values) {
        if (v?.action_type) valueByType.set(v.action_type, Number(v.value) || 0);
      }
      for (const a of actions) {
        if (!a?.action_type) continue;
        const prev = aggregated.get(a.action_type) ?? { count: 0, value: 0 };
        prev.count += Number(a.value) || 0;
        prev.value += valueByType.get(a.action_type) ?? 0;
        aggregated.set(a.action_type, prev);
      }
    }

    const results = actionTypes.map((t) => {
      const hit = aggregated.get(t);
      return {
        actionType: t,
        found: !!hit && hit.count > 0,
        count: hit?.count ?? 0,
        value: hit?.value ?? 0,
      };
    });

    const availableActionTypes = Array.from(aggregated.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([type, v]) => ({ actionType: type, count: v.count, value: v.value }));

    return c.json({
      success: true,
      data: {
        period: 'last_30d',
        hasInsights: rows.length > 0,
        results,
        availableActionTypes,
      },
    });
  } catch (error: any) {
    console.error(error);
    return c.json({ success: false, message: 'Gagal menghubungi Meta API: ' + (error?.message || error) }, 500);
  }
});

// ── Auto import: ambil daftar ad account dari token (me/adaccounts) ─────
const ACCOUNT_STATUS_MAP: Record<number, string> = {
  1: 'Aktif',
  2: 'Dinonaktifkan',
  3: 'Tagihan Belum Lunas',
  7: 'Menunggu Review Risiko',
  8: 'Menunggu Pelunasan',
  9: 'Masa Tenggang',
  100: 'Akan Ditutup',
  101: 'Ditutup',
  201: 'Aktif (Apapun)',
  202: 'Ditutup (Apapun)',
};

const discoverPayload = z
  .object({
    tokenId: z.coerce.number().int().optional(),
    token: z.string().min(1).optional(),
  })
  .refine((v) => v.tokenId != null || (v.token != null && v.token.length > 0), {
    message: 'tokenId atau token wajib diisi',
  });

router.post('/discover', zValidator('json', discoverPayload), async (c) => {
  const { tokenId, token: rawToken } = c.req.valid('json');

  let accessToken = rawToken ?? '';
  if (tokenId != null) {
    const tk = await db
      .select({ token: fbToken.token, status: fbToken.status })
      .from(fbToken)
      .where(eq(fbToken.id, tokenId))
      .limit(1);
    if (!tk[0]) return c.json({ success: false, message: 'Token tidak ditemukan' }, 404);
    accessToken = tk[0].token;
  }
  if (!accessToken) return c.json({ success: false, message: 'Token kosong' }, 400);

  try {
    const fields =
      'account_id,name,currency,account_status,disable_reason,balance,amount_spent,spend_cap,is_prepay_account,business{id,name}';
    let nextUrl: string | null = (() => {
      const u = new URL('https://graph.facebook.com/v20.0/me/adaccounts');
      u.searchParams.set('fields', fields);
      u.searchParams.set('limit', '200');
      u.searchParams.set('access_token', accessToken);
      return u.toString();
    })();

    const raw: any[] = [];
    let guard = 0;
    while (nextUrl && guard < 25) {
      guard++;
      const res = await fetch(nextUrl);
      const data: any = await res.json();
      if (data.error) {
        return c.json({
          success: false,
          message: data.error.message || 'Gagal ambil daftar akun',
          error: data.error,
        });
      }
      if (Array.isArray(data.data)) raw.push(...data.data);
      nextUrl = data.paging?.next ?? null;
    }

    // actId yang sudah ada di sistem (normalisasi: buang prefix act_)
    const existingRows = await db.select({ actId: fbAct.actId }).from(fbAct);
    const existing = new Set(
      existingRows.map((r) => String(r.actId ?? '').replace(/^act_/, '')),
    );

    const accounts = raw.map((a) => {
      const numericId = String(a.account_id ?? '').replace(/^act_/, '');
      const accountStatus = Number(a.account_status);
      return {
        actId: numericId,
        name: a.name ?? null,
        currency: a.currency ?? null,
        accountStatus,
        accountStatusLabel: ACCOUNT_STATUS_MAP[accountStatus] ?? `Status ${accountStatus}`,
        isActive: accountStatus === 1,
        balance: a.balance ?? null,
        amountSpent: a.amount_spent ?? null,
        spendCap: a.spend_cap ?? null,
        isPrepayAccount: a.is_prepay_account ?? null,
        business: a.business ? { id: a.business.id, name: a.business.name } : null,
        alreadyExists: existing.has(numericId),
      };
    });

    return c.json({
      success: true,
      data: {
        total: accounts.length,
        newCount: accounts.filter((a) => !a.alreadyExists).length,
        accounts,
      },
    });
  } catch (error: any) {
    console.error(error);
    return c.json(
      { success: false, message: 'Gagal menghubungi Meta API: ' + (error?.message || error) },
      500,
    );
  }
});

// ── Auto import: simpan banyak akun terpilih sekaligus ─────────────────
const bulkPayload = z.object({
  customerId: z.coerce.number().int(),
  subscriptionId: z.coerce.number().int(),
  tokenId: z.coerce.number().int().optional().nullable(),
  accounts: z
    .array(
      z.object({
        actId: z.string().min(1),
        actName: z.string().optional().nullable(),
        name: z.string().optional().nullable(),
      }),
    )
    .min(1),
});

router.post('/bulk', zValidator('json', bulkPayload), async (c) => {
  const payload = c.req.valid('json');

  const existingRows = await db.select({ actId: fbAct.actId }).from(fbAct);
  const existing = new Set(
    existingRows.map((r) => String(r.actId ?? '').replace(/^act_/, '')),
  );

  const seen = new Set<string>();
  const toInsert: (typeof fbAct.$inferInsert)[] = [];
  let skipped = 0;
  for (const a of payload.accounts) {
    const numericId = String(a.actId).replace(/^act_/, '').trim();
    if (!numericId) continue;
    if (existing.has(numericId) || seen.has(numericId)) {
      skipped++;
      continue;
    }
    seen.add(numericId);
    toInsert.push({
      customerId: payload.customerId,
      subscriptionId: payload.subscriptionId,
      tokenId: payload.tokenId ?? null,
      actId: numericId,
      actName: a.actName ?? null,
      name: a.name ?? a.actName ?? null,
      dataJson: null,
    });
  }

  if (!toInsert.length) {
    return c.json(
      { success: false, message: 'Tidak ada akun baru untuk ditambahkan', created: 0, skipped },
      400,
    );
  }

  try {
    await db.insert(fbAct).values(toInsert);
    return c.json({
      success: true,
      message: `${toInsert.length} akun ditambahkan${skipped ? `, ${skipped} dilewati (sudah ada)` : ''}`,
      created: toInsert.length,
      skipped,
    });
  } catch (error: any) {
    console.error(error);
    return c.json(
      { success: false, message: 'Gagal menambahkan akun: ' + (error?.message || error) },
      500,
    );
  }
});

export default router;
