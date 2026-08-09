import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";

import { db } from "../db/client";
import { profiles, teamSkillRatings, teamSkillUsage, teamSkills, users } from "../db/schema";
import { requireAuth, type JwtPayload } from "../middleware/auth";

/**
 * Team Skill Hub — registry skill Hermes milik tim.
 *
 * Skill hidup sebagai SKILL.md di ~/.hermes/skills/ pada laptop masing-masing
 * orang. Route ini TIDAK pernah menyentuh mesin siapa pun: yang mengambil dan
 * memasang skill adalah frontend lewat relay (/api/relay/skills/:nodeId/...).
 * Di sini murni penyimpanan + peringkat.
 *
 * Endpoint (di balik basePath "/api"):
 *   GET    /api/team-skills                  daftar + cari + urut
 *   GET    /api/team-skills/:id              detail + isi SKILL.md
 *   POST   /api/team-skills                  unggah skill baru
 *   PUT    /api/team-skills/:id              perbarui (penulis / management)
 *   DELETE /api/team-skills/:id              arsipkan (soft)
 *   POST   /api/team-skills/:id/rating       beri / ubah rating
 *   GET    /api/team-skills/:id/ratings      daftar rating + komentar
 *   POST   /api/team-skills/:id/installed    tandai terpasang → install_count++
 *   POST   /api/team-skills/usage/report     laporan usage massal dari node
 *
 * Lihat docs/plan-hermes/manage-skill.md.
 */

const router = new Hono();

router.use("*", requireAuth);

// ─── Konstanta ────────────────────────────────────────────────────────────

// Cocokkan dengan MAX_SKILL_CONTENT_CHARS di custom-hermes
// (tools/skill_manager_tool.py). Kalau di sini lebih longgar, skill lolos ke
// registry lalu ditolak Hermes saat dipasang — gagalnya baru ketahuan di mesin
// orang lain, bukan di sini.
const MAX_SKILL_CONTENT_CHARS = 100_000;

// Nama skill jadi nama direktori di mesin orang lain. Ketat, bukan sekadar
// "tanpa spasi".
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

// ─── Helper ───────────────────────────────────────────────────────────────

function authUserId(c: any): number | null {
    const payload = c.get("jwtPayload") as JwtPayload | undefined;
    const id = Number(payload?.sub);
    return Number.isFinite(id) && id > 0 ? id : null;
}

/** Dev / Admin / Owner boleh mengubah skill milik siapa pun. */
function isManagement(c: any): boolean {
    const payload = c.get("jwtPayload") as JwtPayload | undefined;
    let role: unknown = payload?.rol;
    if (typeof role === "string") {
        try {
            role = JSON.parse(role);
        } catch {
            return false;
        }
    }
    const n = Number(role);
    return n === 1 || n === 2 || n === 3;
}

async function sha256(text: string): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

type Frontmatter = {
    name?: string;
    description?: string;
    version?: string;
    tags?: string[];
};

/**
 * Ambil field yang kita pedulikan dari frontmatter YAML di kepala SKILL.md.
 *
 * Sengaja parser kecil, bukan pustaka YAML: yang dibutuhkan cuma empat field
 * skalar dari blok paling atas, dan menarik dependensi YAML ke backend hanya
 * untuk ini tidak sepadan. Yang tidak terbaca dibiarkan undefined — Hermes
 * tetap jadi validator terakhir saat skill dipasang.
 */
