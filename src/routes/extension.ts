import { Hono } from "hono";
import { createHash } from "crypto";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { requireAuthWithFallback, extractAuthInfo } from "../middleware/auth";
import { isManagementLevel } from "../utils/auth/permissions";

/**
 * Distribusi build extension `vbox-controller` ke VBOX.
 *
 * Sebelumnya VBOX menarik zip-nya dari GitHub Release `visualabs-id/v-box-extension`,
 * yang berarti sebuah PAT GitHub harus ikut ditanam di dalam aplikasi desktop.
 * Sekarang backend yang menyajikannya:
 *
 *   GET  /api/extension/manifest → metadata (version, sha256, size)
 *   GET  /api/extension/zip      → file .zip-nya
 *   POST /api/extension/upload   → unggah build baru (management level)
 *
 * VBOX download → verifikasi sha256 → ekstrak ke
 * `AppLocalData/extensions/vbox-controller`, lalu tiap launch profil menyalinnya
 * ke `<user-data-dir>/.vbox-extension`.
 *
 * Polanya sengaja meniru `hermes.ts` — manifest + berkas, dijaga JWT, nama file
 * diambil dari manifest (bukan dari query user) supaya tidak ada path traversal.
 * Bedanya, berkas dibaca lewat `fs/promises`, bukan `Bun.file`: zip-nya kecil
 * (dibatasi 20MB) sehingga streaming tidak diperlukan, dan route-nya jadi bisa
 * diuji di vitest yang jalan di Node — lihat tests/extension/extension-dist.test.ts.
 *
 * Bedanya dengan Hermes: source Hermes bisa di-`git archive` di server, sedangkan
 * extension harus di-build Plasmo lebih dulu dan repo `v-box` tidak ada di server.
 * Jadi arah alirannya dibalik — mesin build yang mengunggah lewat /upload
 * (`scripts/deploy-extension.js` di repo v-box).
 */

export const EXTENSION_DIST_DIR =
	process.env.EXTENSION_DIST_DIR || join(process.cwd(), "storage", "extension");

// Berapa zip lama yang disimpan. Ini satu-satunya jalan pulih kalau build rusak
// terlanjur tersebar: auto-update di VBOX jalan tanpa konfirmasi, jadi user tidak
// punya kesempatan menolak.
const KEEP = Number(process.env.EXTENSION_KEEP || 3);

const MAX_ZIP_BYTES = 20 * 1024 * 1024;
const FILE_PREFIX = "vbox_controller_v";

type ExtensionManifest = {
	version: string;
	filename: string;
	sha256: string;
	size: number;
	built_at: string;
};

try {
	mkdirSync(EXTENSION_DIST_DIR, { recursive: true });
} catch {
	// abaikan jika sudah ada
}

async function readManifest(): Promise<ExtensionManifest | null> {
	try {
		const raw = await readFile(join(EXTENSION_DIST_DIR, "manifest.json"), "utf8");
		return JSON.parse(raw) as ExtensionManifest;
	} catch {
		return null;
	}
}

/** Sisakan `KEEP` zip terbaru, buang sisanya. */
function pruneOldZips(keepFilename: string) {
	let entries: { name: string; mtime: number }[];
	try {
		entries = readdirSync(EXTENSION_DIST_DIR)
			.filter((n) => n.startsWith(FILE_PREFIX) && n.endsWith(".zip"))
			.map((name) => ({
				name,
				mtime: statSync(join(EXTENSION_DIST_DIR, name)).mtimeMs,
			}))
			.sort((a, b) => b.mtime - a.mtime);
	} catch {
		return;
	}

	for (const e of entries.slice(KEEP)) {
		if (e.name === keepFilename) continue;
		try {
			unlinkSync(join(EXTENSION_DIST_DIR, e.name));
		} catch {
			// biarkan — file sisa tidak merusak apa pun
		}
	}
}

const router = new Hono();

// GET /api/extension/manifest — versi terbaru yang tersedia.
// VBOX pakai ini untuk membandingkan dengan versi terpasang di disk.
router.get("/manifest", requireAuthWithFallback, async (c) => {
	const manifest = await readManifest();
	if (!manifest) {
		return c.json(
			{
				success: false,
				message:
					"Build extension belum tersedia. Unggah lewat `node scripts/deploy-extension.js` di repo v-box.",
			},
			503,
		);
	}
	return c.json({ success: true, data: manifest });
});

// GET /api/extension/zip — stream file zip-nya.
router.get("/zip", requireAuthWithFallback, async (c) => {
	const manifest = await readManifest();
	if (!manifest) {
		return c.json({ success: false, message: "Build extension belum tersedia" }, 503);
	}

	let bytes: Buffer;
	try {
		bytes = await readFile(join(EXTENSION_DIST_DIR, manifest.filename));
	} catch {
		return c.json(
			{
				success: false,
				message: `manifest.json menunjuk ${manifest.filename} tapi filenya tidak ada di disk`,
			},
			503,
		);
	}

	return new Response(bytes, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Length": String(manifest.size),
			"Content-Disposition": `attachment; filename="${manifest.filename}"`,
			// Nama file mengandung versi, jadi isinya tidak pernah berubah.
			"Cache-Control": "private, max-age=31536000, immutable",
			"X-Extension-Sha256": manifest.sha256,
			"X-Extension-Version": manifest.version,
		},
	});
});

// POST /api/extension/upload — unggah build baru. FormData: `file` (.zip), `version`.
//
// Dibatasi management level: endpoint ini mengirim kode ke Chrome semua user
// tanpa konfirmasi, jadi bukan sesuatu yang boleh dilakukan sembarang staff.
router.post("/upload", requireAuthWithFallback, async (c) => {
	const auth = await extractAuthInfo(c.req.header("Authorization"));
	if (!auth.isAdmin || !isManagementLevel(auth.role)) {
		return c.json({ success: false, message: "Akses ditolak" }, 403);
	}

	let form: FormData;
	try {
		form = await c.req.formData();
	} catch {
		return c.json({ success: false, message: "Body harus multipart/form-data" }, 400);
	}

	const file = form.get("file");
	if (!(file instanceof File)) {
		return c.json({ success: false, message: "Field 'file' wajib diisi" }, 400);
	}
	if (file.size <= 0) {
		return c.json({ success: false, message: "File kosong" }, 400);
	}
	if (file.size > MAX_ZIP_BYTES) {
		return c.json({ success: false, message: "Ukuran file maksimal 20MB" }, 413);
	}

	// Versi ikut jadi nama file, jadi divalidasi ketat — bukan sekadar sanitasi.
	const version = String(form.get("version") || "").trim();
	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		return c.json(
			{ success: false, message: "Field 'version' harus semver, contoh 1.0.17" },
			400,
		);
	}

	const bytes = Buffer.from(await file.arrayBuffer());

	// Zip yang valid selalu diawali "PK". Tanpa cek ini, sebuah unggahan salah
	// berujung pada extension rusak yang terpasang senyap di semua mesin.
	if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
		return c.json({ success: false, message: "File bukan arsip .zip yang valid" }, 415);
	}

	const filename = `${FILE_PREFIX}${version}.zip`;
	await writeFile(join(EXTENSION_DIST_DIR, filename), bytes);

	const manifest: ExtensionManifest = {
		version,
		filename,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		size: bytes.length,
		built_at: new Date().toISOString(),
	};
	await writeFile(
		join(EXTENSION_DIST_DIR, "manifest.json"),
		JSON.stringify(manifest, null, 2) + "\n",
	);

	pruneOldZips(filename);

	return c.json({ success: true, data: manifest });
});

export default router;
