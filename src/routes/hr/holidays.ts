import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, between, eq, SQL } from "drizzle-orm";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "../../db/client";
import { holidays } from "../../db/schema";
import { requireAuth } from "../../middleware/auth";
import { requireHR, getHrUserId } from "../../middleware/hrAccess";
import { jsonBody } from "../../utils/zod";

const router = new Hono();
router.use("*", requireAuth, requireHR);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  year: z.coerce.number().int().optional(),
});

router.get("/", zValidator("query", listQuery), async (c) => {
  const { from, to, year } = c.req.valid("query");
  const filters: SQL[] = [];
  if (from && to) filters.push(between(holidays.date, from, to));
  else if (year) filters.push(between(holidays.date, `${year}-01-01`, `${year}-12-31`));

  const items = await db
    .select()
    .from(holidays)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(holidays.date));
  return c.json({ success: true, data: items });
});

const payload = z.object({
  date: dateStr,
  name: z.string().min(1),
  type: z.coerce.number().int().min(0).max(2).default(0),
  isRecurring: z.coerce.number().int().min(0).max(1).default(0),
  notes: z.string().optional(),
});

router.post("/", zValidator("json", jsonBody(payload)), async (c) => {
  const p = c.req.valid("json");
  try {
    const [res] = await db.insert(holidays).values({
      date: p.date,
      name: p.name,
      type: p.type,
      isRecurring: p.isRecurring,
      notes: p.notes ?? null,
    });
    const [row] = await db.select().from(holidays).where(eq(holidays.id, res.insertId)).limit(1);
    return c.json({ success: true, data: row }, 201);
  } catch (e: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((e as any)?.code === "ER_DUP_ENTRY") {
      return c.json({ success: false, message: "Tanggal & nama libur sudah ada" }, 409);
    }
    throw e;
  }
});

router.put("/:id", zValidator("json", jsonBody(payload.partial())), async (c) => {
  const id = Number(c.req.param("id"));
  const p = c.req.valid("json");
  const setValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) setValues[k] = v;
  if (Object.keys(setValues).length) {
    await db
      .update(holidays)
      .set(setValues)
      .where(eq(holidays.id, id));
  }
  const [row] = await db.select().from(holidays).where(eq(holidays.id, id)).limit(1);
  return c.json({ success: true, data: row });
});

router.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db
    .delete(holidays)
    .where(eq(holidays.id, id));
  return c.json({ success: true });
});

// ============================================================
// /preview — fetch dari libur.deno.dev, kompare dengan existing
// Query: ?scope=month|nextMonth|restOfYear|year&year=YYYY
// ============================================================
const previewQuery = z.object({
  scope: z.enum(["month", "nextMonth", "restOfYear", "year"]).default("year"),
  year: z.coerce.number().int().optional(),
});

type ExternalHoliday = {
  tanggal?: string;
  date?: string;
  keterangan?: string;
  nama?: string;
  name?: string;
  is_national_holiday?: boolean;
  is_cuti?: boolean;
  is_cuti_bersama?: boolean;
};

// ============================================================
// File-based cache untuk libur.deno.dev (persisten across restart)
// Per-year JSON di `cache/holidays/<year>.json`.
// TTL 12 jam. Stale fallback kalau API down.
// ============================================================
type CacheEntry = { data: ExternalHoliday[]; fetchedAt: number };
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam
const CACHE_DIR = path.resolve(
  process.env.CACHE_DIR ?? path.join(process.cwd(), "cache"),
  "holidays",
);

// Dedupe concurrent requests untuk year yang sama
const inFlightFetches = new Map<number, Promise<ExternalHoliday[]>>();

function cachePath(year: number): string {
  return path.join(CACHE_DIR, `${year}.json`);
}

async function readCache(year: number): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(cachePath(year), "utf-8");
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.data || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(year: number, data: ExternalHoliday[]): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const entry: CacheEntry = { data, fetchedAt: Date.now() };
    await writeFile(cachePath(year), JSON.stringify(entry), "utf-8");
  } catch (e) {
    console.warn(`[holidays] gagal menulis cache: ${(e as Error).message}`);
  }
}