function parseFrontmatter(content: string): Frontmatter | null {
    if (!content.startsWith("---")) return null;
    const end = content.indexOf("\n---", 3);
    if (end === -1) return null;
    const block = content.slice(3, end);

    const out: Frontmatter = {};
    const scalar = (key: string): string | undefined => {
        const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
        if (!m) return undefined;
        return m[1].trim().replace(/^["']|["']$/g, "") || undefined;
    };

    out.name = scalar("name");
    out.description = scalar("description");
    out.version = scalar("version");

    // tags ada di dalam metadata.hermes.tags, ditulis inline: [a, b, c]
    const tagsMatch = block.match(/^\s*tags:\s*\[(.*?)\]\s*$/m);
    if (tagsMatch) {
        out.tags = tagsMatch[1]
            .split(",")
            .map((t) => t.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean)
            .slice(0, 20);
    }

    return out;
}

/** Hitung ulang rating_avg / rating_count dari tabel rating. */
async function recalcRating(tx: any, skillId: number): Promise<void> {
    const [agg] = await tx
        .select({
            avg: sql<string>`COALESCE(AVG(${teamSkillRatings.rating}), 0)`,
            count: sql<number>`COUNT(*)`,
        })
        .from(teamSkillRatings)
        .where(eq(teamSkillRatings.skillId, skillId));

    await tx
        .update(teamSkills)
        .set({
            ratingAvg: Number(agg?.avg ?? 0).toFixed(2),
            ratingCount: Number(agg?.count ?? 0),
        })
        .where(eq(teamSkills.id, skillId));
}

// ─── Skema validasi ───────────────────────────────────────────────────────

const listQuery = z.object({
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(100).optional(),
    sort: z.enum(["rating", "usage", "installs", "recent"]).optional().default("recent"),
    includeArchived: z
        .enum(["0", "1", "true", "false"])
        .optional()
        .transform((v) => v === "1" || v === "true"),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

const createBody = z.object({
    name: z.string().trim().regex(SKILL_NAME_RE, "Nama skill hanya boleh huruf kecil, angka, dan tanda hubung (2–64 karakter)"),
    category: z.string().trim().max(100).nullable().optional(),
    content: z.string().min(1).max(MAX_SKILL_CONTENT_CHARS),
});

const updateBody = z.object({
    content: z.string().min(1).max(MAX_SKILL_CONTENT_CHARS),
    category: z.string().trim().max(100).nullable().optional(),
});

const ratingBody = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).nullable().optional(),
});

const usageReportBody = z.object({
    items: z
        .array(
            z.object({
                name: z.string().trim().max(150),
                useCount: z.number().int().min(0).max(1_000_000).optional().default(0),
                viewCount: z.number().int().min(0).max(1_000_000).optional().default(0),
                patchCount: z.number().int().min(0).max(1_000_000).optional().default(0),
                lastUsedAt: z.string().datetime().nullable().optional(),
            })
        )
        .max(500),
});

// ─── Daftar ───────────────────────────────────────────────────────────────

router.get("/", zValidator("query", listQuery), async (c) => {
    const { q, category, sort, includeArchived } = c.req.valid("query");

    const filters = [];
    if (!includeArchived) filters.push(eq(teamSkills.status, "published"));
    if (category) filters.push(eq(teamSkills.category, category));
    if (q) {
        filters.push(
            or(like(teamSkills.name, `%${q}%`), like(teamSkills.description, `%${q}%`))!
        );
    }

    // usage total lintas anggota — dijumlahkan di SQL supaya tidak perlu
    // menarik seluruh baris usage ke aplikasi.
    const usageTotal = sql<number>`(
        SELECT COALESCE(SUM(${teamSkillUsage.useCount}), 0)
        FROM ${teamSkillUsage} WHERE ${teamSkillUsage.skillId} = ${teamSkills.id}
    )`;
    const userCount = sql<number>`(
        SELECT COUNT(*) FROM ${teamSkillUsage} WHERE ${teamSkillUsage.skillId} = ${teamSkills.id}
    )`;

    const orderBy =
        sort === "rating"
            ? [desc(teamSkills.ratingAvg), desc(teamSkills.ratingCount)]
            : sort === "usage"
              ? [desc(usageTotal)]
              : sort === "installs"
                ? [desc(teamSkills.installCount)]
                : [desc(teamSkills.updatedAt)];

    const rows = await db
        .select({
            id: teamSkills.id,
            name: teamSkills.name,
            category: teamSkills.category,
            description: teamSkills.description,
            version: teamSkills.version,
            tags: teamSkills.tags,
            contentHash: teamSkills.contentHash,
            status: teamSkills.status,
            installCount: teamSkills.installCount,
            ratingAvg: teamSkills.ratingAvg,
            ratingCount: teamSkills.ratingCount,
            authorUserId: teamSkills.authorUserId,
            authorName: sql<string>`COALESCE(${profiles.name}, ${users.username}, CONCAT('User ', ${users.id}))`,
            usageTotal,
            usedByCount: userCount,
            createdAt: teamSkills.createdAt,
            updatedAt: teamSkills.updatedAt,
        })
        .from(teamSkills)
        .leftJoin(users, eq(users.id, teamSkills.authorUserId))
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(...orderBy)
        .limit(200);

    return c.json({ success: true, data: rows });
});

// ─── Detail ───────────────────────────────────────────────────────────────

router.get("/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const userId = authUserId(c);

    const [row] = await db
        .select({
            id: teamSkills.id,
            name: teamSkills.name,
            category: teamSkills.category,
            description: teamSkills.description,
            version: teamSkills.version,
            tags: teamSkills.tags,
            content: teamSkills.content,
            contentHash: teamSkills.contentHash,
            status: teamSkills.status,
            installCount: teamSkills.installCount,
            ratingAvg: teamSkills.ratingAvg,
            ratingCount: teamSkills.ratingCount,
            authorUserId: teamSkills.authorUserId,
            authorName: sql<string>`COALESCE(${profiles.name}, ${users.username}, CONCAT('User ', ${users.id}))`,
            createdAt: teamSkills.createdAt,
            updatedAt: teamSkills.updatedAt,
        })
        .from(teamSkills)
        .leftJoin(users, eq(users.id, teamSkills.authorUserId))
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .where(eq(teamSkills.id, id))
        .limit(1);

    if (!row) return c.json({ success: false, message: "Skill tidak ditemukan" }, 404);

    // Rating milik user ini + apakah dia sudah pernah memasang (menentukan
    // boleh/tidaknya memberi rating — lihat plan §6.4).
    let myRating: { rating: number; comment: string | null } | null = null;
    let hasInstalled = false;
    if (userId) {
        const [r] = await db
            .select({ rating: teamSkillRatings.rating, comment: teamSkillRatings.comment })
            .from(teamSkillRatings)
            .where(and(eq(teamSkillRatings.skillId, id), eq(teamSkillRatings.userId, userId)))
            .limit(1);
        myRating = r ?? null;

        const [u] = await db
            .select({ id: teamSkillUsage.id })
            .from(teamSkillUsage)
            .where(and(eq(teamSkillUsage.skillId, id), eq(teamSkillUsage.userId, userId)))
            .limit(1);
        hasInstalled = !!u;
    }

    return c.json({
        success: true,
        data: { ...row, myRating, hasInstalled, canEdit: userId === row.authorUserId || isManagement(c) },
    });
});

