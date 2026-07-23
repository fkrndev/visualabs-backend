import { Hono } from "hono";
import { mkdirSync } from "fs";
import { basename, extname, join } from "path";
import { requireAuth } from "../middleware/auth";

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

// Ekstensi yang diizinkan untuk upload dokumen/foto karyawan (modul HR).
const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf",
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

// POST /api/uploads — upload file (staff/admin). FormData: `file`, `module`.
// Balikan { success, data: { url, size, contentType } }. Nama file UUID acak.
router.post("/", requireAuth, async (c) => {
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
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ success: false, message: "Ukuran file maksimal 10MB" }, 413);
  }
  const ext = extname(file.name || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return c.json(
      { success: false, message: "Tipe file tidak didukung (jpg/png/webp/gif/pdf)" },
      415,
    );
  }
  const name = `${crypto.randomUUID()}${ext}`;
  await Bun.write(join(UPLOAD_DIR, name), file);
  return c.json({
    success: true,
    data: {
      url: `/api/uploads/${name}`,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    },
  });
});

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
