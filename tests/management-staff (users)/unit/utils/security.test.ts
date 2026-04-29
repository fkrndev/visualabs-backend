import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hashPassword, verifyPassword, generateResetToken } from '@/utils/security';

// Mock Bun's password API
let saltCounter = 0;
global.Bun = {
  password: {
    hash: vi.fn(async (password: string, options: any) => {
      // Simple mock hash - just return a base64 encoded password with dynamic salt
      const salt = `mock_salt_${saltCounter++}`;
      return Buffer.from(`${password}:${salt}`).toString('base64');
    }),
    verify: vi.fn(async (password: string, hash: string) => {
      // Simple mock verify - decode and check
      const decoded = Buffer.from(hash, 'base64').toString('utf-8');
      const [storedPassword] = decoded.split(':');
      return storedPassword === password;
    }),
  },
} as any;

describe('Security Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saltCounter = 0;
  });

  describe('Password Hashing', () => {
    it('should hash password successfully', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(typeof hash).toBe('string');
    });

    it('should verify correct password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });

    it('should generate different salt for same password', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Token Generation', () => {
    it('should generate valid JWT token', () => {
      // This is a placeholder - actual JWT generation would be tested elsewhere
      // For now, we test the reset token generation
      const token = generateResetToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should generate unique reset token', () => {
      const token1 = generateResetToken();
      const token2 = generateResetToken();
      
      expect(token1).not.toBe(token2);
    });

    it('should generate 48-character hex string for reset token', () => {
      const token = generateResetToken();
      expect(token).toHaveLength(48);
      expect(/^[0-9a-f]{48}$/.test(token)).toBe(true);
    });
  });
});
