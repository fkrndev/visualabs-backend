import { config } from "dotenv";
config();

import { createHash } from "crypto";
import { mkdirSync, statSync, readdirSync, unlinkSync } from "fs";
import { join, resolve } from "path";

/**
 * Bungkus source `custom-hermes` jadi tarball yang disajikan ke VBOX.
 *
 * VBOX tidak bisa `git clone` repo `visualabs-id/custom-hermes` karena private,
 * jadi backend yang menyediakan source-nya sebagai tarball. VBOX download,
 * extract ke `$HERMES_HOME/hermes-agent`, lalu menjalankan `scripts/install.sh`
 * per-stage dengan stage `repository` di-skip (source sudah ada).
 *
 * Pakai `git archive` supaya isinya persis tracked files pada commit HEAD —
 * tanpa `.git`, tanpa `.venv`, tanpa artefak build lokal, dan mode bit
 * (executable pada `scripts/install.sh`) ikut terbawa.
 *
 * Usage:
 *   bun run scripts/pack-hermes.ts [path-ke-custom-hermes] [--ref <git-ref>]
 *
 * Env:
 *   CUSTOM_HERMES_PATH  lokasi checkout custom-hermes (default ../custom-hermes)
 *   HERMES_DIST_DIR     output dir (default ./storage/hermes)
 *   HERMES_KEEP         jumlah tarball lama yang disimpan (default 3)
 */

const DEFAULT_REPO = resolve(process.cwd(), "..", "custom-hermes");
const DIST_DIR = process.env.HERMES_DIST_DIR || join(process.cwd(), "storage", "hermes");
const KEEP = Number(process.env.HERMES_KEEP || 3);

function parseArgs() {
	const argv = process.argv.slice(2);
	let repo = process.env.CUSTOM_HERMES_PATH || DEFAULT_REPO;
	let ref = "HEAD";
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--ref") {
			ref = argv[++i] || "HEAD";
		} else if (!argv[i].startsWith("--")) {
			repo = resolve(argv[i]);
		}
	}
	return { repo, ref };
}

async function git(repo: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(["git", "-C", repo, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) {
		throw new Error(`git ${args.join(" ")} gagal (exit ${code}): ${err.trim()}`);
	}
	return out.trim();
}

/**
 * Hapus tarball lama, sisakan `KEEP` yang paling baru. Manifest cuma menunjuk
 * satu file, tapi VBOX yang sedang download versi sebelumnya jangan sampai
 * kehilangan file di tengah jalan — makanya tidak langsung dihapus semua.
 */
function pruneOld(dir: string, keepFilename: string) {
	let entries: string[];
	try {
		entries = readdirSync(dir).filter((f) => f.startsWith("hermes-agent-") && f.endsWith(".tar.gz"));
	} catch {
		return;
	}
	const sorted = entries
		.map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
		.sort((a, b) => b.mtime - a.mtime);
	for (const { f } of sorted.slice(KEEP)) {
		if (f === keepFilename) continue;
		try {
			unlinkSync(join(dir, f));
			console.log(`[pack-hermes] prune ${f}`);
		} catch {
			// abaikan
		}
	}
}

async function main() {
	const { repo, ref } = parseArgs();

	if (!(await Bun.file(join(repo, "scripts", "install.sh")).exists())) {
		throw new Error(
			`scripts/install.sh tidak ditemukan di ${repo}. ` +
				`Set CUSTOM_HERMES_PATH atau berikan path repo sebagai argumen.`,
		);
	}

	const commit = await git(repo, ["rev-parse", ref]);
	const shortCommit = commit.slice(0, 12);
	const describe = await git(repo, ["log", "-1", "--format=%cI", ref]);

	mkdirSync(DIST_DIR, { recursive: true });

	const filename = `hermes-agent-${shortCommit}.tar.gz`;
	const outPath = join(DIST_DIR, filename);

	console.log(`[pack-hermes] repo   : ${repo}`);
	console.log(`[pack-hermes] commit : ${commit}`);
	console.log(`[pack-hermes] output : ${outPath}`);

	// Biarkan `git archive` yang menulis file lewat `-o`. Sempat dicoba pipe
	// stdout → Bun.write, tapi stream-nya tidak ter-drain penuh dan menghasilkan
	// gzip kosong 23 byte.
	await git(repo, ["archive", "--format=tar.gz", "-o", outPath, ref]);

	// Hash dibaca ulang dari disk, di-stream per chunk supaya repo besar tidak
	// perlu ditampung penuh di memori.
	const hash = createHash("sha256");
	const stream = Bun.file(outPath).stream();
	for await (const chunk of stream) {
		hash.update(chunk);
	}
	const sha256 = hash.digest("hex");
	const written = statSync(outPath).size;

	const manifest = {
		commit,
		short_commit: shortCommit,
		filename,
		sha256,
		size: written,
		committed_at: describe,
		built_at: new Date().toISOString(),
	};

	await Bun.write(join(DIST_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

	pruneOld(DIST_DIR, filename);

	console.log(`[pack-hermes] size   : ${(written / 1024 / 1024).toFixed(2)} MB`);
	console.log(`[pack-hermes] sha256 : ${sha256}`);
	console.log(`[pack-hermes] selesai — manifest.json ditulis`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("[pack-hermes] Fatal:", e instanceof Error ? e.message : e);
		process.exit(1);
	});
