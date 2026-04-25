import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import authRouter from '@/routes/auth';
import customerAuthRouter from '@/routes/customerAuth';

// Mock database
vi.mock('@/db/client', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
      customers: {
        findFirst: vi.fn(),
      },
      refreshTokens: {
        findFirst: vi.fn(),
      },
      customerRefreshTokens: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
  },
}));

// Mock schema
vi.mock('@/db/schema', () => ({
  users: {},
  profiles: {},
  refreshTokens: {},
  customers: {},
  customerProfiles: {},
  customerRefreshTokens: {},
}));

// Mock utilities
vi.mock('@/utils/auth/shared', () => ({
  parseExpiry: vi.fn(() => 900),
  generateRefreshToken: vi.fn(() => 'new_refresh_token'),
  addSeconds: vi.fn((date, seconds) => new Date(date.getTime() + seconds * 1000)),
}));

vi.mock('@/utils/auth/tokenHelpers', () => ({
  generateAccessToken: vi.fn(() => Promise.resolve('new_access_token')),
  createRefreshToken: vi.fn(() => Promise.resolve('new_refresh_token')),
  setRefreshTokenCookie: vi.fn(),
  clearRefreshTokenCookie: vi.fn(),
  getUserWithProfile: vi.fn(),
}));

vi.mock('@/utils/security', () => ({
  hashPassword: vi.fn(() => Promise.resolve('hashed_password')),
  verifyPassword: vi.fn(() => Promise.resolve(true)),
  generateResetToken: vi.fn(() => 'reset_token_123'),
}));

vi.mock('@/middleware/auth', () => ({
  JWT_SECRET: 'test_secret',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_TOKEN_EXPIRES_IN: '1h',
  requireAuth: vi.fn((c, next) => next()),
  requireAuthWithFallback: vi.fn((c, next) => next()),
  getAuthUserId: vi.fn(() => 1),
}));

import { db } from '@/db/client';
import { users, customers, refreshTokens, customerRefreshTokens } from '@/db/schema';
import { generateAccessToken, createRefreshToken } from '@/utils/auth/tokenHelpers';

describe('Admin Refresh Token Rotation Integration', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/auth', authRouter);
    vi.clearAllMocks();
  });

  it('should successfully rotate refresh token', async () => {
    const mockUser = {
      id: 1,
      email: 'admin@example.com',
    };

    const mockExistingToken = {
      id: 1,
      userId: 1,
      token: 'old_refresh_token',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
    };

    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValue(mockExistingToken);
    vi.mocked(db.query.users.findFirst).mockResolvedValue(mockUser);
    vi.mocked(generateAccessToken).mockResolvedValue('new_access_token');
    vi.mocked(createRefreshToken).mockResolvedValue('new_refresh_token');

    const whereMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: whereMock,
      }),
    } as any);

    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=old_refresh_token',
      },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.accessToken).toBe('new_access_token');
    expect(db.update).toHaveBeenCalledWith(refreshTokens);
  });

  it('should fail when refresh token is missing', async () => {
    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('Refresh token required');
  });

  it('should fail when refresh token is invalid', async () => {
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValue(null);

    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=invalid_token',
      },
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('tidak valid');
  });

  it('should fail when refresh token is already revoked', async () => {
    const mockExistingToken = {
      id: 1,
      userId: 1,
      token: 'revoked_token',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: new Date(),
    };

    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValue(mockExistingToken);

    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=revoked_token',
      },
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('dicabut');
  });

  it('should fail when refresh token is expired', async () => {
    const mockExistingToken = {
      id: 1,
      userId: 1,
      token: 'expired_token',
      expiresAt: new Date(Date.now() - 3600000),
      revokedAt: null,
    };

    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValue(mockExistingToken);

    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=expired_token',
      },
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('kedaluwarsa');
  });

  it('should fail when user not found', async () => {
    const mockExistingToken = {
      id: 1,
      userId: 999,
      token: 'valid_token',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
    };

    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValue(mockExistingToken);
    vi.mocked(db.query.users.findFirst).mockResolvedValue(null);

    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=valid_token',
      },
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('tidak ditemukan');
  });

  it('should issue new access token on successful refresh', async () => {
    const mockUser = {
      id: 1,
      email: 'admin@example.com',
    };

    const mockExistingToken = {
      id: 1,
      userId: 1,
      token: 'old_refresh_token',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
    };

    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValue(mockExistingToken);
    vi.mocked(db.query.users.findFirst).mockResolvedValue(mockUser);
    vi.mocked(generateAccessToken).mockResolvedValue('new_access_token');
    vi.mocked(createRefreshToken).mockResolvedValue('new_refresh_token');

    const whereMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: whereMock,
      }),
    } as any);

    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=old_refresh_token',
      },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.accessToken).toBe('new_access_token');
    expect(json.tokenType).toBe('Bearer');
    expect(json.expiresIn).toBeDefined();
  });
});

