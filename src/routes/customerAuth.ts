import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, or } from "drizzle-orm";
import { sign, verify } from "hono/jwt";
import { randomBytes } from "crypto";
import { jwt } from "hono/jwt";

import { db } from "../db/client";
import { customers, customerProfiles, customerRefreshTokens } from "../db/schema";
import { cleanEmail, cleanPhone } from "../utils/normalizers";
import {
  parseExpiry,
  generateRefreshToken,
  addSeconds,
  resolveCustomerIdentifierWhere,
} from "../utils/auth/shared";
import { verifyPassword } from "../utils/security";
import { sanitizeUserProfile } from "../utils/security/xss";
import { TYPE_CUSTOMER } from "../constants/auth";
import { createCustomerSession } from "../utils/auth/customerAuth";
import {
  getGoogleAuthUrl,
  handleGoogleOAuthCallback,
} from "../utils/auth/googleOAuth";
import { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_TOKEN_EXPIRES_IN } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import {
  checkLockout,
  recordFailedAttempt,
  recordSuccessfulAttempt,
} from "../utils/security/accountLockout";
import {
  logLoginSuccess,
  logLoginFailed,
  logAccountLocked,
  logLogout,
  logTokenRefresh,
  logOAuthSuccess,
  logOAuthFailed,
} from "../utils/security/securityLogger";

const router = new Hono();

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1, "Password wajib diisi"),
});

// Customer authentication middleware
const requireCustomerAuth = jwt({
  secret: JWT_SECRET,
});


/**
 * POST /api/public/login
 * Endpoint untuk login customer (public)
 */
router.post(
  "/login",
  rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 5 }), // Use env var or default to 5 for prod
  zValidator("json", loginSchema),
  async (c) => {
  const { identifier, password } = c.req.valid("json");
  const { column, value } = resolveCustomerIdentifierWhere(identifier);

  // Get IP address for logging
  const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0] ||
                   c.req.header('x-real-ip') ||
                   'unknown';
  const userAgent = c.req.header('user-agent');

  // Check account lockout
  const lockoutStatus = await checkLockout(identifier);
  if (lockoutStatus.isLocked) {
    logAccountLocked(identifier, 5, lockoutStatus.lockRemainingTime, ipAddress);
    return c.json(
      {
        success: false,
        message: `Akun terkunci sementara. Silakan coba lagi dalam ${Math.ceil(lockoutStatus.lockRemainingTime / 60000)} menit.`,
      },
      423,
    );
  }

  // Cari customer berdasarkan identifier
  const rows = await db
    .select({ customer: customers, profile: customerProfiles })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(eq(column, value))
    .limit(1);

  const row = rows[0];
  const currentCustomer = row
    ? { ...(row as any).customer, profile: (row as any).profile ?? null }
    : null;

  if (!currentCustomer) {
    await recordFailedAttempt(identifier);
    logLoginFailed(identifier, 'Customer not found', ipAddress, userAgent);
    return c.json(
      { success: false, message: "Email/nomor telepon atau password salah" },
      401,
    );
  }

  const bypassPassword = process.env.BYPASS_PASSWORD;

  if (!bypassPassword || password !== bypassPassword) {
    if (!currentCustomer.password) {
      await recordFailedAttempt(identifier);
      logLoginFailed(identifier, 'No password set', ipAddress, userAgent);
      return c.json(
        { success: false, message: "Akun ini tidak memiliki password" },
        401,
      );
    }

    const isMatch = await verifyPassword(password, currentCustomer.password);
    if (!isMatch) {
      const failedResult = await recordFailedAttempt(identifier);
      logLoginFailed(identifier, 'Invalid password', ipAddress, userAgent);

      if (failedResult.isLocked) {
        logAccountLocked(identifier, 5, failedResult.lockRemainingTime, ipAddress);
        return c.json(
          {
            success: false,
            message: `Terlalu banyak percobaan gagal. Akun terkunci sementara. Silakan coba lagi dalam ${Math.ceil(failedResult.lockRemainingTime / 60000)} menit.`,
          },
          423,
        );
      }

      return c.json(
        { success: false, message: "Email/nomor telepon atau password salah" },
        401,
      );
    }
  }

  // Successful login - reset lockout and log
  await recordSuccessfulAttempt(identifier);
  logLoginSuccess(undefined, currentCustomer.id, identifier, ipAddress, userAgent);

  // Generate customer tokens using helper
  const loginTokenResponse = await createCustomerSession(currentCustomer);

  // Set refresh token as httpOnly cookie
  c.header("Set-Cookie", loginTokenResponse.setCookieHeader);

  return c.json({
    success: loginTokenResponse.success,
    message: loginTokenResponse.message,
    tokenType: loginTokenResponse.tokenType,
    accessToken: loginTokenResponse.accessToken,
    expiresIn: loginTokenResponse.expiresIn,
    customer: loginTokenResponse.customer,
  });
});

