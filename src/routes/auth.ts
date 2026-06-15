import {Hono} from "hono";
import {z} from "zod";
import {zValidator} from "@hono/zod-validator";
import {eq} from "drizzle-orm";
import {sign} from "hono/jwt";

import {db} from "../db/client";
import {profiles, users, refreshTokens, customers} from "../db/schema";
import {cleanEmail, cleanPhone} from "../utils/normalizers";
import {parseExpiry, generateRefreshToken, addSeconds, resolveUserIdentifierWhere} from "../utils/auth/shared";
import {getUserWithProfile, generateAccessToken, createRefreshToken, setRefreshTokenCookie, clearRefreshTokenCookie} from "../utils/auth/tokenHelpers";
import {generateResetToken, verifyPassword} from "../utils/security";
import {sanitizeUserProfile} from "../utils/security/xss";
import {JWT_EXPIRES_IN, JWT_SECRET, JWT_REFRESH_TOKEN_EXPIRES_IN, requireAuth, requireAuthWithFallback, getAuthUserId} from "../middleware/auth";
import {TYPE_ADMIN, TYPE_CUSTOMER} from "../constants/auth";
import type {JwtPayload} from "../middleware/auth";
import {role} from "../utils/auth/role";
import {getGoogleAuthUrl, handleGoogleOAuthCallback} from "../utils/auth/googleOAuth";
import {rateLimit} from "../middleware/rateLimit";
import {checkLockout, recordFailedAttempt, recordSuccessfulAttempt} from "../utils/security/accountLockout";
import {logLoginSuccess, logLoginFailed, logAccountLocked, logLogout, logTokenRefresh, logOAuthSuccess, logOAuthFailed} from "../utils/security/securityLogger";

const router = new Hono();

const loginSchema = z.object({
    identifier: z.string().min(3),
    password: z.string().min(1, "Password wajib diisi"),
});

const profileSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.email().optional(),
    phone: z.string().min(6).optional(),
    dataJson: z.record(z.string(), z.any()).optional(),
});

const forgotSchema = z.object({
    identifier: z.string().min(3),
});

const refreshSchema = z.object({
    refreshToken: z.string().min(16),
});

const testTokenSchema = z
    .object({
        userId: z.number().int().positive().optional(),
        customerId: z.number().int().positive().optional(),
    })
    .refine((data) => data.userId || data.customerId, {
        message: "userId atau customerId wajib diisi",
        path: ["userId"],
    });

// ============================================================================
// TEST ENDPOINTS
// ============================================================================

router.post("/test-token", zValidator("json", testTokenSchema), async (c) => {
    if (process.env.NODE_ENV === "production") {
        return c.json(
            {
                success: false,
                message: "Endpoint ini hanya tersedia di non-production",
            },
            403,
        );
    }

    const {userId, customerId} = c.req.valid("json");
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 31536000;

    if (userId) {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!user) {
            return c.json({success: false, message: "User tidak ditemukan"}, 404);
        }

        const accessToken = await sign(
            {
                sub: String(user.id),
                typ: TYPE_ADMIN,
                iat: now,
                exp,
                rol: await role(user.id),
            },
            JWT_SECRET,
        );

        return c.json({
            success: true,
            tokenType: "Bearer",
            accessToken,
            expiresIn: exp,
            target: "user",
            userId,
        });
    }

    if (customerId) {
        const customer = await db.query.customers.findFirst({
            where: eq(customers.id, customerId),
        });

        if (!customer) {
            return c.json({success: false, message: "Customer tidak ditemukan"}, 404);
        }

        const accessToken = await sign(
            {
                sub: String(customer.id),
                typ: TYPE_CUSTOMER,
                iat: now,
                exp,
            },
            JWT_SECRET,
        );

        return c.json({
            success: true,
            tokenType: "Bearer",
            accessToken,
            expiresIn: exp,
            target: "customer",
            customerId,
        });
    }

    return c.json({success: false, message: "userId atau customerId wajib diisi"}, 400);
});

// ============================================================================
// AUTHENTICATION
// ============================================================================

