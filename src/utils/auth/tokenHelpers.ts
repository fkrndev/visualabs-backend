import {sign} from "hono/jwt";
import {eq} from "drizzle-orm";

import {db} from "../../db/client";
import {users, profiles, refreshTokens} from "../../db/schema";
import {parseExpiry, generateRefreshToken, addSeconds} from "./shared";
import {role} from "./role";
import {sanitizeUserProfile} from "../../utils/security/xss";
import {JWT_EXPIRES_IN, JWT_SECRET, JWT_REFRESH_TOKEN_EXPIRES_IN} from "../../middleware/auth";

/**
 * Generate JWT access token for a user
 */
export async function generateAccessToken(userId: number, userType: string) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + parseExpiry(JWT_EXPIRES_IN);
    const rol = await role(userId);

    return await sign(
        {
            sub: String(userId),
            typ: userType,
            iat: now,
            exp,
            rol: String(rol),
        },
        JWT_SECRET,
    );
}

/**
 * Create and store refresh token in database
 */
export async function createRefreshToken(userId: number) {
    const refreshTkn = generateRefreshToken();
    const refreshExpAt = addSeconds(new Date(), parseExpiry(JWT_REFRESH_TOKEN_EXPIRES_IN));

    await db.insert(refreshTokens as any).values({
        userId,
        token: refreshTkn,
        expiresAt: refreshExpAt,
    });

    return refreshTkn;
}

/**
 * Set refresh token as httpOnly cookie
 */
export function setRefreshTokenCookie(c: any, token: string) {
    const cookieOptions = `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${parseExpiry(JWT_REFRESH_TOKEN_EXPIRES_IN)}`;
    c.header("Set-Cookie", `refresh_token=${token}; ${cookieOptions}`);
}

/**
 * Clear refresh token cookie
 */
export function clearRefreshTokenCookie(c: any) {
    c.header("Set-Cookie", "refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
}

/**
 * Fetch user with profile and sanitize response
 */
export async function getUserWithProfile(userId: number) {
    const rows = await db.select({user: users, profile: profiles}).from(users).leftJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, userId)).limit(1);

    const row = rows[0];
    const user = row ? {...(row as any).user, profile: (row as any).profile ?? null} : null;

    // Remove password from response
    if (user && user.password) {
        delete user.password;
    }

    // Sanitize user data to prevent XSS
    return sanitizeUserProfile(user);
}
