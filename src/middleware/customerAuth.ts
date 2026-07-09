import { verify } from "hono/jwt";
import type { Context, Next } from "hono";

import { JWT_SECRET } from "./auth";
import { TYPE_CUSTOMER } from "../constants/auth";

/**
 * Auth gate untuk endpoint client app (v-auto-client).
 *
 * Berbeda dengan `requireAuth` (staff): middleware ini MEWAJIBKAN JWT dengan
 * `typ === "customer"`. Token staff/admin ditolak — mencegah `sub` (users.id)
 * salah dibaca sebagai customers.id, dan sebaliknya token customer tidak bisa
 * dipakai di route staff yang membaca `rol`.
 *
 * Setelah lolos: `c.get("customerId")` berisi customers.id (number).
 */
export const requireCustomer = async (c: Context, next: Next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      { success: false, message: "Authorization header required" },
      401,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await verify(authHeader.substring(7), JWT_SECRET);
  } catch {
    return c.json({ success: false, message: "Invalid or expired token" }, 401);
  }

  if (payload.typ !== TYPE_CUSTOMER) {
    return c.json(
      { success: false, message: "Forbidden — customer token required" },
      403,
    );
  }

  const customerId = Number(payload.sub);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return c.json({ success: false, message: "Invalid token subject" }, 401);
  }

  c.set("jwtPayload", payload);
  c.set("customerId", customerId);

  await next();
};