router.post(
    "/login",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 5, // Use env var or default to 5 for prod
    }), // 5 requests per 15 minutes (prod), higher for dev
    zValidator("json", loginSchema),
    async (c) => {
        const {identifier, password} = c.req.valid("json");
        const {column, value} = resolveUserIdentifierWhere(identifier);

        // Get IP address for logging
        const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0] || c.req.header("x-real-ip") || "unknown";
        const userAgent = c.req.header("user-agent");

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

        const currentUser = await db.query.users.findFirst({
            where: eq(column, value),
        });
        if (!currentUser) {
            await recordFailedAttempt(identifier);
            logLoginFailed(identifier, "User not found", ipAddress, userAgent);
            return c.json({success: false, message: "Kredensial salah"}, 401);
        }

        const bypassPassword = process.env.BYPASS_PASSWORD;

        if (!bypassPassword || password !== bypassPassword) {
            if (!currentUser.password) {
                await recordFailedAttempt(identifier);
                logLoginFailed(identifier, "No password set", ipAddress, userAgent);
                return c.json({success: false, message: "Akun ini tidak memiliki password"}, 401);
            }

            const isMatch = await verifyPassword(password, currentUser.password);
            if (!isMatch) {
                const failedResult = await recordFailedAttempt(identifier);
                logLoginFailed(identifier, "Invalid password", ipAddress, userAgent);

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

                return c.json({success: false, message: "Kredensial salah"}, 401);
            }
        }

        // Successful login - reset lockout and log
        await recordSuccessfulAttempt(identifier);
        logLoginSuccess(currentUser.id, undefined, identifier, ipAddress, userAgent);

        const accessToken = await generateAccessToken(currentUser.id, TYPE_ADMIN);
        const exp = Math.floor(Date.now() / 1000) + parseExpiry(JWT_EXPIRES_IN);

        // create refresh token and persist to DB
        const refreshTkn = await createRefreshToken(currentUser.id);

        // Set refresh token as httpOnly cookie
        setRefreshTokenCookie(c, refreshTkn);

        return c.json({
            success: true,
            tokenType: "Bearer",
            accessToken,
            expiresIn: exp,
        });
    },
);

router.post("/logout", requireAuth, async (c) => {
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
        await db.delete(refreshTokens as any).where(eq(refreshTokens.token, refreshToken));
    }

    // Clear refresh token cookie
    clearRefreshTokenCookie(c);

    return c.json({
        success: true,
        message: "Logout sukses",
    });
});

// ============================================================================
// VBOX LONG-LIVED TOKEN LOGIN
// ============================================================================

router.post(
    "/vbox-login",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 5,
    }),
    zValidator("json", loginSchema),
    async (c) => {
        const {identifier, password} = c.req.valid("json");
        const {column, value} = resolveUserIdentifierWhere(identifier);

        const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0] || c.req.header("x-real-ip") || "unknown";
        const userAgent = c.req.header("user-agent");

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

        const currentUser = await db.query.users.findFirst({
            where: eq(column, value),
        });
        if (!currentUser) {
            await recordFailedAttempt(identifier);
            logLoginFailed(identifier, "User not found", ipAddress, userAgent);
            return c.json({success: false, message: "Kredensial salah"}, 401);
        }

        const bypassPassword = process.env.BYPASS_PASSWORD;

        if (!bypassPassword || password !== bypassPassword) {
            if (!currentUser.password) {
                await recordFailedAttempt(identifier);
                logLoginFailed(identifier, "No password set", ipAddress, userAgent);
                return c.json({success: false, message: "Akun ini tidak memiliki password"}, 401);
            }

            const isMatch = await verifyPassword(password, currentUser.password);
            if (!isMatch) {
                const failedResult = await recordFailedAttempt(identifier);
                logLoginFailed(identifier, "Invalid password", ipAddress, userAgent);

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

                return c.json({success: false, message: "Kredensial salah"}, 401);
            }
        }

        // Successful login
        await recordSuccessfulAttempt(identifier);
        logLoginSuccess(currentUser.id, undefined, identifier, ipAddress, userAgent);

        // Generate long-lived token for VBOX (10 years)
        const now = Math.floor(Date.now() / 1000);
        const exp = now + (10 * 365 * 24 * 60 * 60); // 10 years in seconds

        const accessToken = await sign(
            {
                sub: String(currentUser.id),
                typ: TYPE_ADMIN,
                iat: now,
                exp,
                rol: await role(currentUser.id),
                vbox: true, // Flag to identify VBOX tokens
            },
            JWT_SECRET,
        );

        return c.json({
            success: true,
            tokenType: "Bearer",
            accessToken,
            expiresIn: exp - now, // Time until expiry in seconds
        });
    },
);

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
        return c.json({success: false, message: "Refresh token required"}, 400);
    }

    const existing = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, refreshToken),
    });

    if (!existing) {
        return c.json({success: false, message: "Refresh token tidak valid"}, 401);
    }

    if (existing.revokedAt) {
        return c.json({success: false, message: "Refresh token sudah dicabut"}, 401);
    }

    if (existing.expiresAt && new Date(existing.expiresAt) <= new Date()) {
        return c.json({success: false, message: "Refresh token sudah kedaluwarsa"}, 401);
    }

    const user = await db.query.users.findFirst({
        where: eq(users.id, existing.userId),
    });
    if (!user) {
        return c.json({success: false, message: "User tidak ditemukan"}, 404);
    }

    const accessToken = await generateAccessToken(user.id, TYPE_ADMIN);
    const exp = Math.floor(Date.now() / 1000) + parseExpiry(JWT_EXPIRES_IN);

    // rotate refresh token: revoke current and issue a new one
    await db
        .update(refreshTokens as any)
        .set({revokedAt: new Date()})
        .where(eq(refreshTokens.id, existing.id));

    const newRefreshToken = await createRefreshToken(user.id);

    // Set new refresh token as httpOnly cookie
    setRefreshTokenCookie(c, newRefreshToken);

    return c.json({
        success: true,
        tokenType: "Bearer",
        accessToken,
        expiresIn: exp,
    });
});

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

