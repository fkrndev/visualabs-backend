import { jwt } from "hono/jwt";
import { verify } from "hono/jwt";
import { config } from "dotenv";
import { TYPE_CUSTOMER } from "../constants/auth";
import type { Context, Next } from "hono";
import { isManagementLevel } from "../utils/auth/permissions";

config();

export const JWT_SECRET = process.env.JWT_SECRET ?? "super-secret-dev-key";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";
export const JWT_REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_TOKEN_EXPIRES_IN ?? "7d";

export const requireAuth = jwt({
  secret: JWT_SECRET,
});

// Custom middleware to handle missing/invalid tokens gracefully
export const requireAuthWithFallback = async (c: Context, next: Next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json({
      success: false,
      message: "Authorization header required"
    }, 401);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return c.json({
      success: false,
      message: "Invalid authorization header format. Expected: Bearer <token>"
    }, 401);
  }

  try {
    await requireAuth(c, next);
  } catch (error: any) {
    // Token rusak/kedaluwarsa dibungkus Hono jadi HTTPException 401 dengan
    // JwtTokenInvalid / JwtTokenExpired sebagai `cause`. Pencocokan lama hanya
    // mencari 'jwt' huruf kecil di message, sehingga kasus ini lolos dan
    // berakhir 500 di onError milik masing-masing router.
    const parts = [error?.name, error?.message, error?.cause?.name, error?.cause?.message]
      .filter(Boolean)
      .map(String)
      .join(' ');
    if (/jwt/i.test(parts) || error?.status === 401) {
      return c.json({
        success: false,
        message: "Invalid or expired token"
      }, 401);
    }
    throw error;
  }
};

export type JwtPayload = {
  sub: string;
  typ: string | number;
  rol?: Record<number, number> | string;
  exp?: number;
  iat?: number;
};

export const getAuthUserId = (payload: JwtPayload): number => {
  return Number(payload.sub);
};

export const extractAuthInfo = async (authHeader?: string): Promise<{
  userId?: number;
  role?: number | null;
  customerId?: number;
  isCustomer: boolean;
  isAdmin: boolean;
  jwtPayload?: JwtPayload;
}> => {
  let userId: number | undefined;
  let customerId: number | undefined;
  let isCustomer = false;
  let isAdmin = false;
  let jwtPayload: JwtPayload | undefined;
  let role: number | null | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      jwtPayload = await verify(token, JWT_SECRET) as JwtPayload;

      if (jwtPayload.typ === TYPE_CUSTOMER) {
        customerId = Number(jwtPayload.sub);
        isCustomer = true;
      } else if (jwtPayload.sub) {
        userId = Number(jwtPayload.sub);
        isAdmin = true;
        if (typeof jwtPayload.rol === 'string') {
          try {
            role = JSON.parse(jwtPayload.rol);
          } catch {
            role = undefined;
          }
        } else {
          role = jwtPayload.rol as number | null | undefined;
        }
      }
    } catch (error) {
      console.error('JWT verification error:', error);
    }
  } else {
    console.log('No Bearer token found or invalid format');
  }

  return { userId, role, customerId, isCustomer, isAdmin, jwtPayload };
};

/**
 * Management gate — allows only Dev / Admin / Owner. Reads the role from the
 * signed JWT payload (`rol`). Must run AFTER `requireAuth` so `jwtPayload` is set.
 */
export const requireManagement = async (c: Context, next: Next) => {
  const jwtPayload = c.get('jwtPayload') as JwtPayload | undefined;

  if (!jwtPayload) {
    return c.json({
      success: false,
      message: "Unauthorized: No JWT payload found"
    }, 401);
  }

  let role: number | null | undefined;
  if (typeof jwtPayload.rol === 'string') {
    try {
      role = JSON.parse(jwtPayload.rol);
    } catch {
      role = undefined;
    }
  } else {
    role = jwtPayload.rol as number | null | undefined;
  }

  if (!isManagementLevel(role)) {
    return c.json({
      success: false,
      message: "Forbidden — Dev/Admin/Owner only"
    }, 403);
  }

  c.set('userId', Number(jwtPayload.sub));
  c.set('userRole', role);

  await next();
};
