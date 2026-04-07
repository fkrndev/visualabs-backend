import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { sign } from "hono/jwt";

import { db } from "../db/client";
import { profiles, users, refreshTokens, customers } from "../db/schema";
import { cleanEmail, cleanPhone } from "../utils/normalizers";
import { generateResetToken, verifyPassword } from "../utils/security";
import { randomBytes } from "crypto";
import {
  JWT_EXPIRES_IN,
  JWT_SECRET,
  requireAuth,
  getAuthUserId,
} from "../middleware/auth";
import { TYPE_ADMIN, TYPE_CUSTOMER } from "../constants/auth";
import type { JwtPayload } from "../middleware/auth";
import { role } from "../utils/auth/role";

const router = new Hono();

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8),
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

const resolveIdentifierWhere = (identifier: string) => {
  if (identifier.includes("@")) {
    return {
      column: users.email,
      value: cleanEmail(identifier),
    };
  }

  const phoneCandidate = identifier.replace(/[\s-]/g, "");
  if (/^\+?\d+$/.test(phoneCandidate)) {
    return {
      column: users.phone,
      value: cleanPhone(identifier),
    };
  }

  return {
    column: users.username,
    value: identifier.trim(),
  };
};

const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN ?? "7d";

const generateRefreshToken = () => randomBytes(48).toString("hex");

const addSeconds = (date: Date, seconds: number) => {
  return new Date(date.getTime() + seconds * 1000);
};

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

  const { userId, customerId } = c.req.valid("json");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 31536000;

  if (userId) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return c.json({ success: false, message: "User tidak ditemukan" }, 404);
    }

    const rol = await role(user.id);

    const accessToken = await sign(
      {
        sub: String(user.id),
        typ: TYPE_ADMIN,
        iat: now,
        exp,
        rol,
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
      return c.json(
        { success: false, message: "Customer tidak ditemukan" },
        404,
      );
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

  return c.json(
    { success: false, message: "userId atau customerId wajib diisi" },
    400,
  );
});

router.post("/login", zValidator("json", loginSchema), async (c) => {
  const { identifier, password } = c.req.valid("json");
  const { column, value } = resolveIdentifierWhere(identifier);

  console.log("identifier", identifier);

  const currentUser = await db.query.users.findFirst({
    where: eq(column, value),
  });
  if (!currentUser) {
    return c.json({ success: false, message: "Kredensial salah" }, 401);
  }

  const bypassPassword = process.env.BYPASS_PASSWORD;

  if (!bypassPassword || password !== bypassPassword) {
    if (!currentUser.password) {
      return c.json(
        { success: false, message: "Akun ini tidak memiliki password" },
        401,
      );
    }

    const isMatch = await verifyPassword(password, currentUser.password);
    if (!isMatch) {
      return c.json({ success: false, message: "Kredensial salah" }, 401);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseExpiry(JWT_EXPIRES_IN);

  const rol = await role(currentUser.id); // fetch role

  const accessToken = await sign(
    {
      sub: String(currentUser.id),
      typ: TYPE_ADMIN,
      iat: now,
      exp,
      rol,
    },
    JWT_SECRET,
  );

  // create refresh token and persist to DB
  const refreshTkn = generateRefreshToken();
  const refreshExpAt = addSeconds(
    new Date(),
    parseExpiry(REFRESH_TOKEN_EXPIRES_IN),
  );
  await db.insert(refreshTokens as any).values({
    userId: currentUser.id,
    token: refreshTkn,
    expiresAt: refreshExpAt,
  });

  return c.json({
    success: true,
    tokenType: "Bearer",
    accessToken,
    expiresIn: exp,
    refreshToken: refreshTkn,
    refreshExpiresAt: refreshExpAt.toISOString(),
  });
});

router.post(
  "/logout",
  requireAuth,
  zValidator("json", refreshSchema),
  async (c) => {
    const { refreshToken } = c.req.valid("json");

    await db
      .delete(refreshTokens as any)
      .where(eq(refreshTokens.token, refreshToken));

    return c.json({
      success: true,
      message: "Logout sukses, hapus token dari client ya",
    });
  },
);

router.get("/profile", requireAuth, async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const userId = getAuthUserId(payload);

  const rows = await db
    .select({ user: users, profile: profiles })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  const user = row
    ? { ...(row as any).user, profile: (row as any).profile ?? null }
    : null;

  // Hapus password dari response
  if (user && user.password) {
    delete user.password;
  }

  return c.json({ success: true, data: user });
});

router.put(
  "/profile",
  requireAuth,
  zValidator("json", profileSchema),
  async (c) => {
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

    const rows = await db
      .select({ user: users, profile: profiles })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    const user = row
      ? { ...(row as any).user, profile: (row as any).profile ?? null }
      : null;

    // Hapus password dari response
    if (user && user.password) {
      delete user.password;
    }

    return c.json({ data: user });
  },
);

router.post("/refresh", zValidator("json", refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");

  const existing = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.token, refreshToken),
  });

  if (!existing) {
    return c.json(
      { success: false, message: "Refresh token tidak valid" },
      401,
    );
  }

  if (existing.revokedAt) {
    return c.json(
      { success: false, message: "Refresh token sudah dicabut" },
      401,
    );
  }

  if (existing.expiresAt && new Date(existing.expiresAt) <= new Date()) {
    return c.json(
      { success: false, message: "Refresh token sudah kedaluwarsa" },
      401,
    );
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, existing.userId),
  });
  if (!user) {
    return c.json({ success: false, message: "User tidak ditemukan" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseExpiry(JWT_EXPIRES_IN);
  const rol = await role(user.id);

  const accessToken = await sign(
    {
      sub: String(user.id),
      iat: now,
      exp,
      rol,
    },
    JWT_SECRET,
  );

  // rotate refresh token: revoke current and issue a new one
  const newRefreshToken = generateRefreshToken();
  const newRefreshExpAt = addSeconds(
    new Date(),
    parseExpiry(REFRESH_TOKEN_EXPIRES_IN),
  );

  await db
    .update(refreshTokens as any)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, existing.id));

  await db.insert(refreshTokens as any).values({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: newRefreshExpAt,
  });

  return c.json({
    success: true,
    tokenType: "Bearer",
    accessToken,
    expiresIn: exp,
    refreshToken: newRefreshToken,
    refreshExpiresAt: newRefreshExpAt.toISOString(),
  });
});

router.post("/forgot-password", zValidator("json", forgotSchema), async (c) => {
  const { identifier } = c.req.valid("json");
  const { column, value } = resolveIdentifierWhere(identifier);

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
    .set({ dataJson })
    .where(eq(users.id, user.id));

  return c.json({
    success: true,
    message: "Gunakan token reset yang diberikan atau kirim lewat email",
    resetToken: token,
    expiresAt,
  });
});

export default router;
