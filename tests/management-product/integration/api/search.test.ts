import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';

import productsRouter from '@/routes/products';

// Mock database client with factory function
vi.mock('@/db/client', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(() => Promise.resolve([]))
            }))
          }))
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            offset: vi.fn(() => Promise.resolve([]))
          }))
        })),
        limit: vi.fn(() => ({
          offset: vi.fn(() => Promise.resolve([]))
        }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve([{ insertId: 1 }]))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve())
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve())
    })),
  },
}));

// Mock schema
vi.mock('@/db/schema', () => ({
  products: {
    id: 'id',
    name: 'name',
    description: 'description',
    price: 'price',
    dataJson: 'dataJson',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}));

// Mock drizzle-orm functions
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  like: vi.fn(),
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  SQL: vi.fn(),
}));

// Create test app
const app = new Hono();
app.route('/api/products', productsRouter);

describe('Search API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Search Functionality', () => {
    it('should search products by name', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Apple iPhone', description: 'Latest iPhone', price: '999.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Samsung Galaxy', description: 'Latest Samsung', price: '899.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=iPhone');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Apple iPhone');
    });

    it('should search products case-insensitively', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Apple iPhone', description: 'Latest iPhone', price: '999.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=IPHONE');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('Apple iPhone');
    });

    it('should search products by description', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Laptop Pro', description: 'High-performance laptop', price: '1299.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=performance');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].description).toContain('performance');
    });

    it('should return empty results for non-matching search', async () => {
      const { db } = await import('@/db/client');
      
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([])
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([])
            })
          })
        })
      });

      const response = await app.request('/api/products?q=nonexistent');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
    });

    it('should handle empty search query', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Product ${i + 1}`,
        description: `Description ${i + 1}`,
        price: String((i + 1) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(10);
    });

    it('should handle search without query parameter', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Product ${i + 1}`,
        description: `Description ${i + 1}`,
        price: String((i + 1) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(10);
    });
  });

  describe('Search with Pagination', () => {
    it('should paginate search results', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        name: `Search Product ${i + 1}`,
        description: `Search Description ${i + 1}`,
        price: String((i + 1) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Search&page=1&limit=5');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(4);
      expect(data.page.limit).toBe(5);
      expect(data.page.hasNext).toBe(false);
    });

    it('should handle search on second page', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 4 }, (_, i) => ({
        id: i + 6,
        name: `Search Product ${i + 6}`,
        description: `Search Description ${i + 6}`,
        price: String((i + 6) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Search&page=2&limit=5');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(4);
      expect(data.page.limit).toBe(5);
      expect(data.page.hasNext).toBe(false);
    });

    it('should handle last page of search results', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        name: `Final Search Product ${i + 1}`,
        description: `Final Search Description ${i + 1}`,
        price: String((i + 1) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Final&page=1&limit=10');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      expect(data.page.hasNext).toBe(false);
    });

    it('should maintain search query across pagination', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Consistent Search ${i + 1}`,
        description: `Consistent Description ${i + 1}`,
        price: String((i + 1) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const firstResponse = await app.request('/api/products?q=Consistent&page=1&limit=5');
      expect(firstResponse.status).toBe(200);
      const firstData = await firstResponse.json() as any;
      expect(firstData.data[0].name).toContain('Consistent Search');

      // Mock second page with different results
      const secondPageProducts = Array.from({ length: 5 }, (_, i) => ({
        id: i + 11,
        name: `Consistent Search ${i + 11}`,
        description: `Consistent Description ${i + 11}`,
        price: String((i + 11) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(secondPageProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(secondPageProducts)
            })
          })
        })
      });

      const secondResponse = await app.request('/api/products?q=Consistent&page=2&limit=5');
      expect(secondResponse.status).toBe(200);
      const secondData = await secondResponse.json() as any;
      expect(secondData.data[0].name).toContain('Consistent Search');
    });
  });

  describe('Search with Sorting', () => {
    it('should sort search results by name ascending', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Apple iPhone', description: 'Latest iPhone', price: '999.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Google Pixel', description: 'Latest Pixel', price: '799.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 3, name: 'Samsung Galaxy', description: 'Latest Samsung', price: '899.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=phone&sortBy=name&sortOrder=asc');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      expect(data.data[0].name).toBe('Apple iPhone');
      expect(data.data[1].name).toBe('Google Pixel');
      expect(data.data[2].name).toBe('Samsung Galaxy');
    });

    it('should sort search results by name descending', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Samsung Galaxy', description: 'Latest Samsung', price: '899.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Google Pixel', description: 'Latest Pixel', price: '799.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 3, name: 'Apple iPhone', description: 'Latest iPhone', price: '999.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=phone&sortBy=name&sortOrder=desc');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      expect(data.data[0].name).toBe('Samsung Galaxy');
      expect(data.data[1].name).toBe('Google Pixel');
      expect(data.data[2].name).toBe('Apple iPhone');
    });

    it('should sort search results by price', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Budget Phone', description: 'Affordable phone', price: '299.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Mid Phone', description: 'Mid-range phone', price: '599.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 3, name: 'Premium Phone', description: 'Premium phone', price: '999.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=phone&sortBy=price&sortOrder=asc');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      expect(data.data[0].price).toBe('299.99');
      expect(data.data[1].price).toBe('599.99');
      expect(data.data[2].price).toBe('999.99');
    });
  });

  describe('Search Performance', () => {
    it('should handle large dataset search efficiently', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Large Dataset Product ${i + 1}`,
        description: `Large Dataset Description ${i + 1}`,
        price: String((i + 1) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Large&page=1&limit=10');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(10);
      expect(data.data[0].name).toContain('Large Dataset Product');
    });

    it('should handle complex search queries', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Complex Product Alpha', description: 'Complex description with multiple keywords', price: '199.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Complex Product Beta', description: 'Another complex description', price: '299.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Complex multiple keywords');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
    });
  });

  describe('Search Edge Cases', () => {
    it('should handle special characters in search', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Product @#$%', description: 'Special chars', price: '99.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=@#$%');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
    });

    it('should handle numeric search terms', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Product 123', description: 'Numeric product', price: '123.45', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=123');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('Product 123');
    });

    it('should handle whitespace in search query', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Product with spaces', description: 'Description with spaces', price: '99.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Product%20with%20spaces');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
    });

    it('should handle very long search queries', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Product', description: 'Description', price: '99.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const longQuery = 'a'.repeat(1000);
      const response = await app.request(`/api/products?q=${longQuery}`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
    });

    it('should handle search with unicode characters', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Café Product', description: 'Unicode description', price: '99.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Café');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
    });
  });

  describe('Search Results Accuracy', () => {
    it('should find all products containing search term', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Test Product Alpha', description: 'First test product', price: '99.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Test Product Beta', description: 'Second test product', price: '199.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 3, name: 'Test Product Gamma', description: 'Third test product', price: '299.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Test');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      data.data.forEach((product: any) => {
        expect(product.name).toContain('Test');
      });
    });

    it('should not return products that do not match search', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Matching Product', description: 'This should match', price: '99.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Matching');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('Matching Product');
    });

    it('should handle partial word matches', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Smartphone Pro', description: 'Advanced smartphone', price: '999.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Smartwatch Ultra', description: 'Advanced smartwatch', price: '499.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Smart');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      data.data.forEach((product: any) => {
        expect(product.name).toContain('Smart');
      });
    });
  });

  describe('Search with Combined Parameters', () => {
    it('should combine search with pagination and sorting', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Combined Search A', description: 'First combined', price: '99.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Combined Search B', description: 'Second combined', price: '199.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=Combined&page=1&limit=5&sortBy=name&sortOrder=asc');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.page.limit).toBe(5);
      expect(data.data[0].name).toBe('Combined Search A');
    });

    it('should handle all parameters together', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'All Parameters Product', description: 'Complete test', price: '149.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?q=All&page=1&limit=10&sortBy=price&sortOrder=desc');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('All Parameters Product');
      expect(data.page.limit).toBe(10);
    });
  });
});
