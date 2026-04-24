import { jwt } from "hono/jwt";
import { verify } from "hono/jwt";
import { config } from "dotenv";
import { TYPE_CUSTOMER } from "../constants/auth";
import type { Context, Next } from "hono";

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
    if (error.name === 'JWTError' || error.message?.includes('jwt')) {
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