async function fetchExternalHolidays(
  year: number,
): Promise<{ data: ExternalHoliday[]; stale: boolean; source: string }> {
  const cached = await readCache(year);
  const now = Date.now();

  // Hit fresh cache
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return { data: cached.data, stale: false, source: "libur.deno.dev (file cache)" };
  }

  // Dedupe in-flight
  let promise = inFlightFetches.get(year);
  if (!promise) {
    promise = (async () => {
      const res = await fetch(`https://libur.deno.dev/api?year=${year}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ExternalHoliday[];
      if (!Array.isArray(data)) throw new Error("Format response tidak dikenali");
      await writeCache(year, data);
      return data;
    })();
    inFlightFetches.set(year, promise);
    promise.finally(() => inFlightFetches.delete(year));
  }

  try {
    const data = await promise;
    return { data, stale: false, source: "libur.deno.dev" };
  } catch (e) {
    // Fallback ke stale cache kalau ada
    if (cached) {
      console.warn(
        `[holidays] fetch failed (${(e as Error).message}), fallback to stale cache for year=${year}`,
      );
      return { data: cached.data, stale: true, source: "libur.deno.dev (stale file cache)" };
    }
    throw e;
  }
}

router.get("/preview", zValidator("query", previewQuery), async (c) => {
  const { scope } = c.req.valid("query");
  const year = c.req.valid("query").year ?? new Date().getFullYear();

  // Fetch dari libur.deno.dev (with cache + stale fallback)
  let externalRows: ExternalHoliday[] = [];
  let dataStale = false;
  let dataSource = "libur.deno.dev";
  try {
    const fetched = await fetchExternalHolidays(year);
    externalRows = fetched.data;
    dataStale = fetched.stale;
    dataSource = fetched.source;
  } catch (e) {
    return c.json(
      {
        success: false,
        message: `Gagal fetch dari libur.deno.dev: ${(e as Error).message}`,
      },
      502,
    );
  }

  // Normalize & filter by scope
  const now = new Date();
  const currentMonth = now.getMonth();
  const isCurrentYear = year === now.getFullYear();

  type NormalRow = { date: string; name: string; type: number };
  const normalized: NormalRow[] = [];
  for (const r of externalRows) {
    const dateRaw = r.tanggal ?? r.date;
    const name = r.keterangan ?? r.nama ?? r.name;
    if (!dateRaw || !name) continue;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateRaw);
    if (!m) continue;
    const monthIdx = Number(m[2]) - 1;

    // Scope filter
    if (scope === "month" && isCurrentYear) {
      if (monthIdx !== currentMonth) continue;
    } else if (scope === "nextMonth" && isCurrentYear) {
      if (monthIdx !== (currentMonth + 1) % 12) continue;
    } else if (scope === "restOfYear" && isCurrentYear) {
      if (monthIdx < currentMonth) continue;
    }
    // libur.deno.dev: is_national_holiday=true → libur nasional (0), false → cuti bersama (1)
    // Fallback ke is_cuti / is_cuti_bersama untuk kompatibilitas
    const isCuti =
      r.is_national_holiday === false ||
      !!r.is_cuti ||
      !!r.is_cuti_bersama;
    normalized.push({
      date: `${m[1]}-${m[2]}-${m[3]}`,
      name: name.trim(),
      type: isCuti ? 1 : 0,
    });
  }

  // Check existing
  const dates = normalized.map((n) => n.date);
  let existing: { date: string; name: string }[] = [];
  if (dates.length > 0) {
    const rows = await db
      .select({ date: holidays.date, name: holidays.name })
      .from(holidays);
    existing = rows;
  }
  const existingSet = new Set(existing.map((e) => `${e.date}::${e.name}`));

  const enriched = normalized.map((n) => ({
    ...n,
    alreadyExists: existingSet.has(`${n.date}::${n.name}`),
  }));

  return c.json({
    success: true,
    data: {
      year,
      scope,
      source: dataSource,
      stale: dataStale,
      items: enriched,
      totalAvailable: enriched.length,
      newCount: enriched.filter((x) => !x.alreadyExists).length,
    },
  });
});

// Bulk import standar libur nasional Indonesia
const bulkPayload = z.object({
  items: z
    .array(
      z.object({
        date: dateStr,
        name: z.string().min(1),
        type: z.coerce.number().int().min(0).max(2).default(0),
        isRecurring: z.coerce.number().int().min(0).max(1).default(0),
      }),
    )
    .min(1),
});

router.post("/bulk", zValidator("json", jsonBody(bulkPayload)), async (c) => {
  const { items } = c.req.valid("json");
  let inserted = 0;
  for (const it of items) {
    try {
      await db.insert(holidays).values({
        date: it.date,
        name: it.name,
        type: it.type,
        isRecurring: it.isRecurring,
      });
      inserted++;
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any)?.code !== "ER_DUP_ENTRY") throw e;
    }
  }
  return c.json({ success: true, data: { inserted, total: items.length } });
});

export default router;