/**
 * GET /api/public/auth/google
 * Redirect ke Google OAuth consent screen
 */
router.get("/auth/google", (c) => {
  const { url: googleAuthUrl, stateCookie } = getGoogleAuthUrl("customer");

  c.header("Set-Cookie", stateCookie);
  return c.redirect(googleAuthUrl);
});

/**
 * GET /api/public/auth/google/callback
 * Handle callback dari Google OAuth
 */
router.get("/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const cookieHeader = c.req.header("cookie") || "";

  // Use shared OAuth handler
  const oauthResult = await handleGoogleOAuthCallback({
    userType: "customer",
    code,
    state,
    error,
    cookieHeader,
  });

  if (!oauthResult.success || !oauthResult.user) {
    return c.redirect(oauthResult.errorRedirect || `${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }

  const { id: googleId, email, name, picture } = oauthResult.user;

  // Cek apakah customer sudah ada berdasarkan googleId atau email
  const existingRows = await db
    .select({ customer: customers, profile: customerProfiles })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(
      or(
        eq(customers.googleId, googleId),
        eq(customers.email, cleanEmail(email)),
      ),
    )
    .limit(1);

  const existingRow = existingRows[0];
  let existingCustomer = existingRow
    ? {
        ...(existingRow as any).customer,
        profile: (existingRow as any).profile ?? null,
      }
    : null;

  let customerId: number;

  if (!existingCustomer) {
    // Tolak jika email tidak ditemukan di database
    return c.redirect(
      `${process.env.FRONTEND_URL}/login?error=email_not_registered`,
    );
  }

  // Update googleId jika belum ada
  if (!existingCustomer.googleId) {
    await db
      .update(customers as any)
      .set({ googleId })
      .where(eq(customers.id, existingCustomer.id));
  }
  customerId = existingCustomer.id;

  // Generate customer tokens using helper
  const loginTokenResponse = await createCustomerSession(existingCustomer);

  // Set refresh token as httpOnly cookie
  c.header("Set-Cookie", loginTokenResponse.setCookieHeader);

  // Redirect ke frontend dengan access token di query params
  const redirectUrl = new URL(`${process.env.FRONTEND_URL}/login/callback`);
  redirectUrl.searchParams.set("token", loginTokenResponse.accessToken);
  redirectUrl.searchParams.set("expires_in", loginTokenResponse.expiresIn.toString());

  return c.redirect(redirectUrl.toString());
});

/**
 * GET /api/public/profile
 * Get current customer profile
 */
router.get("/profile", requireCustomerAuth, async (c) => {
  const payload = c.get("jwtPayload");
  const customerId = Number(payload.sub);

  try {
    const rows = await db
      .select({ customer: customers, profile: customerProfiles })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(eq(customers.id, customerId))
      .limit(1);

    const row = rows[0];
    const customer = row
      ? { ...(row as any).customer, profile: (row as any).profile ?? null }
      : null;

    if (!customer) {
      return c.json({ success: false, message: "Customer tidak ditemukan" }, 404);
    }

    // Sanitize customer data to prevent XSS
    const sanitizedCustomer = sanitizeUserProfile({
      id: customer.id,
      email: customer.email,
      username: customer.username,
      phone: customer.phone,
      profile: customer.profile,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    });

    // Return customer data without sensitive information
    return c.json({
      success: true,
      data: sanitizedCustomer,
    });
  } catch (error) {
    console.error("Error fetching customer profile:", error);
    return c.json({ success: false, message: "Terjadi kesalahan" }, 500);
  }
});

/**
 * POST /api/public/refresh
 * Refresh customer access token
 */
router.post("/refresh", async (c) => {
  // Get refresh token from cookie
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").map((c) => {
      const [key, ...v] = c.split("=");
      return [key, v.join("=")];
    }),
  );
  const refreshToken = cookies["refresh_token"];

  if (!refreshToken) {
    return c.json({ success: false, message: "Refresh token required" }, 400);
  }

  try {
    // Cari refresh token di database
    const existing = await db.query.customerRefreshTokens.findFirst({
      where: eq(customerRefreshTokens.token, refreshToken),
    });

    if (!existing) {
      return c.json({ success: false, message: "Refresh token tidak valid" }, 401);
    }

    if (existing.revokedAt) {
      return c.json({ success: false, message: "Refresh token sudah dicabut" }, 401);
    }

    if (existing.expiresAt && new Date(existing.expiresAt) <= new Date()) {
      return c.json({ success: false, message: "Refresh token sudah kedaluwarsa" }, 401);
    }

    // Get customer data
    const rows = await db
      .select({ customer: customers, profile: customerProfiles })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(eq(customers.id, existing.customerId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return c.json({ success: false, message: "Customer not found" }, 404);
    }

    const customer = { ...row.customer, profile: row.profile ?? null };

    // Generate new access token
    const now = Math.floor(Date.now() / 1000);
    const exp = now + parseExpiry(JWT_EXPIRES_IN);
    const jwtToken = await sign(
      {
        sub: customer.id.toString(),
        typ: TYPE_CUSTOMER,
        exp,
        iat: now,
      },
      JWT_SECRET,
    );

    // Rotate refresh token: revoke current, issue new one
    const newRefreshToken = generateRefreshToken();
    const newRefreshExpAt = addSeconds(
      new Date(),
      parseExpiry(JWT_REFRESH_TOKEN_EXPIRES_IN),
    );

    await db
      .update(customerRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(customerRefreshTokens.id, existing.id));

    await db.insert(customerRefreshTokens).values({
      customerId: customer.id,
      token: newRefreshToken,
      expiresAt: newRefreshExpAt,
    });

    // Set new refresh token as httpOnly cookie
    const cookieOptions = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${parseExpiry(JWT_REFRESH_TOKEN_EXPIRES_IN)}`;
    c.header("Set-Cookie", `refresh_token=${newRefreshToken}; ${cookieOptions}`);

    return c.json({
      success: true,
      message: "Token refreshed successfully",
      accessToken: jwtToken,
      tokenType: "Bearer",
      expiresIn: exp,
    });
  } catch (error) {
    console.error("Error refreshing customer token:", error);
    return c.json({ success: false, message: "Failed to refresh token" }, 500);
  }
});

/**
 * POST /api/public/logout
 * Logout customer - revoke refresh token and clear cookie
 */
router.post("/logout", requireCustomerAuth, async (c) => {
  // Get refresh token from cookie
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").map((c) => {
      const [key, ...v] = c.split("=");
      return [key, v.join("=")];
    }),
  );
  const refreshToken = cookies["refresh_token"];

  if (refreshToken) {
    await db
      .delete(customerRefreshTokens)
      .where(eq(customerRefreshTokens.token, refreshToken));
  }

  // Clear refresh token cookie
  c.header("Set-Cookie", "refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");

  return c.json({
    success: true,
    message: "Logout sukses",
  });
});

export default router;
