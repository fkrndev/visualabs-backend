import { Hono } from "hono";
import { join } from "path";
import { requireAuthWithFallback } from "../middleware/auth";

/**
 * Distribusi source Hermes Agent ke VBOX.
 *
 * Repo `visualabs-id/custom-hermes` private, jadi VBOX tidak bisa `git clone`
 * dari mesin user. Backend yang menyajikan source-nya sebagai tarball:
 *
 *   GET /api/hermes/manifest  → metadata (commit, sha256, size)
 *   GET /api/hermes/tarball   → file .tar.gz-nya
 *
 * VBOX download → verifikasi sha256 → extract ke `$HERMES_HOME/hermes-agent`
 * → jalankan `scripts/install.sh` per-stage (stage `repository` di-skip karena
 * source sudah ada di disk).
 *
 * Tarball dibuat lewat `bun run scripts/pack-hermes.ts` — lihat script itu.
 * Dua-duanya butuh JWT: source ini private, jangan sampai bisa diambil publik.
 */

export const HERMES_DIST_DIR =
	process.env.HERMES_DIST_DIR || join(process.cwd(), "storage", "hermes");

type HermesManifest = {
	commit: string;
	short_commit: string;
	filename: string;
	sha256: string;
	size: number;
	committed_at: string;
	built_at: string;
};

async function readManifest(): Promise<HermesManifest | null> {
	const f = Bun.file(join(HERMES_DIST_DIR, "manifest.json"));
	if (!(await f.exists())) return null;
	try {
		return (await f.json()) as HermesManifest;
	} catch {
		return null;
	}
}

const router = new Hono();

// GET /api/hermes/manifest — metadata build terbaru.
// VBOX pakai ini untuk tahu versi apa yang tersedia + sha256 buat verifikasi,
// dan untuk mendeteksi apakah install lokal sudah ketinggalan.
router.get("/manifest", requireAuthWithFallback, async (c) => {
	const manifest = await readManifest();
	if (!manifest) {
		return c.json(
			{
				success: false,
				message:
					"Tarball Hermes belum tersedia. Jalankan `bun run scripts/pack-hermes.ts` di server.",
			},
			503,
		);
	}
	return c.json({ success: true, data: manifest });
});

// GET /api/hermes/tarball — stream file tarball-nya.
// Nama file diambil dari manifest (bukan dari query user) supaya tidak ada
// celah path traversal.
router.get("/tarball", requireAuthWithFallback, async (c) => {
	const manifest = await readManifest();
	if (!manifest) {
		return c.json({ success: false, message: "Tarball Hermes belum tersedia" }, 503);
	}

	const file = Bun.file(join(HERMES_DIST_DIR, manifest.filename));
	if (!(await file.exists())) {
		return c.json(
			{
				success: false,
				message: `manifest.json menunjuk ${manifest.filename} tapi filenya tidak ada di disk`,
			},
			503,
		);
	}

	return new Response(file, {
		headers: {
			"Content-Type": "application/gzip",
			"Content-Length": String(manifest.size),
			"Content-Disposition": `attachment; filename="${manifest.filename}"`,
			// Tarball diberi nama per-commit, jadi isinya tidak pernah berubah.
			"Cache-Control": "private, max-age=31536000, immutable",
			"X-Hermes-Sha256": manifest.sha256,
			"X-Hermes-Commit": manifest.commit,
		},
	});
});

// GET /api/hermes/config — konfigurasi yang ditulis VBOX ke $HERMES_HOME
// setelah install selesai.
//
// Stage `setup` milik install.sh butuh input interaktif, jadi VBOX melewatinya
// dan menulis config sendiri dari sini. API key sengaja datang dari env server
// (bukan ditanam di skrip atau di binary VBOX) supaya bisa dirotasi tanpa rilis
// ulang, dan supaya tidak ikut ter-commit seperti di `install-team.ps1`.
router.get("/config", requireAuthWithFallback, async (c) => {
	const provider = process.env.HERMES_LLM_PROVIDER || "deepseek";
	const model = process.env.HERMES_LLM_MODEL || "deepseek-chat";
	const apiKey = process.env.HERMES_LLM_API_KEY || "";

	// Nama env var key mengikuti konvensi Hermes: <PROVIDER>_API_KEY.
	const keyName = `${provider.toUpperCase()}_API_KEY`;

	const configYaml = [
		"model:",
		`  provider: ${provider}`,
		`  default: ${model}`,
		"terminal:",
		"  backend: local",
		"agent:",
		"  max_turns: 150",
		"display:",
		"  tool_progress: all",
		"  interface: cli",
		"compression:",
		"  enabled: true",
		"  threshold: 0.5",
		"session_reset:",
		"  mode: none",
		"tts:",
		"  provider: edge",
		"memory:",
		"  memory_enabled: true",
		"  user_profile_enabled: false",
		"checkpoints:",
		"  enabled: false",
		"smart_model_routing:",
		"  enabled: false",
		"toolsets:",
		"  - hermes-cli",
		"platform_toolsets:",
		"  cli:",
		...[
			"terminal", "file", "web", "browser", "code_execution", "vision",
			"image_gen", "tts", "skills", "todo", "memory", "session_search",
			"clarify", "delegation", "cronjob",
		].map((t) => `    - ${t}`),
		"",
	].join("\n");

	return c.json({
		success: true,
		data: {
			config_yaml: configYaml,
			// Kosong kalau HERMES_LLM_API_KEY belum di-set di server — VBOX akan
			// melewati penulisan .env dan memberi tahu user, bukan menulis key kosong.
			env: apiKey ? { [keyName]: apiKey } : {},
			provider,
			model,
		},
	});
});

export default router;
