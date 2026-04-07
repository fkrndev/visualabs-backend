import { sign } from "hono/jwt";
import { db } from "../../db/client";
import { customerRefreshTokens } from "../../db/schema";
import { TYPE_CUSTOMER } from "../../constants/auth";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN ?? "7d";

const parseExpiry = (value: string | undefined): number => {
  if (!value) return 3600;
  const match = value.match(/^(\d+)([smhd])$/i);
  if (!match) return Number(value) || 3600;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitMap: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return amount * (unitMap[unit] ?? 3600);
};

const generateRefreshToken = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(48).toString("hex");
};

const addSeconds = (date: Date, seconds: number) => {
  return new Date(date.getTime() + seconds * 1000);
};

export interface CustomerLoginResponse {
  success: true;
  message: string;
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
  customer: any;
}

/**
 * Helper function untuk create customer login session
 * Digunakan oleh semua customer login methods (email/password, Google OAuth, WhatsApp)
 */
export async function createCustomerSession(customer: any): Promise<CustomerLoginResponse> {
  // Generate JWT token
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseExpiry(JWT_EXPIRES_IN);
  
  const accessToken = await sign(
    {
      sub: String(customer.id),
      typ: TYPE_CUSTOMER,
      iat: now,
      exp,
    },
    JWT_SECRET,
  );
  
  // Generate refresh token
  const refreshTkn = generateRefreshToken();
  const refreshExpAt = addSeconds(
    new Date(),
    parseExpiry(REFRESH_TOKEN_EXPIRES_IN),
  );
  
  // Simpan refresh token ke database
  await db.insert(customerRefreshTokens).values({
    customerId: customer.id,
    token: refreshTkn,
    expiresAt: refreshExpAt,
  });
  
  console.log("[Customer Auth] Session created for customer:", {
    customerId: customer.id,
  });
  
  return {
    success: true,
    message: "Login berhasil",
    tokenType: "Bearer",
    accessToken,
    expiresIn: exp,
    refreshToken: refreshTkn,
    refreshExpiresAt: refreshExpAt.toISOString(),
    customer: {
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      username: customer.username,
      profile: customer.profile,
    },
  };
}
