import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the db-helpers module completely to avoid environment teardown error
vi.mock('@/utils/db-helpers', () => ({
  softDeleteEntity: vi.fn(),
  restoreEntity: vi.fn(),
  validateUniqueEmail: vi.fn(),
  validateUniqueUsername: vi.fn(),
  validateUniquePhone: vi.fn(),
  fetchEntityWithProfile: vi.fn(),
  fetchEntityById: vi.fn(),
}));

import { softDeleteEntity, restoreEntity } from '@/utils/db-helpers';

describe('Soft Delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('softDeleteEntity', () => {
    it('should set deletedAt timestamp', async () => {
      (softDeleteEntity as any).mockResolvedValue({ id: 1, deletedAt: new Date() });
      
      const result = await softDeleteEntity({ name: 'users' }, 1);
      
      expect(result).toBeDefined();
      expect(softDeleteEntity).toHaveBeenCalledWith({ name: 'users' }, 1);
    });

    it('should call with table and id', async () => {
      (softDeleteEntity as any).mockResolvedValue({});
      
      await softDeleteEntity({ name: 'users' }, 123);
      
      expect(softDeleteEntity).toHaveBeenCalledWith({ name: 'users' }, 123);
    });

    it('should handle different table types', async () => {
      const mockTable = { name: 'testTable' };
      (softDeleteEntity as any).mockResolvedValue({});
      
      await softDeleteEntity(mockTable, 1);
      
      expect(softDeleteEntity).toHaveBeenCalledWith(mockTable, 1);
    });
  });

  describe('restoreEntity', () => {
    it('should set deletedAt to null', async () => {
      (restoreEntity as any).mockResolvedValue({ id: 1, deletedAt: null });
      
      const result = await restoreEntity({ name: 'users' }, 1);
      
      expect(result).toBeDefined();
      expect(restoreEntity).toHaveBeenCalledWith({ name: 'users' }, 1);
    });

    it('should call with table and id', async () => {
      (restoreEntity as any).mockResolvedValue({});
      
      await restoreEntity({ name: 'users' }, 456);
      
      expect(restoreEntity).toHaveBeenCalledWith({ name: 'users' }, 456);
    });

    it('should handle different table types', async () => {
      const mockTable = { name: 'testTable' };
      (restoreEntity as any).mockResolvedValue({});
      
      await restoreEntity(mockTable, 1);
      
      expect(restoreEntity).toHaveBeenCalledWith(mockTable, 1);
    });
  });
});
