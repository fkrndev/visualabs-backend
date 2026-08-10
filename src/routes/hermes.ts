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
// dan menulis config sendiri dari sini.
//
// DUA MODE, dipilih lewat HERMES_LLM_PROVIDER:
//
//   custom (disarankan) — Hermes diarahkan ke LLM Gateway milik kita sendiri
//     (/api/llm/v1). Key DeepSeek asli TIDAK PERNAH keluar dari server; yang
//     dikirim ke laptop tim hanya base_url + LLM_TEAM_TOKEN yang bisa dicabut
//     kapan saja tanpa menyentuh mesin siapa pun. Provider `custom` di Hermes
//     memang tidak butuh env key (`env_vars=()` — "No fixed key").
//
//   deepseek/lainnya — key asli disalin ke .env setiap laptop. Rotasi berarti
//     menyentuh semua mesin, dan key hidup di banyak tempat sekaligus.
//
// Riwayatnya: sebelum ini key ditanam mentah di `install-team.ps1` dan ikut
// ter-commit. Mode gateway ada supaya kesalahan itu tidak terulang dalam bentuk
// lain (tertanam di .env belasan laptop, bukan di git).
router.get("/config", requireAuthWithFallback, async (c) => {
	const provider = process.env.HERMES_LLM_PROVIDER || "deepseek";
	const model = process.env.HERMES_LLM_MODEL || "deepseek-chat";
	const apiKey = process.env.HERMES_LLM_API_KEY || "";

	const viaGateway = provider === "custom";
	// Base URL gateway yang dilihat dari LUAR (laptop tim), bukan dari dalam
	// server — jadi tidak bisa diturunkan dari request; harus disetel eksplisit.
	const gatewayBaseUrl = (
		process.env.HERMES_LLM_BASE_URL || "https://vims.dots.my.id/api/llm/v1"
	).replace(/\/+$/, "");
	const teamToken = process.env.LLM_TEAM_TOKEN || "";

	// Nama env var key mengikuti konvensi Hermes: <PROVIDER>_API_KEY.
	const keyName = `${provider.toUpperCase()}_API_KEY`;

	const configYaml = [
		"model:",
		`  provider: ${provider}`,
		`  default: ${model}`,
		// base_url + api_key hanya relevan di mode gateway. api_key di sini
		// adalah token tim milik kita, BUKAN key DeepSeek.
		...(viaGateway ? [`  base_url: ${gatewayBaseUrl}`] : []),
		...(viaGateway && teamToken ? [`  api_key: ${teamToken}`] : []),
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
			// Mode gateway: SENGAJA kosong — tidak ada key yang perlu mendarat di
			// laptop siapa pun. Mode langsung: kosong berarti HERMES_LLM_API_KEY
			// belum di-set di server, dan itu memang keadaan yang salah.
			env: viaGateway ? {} : apiKey ? { [keyName]: apiKey } : {},
			provider,
			model,
			// Dibaca VBOX untuk membedakan "env kosong karena memang tidak perlu"
			// dari "env kosong karena server belum dikonfigurasi". Tanpa ini VBOX
			// memperingatkan user soal API key yang hilang padahal semuanya benar.
			mode: viaGateway ? "gateway" : "direct",
			// Peringatan yang layak ditampilkan ke user, kalau ada. Gateway tanpa
			// LLM_TEAM_TOKEN berarti endpoint LLM kita terbuka untuk siapa saja di
			// internet dengan tagihan ke kita.
			warning: viaGateway
				? teamToken
					? null
					: "LLM_TEAM_TOKEN belum di-set di server — endpoint /api/llm terbuka tanpa autentikasi."
				: apiKey
					? null
					: "HERMES_LLM_API_KEY belum di-set di server — Hermes akan terpasang tapi belum bisa memanggil model.",
		},
	});
});

export default router;
