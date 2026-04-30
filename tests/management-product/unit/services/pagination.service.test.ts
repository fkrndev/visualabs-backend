import { describe, it, expect, beforeEach } from 'vitest';

describe('Pagination Service - Unit Tests', () => {
  describe('Pagination Logic', () => {
    it('should calculate page numbers correctly', () => {
      // Test basic page calculations
      expect(calculateOffset(1, 20)).toBe(0);
      expect(calculateOffset(2, 20)).toBe(20);
      expect(calculateOffset(3, 20)).toBe(40);
      expect(calculateOffset(10, 50)).toBe(450);
    });

    it('should handle items per page variations', () => {
      const testCases = [
        { page: 1, limit: 10, expected: 0 },
        { page: 2, limit: 10, expected: 10 },
        { page: 1, limit: 20, expected: 0 },
        { page: 2, limit: 20, expected: 20 },
        { page: 1, limit: 50, expected: 0 },
        { page: 2, limit: 50, expected: 50 },
        { page: 1, limit: 100, expected: 0 },
        { page: 2, limit: 100, expected: 100 },
      ];

      testCases.forEach(({ page, limit, expected }) => {
        expect(calculateOffset(page, limit)).toBe(expected);
      });
    });

    it('should validate limit bounds', () => {
      // Test minimum and maximum limits
      expect(validateLimit(5)).toBe(10); // Below minimum should be set to default
      expect(validateLimit(10)).toBe(10);
      expect(validateLimit(20)).toBe(20);
      expect(validateLimit(50)).toBe(50);
      expect(validateLimit(100)).toBe(100);
      expect(validateLimit(150)).toBe(100); // Above maximum should be capped
    });

    it('should calculate total data counting', () => {
      const paginationData = {
        currentPage: 1,
        limit: 20,
        totalItems: 100,
        items: Array(20).fill({}), // Current page has 20 items
      };

      const result = calculatePaginationInfo(paginationData);

      expect(result.totalPages).toBe(5);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(false);
      expect(result.totalItems).toBe(100);
    });

    it('should handle last page correctly', () => {
      const paginationData = {
        currentPage: 5,
        limit: 20,
        totalItems: 100,
        items: Array(20).fill({}), // Last page has 20 items
      };

      const result = calculatePaginationInfo(paginationData);

      expect(result.totalPages).toBe(5);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });

    it('should handle partial last page', () => {
      const paginationData = {
        currentPage: 5,
        limit: 20,
        totalItems: 95, // Not a multiple of limit
        items: Array(15).fill({}), // Last page has only 15 items
      };

      const result = calculatePaginationInfo(paginationData);

      expect(result.totalPages).toBe(5);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });

    it('should handle jump to page functionality', () => {
      const testCases = [
        { currentPage: 1, targetPage: 5, totalPages: 10, expected: 5 },
        { currentPage: 10, targetPage: 1, totalPages: 10, expected: 1 },
        { currentPage: 5, targetPage: 15, totalPages: 10, expected: 10 }, // Cap at total pages
        { currentPage: 5, targetPage: 0, totalPages: 10, expected: 1 }, // Minimum is 1
      ];

      testCases.forEach(({ currentPage, targetPage, totalPages, expected }) => {
        expect(jumpToPage(currentPage, targetPage, totalPages)).toBe(expected);
      });
    });

    it('should handle edge cases for page calculations', () => {
      // Test with zero items
      const emptyData = {
        currentPage: 1,
        limit: 20,
        totalItems: 0,
        items: [],
      };

      const emptyResult = calculatePaginationInfo(emptyData);
      expect(emptyResult.totalPages).toBe(0);
      expect(emptyResult.hasNextPage).toBe(false);
      expect(emptyResult.hasPreviousPage).toBe(false);

      // Test with single item
      const singleItemData = {
        currentPage: 1,
        limit: 20,
        totalItems: 1,
        items: [{}],
      };

      const singleResult = calculatePaginationInfo(singleItemData);
      expect(singleResult.totalPages).toBe(1);
      expect(singleResult.hasNextPage).toBe(false);
      expect(singleResult.hasPreviousPage).toBe(false);
    });
  });

  describe('Sorting', () => {
    it('should handle ascending/descending per column', () => {
      const sortColumns = ['id', 'name', 'price', 'createdAt', 'updatedAt'];
      const sortOrders = ['asc', 'desc'];

      sortColumns.forEach(column => {
        sortOrders.forEach(order => {
          const result = buildSortClause(column, order as 'asc' | 'desc');
          expect(result).toHaveProperty('field', column);
          expect(result).toHaveProperty('direction', order);
        });
      });
    });

    it('should handle multiple column sorting', () => {
      const sortRules = [
        { field: 'name', direction: 'asc' as const },
        { field: 'price', direction: 'desc' as const },
        { field: 'id', direction: 'asc' as const },
      ];

      const result = buildMultiColumnSort(sortRules);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ field: 'name', direction: 'asc' });
      expect(result[1]).toEqual({ field: 'price', direction: 'desc' });
      expect(result[2]).toEqual({ field: 'id', direction: 'asc' });
    });

    it('should provide default sorting', () => {
      const result = getDefaultSort();
      expect(result).toEqual({ field: 'id', direction: 'asc' });
    });

    it('should validate sort fields', () => {
      const validFields = ['id', 'name', 'price', 'createdAt', 'updatedAt'];
      
      expect(validateSortField('name', validFields)).toBe(true);
      expect(validateSortField('price', validFields)).toBe(true);
      expect(validateSortField('invalid', validFields)).toBe(false);
      expect(validateSortField('', validFields)).toBe(false);
    });

    it('should validate sort directions', () => {
      expect(validateSortDirection('asc')).toBe(true);
      expect(validateSortDirection('desc')).toBe(true);
      expect(validateSortDirection('ASC')).toBe(false); // Case sensitive
      expect(validateSortDirection('DESC')).toBe(false); // Case sensitive
      expect(validateSortDirection('invalid')).toBe(false);
      expect(validateSortDirection('')).toBe(false);
    });
  });

  describe('Pagination Utilities', () => {
    it('should generate pagination metadata', () => {
      const metadata = generatePaginationMetadata({
        currentPage: 2,
        totalPages: 5,
        totalItems: 100,
        limit: 20,
        hasNextPage: true,
        hasPreviousPage: true,
      });

      expect(metadata).toEqual({
        currentPage: 2,
        totalPages: 5,
        totalItems: 100,
        limit: 20,
        hasNextPage: true,
        hasPreviousPage: true,
        startItem: 21,
        endItem: 40,
      });
    });

    it('should calculate start and end item numbers', () => {
      const testCases = [
        { page: 1, limit: 20, total: 100, expectedStart: 1, expectedEnd: 20 },
        { page: 2, limit: 20, total: 100, expectedStart: 21, expectedEnd: 40 },
        { page: 5, limit: 20, total: 95, expectedStart: 81, expectedEnd: 95 }, // Last page partial
        { page: 1, limit: 10, total: 5, expectedStart: 1, expectedEnd: 5 }, // Less items than limit
      ];

      testCases.forEach(({ page, limit, total, expectedStart, expectedEnd }) => {
        const { startItem, endItem } = calculateItemRange(page, limit, total);
        expect(startItem).toBe(expectedStart);
        expect(endItem).toBe(expectedEnd);
      });
    });

    it('should build pagination URLs', () => {
      const baseUrl = '/api/products';
      const params = { limit: 20, sort: 'name', order: 'asc' };

      const urls = buildPaginationUrls(baseUrl, 3, 5, params);

      expect(urls.first).toBe('/api/products?page=1&limit=20&sort=name&order=asc');
      expect(urls.last).toBe('/api/products?page=5&limit=20&sort=name&order=asc');
      expect(urls.prev).toBe('/api/products?page=2&limit=20&sort=name&order=asc');
      expect(urls.next).toBe('/api/products?page=4&limit=20&sort=name&order=asc');
    });

    it('should handle pagination URLs for edge cases', () => {
      const baseUrl = '/api/products';
      const params = { limit: 20 };

      // First page - no previous URL
      const firstPageUrls = buildPaginationUrls(baseUrl, 1, 3, params);
      expect(firstPageUrls.prev).toBeNull();
      expect(firstPageUrls.next).toBe('/api/products?page=2&limit=20');

      // Last page - no next URL
      const lastPageUrls = buildPaginationUrls(baseUrl, 3, 3, params);
      expect(lastPageUrls.next).toBeNull();
      expect(lastPageUrls.prev).toBe('/api/products?page=2&limit=20');

      // Single page - no prev or next
      const singlePageUrls = buildPaginationUrls(baseUrl, 1, 1, params);
      expect(singlePageUrls.prev).toBeNull();
      expect(singlePageUrls.next).toBeNull();
    });
  });
});

