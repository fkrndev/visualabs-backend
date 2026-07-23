import { z, type ZodTypeAny } from "zod";

/**
 * Ubah semua nilai `null` (top-level) jadi `undefined`.
 * Frontend HR mengirim field opsional yang kosong sebagai `null`, sedangkan
 * `.optional()` di zod hanya menerima `undefined`. Preprocess ini menjembatani.
 */
export function stripNulls(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = val === null ? undefined : val;
    }
    return out;
  }
  return v;
}

/** Bungkus schema body request: `null` → `undefined` sebelum divalidasi. */
export function jsonBody<T extends ZodTypeAny>(schema: T) {
  return z.preprocess(stripNulls, schema);
}
