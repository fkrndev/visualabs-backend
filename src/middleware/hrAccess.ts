import type { Context, Next } from "hono";
import type { JwtPayload } from "./auth";
import {
  isManagementLevel,
  ROLE_HRD,
  ROLE_AKUNTAN,
} from "../utils/auth/permissions";

/** Resolve the numeric role from a (possibly stringified) JWT `rol` payload. */
function resolveRole(jwtPayload: JwtPayload | undefined): number | null | undefined {
  if (!jwtPayload) return undefined;
  if (typeof jwtPayload.rol === "string") {
    try {
      return JSON.parse(jwtPayload.rol);
    } catch {
      return undefined;
    }
  }
  return jwtPayload.rol as number | null | undefined;
}

/** Authenticated user id from the signed JWT. Must run after `requireAuth`. */
export function getHrUserId(c: Context): number {
  const cached = c.get("userId");
  if (cached !== undefined && cached !== null) return Number(cached);
  const jwtPayload = c.get("jwtPayload") as JwtPayload | undefined;
  return Number(jwtPayload?.sub);
}

/**
 * HR gate — allows Dev/Admin/Owner/Head Advertiser (management) + HRD.
 * Must run AFTER `requireAuth` so `jwtPayload` is set on the context.
 */
export const requireHR = async (c: Context, next: Next) => {
  const jwtPayload = c.get("jwtPayload") as JwtPayload | undefined;
  if (!jwtPayload) {
    return c.json({ success: false, message: "Unauthorized: No JWT payload found" }, 401);
  }
  const role = resolveRole(jwtPayload);
  if (!isManagementLevel(role) && role !== ROLE_HRD) {
    return c.json({ success: false, message: "Forbidden — akses HR (HRD/management) saja" }, 403);
  }
  c.set("userId", Number(jwtPayload.sub));
  c.set("userRole", role);
  await next();
};

/**
 * Finance gate — allows Dev/Admin/Owner/Head Advertiser (management) + Akuntan.
 * Dipakai modul keuangan murni. Must run AFTER `requireAuth`.
 */
export const requireFinance = async (c: Context, next: Next) => {
  const jwtPayload = c.get("jwtPayload") as JwtPayload | undefined;
  if (!jwtPayload) {
    return c.json({ success: false, message: "Unauthorized: No JWT payload found" }, 401);
  }
  const role = resolveRole(jwtPayload);
  if (!isManagementLevel(role) && role !== ROLE_AKUNTAN) {
    return c.json({ success: false, message: "Forbidden — akses keuangan (Akuntan/management) saja" }, 403);
  }
  c.set("userId", Number(jwtPayload.sub));
  c.set("userRole", role);
  await next();
};

/**
 * Payroll gate — modul penggajian/kompensasi butuh HR maupun Akuntan.
 * Allows management + HRD + Akuntan. Must run AFTER `requireAuth`.
 */
export const requirePayroll = async (c: Context, next: Next) => {
  const jwtPayload = c.get("jwtPayload") as JwtPayload | undefined;
  if (!jwtPayload) {
    return c.json({ success: false, message: "Unauthorized: No JWT payload found" }, 401);
  }
  const role = resolveRole(jwtPayload);
  if (!isManagementLevel(role) && role !== ROLE_HRD && role !== ROLE_AKUNTAN) {
    return c.json({ success: false, message: "Forbidden — akses payroll (HRD/Akuntan/management) saja" }, 403);
  }
  c.set("userId", Number(jwtPayload.sub));
  c.set("userRole", role);
  await next();
};
