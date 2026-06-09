import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Application-level encryption for credential vault secrets (AES-256-GCM).
 *
 * The 32-byte key is derived (SHA-256) from CREDENTIAL_ENCRYPTION_KEY. This key
 * MUST be set in production and MUST NOT change after data exists — changing it
 * makes every previously stored secret undecryptable.
 *
 * Stored format: base64(iv).base64(authTag).base64(ciphertext)
 */
const RAW_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY ?? 'dev-insecure-key-change-me';
const KEY = createHash('sha256').update(RAW_KEY).digest(); // 32 bytes

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12); // 96-bit nonce (GCM standard)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, ctB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('Invalid encrypted payload format');
  }
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Secret payload stored (encrypted) for a credential item. */
export type CredentialSecret = {
  password?: string;
  token?: string;
  apiKey?: string;
  secret?: string;
  endpoint?: string;
  notes?: string;
  extra?: Record<string, string>;
};

/** Encrypt a secret object → opaque string (or null when empty). */
export function encryptSecretObject(secret: CredentialSecret | undefined | null): string | null {
  if (!secret) return null;
  const cleaned: CredentialSecret = {};
  for (const [k, v] of Object.entries(secret)) {
    if (k === 'extra') {
      if (v && typeof v === 'object' && Object.keys(v).length) {
        cleaned.extra = v as Record<string, string>;
      }
      continue;
    }
    if (typeof v === 'string' && v.length) {
      (cleaned as Record<string, unknown>)[k] = v;
    }
  }
  if (!Object.keys(cleaned).length) return null;
  return encryptSecret(JSON.stringify(cleaned));
}

/** Decrypt the stored string back into a secret object. */
export function decryptSecretObject(payload: string | null | undefined): CredentialSecret {
  if (!payload) return {};
  try {
    return JSON.parse(decryptSecret(payload)) as CredentialSecret;
  } catch {
    return {};
  }
}