// Helper functions implementing pagination logic
function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

function validateLimit(limit: number): number {
  if (limit < 10) return 10;
  if (limit > 100) return 100;
  return limit;
}

function calculatePaginationInfo(data: {
  currentPage: number;
  limit: number;
  totalItems: number;
  items: any[];
}) {
  const totalPages = Math.ceil(data.totalItems / data.limit);
  const hasNextPage = data.currentPage < totalPages;
  const hasPreviousPage = data.currentPage > 1;

  return {
    totalPages,
    hasNextPage,
    hasPreviousPage,
    totalItems: data.totalItems,
  };
}

function jumpToPage(currentPage: number, targetPage: number, totalPages: number): number {
  if (targetPage < 1) return 1;
  if (targetPage > totalPages) return totalPages;
  return targetPage;
}

function buildSortClause(field: string, direction: 'asc' | 'desc') {
  return { field, direction };
}

function buildMultiColumnSort(rules: Array<{ field: string; direction: 'asc' | 'desc' }>) {
  return rules;
}

function getDefaultSort() {
  return { field: 'id', direction: 'asc' as const };
}

function validateSortField(field: string, validFields: string[]): boolean {
  return validFields.includes(field);
}

function validateSortDirection(direction: string): boolean {
  return direction === 'asc' || direction === 'desc';
}

function generatePaginationMetadata(data: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}) {
  const startItem = (data.currentPage - 1) * data.limit + 1;
  const endItem = Math.min(data.currentPage * data.limit, data.totalItems);

  return {
    ...data,
    startItem,
    endItem,
  };
}

function calculateItemRange(page: number, limit: number, totalItems: number) {
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalItems);
  return { startItem, endItem };
}

function buildPaginationUrls(
  baseUrl: string,
  currentPage: number,
  totalPages: number,
  params: Record<string, any>
) {
  const buildUrl = (page: number) => {
    const searchParams = new URLSearchParams({ page: page.toString(), ...params });
    return `${baseUrl}?${searchParams.toString()}`;
  };

  return {
    first: currentPage > 1 ? buildUrl(1) : buildUrl(1),
    last: currentPage < totalPages ? buildUrl(totalPages) : buildUrl(totalPages),
    prev: currentPage > 1 ? buildUrl(currentPage - 1) : null,
    next: currentPage < totalPages ? buildUrl(currentPage + 1) : null,
  };
}
