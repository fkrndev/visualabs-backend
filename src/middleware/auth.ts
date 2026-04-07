import { jwt } from "hono/jwt";
import { verify } from "hono/jwt";
import { config } from "dotenv";
import { TYPE_CUSTOMER } from "../constants/auth";

config();

export const JWT_SECRET = process.env.JWT_SECRET ?? "super-secret-dev-key";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";

export const requireAuth = jwt({
  secret: JWT_SECRET,
});

export type JwtPayload = {
  sub: string;
  typ: string | number;
  rol?: Record<number, number> | string;
  bid?: string;
  exp?: number;
  iat?: number;
};

export const getAuthUserId = (payload: JwtPayload): number => {
  return Number(payload.sub);
};

export const extractAuthInfo = async (authHeader?: string): Promise<{ 
  userId?: number; 
  role?: Record<number, number>; 
  customerId?: number; 
  isCustomer: boolean;
  isAdmin: boolean;
  businessId?: string;
  jwtPayload?: JwtPayload;
}> => {
  let userId: number | undefined;
  let customerId: number | undefined;
  let businessId: string | undefined;
  let isCustomer = false;
  let isAdmin = false;
  let jwtPayload: JwtPayload | undefined;
  let role: Record<number, number> | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      jwtPayload = await verify(token, JWT_SECRET) as JwtPayload;
      
      // Jika payload memiliki bid (businessId) dan typ === TYPE_CUSTOMER
      if (jwtPayload.bid && jwtPayload.typ === TYPE_CUSTOMER) {
        customerId = Number(jwtPayload.sub);
        businessId = jwtPayload.bid;
        isCustomer = true;
      } else if (jwtPayload.sub) {
        userId = Number(jwtPayload.sub);
        isAdmin = true;
        // Parse rol dari JWT karena akan di-serialize sebagai string
        if (typeof jwtPayload.rol === 'string') {
          try {
            role = JSON.parse(jwtPayload.rol);
          } catch {
            role = undefined;
          }
        } else {
          role = jwtPayload.rol;
        }
      }
    } catch (error) {
      console.error('JWT verification error:', error);
      // Token invalid, continue as unauthenticated
    }
  } else {
    console.log('No Bearer token found or invalid format');
  }

  return { userId, role, customerId, isCustomer, isAdmin, businessId, jwtPayload };
};
