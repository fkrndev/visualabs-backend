import { describe, it, expect } from 'vitest';
import { cleanEmail, cleanPhone } from '@/utils/normalizers';

describe('Normalizers', () => {
  describe('cleanEmail', () => {
    it('should trim and lowercase email', () => {
      const result = cleanEmail('  Test@Example.COM  ');
      expect(result).toBe('test@example.com');
    });

    it('should remove dots from local part', () => {
      const result = cleanEmail('test.user.name@example.com');
      expect(result).toBe('testusername@example.com');
    });

    it('should handle email without domain', () => {
      const result = cleanEmail('testuser');
      expect(result).toBe('testuser');
    });

    it('should handle multiple dots in local part', () => {
      const result = cleanEmail('t.e.s.t@example.com');
      expect(result).toBe('test@example.com');
    });

    it('should preserve domain part', () => {
      const result = cleanEmail('test@sub.example.com');
      expect(result).toBe('test@sub.example.com');
    });
  });

  describe('cleanPhone', () => {
    it('should remove all non-digit characters', () => {
      const result = cleanPhone('+62-812-3456-7890');
      expect(result).toBe('6281234567890');
    });

    it('should replace leading 0 with 62', () => {
      const result = cleanPhone('081234567890');
      expect(result).toBe('6281234567890');
    });

    it('should handle number starting with 62', () => {
      const result = cleanPhone('6281234567890');
      expect(result).toBe('6281234567890');
    });

    it('should throw error for phone number that is too short', () => {
      expect(() => cleanPhone('12345')).toThrow('Nomor telepon terlalu pendek');
    });

    it('should handle phone with spaces', () => {
      const result = cleanPhone('0812 3456 7890');
      expect(result).toBe('6281234567890');
    });

    it('should handle phone with parentheses', () => {
      const result = cleanPhone('(0812) 3456-7890');
      expect(result).toBe('6281234567890');
    });

    it('should handle minimum valid length', () => {
      const result = cleanPhone('0812345678');
      expect(result).toBe('62812345678');
    });
  });
});