// ─── Unggah ───────────────────────────────────────────────────────────────

router.post("/", zValidator("json", createBody), async (c) => {
    const userId = authUserId(c);
    if (!userId) return c.json({ success: false, message: "Tidak terautentikasi" }, 401);

    const { name, category, content } = c.req.valid("json");

    const fm = parseFrontmatter(content);
    if (!fm) {
        return c.json(
            {
                success: false,
                message:
                    "SKILL.md tidak punya frontmatter YAML di bagian atas. Skill wajib diawali blok --- ... ---.",
            },
            400
        );
    }
    if (!fm.name) {
        return c.json({ success: false, message: "Frontmatter tidak memuat field `name`." }, 400);
    }
    // Nama di frontmatter yang dipakai Hermes saat memasang; kalau beda dengan
    // nama di registry, skill akan mendarat dengan nama lain di mesin orang.
    if (fm.name !== name) {
        return c.json(
            {
                success: false,
                message: `Nama di frontmatter ("${fm.name}") berbeda dengan nama skill ("${name}").`,
            },
            400
        );
    }

    const [existing] = await db
        .select({ id: teamSkills.id })
        .from(teamSkills)
        .where(eq(teamSkills.name, name))
        .limit(1);
    if (existing) {
        return c.json(
            {
                success: false,
                message: `Skill bernama "${name}" sudah ada di Team Hub. Perbarui yang itu, atau ganti namanya.`,
            },
            409
        );
    }

    const [res] = await db.insert(teamSkills).values({
        name,
        category: category ?? null,
        description: fm.description ?? null,
        version: fm.version ?? null,
        tags: fm.tags ?? [],
        content,
        contentHash: await sha256(content),
        authorUserId: userId,
    });

    return c.json({ success: true, data: { id: (res as any).insertId } }, 201);
});

