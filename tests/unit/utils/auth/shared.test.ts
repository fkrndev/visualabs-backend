import { describe, it, expect } from 'vitest';
import {
  parseExpiry,
  generateRefreshToken,
  addSeconds,
  resolveUserIdentifierWhere,
  resolveCustomerIdentifierWhere,
} from '@/utils/auth/shared';

describe('parseExpiry', () => {
  it('should return default 3600 seconds for undefined value', () => {
    expect(parseExpiry(undefined)).toBe(3600);
  });

  it('should parse seconds format', () => {
    expect(parseExpiry('60s')).toBe(60);
    expect(parseExpiry('120s')).toBe(120);
  });

  it('should parse minutes format', () => {
    expect(parseExpiry('30m')).toBe(30 * 60);
    expect(parseExpiry('1h')).toBe(3600);
  });

  it('should parse hours format', () => {
    expect(parseExpiry('1h')).toBe(3600);
    expect(parseExpiry('2h')).toBe(2 * 3600);
  });

  it('should parse days format', () => {
    expect(parseExpiry('7d')).toBe(7 * 86400);
    expect(parseExpiry('1d')).toBe(86400);
  });

  it('should handle case insensitive units', () => {
    expect(parseExpiry('1H')).toBe(3600);
    expect(parseExpiry('1M')).toBe(60);
    expect(parseExpiry('1S')).toBe(1);
    expect(parseExpiry('1D')).toBe(86400);
  });

  it('should return plain number if no unit match', () => {
    expect(parseExpiry('500')).toBe(500);
    expect(parseExpiry('1000')).toBe(1000);
  });

  it('should return default for invalid format', () => {
    expect(parseExpiry('invalid')).toBe(3600);
    expect(parseExpiry('')).toBe(3600);
  });
});

describe('generateRefreshToken', () => {
  it('should generate a 96-character hex string (48 bytes)', () => {
    const token = generateRefreshToken();
    expect(token).toHaveLength(96);
    expect(/^[0-9a-f]{96}$/.test(token)).toBe(true);
  });

  it('should generate unique tokens', () => {
    const token1 = generateRefreshToken();
    const token2 = generateRefreshToken();
    expect(token1).not.toBe(token2);
  });
});

describe('addSeconds', () => {
  it('should add seconds to date', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    const result = addSeconds(date, 60);
    expect(result.getTime()).toBe(date.getTime() + 60 * 1000);
  });

  it('should handle zero seconds', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    const result = addSeconds(date, 0);
    expect(result.getTime()).toBe(date.getTime());
  });

  it('should handle negative seconds', () => {
    const date = new Date('2024-01-01T00:01:00Z');
    const result = addSeconds(date, -60);
    expect(result.getTime()).toBe(date.getTime() - 60 * 1000);
  });
});

describe('resolveUserIdentifierWhere', () => {
  it('should resolve email identifier', () => {
    const result = resolveUserIdentifierWhere('test@example.com');
    expect(result.column).toBeDefined();
    expect(result.value).toBe('test@example.com');
  });

  it('should normalize email by removing dots from local part', () => {
    const result = resolveUserIdentifierWhere('test.user@example.com');
    expect(result.value).toBe('testuser@example.com');
  });

  it('should normalize email to lowercase', () => {
    const result = resolveUserIdentifierWhere('TEST@EXAMPLE.COM');
    expect(result.value).toBe('test@example.com');
  });

  it('should trim email whitespace', () => {
    const result = resolveUserIdentifierWhere('  test@example.com  ');
    expect(result.value).toBe('test@example.com');
  });

  it('should resolve phone identifier with + prefix', () => {
    const result = resolveUserIdentifierWhere('+628123456789');
    expect(result.value).toBe('628123456789');
  });

  it('should resolve phone identifier with leading 0', () => {
    const result = resolveUserIdentifierWhere('08123456789');
    expect(result.value).toBe('628123456789');
  });

  it('should resolve phone identifier with spaces', () => {
    const result = resolveUserIdentifierWhere('0812 3456 789');
    expect(result.value).toBe('628123456789');
  });

  it('should resolve phone identifier with dashes', () => {
    const result = resolveUserIdentifierWhere('0812-3456-789');
    expect(result.value).toBe('628123456789');
  });

  it('should resolve username identifier', () => {
    const result = resolveUserIdentifierWhere('testuser');
    expect(result.value).toBe('testuser');
  });

  it('should trim username', () => {
    const result = resolveUserIdentifierWhere('  testuser  ');
    expect(result.value).toBe('testuser');
  });
});

describe('resolveCustomerIdentifierWhere', () => {
  it('should resolve email identifier', () => {
    const result = resolveCustomerIdentifierWhere('test@example.com');
    expect(result.column).toBeDefined();
    expect(result.value).toBe('test@example.com');
  });

  it('should normalize email by removing dots from local part', () => {
    const result = resolveCustomerIdentifierWhere('test.user@example.com');
    expect(result.value).toBe('testuser@example.com');
  });

  it('should normalize email to lowercase', () => {
    const result = resolveCustomerIdentifierWhere('TEST@EXAMPLE.COM');
    expect(result.value).toBe('test@example.com');
  });

  it('should trim email whitespace', () => {
    const result = resolveCustomerIdentifierWhere('  test@example.com  ');
    expect(result.value).toBe('test@example.com');
  });

  it('should resolve phone identifier with + prefix', () => {
    const result = resolveCustomerIdentifierWhere('+628123456789');
    expect(result.value).toBe('628123456789');
  });

  it('should resolve phone identifier with leading 0', () => {
    const result = resolveCustomerIdentifierWhere('08123456789');
    expect(result.value).toBe('628123456789');
  });

  it('should resolve phone identifier with spaces', () => {
    const result = resolveCustomerIdentifierWhere('0812 3456 789');
    expect(result.value).toBe('628123456789');
  });

  it('should resolve phone identifier with dashes', () => {
    const result = resolveCustomerIdentifierWhere('0812-3456-789');
    expect(result.value).toBe('628123456789');
  });

  it('should resolve username identifier', () => {
    const result = resolveCustomerIdentifierWhere('testuser');
    expect(result.value).toBe('testuser');
  });

  it('should trim username', () => {
    const result = resolveCustomerIdentifierWhere('  testuser  ');
    expect(result.value).toBe('testuser');
  });
});
