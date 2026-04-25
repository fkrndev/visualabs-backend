import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  generateRefreshToken: vi.fn(() => 'test_refresh_token'),
  addSeconds: vi.fn((date, seconds) => new Date(date.getTime() + seconds * 1000)),
  resolveUserIdentifierWhere: vi.fn((identifier) => {
    if (identifier.includes('@')) return { column: 'email', value: identifier };
    return { column: 'username', value: identifier };
  }),
  resolveCustomerIdentifierWhere: vi.fn((identifier) => {
    if (identifier.includes('@')) return { column: 'email', value: identifier };
    return { column: 'phone', value: identifier };
  }),
}));

vi.mock('@/utils/auth/tokenHelpers', () => ({
  generateAccessToken: vi.fn(() => Promise.resolve('test_access_token')),
  createRefreshToken: vi.fn(() => Promise.resolve('test_refresh_token')),
  setRefreshTokenCookie: vi.fn(),
  clearRefreshTokenCookie: vi.fn(),
  getUserWithProfile: vi.fn(),
}));

vi.mock('@/utils/security', () => ({
  hashPassword: vi.fn(() => Promise.resolve('hashed_password')),
  verifyPassword: vi.fn(() => Promise.resolve(true)),
  generateResetToken: vi.fn(() => 'reset_token_123'),
}));

vi.mock('@/utils/security/accountLockout', () => ({
  checkLockout: vi.fn(() => Promise.resolve({ isLocked: false, remainingAttempts: 5 })),
  recordFailedAttempt: vi.fn(() => Promise.resolve({ isLocked: false })),
  recordSuccessfulAttempt: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/utils/security/securityLogger', () => ({
  logLoginSuccess: vi.fn(),
  logLoginFailed: vi.fn(),
  logAccountLocked: vi.fn(),
  logLogout: vi.fn(),
  logTokenRefresh: vi.fn(),
  logOAuthSuccess: vi.fn(),
  logOAuthFailed: vi.fn(),
}));

vi.mock('@/utils/auth/role', () => ({
  role: vi.fn(() => Promise.resolve('admin')),
}));

vi.mock('@/utils/auth/customerAuth', () => ({
  createCustomerSession: vi.fn(() => Promise.resolve({
    success: true,
    message: 'Login successful',
    tokenType: 'Bearer',
    accessToken: 'test_access_token',
    expiresIn: 1234567890,
    customer: { id: 1, email: 'customer@example.com' },
    setCookieHeader: 'refresh_token=test; HttpOnly; Secure',
  })),
}));

vi.mock('@/middleware/auth', () => ({
  JWT_SECRET: 'test_secret',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_TOKEN_EXPIRES_IN: '1h',
  requireAuth: vi.fn((c, next) => next()),
  requireAuthWithFallback: vi.fn((c, next) => next()),
  getAuthUserId: vi.fn(() => 1),
}));

vi.mock('@/middleware/rateLimit', () => ({
  rateLimit: vi.fn(() => (c, next) => next()),
}));

import { db } from '@/db/client';
import { users, customers, refreshTokens, customerRefreshTokens } from '@/db/schema';
import { verifyPassword } from '@/utils/security';
import { checkLockout, recordFailedAttempt, recordSuccessfulAttempt } from '@/utils/security/accountLockout';
import { generateAccessToken, createRefreshToken } from '@/utils/auth/tokenHelpers';
import { createCustomerSession } from '@/utils/auth/customerAuth';

describe('Admin Login Flow Integration', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/auth', authRouter);
    vi.clearAllMocks();
  });

  it('should successfully login with valid credentials', async () => {
    const mockUser = {
      id: 1,
      email: 'admin@example.com',
      password: 'hashed_password',
    };

    vi.mocked(db.query.users.findFirst).mockResolvedValue(mockUser);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(generateAccessToken).mockResolvedValue('access_token_123');
    vi.mocked(createRefreshToken).mockResolvedValue('refresh_token_123');

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@example.com',
        password: 'password123',
      }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.accessToken).toBe('access_token_123');
    expect(json.tokenType).toBe('Bearer');
  });

  it('should fail with invalid credentials', async () => {
    const mockUser = {
      id: 1,
      email: 'admin@example.com',
      password: 'hashed_password',
    };

    vi.mocked(db.query.users.findFirst).mockResolvedValue(mockUser);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    vi.mocked(recordFailedAttempt).mockResolvedValue({ isLocked: false });

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@example.com',
        password: 'wrong_password',
      }),
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('Kredensial salah');
  });

  it('should fail when user not found', async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue(null);
    vi.mocked(recordFailedAttempt).mockResolvedValue({ isLocked: false });

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'nonexistent@example.com',
        password: 'password123',
      }),
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('should lock account after too many failed attempts', async () => {
    const mockUser = {
      id: 1,
      email: 'admin@example.com',
      password: 'hashed_password',
    };

    vi.mocked(db.query.users.findFirst).mockResolvedValue(mockUser);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    vi.mocked(recordFailedAttempt).mockResolvedValue({
      isLocked: true,
      lockRemainingTime: 300000,
    });

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@example.com',
        password: 'wrong_password',
      }),
    });

    expect(response.status).toBe(423);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('terkunci');
  });

  it('should reject login when account is already locked', async () => {
    vi.mocked(checkLockout).mockResolvedValue({
      isLocked: true,
      lockRemainingTime: 300000,
    });

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@example.com',
        password: 'password123',
      }),
    });

    expect(response.status).toBe(423);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('terkunci');
  });

  it('should reset lockout on successful login', async () => {
    const mockUser = {
      id: 1,
      email: 'admin@example.com',
      password: 'hashed_password',
    };

    vi.mocked(checkLockout).mockResolvedValue({ isLocked: false, remainingAttempts: 5 });
    vi.mocked(db.query.users.findFirst).mockResolvedValue(mockUser);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(generateAccessToken).mockResolvedValue('access_token_123');
    vi.mocked(createRefreshToken).mockResolvedValue('refresh_token_123');

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@example.com',
        password: 'password123',
      }),
    });

    expect(response.status).toBe(200);
    expect(recordSuccessfulAttempt).toHaveBeenCalledWith('admin@example.com');
  });

  it('should validate request schema', async () => {
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'ab', // Too short
        password: '',
      }),
    });

    expect(response.status).toBe(400);
  });
});

