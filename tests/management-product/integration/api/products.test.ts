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
      set: vi.fn(() => Promise.resolve())
    })),
    delete: vi.fn(() => Promise.resolve()),
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

// Test data
const testProduct = {
  name: 'Test Product',
  description: 'Test Description',
  price: '99.99',
};

const updatedProduct = {
  name: 'Updated Product',
  description: 'Updated Description',
  price: '149.99',
};

describe('Products API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/products - Create Product', () => {
    it('should create a product successfully', async () => {
      const { db } = await import('@/db/client');
      
      // Mock successful insert
      db.insert().values.mockResolvedValue([{ insertId: 1 }]);
      
      // Mock successful select after insert
      const mockCreatedProduct = {
        id: 1,
        name: testProduct.name,
        description: testProduct.description,
        price: testProduct.price,
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCreatedProduct])
          })
        })
      });

      const response = await app.request('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testProduct),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(testProduct.name);
      expect(data.data.description).toBe(testProduct.description);
      expect(data.data.price).toBe(testProduct.price);
      expect(data.data.id).toBeDefined();
    });

    it('should return 409 when creating duplicate product', async () => {
      const { db } = await import('@/db/client');
      
      // Reset mocks first
      vi.clearAllMocks();
      
      // Mock duplicate error - ensure the rejection happens on the actual call
      db.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue({ code: 'ER_DUP_ENTRY' })
      });

      const response = await app.request('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testProduct),
      });

      expect(response.status).toBe(409);
      const data = await response.json() as any;
      expect(data.success).toBe(false);
      expect(data.message).toContain('sudah ada');
    });

    it('should create product with minimal data', async () => {
      const { db } = await import('@/db/client');
      
      const minimalProduct = { name: 'Minimal Product' };

      db.insert().values.mockResolvedValue([{ insertId: 2 }]);
      
      const mockCreatedProduct = {
        id: 2,
        name: minimalProduct.name,
        description: null,
        price: '0',
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCreatedProduct])
          })
        })
      });

      const response = await app.request('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minimalProduct),
      });

      expect(response.status).toBe(201);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(minimalProduct.name);
      expect(data.data.description).toBe(null);
      expect(data.data.price).toBe('0');
    });
  });

  describe('GET /api/products - Read Products', () => {
    it('should get all products with default pagination', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Product 1', description: 'Desc 1', price: '10.99' },
        { id: 2, name: 'Product 2', description: 'Desc 2', price: '20.99' },
        { id: 3, name: 'Product 3', description: 'Desc 3', price: '30.99' },
      ];

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
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(3);
      expect(data.page).toBeDefined();
    });

    it('should paginate products correctly', async () => {
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

      // Mock count query for pagination
      const mockCount = [{ count: 25 }];
      
      // Reset and setup mocks properly
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(mockProducts)
            }),
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
          }),
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(mockProducts)
          })
        })
      });

      const response = await app.request('/api/products?page=1&limit=10');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.length).toBeLessThanOrEqual(10);
      expect(data.page.limit).toBe(10);
      expect(data.page.hasNext).toBe(true);
    });

    it('should sort products by name', async () => {
      const { db } = await import('@/db/client');
      
      const mockProducts = [
        { id: 1, name: 'Apple Product', description: 'Desc 1', price: '20.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Banana Product', description: 'Desc 2', price: '30.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 3, name: 'Zebra Product', description: 'Desc 3', price: '10.99', dataJson: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      // Reset mocks first
      vi.clearAllMocks();
      
      // Setup proper mock for sorting query
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
          }),
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(mockProducts)
          })
        })
      });

      const response = await app.request('/api/products?sortBy=name&sortOrder=asc');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data[0].name).toBe('Apple Product');
      expect(data.data[1].name).toBe('Banana Product');
      expect(data.data[2].name).toBe('Zebra Product');
    });
  });

  describe('GET /api/products/:id - Get Single Product', () => {
    it('should get product by ID', async () => {
      const { db } = await import('@/db/client');
      
      const mockProduct = {
        id: 1,
        name: testProduct.name,
        description: testProduct.description,
        price: testProduct.price,
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockProduct])
          })
        })
      });

      const response = await app.request('/api/products/1');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(1);
      expect(data.data.name).toBe(testProduct.name);
    });

    it('should return 404 for non-existent product', async () => {
      const { db } = await import('@/db/client');
      
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([])
          })
        })
      });

      const response = await app.request('/api/products/99999');

      expect(response.status).toBe(404);
      const data = await response.json() as any;
      expect(data.success).toBe(false);
      expect(data.message).toContain('tidak ditemukan');
    });

    it('should return 400 for invalid ID', async () => {
      const response = await app.request('/api/products/invalid');

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.success).toBe(false);
      expect(data.message).toContain('ID tidak valid');
    });
  });

  describe('PUT /api/products/:id - Update Product', () => {
    it('should update product successfully', async () => {
      const { db } = await import('@/db/client');
      
      const mockUpdatedProduct = {
        id: 1,
        name: updatedProduct.name,
        description: updatedProduct.description,
        price: updatedProduct.price,
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Reset mocks first
      vi.clearAllMocks();
      
      // Setup proper mock for update query with .where method
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue()
        })
      });
      
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUpdatedProduct])
          })
        })
      });

      const response = await app.request('/api/products/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(updatedProduct.name);
      expect(data.data.description).toBe(updatedProduct.description);
      expect(data.data.price).toBe(updatedProduct.price);
    });

    it('should return 400 for invalid ID', async () => {
      const response = await app.request('/api/products/invalid', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct),
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.success).toBe(false);
      expect(data.message).toContain('ID tidak valid');
    });

    it('should return 400 for empty update', async () => {
      const response = await app.request('/api/products/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.success).toBe(false);
      expect(data.message).toContain('Tidak ada data yang diupdate');
    });
  });

  describe('DELETE /api/products/:id - Delete Product', () => {
    it('should delete product successfully', async () => {
      const { db } = await import('@/db/client');
      
      // Reset mocks first
      vi.clearAllMocks();
      
      // Setup proper mock for delete query with .where method
      db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue()
      });
      
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([])
          })
        })
      });

      const response = await app.request('/api/products/1', {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.message).toContain('dihapus');
    });

    it('should return 400 for invalid ID', async () => {
      const response = await app.request('/api/products/invalid', {
        method: 'DELETE',
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.success).toBe(false);
      expect(data.message).toContain('ID tidak valid');
    });
  });

  describe('Complete CRUD Workflow', () => {
    it('should perform complete CRUD operations', async () => {
      const { db } = await import('@/db/client');
      
      // CREATE
      db.insert().values.mockResolvedValue([{ insertId: 1 }]);
      
      const mockCreatedProduct = {
        id: 1,
        name: testProduct.name,
        description: testProduct.description,
        price: testProduct.price,
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCreatedProduct])
          })
        })
      });

      const createResponse = await app.request('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testProduct),
      });

      expect(createResponse.status).toBe(201);
      const createData = await createResponse.json() as any;
      expect(createData.data.name).toBe(testProduct.name);

      // READ
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCreatedProduct])
          })
        })
      });

      const getResponse = await app.request('/api/products/1');
      expect(getResponse.status).toBe(200);
      const getData = await getResponse.json() as any;
      expect(getData.data.name).toBe(testProduct.name);

      // UPDATE
      const mockUpdatedProduct = {
        id: 1,
        name: updatedProduct.name,
        description: updatedProduct.description,
        price: updatedProduct.price,
        dataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue()
        })
      });
      
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUpdatedProduct])
          })
        })
      });

      const updateResponse = await app.request('/api/products/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct),
      });
      expect(updateResponse.status).toBe(200);
      const updateData = await updateResponse.json() as any;
      expect(updateData.data.name).toBe(updatedProduct.name);

      // DELETE
      db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue()
      });
      
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([])
          })
        })
      });

      const deleteResponse = await app.request('/api/products/1', {
        method: 'DELETE',
      });
      expect(deleteResponse.status).toBe(200);
      const deleteData = await deleteResponse.json() as any;
      expect(deleteData.success).toBe(true);

      // Verify deletion
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([])
          })
        })
      });

      const finalGetResponse = await app.request('/api/products/1');
      expect(finalGetResponse.status).toBe(404);
    });
  });
});