describe('Customer Refresh Token Rotation Integration', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/public', customerAuthRouter);
    vi.clearAllMocks();
  });

  it('should successfully rotate refresh token', async () => {
    const mockCustomer = {
      id: 1,
      email: 'customer@example.com',
    };

    const mockExistingToken = {
      id: 1,
      customerId: 1,
      token: 'old_refresh_token',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
    };

    vi.mocked(db.query.customerRefreshTokens.findFirst).mockResolvedValue(mockExistingToken);

    const mockRow = {
      customer: mockCustomer,
      profile: null,
    };

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
    } as any);

    vi.mocked(createRefreshToken).mockReturnValue('new_refresh_token');

    const whereMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: whereMock,
      }),
    } as any);

    const insertMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue(insertMock),
    } as any);

    const response = await app.request('/api/public/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=old_refresh_token',
      },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.accessToken).toBeDefined();
    expect(db.update).toHaveBeenCalledWith(customerRefreshTokens);
  });

  it('should fail when refresh token is missing', async () => {
    const response = await app.request('/api/public/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('Refresh token required');
  });

  it('should fail when refresh token is invalid', async () => {
    vi.mocked(db.query.customerRefreshTokens.findFirst).mockResolvedValue(null);

    const response = await app.request('/api/public/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=invalid_token',
      },
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('tidak valid');
  });

  it('should fail when refresh token is already revoked', async () => {
    const mockExistingToken = {
      id: 1,
      customerId: 1,
      token: 'revoked_token',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: new Date(),
    };

    vi.mocked(db.query.customerRefreshTokens.findFirst).mockResolvedValue(mockExistingToken);

    const response = await app.request('/api/public/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=revoked_token',
      },
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('dicabut');
  });

  it('should fail when refresh token is expired', async () => {
    const mockExistingToken = {
      id: 1,
      customerId: 1,
      token: 'expired_token',
      expiresAt: new Date(Date.now() - 3600000),
      revokedAt: null,
    };

    vi.mocked(db.query.customerRefreshTokens.findFirst).mockResolvedValue(mockExistingToken);

    const response = await app.request('/api/public/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=expired_token',
      },
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('kedaluwarsa');
  });

  it('should fail when customer not found', async () => {
    const mockExistingToken = {
      id: 1,
      customerId: 999,
      token: 'valid_token',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
    };

    vi.mocked(db.query.customerRefreshTokens.findFirst).mockResolvedValue(mockExistingToken);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as any);

    const response = await app.request('/api/public/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=valid_token',
      },
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('not found');
  });

  it('should issue new access token on successful refresh', async () => {
    const mockCustomer = {
      id: 1,
      email: 'customer@example.com',
    };

    const mockExistingToken = {
      id: 1,
      customerId: 1,
      token: 'old_refresh_token',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
    };

    vi.mocked(db.query.customerRefreshTokens.findFirst).mockResolvedValue(mockExistingToken);

    const mockRow = {
      customer: mockCustomer,
      profile: null,
    };

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
    } as any);

    vi.mocked(createRefreshToken).mockReturnValue('new_refresh_token');

    const whereMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: whereMock,
      }),
    } as any);

    const insertMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue(insertMock),
    } as any);

    const response = await app.request('/api/public/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': 'refresh_token=old_refresh_token',
      },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.accessToken).toBeDefined();
    expect(json.tokenType).toBe('Bearer');
    expect(json.expiresIn).toBeDefined();
  });
});
