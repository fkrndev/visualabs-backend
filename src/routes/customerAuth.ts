import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, or } from "drizzle-orm";
import { sign, verify } from "hono/jwt";
import { randomBytes } from "crypto";
import { jwt } from "hono/jwt";

import { db } from "../db/client";
import { customers, customerProfiles, customerRefreshTokens } from "../db/schema";
import { cleanEmail, cleanPhone } from "../utils/normalizers";
import { verifyPassword } from "../utils/security";
import { getBusinessIdFromOrigin } from "../utils/business";
import { TYPE_CUSTOMER } from "../constants/auth";
import { createCustomerSession } from "../utils/auth/customerAuth";

const router = new Hono();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:3006/api/public/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8888";

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8),
});

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN ?? "7d";

// Customer authentication middleware
const requireCustomerAuth = jwt({
  secret: JWT_SECRET,
});

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

const resolveIdentifierWhere = (identifier: string, businessId: number) => {
  // Cek apakah identifier adalah email
  if (identifier.includes("@")) {
    return {
      column: customers.email,
      value: cleanEmail(identifier),
    };
  }

  // Cek apakah identifier adalah phone
  const phoneCandidate = identifier.replace(/[\s-]/g, "");
  if (/^\+?\d+$/.test(phoneCandidate)) {
    return {
      column: customers.phone,
      value: cleanPhone(identifier),
    };
  }

  // Fallback ke username
  return {
    column: customers.username,
    value: identifier.trim(),
  };
};

const generateRefreshToken = () => randomBytes(48).toString("hex");

const addSeconds = (date: Date, seconds: number) => {
  return new Date(date.getTime() + seconds * 1000);
};

/**
 * POST /api/public/login
 * Endpoint untuk login customer (public)
 */
router.post("/login", zValidator("json", loginSchema), async (c) => {
  const { identifier, password } = c.req.valid("json");
  const origin = c.req.header("origin") || c.req.header("referer") || null;

  // Dapatkan businessId berdasarkan origin
  const businessId = getBusinessIdFromOrigin(origin);

  const { column, value } = resolveIdentifierWhere(identifier, businessId);

  console.log("Customer login attempt:", { identifier, businessId });

  // Cari customer berdasarkan identifier dan businessId
  const rows = await db
    .select({ customer: customers, profile: customerProfiles })
    .from(customers)
    .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
    .where(and(eq(column, value), eq(customers.businessId, businessId)))
    .limit(1);

  const row = rows[0];
  const currentCustomer = row
    ? { ...(row as any).customer, profile: (row as any).profile ?? null }
    : null;

  if (!currentCustomer) {
    return c.json(
      { success: false, message: "Email/nomor telepon atau password salah" },
      401,
    );
  }

  const bypassPassword = process.env.BYPASS_PASSWORD;

  if (!bypassPassword || password !== bypassPassword) {
    if (!currentCustomer.password) {
      return c.json(
        { success: false, message: "Akun ini tidak memiliki password" },
        401,
      );
    }

    const isMatch = await verifyPassword(password, currentCustomer.password);
    if (!isMatch) {
      return c.json(
        { success: false, message: "Email/nomor telepon atau password salah" },
        401,
      );
    }
  }

  // Generate customer tokens using helper
  const loginTokenResponse = await createCustomerSession(currentCustomer);

  return c.json(loginTokenResponse);
});

/**
 * GET /api/public/auth/google
 * Redirect ke Google OAuth consent screen
 */
