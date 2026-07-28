import { readFileSync } from "fs";
import { isAbsolute, join } from "path";
import { JWT } from "google-auth-library";

/**
 * Klien Google Drive minimal: cuma urus autentikasi service account.
 * Panggilan API-nya sendiri pakai `fetch` ke Drive v3 REST (lihat services/driveFolder.ts),
 * supaya tidak perlu menambah paket `googleapis` yang berat — build di server pernah OOM.
 *
 * Credential dibaca dari salah satu env (urutan prioritas):
 *   1. GOOGLE_DRIVE_SA_JSON      — isi service account JSON, boleh base64 atau raw JSON
 *   2. GOOGLE_DRIVE_SA_KEY_FILE  — path ke file JSON (relatif ke cwd atau absolut)
 */

// Scope penuh karena fitur upload dipakai. Kalau upload dimatikan, turunkan ke
// https://www.googleapis.com/auth/drive.readonly supaya blast radius-nya kecil.
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

export class DriveNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveNotConfiguredError";
  }
}

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
};

let cachedClient: JWT | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

function parseServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_DRIVE_SA_JSON?.trim();
  if (raw) {
    // Boleh raw JSON, boleh base64 — deteksi dari karakter pertama.
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    try {
      return JSON.parse(text) as ServiceAccount;
    } catch {
      throw new DriveNotConfiguredError("GOOGLE_DRIVE_SA_JSON bukan JSON yang valid");
    }
  }

  const keyFile = process.env.GOOGLE_DRIVE_SA_KEY_FILE?.trim();
  if (!keyFile) {
    throw new DriveNotConfiguredError(
      "Google Drive belum dikonfigurasi: set GOOGLE_DRIVE_SA_KEY_FILE atau GOOGLE_DRIVE_SA_JSON",
    );
  }

  const path = isAbsolute(keyFile) ? keyFile : join(process.cwd(), keyFile);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ServiceAccount;
  } catch (err: any) {
    throw new DriveNotConfiguredError(
      `Gagal membaca service account Drive di ${path}: ${err?.message ?? err}`,
    );
  }
}

function getClient(): JWT {
  if (cachedClient) return cachedClient;

  const sa = parseServiceAccount();
  if (!sa.client_email || !sa.private_key) {
    throw new DriveNotConfiguredError(
      "Service account Drive tidak lengkap (client_email / private_key kosong)",
    );
  }

  cachedClient = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: DRIVE_SCOPES,
  });
  return cachedClient;
}

/** True kalau credential Drive tersedia — dipakai route buat balikin 503 yang informatif. */
export function driveEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_SA_JSON?.trim() || process.env.GOOGLE_DRIVE_SA_KEY_FILE?.trim(),
  );
}

/** Google ID folder root yang ditampilkan di aplikasi. */
export function driveRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (!id) {
    throw new DriveNotConfiguredError("GOOGLE_DRIVE_ROOT_FOLDER_ID belum di-set");
  }
  return id;
}

/** Access token OAuth2, di-cache di memori sampai 60 detik sebelum expiry. */
export async function getDriveAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;

  const client = getClient();
  const res = await client.getAccessToken();
  const token = typeof res === "string" ? res : res?.token;
  if (!token) {
    throw new DriveNotConfiguredError("Gagal mendapatkan access token dari service account Drive");
  }

  // client.credentials.expiry_date = epoch ms. Kasih margin 60 detik.
  const expiry = Number(client.credentials?.expiry_date ?? 0);
  cachedToken = {
    value: token,
    expiresAt: expiry > now ? expiry - 60_000 : now + 30 * 60_000,
  };
  return token;
}

/** Reset cache token (dipakai saat dapat 401 dari Drive, biar bisa retry sekali). */
export function resetDriveTokenCache(): void {
  cachedToken = null;
}
