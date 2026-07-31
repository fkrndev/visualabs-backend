import { and, desc, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "../db/client";
import { driveFolderClients, driveFolders } from "../db/schema";
import {
  DriveNotConfiguredError,
  driveRootFolderId,
  getDriveAccessToken,
  resetDriveTokenCache,
} from "../utils/google/driveClient";

/**
 * Sync isi satu folder Google Drive ke tabel `drive_folder`.
 *
 * Pola diadopsi dari visualabs-backend (UtilCurlGDrive::syncDriveServiceFetchByFolderId):
 *   1. Ambil semua anak folder dari Drive API (`'<id>' in parents and trashed = false`).
 *   2. Upsert tiap item by `google_id`, tandai dengan `synced_at` = timestamp run ini.
 *   3. Hapus baris di bawah parent yang sama yang `synced_at`-nya bukan run ini
 *      (artinya item sudah tidak ada lagi di Drive).
 *
 * Bedanya dari sumber: pagination di-loop sampai habis, dan delete HANYA dijalankan
 * kalau seluruh halaman berhasil diambil — supaya sync yang gagal separuh jalan
 * tidak menghapus data yang sebenarnya masih ada.
 */

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const PAGE_SIZE = 200;
const FIELDS = "nextPageToken,files(id,name,mimeType,driveId,webViewLink,iconLink,size,modifiedTime)";

/** Google file/folder ID selalu alfanumerik + `-` `_`. Ditolak kalau bukan. */
const GOOGLE_ID_RE = /^[A-Za-z0-9_-]{5,255}$/;

export class DriveApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveApiError";
    this.status = status;
  }
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  driveId?: string;
  webViewLink?: string;
  iconLink?: string;
  size?: string;
  modifiedTime?: string;
};

function assertGoogleId(id: string): string {
  if (!GOOGLE_ID_RE.test(id)) {
    throw new DriveApiError(400, `Google Drive ID tidak valid: ${id}`);
  }
  return id;
}

/** Panggil Drive API dengan retry sekali kalau token kadung basi (401). */
async function driveFetch(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getDriveAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 && retry) {
    resetDriveTokenCache();
    return driveFetch(url, init, false);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DriveApiError(res.status, `Google Drive API ${res.status}: ${body.slice(0, 500)}`);
  }
  return res;
}

/** Ambil SEMUA anak dari sebuah folder Drive (loop pageToken sampai habis). */
export async function listDriveChildren(googleFolderId: string): Promise<DriveFile[]> {
  assertGoogleId(googleFolderId);

  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
      pageSize: String(PAGE_SIZE),
      q: `'${googleFolderId}' in parents and trashed = false`,
      orderBy: "folder,name",
      fields: FIELDS,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await driveFetch(`${DRIVE_FILES_URL}?${params.toString()}`);
    const json = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };

    files.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  return files;
}

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Sync satu folder. `parentDbId` = id baris folder tsb di DB (0 untuk root).
 * Return jumlah item yang tersimpan.
 */
export async function syncFolder(googleFolderId: string, parentDbId: number): Promise<number> {
  const files = await listDriveChildren(googleFolderId);
  // Dibulatkan ke detik: kolom TIMESTAMP MySQL tanpa fsp membulatkan milidetik saat insert,
  // jadi menyimpan Date ber-ms bikin nilai di DB beda dari nilai di memori.
  const syncedAt = new Date(Math.floor(Date.now() / 1000) * 1000);

  for (const file of files) {
    const row = {
      parentId: parentDbId,
      name: file.name?.slice(0, 512) ?? "(tanpa nama)",
      driveId: file.driveId ?? null,
      mimeType: file.mimeType ?? "application/octet-stream",
      googleId: file.id,
      parentGoogleId: googleFolderId,
      webViewLink: file.webViewLink ?? null,
      iconLink: file.iconLink ?? null,
      sizeBytes: file.size ? Number(file.size) : null,
      modifiedTime: toDate(file.modifiedTime),
      syncedAt,
    };

    await db
      .insert(driveFolders)
      .values(row)
      .onDuplicateKeyUpdate({
        set: {
          parentId: row.parentId,
          name: row.name,
          driveId: row.driveId,
          mimeType: row.mimeType,
          parentGoogleId: row.parentGoogleId,
          webViewLink: row.webViewLink,
          iconLink: row.iconLink,
          sizeBytes: row.sizeBytes,
          modifiedTime: row.modifiedTime,
          syncedAt: row.syncedAt,
        },
      });
  }

  // Baru aman menghapus setelah seluruh halaman berhasil diambil & disimpan.
  // Dihapus berdasar daftar google_id yang barusan dilihat, bukan berdasar timestamp —
  // perbandingan TIMESTAMP rawan meleset karena pembulatan milidetik.
  const seen = files.map((f) => f.id);
  await db
    .delete(driveFolders)
    .where(
      seen.length
        ? and(
            eq(driveFolders.parentGoogleId, googleFolderId),
            notInArray(driveFolders.googleId, seen),
          )
        : eq(driveFolders.parentGoogleId, googleFolderId),
    );

  return files.length;
}

const syncTtlMs = (): number => Number(process.env.DRIVE_SYNC_TTL_SECONDS || "30") * 1000;