describe('Customer Login Flow Integration', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/public', customerAuthRouter);
    vi.clearAllMocks();
  });

  it('should successfully login with valid credentials', async () => {
    const mockCustomer = {
      id: 1,
      email: 'customer@example.com',
      password: 'hashed_password',
    };

    const mockRow = {
      customer: mockCustomer,
      profile: null,
    };

    vi.mocked(checkLockout).mockResolvedValue({ isLocked: false, remainingAttempts: 5 });
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
    } as any);

    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(createCustomerSession).mockResolvedValue({
      success: true,
      message: 'Login successful',
      tokenType: 'Bearer',
      accessToken: 'access_token_123',
      expiresIn: 1234567890,
      customer: { id: 1, email: 'customer@example.com' },
      setCookieHeader: 'refresh_token=test; HttpOnly; Secure',
    });

    const response = await app.request('/api/public/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'customer@example.com',
        password: 'password123',
      }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.accessToken).toBe('access_token_123');
  });

  it('should fail with invalid credentials', async () => {
    const mockCustomer = {
      id: 1,
      email: 'customer@example.com',
      password: 'hashed_password',
    };

    const mockRow = {
      customer: mockCustomer,
      profile: null,
    };

    vi.mocked(checkLockout).mockResolvedValue({ isLocked: false, remainingAttempts: 5 });
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
    } as any);

    vi.mocked(verifyPassword).mockResolvedValue(false);
    vi.mocked(recordFailedAttempt).mockResolvedValue({ isLocked: false });

    const response = await app.request('/api/public/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'customer@example.com',
        password: 'wrong_password',
      }),
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('should fail when customer not found', async () => {
    vi.mocked(checkLockout).mockResolvedValue({ isLocked: false, remainingAttempts: 5 });
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as any);

    vi.mocked(recordFailedAttempt).mockResolvedValue({ isLocked: false });

    const response = await app.request('/api/public/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'nonexistent@example.com',
        password: 'password123',
      }),
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('should lock account after too many failed attempts', async () => {
    const mockCustomer = {
      id: 1,
      email: 'customer@example.com',
      password: 'hashed_password',
    };

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

    vi.mocked(verifyPassword).mockResolvedValue(false);
    vi.mocked(recordFailedAttempt).mockResolvedValue({
      isLocked: true,
      lockRemainingTime: 300000,
    });

    const response = await app.request('/api/public/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'customer@example.com',
        password: 'wrong_password',
      }),
    });

    expect(response.status).toBe(423);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('terkunci');
  });

  it('should reject login when account is already locked', async () => {
    vi.mocked(checkLockout).mockResolvedValue({
      isLocked: true,
      lockRemainingTime: 300000,
    });

    const response = await app.request('/api/public/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'customer@example.com',
        password: 'password123',
      }),
    });

    expect(response.status).toBe(423);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('should reset lockout on successful login', async () => {
    const mockCustomer = {
      id: 1,
      email: 'customer@example.com',
      password: 'hashed_password',
    };

    const mockRow = {
      customer: mockCustomer,
      profile: null,
    };

    vi.mocked(checkLockout).mockResolvedValue({ isLocked: false, remainingAttempts: 5 });
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
    } as any);

    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(createCustomerSession).mockResolvedValue({
      success: true,
      message: 'Login successful',
      tokenType: 'Bearer',
      accessToken: 'access_token_123',
      expiresIn: 1234567890,
      customer: { id: 1, email: 'customer@example.com' },
      setCookieHeader: 'refresh_token=test; HttpOnly; Secure',
    });

    const response = await app.request('/api/public/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'customer@example.com',
        password: 'password123',
      }),
    });

    expect(response.status).toBe(200);
    expect(recordSuccessfulAttempt).toHaveBeenCalledWith('customer@example.com');
  });

  it('should validate request schema', async () => {
    const response = await app.request('/api/public/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'ab', // Too short
        password: '',
      }),
    });

    expect(response.status).toBe(400);
  });
});
