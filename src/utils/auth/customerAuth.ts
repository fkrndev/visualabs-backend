import { sign } from "hono/jwt";
import { db } from "../../db/client";
import { customerRefreshTokens } from "../../db/schema";
import { TYPE_CUSTOMER } from "../../constants/auth";
import { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_TOKEN_EXPIRES_IN } from "../../middleware/auth";
import {
  parseExpiry,
  generateRefreshToken,
  addSeconds,
} from "./shared";

export interface CustomerLoginResponse {
  success: true;
  message: string;
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  customer: any;
  setCookieHeader: string;
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
    parseExpiry(JWT_REFRESH_TOKEN_EXPIRES_IN),
  );

  // Simpan refresh token ke database
  await db.insert(customerRefreshTokens).values({
    customerId: customer.id,
    token: refreshTkn,
    expiresAt: refreshExpAt,
  });

  // Set refresh token as httpOnly cookie
  const cookieOptions = `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${parseExpiry(JWT_REFRESH_TOKEN_EXPIRES_IN)}`;
  const setCookieHeader = `refresh_token=${refreshTkn}; ${cookieOptions}`;

  return {
    success: true,
    message: "Login berhasil",
    tokenType: "Bearer",
    accessToken,
    expiresIn: exp,
    customer: {
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      username: customer.username,
      profile: customer.profile,
    },
    setCookieHeader,
  };
}
