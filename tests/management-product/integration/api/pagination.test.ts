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

describe('Pagination API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Pagination', () => {
    it('should paginate products with default limit', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 20 }, (_, i) => ({
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

      const response = await app.request('/api/products?page=1');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(20);
      expect(data.page.limit).toBe(20); // Default limit is 20
      expect(data.page.hasNext).toBe(true);
      expect(data.page.lastId).toBeDefined();
    });

    it('should respect custom limit parameter', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 5 }, (_, i) => ({
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

      const response = await app.request('/api/products?page=1&limit=5');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(5);
      expect(data.page.limit).toBe(5);
    });

    it('should return different results for different pages', async () => {
      const { db } = await import('@/db/client');
      
      // Mock first page
      const firstPageProducts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Product ${i + 1}`,
        description: `Description ${i + 1}`,
        price: String((i + 1) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Mock second page
      const secondPageProducts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 11,
        name: `Product ${i + 11}`,
        description: `Description ${i + 11}`,
        price: String((i + 11) * 10.99),
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Setup first page mock
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(firstPageProducts)
              })
            })
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(firstPageProducts)
            })
          })
        })
      });

      const firstResponse = await app.request('/api/products?page=1&limit=10');
      expect(firstResponse.status).toBe(200);
      const firstData = await firstResponse.json() as any;
      expect(firstData.data[0].name).toBe('Product 1');

      // Setup second page mock
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

      const secondResponse = await app.request('/api/products?page=2&limit=10');
      expect(secondResponse.status).toBe(200);
      const secondData = await secondResponse.json() as any;
      expect(secondData.data[0].name).toBe('Product 11');
    });
  });

  describe('Pagination Metadata', () => {
    it('should return correct pagination metadata', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 8 }, (_, i) => ({
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

      const response = await app.request('/api/products?page=1&limit=10');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.page).toBeDefined();
      expect(data.page.limit).toBe(10);
      expect(data.page.hasNext).toBe(false);
      expect(data.page.lastId).toBeDefined();
    });

    it('should update lastId correctly for different pages', async () => {
      const { db } = await import('@/db/client');
      
      const firstPageProducts = Array.from({ length: 10 }, (_, i) => ({
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
              offset: vi.fn().mockResolvedValue(firstPageProducts)
            })
          })
        })
      });

      const response = await app.request('/api/products?page=1&limit=10');
      const data = await response.json() as any;
      expect(data.page.lastId).toBe(10);
    });

    it('should set hasNext to false on last page', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 5 }, (_, i) => ({
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

      const response = await app.request('/api/products?page=1&limit=10');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.page.hasNext).toBe(false);
    });
  });

  describe('Large Dataset Performance', () => {
    it('should handle deep pagination efficiently', async () => {
      const { db } = await import('@/db/client');
      
      // Mock large dataset - we don't actually create 1000 items, just mock the response
      const mockProducts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 991, // Simulate page 100
        name: `Product ${i + 991}`,
        description: `Description ${i + 991}`,
        price: String((i + 991) * 10.99),
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

      const response = await app.request('/api/products?page=100&limit=10');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(10);
      expect(data.data[0].id).toBe(991);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty dataset', async () => {
      const { db } = await import('@/db/client');
      
      // Mock empty dataset
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([])
            })
          })
        })
      });

      const response = await app.request('/api/products?page=1&limit=10');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
      expect(data.page.hasNext).toBe(false);
      expect(data.page.lastId).toBe(null);
    });

    it('should handle negative page numbers gracefully', async () => {
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

      const response = await app.request('/api/products?page=-1&limit=10');

      // API returns 400 for invalid negative page numbers
      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.success).toBe(false);
    });

    it('should handle zero limit gracefully', async () => {
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

      const response = await app.request('/api/products?page=1&limit=0');

      // API should return 400 for zero limit
      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.success).toBe(false);
    });

    it('should handle very large limit gracefully', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 100 }, (_, i) => ({
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

      const response = await app.request('/api/products?page=1&limit=1000');

      // API should return 400 for very large limit (over maximum allowed)
      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.success).toBe(false);
    });
  });

  describe('Pagination with Sorting', () => {
    it('should maintain pagination with sorting', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = Array.from({ length: 9 }, (_, i) => ({
        id: i + 1,
        name: `Product ${String.fromCharCode(90 - i)}`, // Z, Y, X... for descending
        description: `Description ${i + 1}`,
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

      const response = await app.request('/api/products?page=1&limit=10&sortBy=name&sortOrder=desc');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(9);
      expect(data.page.hasNext).toBe(false);
    });
  });

  describe('Consistency Tests', () => {
    it('should maintain consistent results across requests', async () => {
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

      // Make multiple requests to ensure consistency
      const responses = await Promise.all([
        app.request('/api/products?page=1&limit=10'),
        app.request('/api/products?page=1&limit=10'),
        app.request('/api/products?page=1&limit=10'),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(200);
        const data = await response.json() as any;
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(10);
        expect(data.data[0].name).toBe('Product 1');
      }
    });
  });
});