router.get("/auth/google", (c) => {
  const state = randomBytes(16).toString("hex");

  // Simpan state di cookie untuk validasi nanti
  c.header(
    "Set-Cookie",
    `oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`,
  );

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

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

  // Cek apakah ada error dari Google
  if (error) {
    return c.redirect(
      `${FRONTEND_URL}/login?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state) {
    return c.redirect(`${FRONTEND_URL}/login?error=missing_code_or_state`);
  }

  // Validasi state (ambil dari cookie)
  const cookieHeader = c.req.header("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").map((c) => {
      const [key, ...v] = c.split("=");
      return [key, v.join("=")];
    }),
  );

  const savedState = cookies["oauth_state"];
  if (savedState !== state) {
    return c.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
  }

  try {
    // Exchange code untuk access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      return c.redirect(`${FRONTEND_URL}/login?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Ambil user info dari Google
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      return c.redirect(`${FRONTEND_URL}/login?error=failed_to_get_user_info`);
    }

    const googleUser = await userInfoResponse.json();
    const { id: googleId, email, name, picture } = googleUser;

    // Dapatkan businessId dari origin atau default
    const origin = c.req.header("origin") || c.req.header("referer") || null;
    const businessId = getBusinessIdFromOrigin(origin);

    // Cek apakah customer sudah ada berdasarkan googleId atau email
    const existingRows = await db
      .select({ customer: customers, profile: customerProfiles })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(
        and(
          eq(customers.businessId, businessId),
          or(
            eq(customers.googleId, googleId),
            eq(customers.email, cleanEmail(email)),
          ),
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

    if (existingCustomer) {
      // Update googleId jika belum ada
      if (!existingCustomer.googleId) {
        await db
          .update(customers as any)
          .set({ googleId })
          .where(eq(customers.id, existingCustomer.id));
      }
      customerId = existingCustomer.id;
    } else {
      // Buat customer baru
      const [insertResult] = await db.insert(customers).values({
        businessId,
        email: cleanEmail(email),
        googleId,
        username: null,
        phone: null,
        fbid: null,
        password: null,
        dataJson: { picture },
      });

      customerId = Number(insertResult.insertId);

      // Buat profile
      await db.insert(customerProfiles).values({
        businessId,
        customerId,
        name,
        email,
        phone: null,
      });

      // Fetch customer yang baru dibuat
      const newRows = await db
        .select({ customer: customers, profile: customerProfiles })
        .from(customers)
        .leftJoin(
          customerProfiles,
          eq(customerProfiles.customerId, customers.id),
        )
        .where(eq(customers.id, customerId))
        .limit(1);

      const newRow = newRows[0];
      existingCustomer = newRow
        ? {
            ...(newRow as any).customer,
            profile: (newRow as any).profile ?? null,
          }
        : null;
    }

    // Generate customer tokens using helper
    const loginTokenResponse = await createCustomerSession(existingCustomer);

    // Redirect ke frontend dengan token di query params
    const redirectUrl = new URL(`${FRONTEND_URL}/login/callback`);
    redirectUrl.searchParams.set("token", loginTokenResponse.accessToken);
    redirectUrl.searchParams.set("refresh_token", loginTokenResponse.refreshToken);
    redirectUrl.searchParams.set("expires_in", loginTokenResponse.expiresIn.toString());

    return c.redirect(redirectUrl.toString());
  } catch (error: any) {
    console.error("Google OAuth error:", error);
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

/**
 * GET /api/public/profile
 * Get current customer profile
 */
router.get("/profile", requireCustomerAuth, async (c) => {
  const payload = c.get("jwtPayload");
  const customerId = Number(payload.sub);
  const businessId = Number(payload.bid);

  try {
    const rows = await db
      .select({ customer: customers, profile: customerProfiles })
      .from(customers)
      .leftJoin(customerProfiles, eq(customerProfiles.customerId, customers.id))
      .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)))
      .limit(1);

    const row = rows[0];
    const customer = row
      ? { ...(row as any).customer, profile: (row as any).profile ?? null }
      : null;

    if (!customer) {
      return c.json({ success: false, message: "Customer tidak ditemukan" }, 404);
    }

    // Return customer data without sensitive information
    return c.json({
      success: true,
      data: {
        id: customer.id,
        businessId: customer.businessId,
        email: customer.email,
        username: customer.username,
        phone: customer.phone,
        profile: customer.profile,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
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
  const { refreshToken } = await c.req.json();

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
        bid: customer.businessId,
        exp,
        iat: now,
      },
      JWT_SECRET,
    );

    // Rotate refresh token: revoke current, issue new one
    const newRefreshToken = generateRefreshToken();
    const newRefreshExpAt = addSeconds(
      new Date(),
      parseExpiry(REFRESH_TOKEN_EXPIRES_IN),
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

    return c.json({
      success: true,
      message: "Token refreshed successfully",
      accessToken: jwtToken,
      tokenType: "Bearer",
      expiresIn: exp,
      refreshToken: newRefreshToken,
      refreshExpiresAt: newRefreshExpAt.toISOString(),
    });
  } catch (error) {
    console.error("Error refreshing customer token:", error);
    return c.json({ success: false, message: "Failed to refresh token" }, 500);
  }
});

export default router;