/**
 * Sync kalau datanya sudah basi. Sumber PHP selalu hit Drive API tiap klik folder —
 * di sini dikasih TTL supaya klik bolak-balik tidak menghabiskan kuota.
 */
async function syncIfStale(googleFolderId: string, parentDbId: number, force: boolean) {
  if (force) {
    await syncFolder(googleFolderId, parentDbId);
    return;
  }

  const [freshest] = await db
    .select({ syncedAt: driveFolders.syncedAt })
    .from(driveFolders)
    .where(eq(driveFolders.parentGoogleId, googleFolderId))
    .orderBy(desc(driveFolders.syncedAt))
    .limit(1);

  const lastSync = freshest?.syncedAt ? new Date(freshest.syncedAt).getTime() : 0;
  if (Date.now() - lastSync > syncTtlMs()) {
    await syncFolder(googleFolderId, parentDbId);
  }
}

export type DriveFolderItem = {
  id: number;
  parentId: number;
  name: string;
  mimeType: string;
  googleId: string;
  driveId: string | null;
  webViewLink: string | null;
  iconLink: string | null;
  sizeBytes: number | null;
  modifiedTime: Date | null;
  isFolder: boolean;
  customerIds: number[];
};

/** Cari baris folder di DB; `parentId` 0 = root virtual. */
export async function resolveFolder(
  parentId: number,
): Promise<{ googleId: string; dbId: number; name: string | null }> {
  if (!parentId) {
    return { googleId: driveRootFolderId(), dbId: 0, name: null };
  }

  const [row] = await db.select().from(driveFolders).where(eq(driveFolders.id, parentId)).limit(1);
  if (!row) throw new DriveApiError(404, "Folder tidak ditemukan");
  if (row.mimeType !== DRIVE_FOLDER_MIME) {
    throw new DriveApiError(400, "Item ini bukan folder");
  }
  return { googleId: row.googleId, dbId: row.id, name: row.name };
}

/** Isi sebuah folder: sync dulu kalau perlu, lalu baca dari DB + mapping client. */
export async function listFolderChildren(
  parentId: number,
  opts: { force?: boolean } = {},
): Promise<DriveFolderItem[]> {
  const parent = await resolveFolder(parentId);
  await syncIfStale(parent.googleId, parent.dbId, Boolean(opts.force));

  const rows = await db
    .select()
    .from(driveFolders)
    .where(eq(driveFolders.parentGoogleId, parent.googleId));

  const ids = rows.map((r) => r.id);
  const mapping = new Map<number, number[]>();
  if (ids.length) {
    const links = await db
      .select()
      .from(driveFolderClients)
      .where(inArray(driveFolderClients.folderId, ids));
    for (const link of links) {
      const list = mapping.get(link.folderId) ?? [];
      list.push(link.customerId);
      mapping.set(link.folderId, list);
    }
  }

  return rows
    .map((row) => ({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      mimeType: row.mimeType,
      googleId: row.googleId,
      driveId: row.driveId,
      webViewLink: row.webViewLink,
      iconLink: row.iconLink,
      sizeBytes: row.sizeBytes,
      modifiedTime: row.modifiedTime,
      isFolder: row.mimeType === DRIVE_FOLDER_MIME,
      customerIds: mapping.get(row.id) ?? [],
    }))
    .sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name, "id");
    });
}

/** Rantai parent dari root sampai folder tsb, untuk breadcrumb. */
export async function buildBreadcrumb(folderId: number): Promise<{ id: number; name: string }[]> {
  const trail: { id: number; name: string }[] = [];
  let cursor = folderId;

  // Guard kedalaman, jaga-jaga kalau ada data parent yang melingkar.
  for (let depth = 0; cursor > 0 && depth < 50; depth++) {
    const [row] = await db.select().from(driveFolders).where(eq(driveFolders.id, cursor)).limit(1);
    if (!row) break;
    trail.unshift({ id: row.id, name: row.name });
    cursor = row.parentId;
  }

  return trail;
}

/** Set relasi folder → customer (replace-all). */
export async function setFolderCustomers(folderId: number, customerIds: number[]): Promise<void> {
  const unique = [...new Set(customerIds.filter((id) => Number.isInteger(id) && id > 0))];

  await db.delete(driveFolderClients).where(eq(driveFolderClients.folderId, folderId));
  if (unique.length) {
    await db
      .insert(driveFolderClients)
      .values(unique.map((customerId) => ({ folderId, customerId })));
  }
}

/** Upload satu file ke folder Drive (multipart), lalu sync ulang folder tujuan. */
export async function uploadToDrive(
  file: File,
  parentGoogleId: string,
  parentDbId: number,
): Promise<{ id: string; name: string; webViewLink?: string }> {
  assertGoogleId(parentGoogleId);

  const metadata = {
    name: file.name,
    parents: [parentGoogleId],
  };

  const body = new FormData();
  body.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  body.append("file", file);

  const params = new URLSearchParams({
    uploadType: "multipart",
    supportsAllDrives: "true",
    fields: "id,name,webViewLink",
  });

  const res = await driveFetch(`${DRIVE_UPLOAD_URL}?${params.toString()}`, {
    method: "POST",
    body,
  });
  const uploaded = (await res.json()) as { id: string; name: string; webViewLink?: string };

  await syncFolder(parentGoogleId, parentDbId);
  return uploaded;
}

export { DriveNotConfiguredError };
