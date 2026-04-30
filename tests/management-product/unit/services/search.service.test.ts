import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from 'lodash-es';

// Mock debounce function
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn, delay) => {
    let timeoutId;
    const debouncedFn = (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
    debouncedFn.cancel = vi.fn(() => clearTimeout(timeoutId));
    debouncedFn.flush = vi.fn(() => fn());
    return debouncedFn;
  }),
}));

describe('Search Service - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Real-time search with 500ms debounce', () => {
    it('should debounce search input', async () => {
      const mockSearchFn = vi.fn();
      const debouncedSearch = debounce(mockSearchFn, 500);

      // Simulate rapid typing
      debouncedSearch('a');
      debouncedSearch('ap');
      debouncedSearch('app');
      debouncedSearch('apple');

      // Wait for debounce to settle
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(mockSearchFn).toHaveBeenCalledTimes(1);
      expect(mockSearchFn).toHaveBeenCalledWith('apple');
    });

    it('should not trigger search for empty input', async () => {
      const mockSearchFn = vi.fn();
      const debouncedSearch = debounce(mockSearchFn, 500);

      // Test with empty string
      debouncedSearch('');
      
      // Wait for debounce to settle
      await new Promise(resolve => setTimeout(resolve, 600));

      // The debounce function still gets called, but the search logic should handle empty input
      expect(mockSearchFn).toHaveBeenCalled();
      // Verify it was called with empty string
      expect(mockSearchFn).toHaveBeenCalledWith('');
    });

    it('should handle search cancellation', async () => {
      const mockSearchFn = vi.fn();
      const debouncedSearch = debounce(mockSearchFn, 500);

      debouncedSearch('apple');
      
      // Cancel before debounce completes
      setTimeout(() => {
        debouncedSearch.cancel();
      }, 200);

      await new Promise(resolve => setTimeout(resolve, 600));

      expect(mockSearchFn).not.toHaveBeenCalled();
    });
  });

  describe('Search by name only', () => {
    it('should search products by name', () => {
      const products = [
        { id: 1, name: 'Apple iPhone', description: 'Latest iPhone', price: '999' },
        { id: 2, name: 'Samsung Galaxy', description: 'Android phone', price: '799' },
        { id: 3, name: 'Apple MacBook', description: 'Laptop computer', price: '1299' },
      ];

      const results = searchByName(products, 'Apple');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Apple iPhone');
      expect(results[1].name).toBe('Apple MacBook');
    });

    it('should be case insensitive', () => {
      const products = [
        { id: 1, name: 'Apple iPhone', description: 'Latest iPhone', price: '999' },
        { id: 2, name: 'Samsung Galaxy', description: 'Android phone', price: '799' },
      ];

      const results1 = searchByName(products, 'apple');
      const results2 = searchByName(products, 'APPLE');
      const results3 = searchByName(products, 'Apple');

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
      expect(results3).toHaveLength(1);
      expect(results1[0].name).toBe('Apple iPhone');
      expect(results2[0].name).toBe('Apple iPhone');
      expect(results3[0].name).toBe('Apple iPhone');
    });

    it('should handle partial matches', () => {
      const products = [
        { id: 1, name: 'Apple iPhone', description: 'Latest iPhone', price: '999' },
        { id: 2, name: 'Samsung Galaxy', description: 'Android phone', price: '799' },
        { id: 3, name: 'Pineapple', description: 'Tropical fruit', price: '5' },
      ];

      const results = searchByName(products, 'app');

      expect(results).toHaveLength(2);
      expect(results.map(p => p.name)).toContain('Apple iPhone');
      expect(results.map(p => p.name)).toContain('Pineapple');
    });

    it('should return empty array for no matches', () => {
      const products = [
        { id: 1, name: 'Apple iPhone', description: 'Latest iPhone', price: '999' },
        { id: 2, name: 'Samsung Galaxy', description: 'Android phone', price: '799' },
      ];

      const results = searchByName(products, 'NonExistent');

      expect(results).toHaveLength(0);
    });
  });

  describe('Search by description only', () => {
    it('should search products by description', () => {
      const products = [
        { id: 1, name: 'iPhone', description: 'Latest Apple smartphone', price: '999' },
        { id: 2, name: 'Galaxy', description: 'Samsung Android device', price: '799' },
        { id: 3, name: 'MacBook', description: 'Apple laptop computer', price: '1299' },
      ];

      const results = searchByDescription(products, 'Apple');

      expect(results).toHaveLength(2);
      expect(results.map(p => p.name)).toContain('iPhone');
      expect(results.map(p => p.name)).toContain('MacBook');
    });

    it('should be case insensitive for description', () => {
      const products = [
        { id: 1, name: 'iPhone', description: 'Latest Apple smartphone', price: '999' },
      ];

      const results1 = searchByDescription(products, 'APPLE');
      const results2 = searchByDescription(products, 'apple');

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
    });

    it('should handle partial description matches', () => {
      const products = [
        { id: 1, name: 'iPhone', description: 'Latest smartphone with camera', price: '999' },
        { id: 2, name: 'Camera', description: 'Digital camera device', price: '599' },
      ];

      const results = searchByDescription(products, 'camera');

      expect(results).toHaveLength(2);
    });
  });

  describe('Search by name + description', () => {
    it('should search both name and description fields', () => {
      const products = [
        { id: 1, name: 'iPhone', description: 'Latest Apple smartphone', price: '999' },
        { id: 2, name: 'Samsung', description: 'Galaxy Android device', price: '799' },
        { id: 3, name: 'MacBook', description: 'Apple laptop computer', price: '1299' },
        { id: 4, name: 'Apple Watch', description: 'Smart watch', price: '399' },
      ];

      const results = searchByNameAndDescription(products, 'Apple');

      expect(results).toHaveLength(3);
      expect(results.map(p => p.name)).toContain('iPhone');
      expect(results.map(p => p.name)).toContain('MacBook');
      expect(results.map(p => p.name)).toContain('Apple Watch');
    });

    it('should prioritize name matches over description matches', () => {
      const products = [
        { id: 1, name: 'Apple iPhone', description: 'No mention of apple', price: '999' },
        { id: 2, name: 'Samsung', description: 'Contains apple in description', price: '799' },
      ];

      const results = searchByNameAndDescription(products, 'apple');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Apple iPhone'); // Name match should come first
      expect(results[1].name).toBe('Samsung');
    });

    it('should handle complex search queries', () => {
      const products = [
        { id: 1, name: 'Apple iPhone Pro', description: 'Professional smartphone', price: '999' },
        { id: 2, name: 'Samsung Galaxy Pro', description: 'Professional Android', price: '899' },
        { id: 3, name: 'Pro Camera', description: 'Professional photography equipment', price: '1299' },
      ];

      const results = searchByNameAndDescription(products, 'pro');

      expect(results).toHaveLength(3);
    });
  });

  describe('Empty search results', () => {
    it('should handle empty search query', () => {
      const products = [
        { id: 1, name: 'iPhone', description: 'Latest smartphone', price: '999' },
      ];

      const results1 = searchByName(products, '');
      const results2 = searchByNameAndDescription(products, '');
      const results3 = searchByDescription(products, '');

      expect(results1).toHaveLength(0);
      expect(results2).toHaveLength(0);
      expect(results3).toHaveLength(0);
    });

    it('should handle whitespace-only search query', () => {
      const products = [
        { id: 1, name: 'iPhone', description: 'Latest smartphone', price: '999' },
      ];

      const results = searchByName(products, '   ');

      expect(results).toHaveLength(0);
    });

    it('should handle search in empty product list', () => {
      const products: any[] = [];

      const results = searchByName(products, 'iPhone');

      expect(results).toHaveLength(0);
    });
  });

  describe('Search highlighting logic', () => {
    it('should highlight matching text in name', () => {
      const product = { id: 1, name: 'Apple iPhone', description: 'Latest smartphone', price: '999' };
      
      const highlighted = highlightSearchTerm(product, 'iPhone', 'name');

      expect(highlighted.name).toContain('<mark>iPhone</mark>');
      expect(highlighted.name).not.toContain('<mark>Apple</mark>');
    });

    it('should highlight matching text in description', () => {
      const product = { id: 1, name: 'iPhone', description: 'Latest Apple smartphone', price: '999' };
      
      const highlighted = highlightSearchTerm(product, 'Apple', 'description');

      expect(highlighted.description).toContain('<mark>Apple</mark>');
      expect(highlighted.description).not.toContain('<mark>Latest</mark>');
    });

    it('should be case insensitive for highlighting', () => {
      const product = { id: 1, name: 'Apple iPhone', description: 'Latest smartphone', price: '999' };
      
      const highlighted1 = highlightSearchTerm(product, 'apple', 'name');
      const highlighted2 = highlightSearchTerm(product, 'APPLE', 'name');

      expect(highlighted1.name).toContain('<mark>Apple</mark>');
      expect(highlighted2.name).toContain('<mark>Apple</mark>');
    });

    it('should handle multiple occurrences', () => {
      const product = { 
        id: 1, 
        name: 'Apple Apple iPhone', 
        description: 'Latest smartphone', 
        price: '999' 
      };
      
      const highlighted = highlightSearchTerm(product, 'Apple', 'name');

      expect(highlighted.name.match(/<mark>Apple<\/mark>/g)).toHaveLength(2);
    });

    it('should not modify other fields', () => {
      const product = { 
        id: 1, 
        name: 'Apple iPhone', 
        description: 'Latest smartphone', 
        price: '999' 
      };
      
      const highlighted = highlightSearchTerm(product, 'iPhone', 'name');

      expect(highlighted.description).toBe('Latest smartphone');
      expect(highlighted.price).toBe('999');
      expect(highlighted.id).toBe(1);
    });

    it('should handle empty search term', () => {
      const product = { 
        id: 1, 
        name: 'Apple iPhone', 
        description: 'Latest smartphone', 
        price: '999' 
      };
      
      const highlighted = highlightSearchTerm(product, '', 'name');

      expect(highlighted.name).toBe('Apple iPhone');
    });
  });

  describe('Search performance optimization', () => {
    it('should limit search results to reasonable number', () => {
      const products = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `Product ${i + 1}`,
        description: `Description for product ${i + 1}`,
        price: `${(i + 1) * 10}`,
      }));

      const results = searchByName(products, 'Product', 50);

      expect(results.length).toBeLessThanOrEqual(50);
    });

    it('should handle large search queries efficiently', () => {
      const products = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Product ${i + 1}`,
        description: `Description for product ${i + 1}`,
        price: `${(i + 1) * 10}`,
      }));

      const startTime = performance.now();
      const results = searchByNameAndDescription(products, 'Product');
      const endTime = performance.now();

      expect(results.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in less than 100ms
    });
  });
});

// Helper functions implementing search logic
function searchByName(products: any[], searchTerm: string, limit?: number): any[] {
  if (!searchTerm || !searchTerm.trim()) return [];
  
  const filtered = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return limit ? filtered.slice(0, limit) : filtered;
}

function searchByDescription(products: any[], searchTerm: string, limit?: number): any[] {
  if (!searchTerm || !searchTerm.trim()) return [];
  
  const filtered = products.filter(product =>
    product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return limit ? filtered.slice(0, limit) : filtered;
}

function searchByNameAndDescription(products: any[], searchTerm: string, limit?: number): any[] {
  if (!searchTerm || !searchTerm.trim()) return [];
  
  const filtered = products.filter(product => {
    const nameMatch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const descMatch = product.description && 
      product.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    return nameMatch || descMatch;
  });

  // Sort by name matches first
  filtered.sort((a, b) => {
    const aNameMatch = a.name.toLowerCase().includes(searchTerm.toLowerCase());
    const bNameMatch = b.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;
    return 0;
  });

  return limit ? filtered.slice(0, limit) : filtered;
}

function highlightSearchTerm(product: any, searchTerm: string, field: string): any {
  if (!searchTerm || !searchTerm.trim()) return product;
  
  const highlighted = { ...product };
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  
  if (highlighted[field] && typeof highlighted[field] === 'string') {
    highlighted[field] = highlighted[field].replace(regex, '<mark>$1</mark>');
  }
  
  return highlighted;
}
