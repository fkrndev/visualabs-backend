import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateAccessToken,
  createRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getUserWithProfile,
} from '@/utils/auth/tokenHelpers';

// Mock dependencies
vi.mock('hono/jwt', () => ({
  sign: vi.fn(),
}));

vi.mock('@/db/client', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('@/db/schema', () => ({
  users: {},
  profiles: {},
  refreshTokens: {},
}));

vi.mock('@/utils/auth/shared', () => ({
  parseExpiry: vi.fn((val) => {
    if (val === '15m') return 900;
    if (val === '1h') return 3600;
    return 3600;
  }),
  generateRefreshToken: vi.fn(() => 'mock_refresh_token_123'),
  addSeconds: vi.fn((date, seconds) => new Date(date.getTime() + seconds * 1000)),
}));

vi.mock('@/utils/auth/role', () => ({
  role: vi.fn(() => Promise.resolve('admin')),
}));

vi.mock('@/utils/security/xss', () => ({
  sanitizeUserProfile: vi.fn((user) => user),
}));

vi.mock('@/middleware/auth', () => ({
  JWT_SECRET: 'test_secret',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_TOKEN_EXPIRES_IN: '1h',
}));

import { sign } from 'hono/jwt';
import { db } from '@/db/client';
import { users, profiles, refreshTokens } from '@/db/schema';
import { parseExpiry, generateRefreshToken, addSeconds } from '@/utils/auth/shared';
import { role } from '@/utils/auth/role';
import { sanitizeUserProfile } from '@/utils/security/xss';
import { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_TOKEN_EXPIRES_IN } from '@/middleware/auth';

describe('generateAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate a valid JWT access token', async () => {
    vi.mocked(sign).mockResolvedValue('mock_jwt_token');

    const token = await generateAccessToken(1, 'admin');

    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: '1',
        typ: 'admin',
        iat: expect.any(Number),
        exp: expect.any(Number),
        rol: 'admin',
      }),
      JWT_SECRET
    );
    expect(token).toBe('mock_jwt_token');
  });

  it('should include correct user ID in token', async () => {
    vi.mocked(sign).mockResolvedValue('mock_jwt_token');

    await generateAccessToken(123, 'customer');

    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: '123',
        typ: 'customer',
      }),
      JWT_SECRET
    );
  });

  it('should calculate expiry based on JWT_EXPIRES_IN', async () => {
    vi.mocked(sign).mockResolvedValue('mock_jwt_token');
    vi.mocked(parseExpiry).mockReturnValue(900);

    const now = Math.floor(Date.now() / 1000);
    await generateAccessToken(1, 'admin');

    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        exp: now + 900,
      }),
      JWT_SECRET
    );
  });

  it('should include user role in token', async () => {
    vi.mocked(sign).mockResolvedValue('mock_jwt_token');
    vi.mocked(role).mockResolvedValue('superadmin');

    await generateAccessToken(1, 'admin');

    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        rol: 'superadmin',
      }),
      JWT_SECRET
    );
  });
});

describe('createRefreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create and store refresh token', async () => {
    const insertMock = vi.fn().mockReturnThis();
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({
      values: valuesMock,
    } as any);
    valuesMock.mockReturnValue(insertMock);

    const token = await createRefreshToken(1);

    expect(generateRefreshToken).toHaveBeenCalled();
    expect(addSeconds).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledWith(refreshTokens);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        token: 'mock_refresh_token_123',
        expiresAt: expect.any(Date),
      })
    );
    expect(token).toBe('mock_refresh_token_123');
  });

  it('should generate unique refresh token', async () => {
    vi.mocked(generateRefreshToken).mockReturnValue('unique_token_456');
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({
      values: valuesMock,
    } as any);

    const token = await createRefreshToken(2);

    expect(token).toBe('unique_token_456');
  });

  it('should calculate expiry based on JWT_REFRESH_TOKEN_EXPIRES_IN', async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({
      values: valuesMock,
    } as any);

    await createRefreshToken(1);

    expect(addSeconds).toHaveBeenCalledWith(expect.any(Date), expect.any(Number));
  });
});