// ─── Perbarui ─────────────────────────────────────────────────────────────

router.put("/:id", zValidator("param", idParam), zValidator("json", updateBody), async (c) => {
    const userId = authUserId(c);
    if (!userId) return c.json({ success: false, message: "Tidak terautentikasi" }, 401);

    const { id } = c.req.valid("param");
    const { content, category } = c.req.valid("json");

    const [row] = await db
        .select({ id: teamSkills.id, name: teamSkills.name, authorUserId: teamSkills.authorUserId })
        .from(teamSkills)
        .where(eq(teamSkills.id, id))
        .limit(1);
    if (!row) return c.json({ success: false, message: "Skill tidak ditemukan" }, 404);
    if (row.authorUserId !== userId && !isManagement(c)) {
        return c.json({ success: false, message: "Hanya pengunggah yang boleh mengubah skill ini" }, 403);
    }

    const fm = parseFrontmatter(content);
    if (!fm?.name) {
        return c.json({ success: false, message: "SKILL.md tidak punya frontmatter dengan field `name`." }, 400);
    }
    // Nama tidak boleh berubah lewat edit: nama adalah kunci unik registry DAN
    // nama direktori pada setiap mesin yang sudah memasangnya.
    if (fm.name !== row.name) {
        return c.json(
            {
                success: false,
                message: `Nama skill tidak bisa diubah lewat edit (registry: "${row.name}", frontmatter: "${fm.name}").`,
            },
            400
        );
    }

    await db
        .update(teamSkills)
        .set({
            content,
            contentHash: await sha256(content),
            description: fm.description ?? null,
            version: fm.version ?? null,
            tags: fm.tags ?? [],
            ...(category !== undefined ? { category: category ?? null } : {}),
        })
        .where(eq(teamSkills.id, id));

    return c.json({ success: true });
});

// ─── Arsipkan ─────────────────────────────────────────────────────────────

router.delete("/:id", zValidator("param", idParam), async (c) => {
    const userId = authUserId(c);
    if (!userId) return c.json({ success: false, message: "Tidak terautentikasi" }, 401);

    const { id } = c.req.valid("param");
    const [row] = await db
        .select({ authorUserId: teamSkills.authorUserId })
        .from(teamSkills)
        .where(eq(teamSkills.id, id))
        .limit(1);
    if (!row) return c.json({ success: false, message: "Skill tidak ditemukan" }, 404);
    if (row.authorUserId !== userId && !isManagement(c)) {
        return c.json({ success: false, message: "Hanya pengunggah yang boleh mengarsipkan skill ini" }, 403);
    }

    // Soft delete: rating dan riwayat usage ikut hilang kalau barisnya dibuang.
    await db.update(teamSkills).set({ status: "archived" }).where(eq(teamSkills.id, id));
    return c.json({ success: true });
});

// ─── Rating ───────────────────────────────────────────────────────────────

router.post("/:id/rating", zValidator("param", idParam), zValidator("json", ratingBody), async (c) => {
    const userId = authUserId(c);
    if (!userId) return c.json({ success: false, message: "Tidak terautentikasi" }, 401);

    const { id } = c.req.valid("param");
    const { rating, comment } = c.req.valid("json");

    const [skill] = await db
        .select({ id: teamSkills.id })
        .from(teamSkills)
        .where(eq(teamSkills.id, id))
        .limit(1);
    if (!skill) return c.json({ success: false, message: "Skill tidak ditemukan" }, 404);

    // Hanya yang pernah memasang boleh menilai — tanpa ini rating jadi opini
    // tanpa pengalaman dan sinyal "skill terbaik" kehilangan arti.
    const [used] = await db
        .select({ id: teamSkillUsage.id })
        .from(teamSkillUsage)
        .where(and(eq(teamSkillUsage.skillId, id), eq(teamSkillUsage.userId, userId)))
        .limit(1);
    if (!used) {
        return c.json(
            { success: false, message: "Pasang dan coba dulu skill ini sebelum memberi rating." },
            403
        );
    }

    await db.transaction(async (tx) => {
        await tx
            .insert(teamSkillRatings)
            .values({ skillId: id, userId, rating, comment: comment ?? null })
            .onDuplicateKeyUpdate({ set: { rating, comment: comment ?? null } });
        await recalcRating(tx, id);
    });

    return c.json({ success: true });
});

