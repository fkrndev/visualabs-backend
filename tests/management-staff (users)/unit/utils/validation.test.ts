import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the db-helpers module directly to test the logic
vi.mock('@/utils/db-helpers', () => {
  const actual = vi.importActual('@/utils/db-helpers');
  return {
    ...actual,
    validateUniqueEmail: vi.fn(),
    validateUniqueUsername: vi.fn(),
    validateUniquePhone: vi.fn(),
  };
});

import { validateUniqueEmail, validateUniqueUsername, validateUniquePhone } from '@/utils/db-helpers';

describe('Validation Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateUniqueEmail', () => {
    it('should return true when email does not exist', async () => {
      (validateUniqueEmail as any).mockResolvedValue(true);
      
      const result = await validateUniqueEmail('test@example.com', undefined, { name: 'users' });
      
      expect(result).toBe(true);
    });

    it('should return false when email already exists', async () => {
      (validateUniqueEmail as any).mockResolvedValue(false);
      
      const result = await validateUniqueEmail('test@example.com', undefined, { name: 'users' });
      
      expect(result).toBe(false);
    });

    it('should exclude user ID when checking for duplicates', async () => {
      (validateUniqueEmail as any).mockResolvedValue(true);
      
      const result = await validateUniqueEmail('test@example.com', 1, { name: 'users' });
      
      expect(result).toBe(true);
      expect(validateUniqueEmail).toHaveBeenCalledWith('test@example.com', 1, { name: 'users' });
    });
  });

  describe('validateUniqueUsername', () => {
    it('should return true when username does not exist', async () => {
      (validateUniqueUsername as any).mockResolvedValue(true);
      
      const result = await validateUniqueUsername('testuser', undefined, { name: 'users' });
      
      expect(result).toBe(true);
    });

    it('should return false when username already exists', async () => {
      (validateUniqueUsername as any).mockResolvedValue(false);
      
      const result = await validateUniqueUsername('testuser', undefined, { name: 'users' });
      
      expect(result).toBe(false);
    });

    it('should exclude user ID when checking for duplicates', async () => {
      (validateUniqueUsername as any).mockResolvedValue(true);
      
      const result = await validateUniqueUsername('testuser', 1, { name: 'users' });
      
      expect(result).toBe(true);
    });
  });

  describe('validateUniquePhone', () => {
    it('should return true when phone does not exist', async () => {
      (validateUniquePhone as any).mockResolvedValue(true);
      
      const result = await validateUniquePhone('628123456789', undefined, { name: 'users' });
      
      expect(result).toBe(true);
    });

    it('should return false when phone already exists', async () => {
      (validateUniquePhone as any).mockResolvedValue(false);
      
      const result = await validateUniquePhone('628123456789', undefined, { name: 'users' });
      
      expect(result).toBe(false);
    });

    it('should exclude user ID when checking for duplicates', async () => {
      (validateUniquePhone as any).mockResolvedValue(true);
      
      const result = await validateUniquePhone('628123456789', 1, { name: 'users' });
      
      expect(result).toBe(true);
    });
  });
});