describe('setRefreshTokenCookie', () => {
  it('should set refresh token as httpOnly cookie', () => {
    const mockContext = {
      header: vi.fn(),
    };

    setRefreshTokenCookie(mockContext, 'test_token');

    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('refresh_token=test_token')
    );
    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('HttpOnly')
    );
    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Secure')
    );
    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('SameSite=Strict')
    );
  });

  it('should include correct Max-Age', () => {
    const mockContext = {
      header: vi.fn(),
    };

    setRefreshTokenCookie(mockContext, 'test_token');

    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Max-Age=')
    );
  });

  it('should set Path to root', () => {
    const mockContext = {
      header: vi.fn(),
    };

    setRefreshTokenCookie(mockContext, 'test_token');

    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Path=/')
    );
  });
});

describe('clearRefreshTokenCookie', () => {
  it('should clear refresh token cookie', () => {
    const mockContext = {
      header: vi.fn(),
    };

    clearRefreshTokenCookie(mockContext);

    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('refresh_token=')
    );
    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Max-Age=0')
    );
  });

  it('should include security flags when clearing', () => {
    const mockContext = {
      header: vi.fn(),
    };

    clearRefreshTokenCookie(mockContext);

    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('HttpOnly')
    );
    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Secure')
    );
    expect(mockContext.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('SameSite=Strict')
    );
  });
});

describe('getUserWithProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch user with profile', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      password: 'hashed_password',
    };
    const mockProfile = {
      userId: 1,
      firstName: 'John',
      lastName: 'Doe',
    };

    const limitMock = vi.fn().mockResolvedValue([
      { user: mockUser, profile: mockProfile },
    ]);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: limitMock,
          }),
        }),
      }),
    } as any);

    const result = await getUserWithProfile(1);

    expect(db.select).toHaveBeenCalled();
    expect(result).toEqual({
      id: 1,
      email: 'test@example.com',
      profile: mockProfile,
    });
  });

  it('should remove password from user object', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      password: 'hashed_password',
    };
    const mockProfile = {
      userId: 1,
      firstName: 'John',
    };

    const limitMock = vi.fn().mockResolvedValue([
      { user: mockUser, profile: mockProfile },
    ]);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: limitMock,
          }),
        }),
      }),
    } as any);

    const result = await getUserWithProfile(1);

    expect(result).not.toHaveProperty('password');
  });

  it('should handle user without profile', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      password: 'hashed_password',
    };

    const limitMock = vi.fn().mockResolvedValue([
      { user: mockUser, profile: null },
    ]);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: limitMock,
          }),
        }),
      }),
    } as any);

    const result = await getUserWithProfile(1);

    expect(result).toEqual({
      id: 1,
      email: 'test@example.com',
      profile: null,
    });
  });

  it('should return null when user not found', async () => {
    const limitMock = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: limitMock,
          }),
        }),
      }),
    } as any);

    const result = await getUserWithProfile(999);

    expect(result).toBeNull();
  });

  it('should sanitize user profile data', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
    };
    const mockProfile = {
      userId: 1,
      firstName: '<script>alert("xss")</script>',
    };

    const sanitizedProfile = {
      userId: 1,
      firstName: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    };

    vi.mocked(sanitizeUserProfile).mockImplementation((user) => {
      if (user.profile) {
        user.profile = sanitizedProfile;
      }
      return user;
    });

    const limitMock = vi.fn().mockResolvedValue([
      { user: mockUser, profile: mockProfile },
    ]);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: limitMock,
          }),
        }),
      }),
    } as any);

    const result = await getUserWithProfile(1);

    expect(sanitizeUserProfile).toHaveBeenCalled();
    expect(result?.profile).toEqual(sanitizedProfile);
  });
});
