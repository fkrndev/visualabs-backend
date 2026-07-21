import { Hono } from "hono";
import { mkdirSync } from "fs";
import { basename, join } from "path";

/**
 * Penyimpanan file upload (foto produk/talent untuk Request Video AI).
 * File disimpan ke disk di `UPLOAD_DIR` (default `./uploads`, di server diarahkan
 * ke folder di luar path deploy). GET-nya publik karena <img> tak bisa kirim
 * Authorization header; nama file berupa UUID acak sehingga tidak mudah ditebak.
 * Upload (POST) ada di router client (requireCustomer) — lihat videoRequest.ts.
 */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");

try {
  mkdirSync(UPLOAD_DIR, { recursive: true });
} catch {
  // abaikan jika sudah ada
}

const router = new Hono();

// GET /api/uploads/:name — sajikan file publik.
router.get("/:name", async (c) => {
  const raw = c.req.param("name");
  const name = basename(raw);
  if (!name || name !== raw || name.includes("..")) {
    return c.json({ success: false, message: "Not found" }, 404);
  }
  const file = Bun.file(join(UPLOAD_DIR, name));
  if (!(await file.exists())) {
    return c.json({ success: false, message: "Not found" }, 404);
  }
  return new Response(file);
});

export default router;
