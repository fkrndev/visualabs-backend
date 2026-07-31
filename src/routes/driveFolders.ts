import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { requireAuth } from "../middleware/auth";
import {
  DriveApiError,
  DriveNotConfiguredError,
  buildBreadcrumb,
  listFolderChildren,
  resolveFolder,
  setFolderCustomers,
  uploadToDrive,
} from "../services/driveFolder";

/**
 * Google Drive — List Directory.
 * Semua endpoint butuh JWT staff (requireAuth); tidak ada role gate tambahan,
 * semua staff yang login boleh melihat & mengunggah.
 */

const router = new Hono();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const listQuery = z.object({
  parentId: z.coerce.number().int().min(0).optional().default(0),
  force: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

const clientsBody = z.object({
  customerIds: z.array(z.number().int().positive()).max(200),
});

/** Terjemahkan error domain jadi HTTP response yang informatif. */
function handleError(c: any, err: unknown) {
  if (err instanceof DriveNotConfiguredError) {
    return c.json({ success: false, message: err.message }, 503);
  }
  if (err instanceof DriveApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return c.json({ success: false, message: err.message }, status);
  }
  console.error("[drive-folders]", err);
  return c.json({ success: false, message: "Gagal mengakses Google Drive" }, 500);
}

// GET /api/drive-folders?parentId=0&force=1 — isi sebuah folder (sync dulu kalau basi).
router.get("/", requireAuth, zValidator("query", listQuery), async (c) => {
  const { parentId, force } = c.req.valid("query");
  try {
    const items = await listFolderChildren(parentId, { force });
    return c.json({ success: true, data: items });
  } catch (err) {
    return handleError(c, err);
  }
});

// GET /api/drive-folders/:id/breadcrumb — rantai parent untuk navigasi.
router.get("/:id/breadcrumb", requireAuth, zValidator("param", idParam), async (c) => {
  const { id } = c.req.valid("param");
  try {
    const trail = await buildBreadcrumb(id);
    return c.json({ success: true, data: trail });
  } catch (err) {
    return handleError(c, err);
  }
});

// POST /api/drive-folders/:id/sync — paksa sync folder ini (abaikan TTL).
router.post("/:id/sync", requireAuth, zValidator("param", idParam), async (c) => {
  const { id } = c.req.valid("param");
  try {
    const items = await listFolderChildren(id, { force: true });
    return c.json({ success: true, message: "Folder disinkronkan", data: items });
  } catch (err) {
    return handleError(c, err);
  }
});

// PATCH /api/drive-folders/:id/clients — set relasi folder → client (replace-all).
router.patch(
  "/:id/clients",
  requireAuth,
  zValidator("param", idParam),
  zValidator("json", clientsBody),
  async (c) => {
    const { id } = c.req.valid("param");
    const { customerIds } = c.req.valid("json");
    try {
      await setFolderCustomers(id, customerIds);
      return c.json({ success: true, message: "Client folder diperbarui" });
    } catch (err) {
      return handleError(c, err);
    }
  },
);

// POST /api/drive-folders/:id/upload — upload file ke folder Drive tsb (FormData: `file`).
router.post("/:id/upload", requireAuth, zValidator("param", idParam), async (c) => {
  const { id } = c.req.valid("param");

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
    return c.json({ success: false, message: "Ukuran file maksimal 25 MB" }, 413);
  }

  try {
    const parent = await resolveFolder(id);
    const uploaded = await uploadToDrive(file, parent.googleId, parent.dbId);
    return c.json({ success: true, message: "File diunggah", data: uploaded });
  } catch (err) {
    return handleError(c, err);
  }
});

export const driveFolderRoutes = router;
export default router;
