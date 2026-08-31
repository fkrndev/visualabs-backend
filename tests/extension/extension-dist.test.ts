import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "crypto";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { sign } from "hono/jwt";

/**
 * Distribusi build extension ke VBOX (`/api/extension/*`).
 *
 * Jalur ini memasang kode ke Chrome semua user TANPA konfirmasi, jadi yang diuji
 * di sini bukan happy path-nya saja, melainkan penjaga-penjaganya: siapa boleh
 * mengunggah, apa yang ditolak, dan apakah sha256 di manifest benar-benar cocok
 * dengan byte yang dilayani.
 *
 * Dir distribusi diarahkan ke folder temp lewat EXTENSION_DIST_DIR — harus diset
 * SEBELUM modulnya di-import, karena konstanta itu dibaca saat modul dimuat.
 */

const DIST = mkdtempSync(join(tmpdir(), "ext-dist-"));
process.env.EXTENSION_DIST_DIR = DIST;
process.env.JWT_SECRET = process.env.JWT_SECRET || "super-secret-dev-key";

const SECRET = process.env.JWT_SECRET;

// Zip minimal yang sah: satu entry kosong. Cukup untuk melewati cek magic "PK".
const ZIP_BYTES = new Uint8Array([
	0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

let app: any;

const token = (payload: Record<string, unknown>) =>
	sign({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);

// rol 0 = ROLE_DEV (management level), rol 4 = ROLE_ADVERTISER (bukan management)
const devToken = () => token({ sub: "1", rol: 0 });
const staffToken = () => token({ sub: "2", rol: 4 });

const upload = async (jwt: string, version: string, bytes = ZIP_BYTES) => {
	const form = new FormData();
	form.append("file", new File([bytes], "vbox_controller.zip"), "vbox_controller.zip");
	form.append("version", version);
	return app.request("/upload", {
		method: "POST",
		headers: { Authorization: `Bearer ${jwt}` },
		body: form,
	});
};

beforeAll(async () => {
	const { Hono } = await import("hono");
	const router = (await import("../../src/routes/extension")).default;
	app = new Hono().route("/", router);
});

afterAll(() => rmSync(DIST, { recursive: true, force: true }));

describe("GET /manifest sebelum ada build", () => {
	it("balas 503, bukan 200 dengan data kosong", async () => {
		const res = await app.request("/manifest", {
			headers: { Authorization: `Bearer ${await devToken()}` },
		});
		expect(res.status).toBe(503);
	});
});

describe("penjaga akses", () => {
	it("tanpa token: 401", async () => {
		expect((await app.request("/manifest")).status).toBe(401);
		expect((await app.request("/zip")).status).toBe(401);
	});

	it("staff non-management tidak boleh mengunggah", async () => {
		const res = await upload(await staffToken(), "1.0.17");
		expect(res.status).toBe(403);
	});
});

describe("validasi unggahan", () => {
	it("versi non-semver ditolak (versi ikut jadi nama file)", async () => {
		for (const bad of ["../../etc/passwd", "1.0", "latest", ""]) {
			const res = await upload(await devToken(), bad);
			expect(res.status, `version=${bad}`).toBe(400);
		}
	});

	it("file yang bukan zip ditolak", async () => {
		const res = await upload(await devToken(), "1.0.17", new TextEncoder().encode("bukan zip"));
		expect(res.status).toBe(415);
	});
});

describe("unggah lalu sajikan", () => {
	it("manifest dan zip yang dilayani konsisten", async () => {
		const up = await upload(await devToken(), "1.0.17");
		expect(up.status).toBe(200);

		const jwt = await devToken();
		const manifest = (
			await (
				await app.request("/manifest", { headers: { Authorization: `Bearer ${jwt}` } })
			).json()
		).data;

		expect(manifest.version).toBe("1.0.17");
		expect(manifest.filename).toBe("vbox_controller_v1.0.17.zip");

		const res = await app.request("/zip", { headers: { Authorization: `Bearer ${jwt}` } });
		expect(res.status).toBe(200);
		expect(res.headers.get("X-Extension-Version")).toBe("1.0.17");

		// Inti kontraknya: VBOX menolak paket kalau sha256 tidak cocok, jadi hash di
		// manifest harus dihitung dari byte yang benar-benar dikirim.
		const body = new Uint8Array(await res.arrayBuffer());
		const digest = createHash("sha256").update(body).digest("hex");
		expect(digest).toBe(manifest.sha256);
		expect(body.length).toBe(manifest.size);
	});

	it("unggah versi lebih baru menggantikan manifest", async () => {
		expect((await upload(await devToken(), "1.0.18")).status).toBe(200);
		const manifest = (
			await (
				await app.request("/manifest", {
					headers: { Authorization: `Bearer ${await devToken()}` },
				})
			).json()
		).data;
		expect(manifest.version).toBe("1.0.18");
	});
});