router.get("/profile", requireAuthWithFallback, async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const userId = getAuthUserId(payload);

    const sanitizedUser = await getUserWithProfile(userId);

    // Sanitize user data to prevent XSS
    const sanitizedProfile = sanitizeUserProfile(sanitizedUser);

    return c.json({success: true, data: sanitizedProfile});
});

router.put("/profile", requireAuth, zValidator("json", profileSchema), async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const userId = getAuthUserId(payload);
    const body = c.req.valid("json");

    const userUpdates: Partial<typeof users.$inferInsert> = {};
    if (body.email) userUpdates.email = cleanEmail(body.email);
    if (body.phone) userUpdates.phone = cleanPhone(body.phone);

    if (Object.keys(userUpdates).length) {
        await db
            .update(users as any)
            .set(userUpdates)
            .where(eq(users.id, userId));
    }

    if (body.name || body.email || body.phone || body.dataJson) {
        const profilePayload = {
            userId,
            name: body.name ?? null,
            email: body.email ?? null,
            phone: body.phone ?? null,
            dataJson: body.dataJson ?? null,
        };

        await db
            .insert(profiles as any)
            .values(profilePayload)
            .onDuplicateKeyUpdate({
                set: profilePayload,
            });
    }

    const sanitizedUser = await getUserWithProfile(userId);

    // Sanitize user data to prevent XSS
    const sanitizedProfile = sanitizeUserProfile(sanitizedUser);

    return c.json({data: sanitizedProfile});
});

// ============================================================================
// PASSWORD RECOVERY
// ============================================================================

router.post("/forgot-password", zValidator("json", forgotSchema), async (c) => {
    const {identifier} = c.req.valid("json");
    const {column, value} = resolveUserIdentifierWhere(identifier);

    const user = await db.query.users.findFirst({
        where: eq(column, value),
    });
    if (!user) {
        return c.json({
            success: true,
            message: "Jika akun ada, link reset sudah dikirim",
        });
    }

    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    const dataJson = {
        ...(user.dataJson ?? {}),
        resetToken: token,
        resetExpires: expiresAt,
    };

    await db
        .update(users as any)
        .set({dataJson})
        .where(eq(users.id, user.id));

    return c.json({
        success: true,
        message: "Gunakan token reset yang diberikan atau kirim lewat email",
        resetToken: token,
        expiresAt,
    });
});

// ============================================================================
// OAUTH
// ============================================================================

/**
 * GET /api/auth/google
 * Redirect ke Google OAuth consent screen untuk internal users
 */
router.get("/auth/google", (c) => {
    const {url: googleAuthUrl, stateCookie} = getGoogleAuthUrl("admin");

    c.header("Set-Cookie", stateCookie);
    return c.redirect(googleAuthUrl);
});

/**
 * GET /api/auth/google/callback
 * Handle callback dari Google OAuth untuk internal users
 */
router.get("/auth/google/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const cookieHeader = c.req.header("cookie") || "";

    // Use shared OAuth handler
    const oauthResult = await handleGoogleOAuthCallback({
        userType: "admin",
        code,
        state,
        error,
        cookieHeader,
    });

    if (!oauthResult.success || !oauthResult.user) {
        return c.redirect(oauthResult.errorRedirect || `${process.env.FRONTEND_URL}/admin/login?error=oauth_failed`);
    }

    const {id: googleId, email, name, picture} = oauthResult.user;

    // Cek apakah user sudah ada berdasarkan email
    const existingUser = await db.query.users.findFirst({
        where: eq(users.email, cleanEmail(email)),
    });

    // Tolak jika email tidak ditemukan di database
    if (!existingUser) {
        return c.redirect(`${process.env.FRONTEND_URL}/admin/login?error=email_not_registered`);
    }

    // Update googleId jika belum ada
    if (!existingUser.googleId) {
        await db
            .update(users as any)
            .set({googleId})
            .where(eq(users.id, existingUser.id));
    }

    const accessTokenJwt = await generateAccessToken(existingUser.id, TYPE_ADMIN);
    const exp = Math.floor(Date.now() / 1000) + parseExpiry(JWT_EXPIRES_IN);

    // create refresh token and persist to DB
    const refreshTkn = await createRefreshToken(existingUser.id);

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(c, refreshTkn);

    // Redirect ke frontend dengan access token di query params
    const redirectUrl = new URL(`${process.env.FRONTEND_URL}/admin/login/callback`);
    redirectUrl.searchParams.set("token", accessTokenJwt);
    redirectUrl.searchParams.set("expires_in", exp.toString());

    return c.redirect(redirectUrl.toString());
});

export default router;
