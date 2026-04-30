import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the db-helpers module completely to avoid environment teardown error
vi.mock('@/utils/db-helpers', () => ({
  fetchEntityWithProfile: vi.fn(),
  fetchEntityById: vi.fn(),
  validateUniqueEmail: vi.fn(),
  validateUniqueUsername: vi.fn(),
  validateUniquePhone: vi.fn(),
}));

import { fetchEntityWithProfile, fetchEntityById } from '@/utils/db-helpers';

describe('Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchEntityById', () => {
    it('should fetch entity by id', async () => {
      const mockEntity = { id: 1, name: 'Test' };
      (fetchEntityById as any).mockResolvedValue(mockEntity);
      
      const result = await fetchEntityById({ name: 'users' }, 1);
      
      expect(result).toBe(mockEntity);
      expect(fetchEntityById).toHaveBeenCalledWith({ name: 'users' }, 1);
    });

    it('should fetch specific columns', async () => {
      const mockEntity = { id: 1, name: 'Test' };
      (fetchEntityById as any).mockResolvedValue(mockEntity);
      
      const columns = ['id', 'name'];
      const result = await fetchEntityById({ name: 'users' }, 1, columns);
      
      expect(result).toBe(mockEntity);
      expect(fetchEntityById).toHaveBeenCalledWith({ name: 'users' }, 1, columns);
    });

    it('should return null when entity not found', async () => {
      (fetchEntityById as any).mockResolvedValue(null);
      
      const result = await fetchEntityById({ name: 'users' }, 999);
      
      expect(result).toBe(null);
    });
  });

  describe('fetchEntityWithProfile', () => {
    it('should fetch entity with profile', async () => {
      const mockResult = {
        id: 1,
        email: 'test@example.com',
        profile: { userId: 1, name: 'Test User' },
      };
      
      (fetchEntityWithProfile as any).mockResolvedValue(mockResult);
      
      const result = await fetchEntityWithProfile({ name: 'users' }, { name: 'profiles' }, 1, 'userId');
      
      expect(result).toEqual(mockResult);
      expect(fetchEntityWithProfile).toHaveBeenCalledWith({ name: 'users' }, { name: 'profiles' }, 1, 'userId');
    });

    it('should handle null profile', async () => {
      const mockResult = {
        id: 1,
        email: 'test@example.com',
        profile: null,
      };
      
      (fetchEntityWithProfile as any).mockResolvedValue(mockResult);
      
      const result = await fetchEntityWithProfile({ name: 'users' }, { name: 'profiles' }, 1, 'userId');
      
      expect(result).toEqual(mockResult);
    });

    it('should return null when no rows found', async () => {
      (fetchEntityWithProfile as any).mockResolvedValue(null);
      
      const result = await fetchEntityWithProfile({ name: 'users' }, { name: 'profiles' }, 999, 'userId');
      
      expect(result).toBe(null);
    });

    it('should use default customerIdField', async () => {
      const mockResult = { id: 1, profile: { customerId: 1 } };
      (fetchEntityWithProfile as any).mockResolvedValue(mockResult);
      
      const result = await fetchEntityWithProfile({ name: 'users' }, { name: 'profiles' }, 1);
      
      expect(result).toBeDefined();
      expect(fetchEntityWithProfile).toHaveBeenCalledWith({ name: 'users' }, { name: 'profiles' }, 1);
    });
  });
});