router.get("/:id/ratings", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const rows = await db
        .select({
            rating: teamSkillRatings.rating,
            comment: teamSkillRatings.comment,
            updatedAt: teamSkillRatings.updatedAt,
            userName: sql<string>`COALESCE(${profiles.name}, ${users.username}, CONCAT('User ', ${users.id}))`,
        })
        .from(teamSkillRatings)
        .leftJoin(users, eq(users.id, teamSkillRatings.userId))
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .where(eq(teamSkillRatings.skillId, id))
        .orderBy(desc(teamSkillRatings.updatedAt))
        .limit(100);

    return c.json({ success: true, data: rows });
});

// ─── Tandai terpasang ─────────────────────────────────────────────────────

router.post("/:id/installed", zValidator("param", idParam), async (c) => {
    const userId = authUserId(c);
    if (!userId) return c.json({ success: false, message: "Tidak terautentikasi" }, 401);

    const { id } = c.req.valid("param");
    const [skill] = await db
        .select({ id: teamSkills.id })
        .from(teamSkills)
        .where(eq(teamSkills.id, id))
        .limit(1);
    if (!skill) return c.json({ success: false, message: "Skill tidak ditemukan" }, 404);

    await db.transaction(async (tx) => {
        // Baris usage dibuat kosong di sini supaya (a) install_count naik sekali
        // per orang, dan (b) user langsung berhak memberi rating. Angkanya diisi
        // belakangan lewat /usage/report.
        const [existing] = await tx
            .select({ id: teamSkillUsage.id })
            .from(teamSkillUsage)
            .where(and(eq(teamSkillUsage.skillId, id), eq(teamSkillUsage.userId, userId)))
            .limit(1);

        if (!existing) {
            await tx.insert(teamSkillUsage).values({ skillId: id, userId });
            await tx
                .update(teamSkills)
                .set({ installCount: sql`${teamSkills.installCount} + 1` })
                .where(eq(teamSkills.id, id));
        }
    });

    return c.json({ success: true });
});

// ─── Laporan usage ────────────────────────────────────────────────────────

router.post("/usage/report", zValidator("json", usageReportBody), async (c) => {
    const userId = authUserId(c);
    if (!userId) return c.json({ success: false, message: "Tidak terautentikasi" }, 401);

    const { items } = c.req.valid("json");
    if (!items.length) return c.json({ success: true, data: { matched: 0 } });

    // Cocokkan nama ke registry; yang tidak dikenal diabaikan diam-diam —
    // daftar skill lokal user memang berisi banyak skill yang bukan dari hub.
    const names = [...new Set(items.map((i) => i.name))];
    const known = await db
        .select({ id: teamSkills.id, name: teamSkills.name })
        .from(teamSkills)
        .where(inArray(teamSkills.name, names));
    if (!known.length) return c.json({ success: true, data: { matched: 0 } });

    const idByName = new Map(known.map((k) => [k.name, k.id]));

    for (const item of items) {
        const skillId = idByName.get(item.name);
        if (!skillId) continue;

        // UPSERT, bukan increment: .usage.json menyimpan total kumulatif, jadi
        // menambahkannya akan menggandakan angka setiap laporan masuk.
        const lastUsedAt = item.lastUsedAt ? new Date(item.lastUsedAt) : null;
        await db
            .insert(teamSkillUsage)
            .values({
                skillId,
                userId,
                useCount: item.useCount,
                viewCount: item.viewCount,
                patchCount: item.patchCount,
                lastUsedAt,
            })
            .onDuplicateKeyUpdate({
                set: {
                    useCount: item.useCount,
                    viewCount: item.viewCount,
                    patchCount: item.patchCount,
                    lastUsedAt,
                },
            });
    }

    return c.json({ success: true, data: { matched: idByName.size } });
});

export default router;
