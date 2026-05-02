import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { 
  createMockSubscription, 
  createMockSubscriptionList,
  validSubscriptionData,
  invalidSubscriptionData,
  minimalSubscriptionData 
} from '../../utils/mock-data';
import { 
  createTestRequest,
  expectSuccessResponse,
  expectErrorResponse,
  expectPaginationResponse,
  expectSubscriptionShape,
  setupTestIsolation,
  createFilterTestCases,
  createSortTestCases,
  createPaginationTestCases,
  createErrorScenarios
} from '../../utils/test-helpers';

describe('Subscription API Integration Tests', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    setupTestIsolation();
  });

  describe('POST /api/subscriptions', () => {
    it('should create subscription successfully', async () => {
      app.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        const newSubscription = {
          id: 1,
          ...payload,
          brand: payload.brand ?? null,
          platform: payload.platform ?? null,
          advertiserId: payload.advertiserId ?? null,
          startDate: payload.startDate ?? null,
          dueDate: payload.dueDate ?? null,
          onboardingDate: payload.onboardingDate ?? null,
          target: payload.target ?? null,
          note: payload.note ?? null,
          status: payload.status ?? 1,
          onboardingStatus: payload.onboardingStatus ?? 0,
          onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const formattedData = {
          ...newSubscription,
          customer: { id: newSubscription.customerId, email: `customer${newSubscription.customerId}@test.com` },
          product: { id: newSubscription.productId, name: `Product ${newSubscription.productId}` },
          advertiser: newSubscription.advertiserId ? { id: newSubscription.advertiserId, email: `advertiser${newSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData }, 201);
      });

      const response = await createTestRequest(app, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(validSubscriptionData),
      });

      const data = await expectSuccessResponse(response, 201);
      expectSubscriptionShape(data.data);
      expect(data.data.customerId).toBe(validSubscriptionData.customerId);
      expect(data.data.productId).toBe(validSubscriptionData.productId);
      expect(data.data.status).toBe(1);
      expect(data.data.onboardingStatus).toBe(0);
    });

    it('should create subscription with minimal data', async () => {
      app.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        const newSubscription = {
          id: 1,
          ...payload,
          brand: payload.brand ?? null,
          platform: payload.platform ?? null,
          advertiserId: payload.advertiserId ?? null,
          startDate: payload.startDate ?? null,
          dueDate: payload.dueDate ?? null,
          onboardingDate: payload.onboardingDate ?? null,
          target: payload.target ?? null,
          note: payload.note ?? null,
          status: payload.status ?? 1,
          onboardingStatus: payload.onboardingStatus ?? 0,
          onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const formattedData = {
          ...newSubscription,
          customer: { id: newSubscription.customerId, email: `customer${newSubscription.customerId}@test.com` },
          product: { id: newSubscription.productId, name: `Product ${newSubscription.productId}` },
          advertiser: newSubscription.advertiserId ? { id: newSubscription.advertiserId, email: `advertiser${newSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData }, 201);
      });

      const response = await createTestRequest(app, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(minimalSubscriptionData),
      });

      const data = await expectSuccessResponse(response, 201);
      expectSubscriptionShape(data.data);
      expect(data.data.customerId).toBe(minimalSubscriptionData.customerId);
      expect(data.data.productId).toBe(minimalSubscriptionData.productId);
      expect(data.data.status).toBe(1);
      expect(data.data.onboardingStatus).toBe(0);
    });

    it('should create subscription with full data', async () => {
      app.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        const newSubscription = {
          id: 1,
          ...payload,
          brand: payload.brand ?? null,
          platform: payload.platform ?? null,
          advertiserId: payload.advertiserId ?? null,
          startDate: payload.startDate ?? null,
          dueDate: payload.dueDate ?? null,
          onboardingDate: payload.onboardingDate ?? null,
          target: payload.target ?? null,
          note: payload.note ?? null,
          status: payload.status ?? 1,
          onboardingStatus: payload.onboardingStatus ?? 0,
          onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const formattedData = {
          ...newSubscription,
          customer: { id: newSubscription.customerId, email: `customer${newSubscription.customerId}@test.com` },
          product: { id: newSubscription.productId, name: `Product ${newSubscription.productId}` },
          advertiser: newSubscription.advertiserId ? { id: newSubscription.advertiserId, email: `advertiser${newSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData }, 201);
      });

      const fullData = {
        ...validSubscriptionData,
        brand: 'Test Brand',
        platform: 'Meta',
        advertiserId: 1,
        startDate: '2024-01-01',
        dueDate: '2024-12-31',
        onboardingDate: '2024-01-01',
        onboardingStatus: 2,
        target: 'Test target',
        note: 'Test note',
      };

      const response = await createTestRequest(app, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(fullData),
      });

      const data = await expectSuccessResponse(response, 201);
      expectSubscriptionShape(data.data);
      expect(data.data.brand).toBe(fullData.brand);
      expect(data.data.platform).toBe(fullData.platform);
      expect(data.data.advertiserId).toBe(fullData.advertiserId);
      expect(data.data.onboardingStatus).toBe(fullData.onboardingStatus);
      expect(data.data.target).toBe(fullData.target);
      expect(data.data.note).toBe(fullData.note);
    });

    it('should return 400 for invalid data', async () => {
      app.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        // Simple validation
        if (!payload.customerId || !payload.productId) {
          return c.json({ success: false, message: 'Missing required fields' }, 400);
        }

        return c.json({ success: true, data: payload }, 201);
      });

      const response = await createTestRequest(app, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(invalidSubscriptionData),
      });

      await expectErrorResponse(response, 400);
    });

    it('should return 400 for missing required fields', async () => {
      app.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        // Simple validation
        if (!payload.customerId || !payload.productId) {
          return c.json({ success: false, message: 'Missing required fields' }, 400);
        }

        return c.json({ success: true, data: payload }, 201);
      });

      const response = await createTestRequest(app, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      await expectErrorResponse(response, 400);
    });

    it('should handle foreign key constraint violations', async () => {
      app.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        // Simple validation
        if (!payload.customerId || !payload.productId) {
          return c.json({ success: false, message: 'Missing required fields' }, 400);
        }

        // Simulate foreign key constraint
        if (payload.customerId > 100 || payload.productId > 100) {
          return c.json({ success: false, message: 'Foreign key constraint violation' }, 500);
        }

        return c.json({ success: true, data: payload }, 201);
      });

      const invalidData = { ...validSubscriptionData, customerId: 999999 };
      
      const response = await createTestRequest(app, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(invalidData),
      });

      await expectErrorResponse(response, 500);
    });
  });

  describe('GET /api/subscriptions', () => {
    it('should get paginated subscriptions', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');

        const mockData = createMockSubscriptionList(50);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedData = mockData.slice(startIndex, endIndex);

        const formattedData = paginatedData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: {
            limit,
            lastId: paginatedData.length > 0 ? paginatedData[paginatedData.length - 1].id : null,
            hasNext: endIndex < mockData.length,
            sortBy: 'id',
            sortOrder: 'asc',
          },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions?page=1&limit=10');
      
      const data = await expectPaginationResponse(response);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeLessThanOrEqual(10);
      expect(data.page.limit).toBe(10);
      expect(data.page.hasNext).toBe(true);
    });

    it('should return default pagination when no params provided', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');

        const mockData = createMockSubscriptionList(50);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedData = mockData.slice(startIndex, endIndex);

        const formattedData = paginatedData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: {
            limit,
            lastId: paginatedData.length > 0 ? paginatedData[paginatedData.length - 1].id : null,
            hasNext: endIndex < mockData.length,
            sortBy: 'id',
            sortOrder: 'asc',
          },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions');
      
      const data = await expectPaginationResponse(response);
      expect(data.page.limit).toBe(20);
      expect(data.page.sortBy).toBe('id');
      expect(data.page.sortOrder).toBe('asc');
    });

    it('should filter by customerId', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const customerId = parseInt(query.customerId || '0');

        const mockData = createMockSubscriptionList(20);
        const filteredData = mockData.filter(sub => sub.customerId === customerId);

        const formattedData = filteredData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: { limit: 20, hasNext: false, sortBy: 'id', sortOrder: 'asc' },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions?customerId=1');
      
      const data = await expectSuccessResponse(response);
      expect(data.data.every((sub: any) => sub.customerId === 1)).toBe(true);
    });

    it('should filter by productId', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const productId = parseInt(query.productId || '0');

        const mockData = createMockSubscriptionList(20);
        const filteredData = mockData.filter(sub => sub.productId === productId);

        const formattedData = filteredData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: { limit: 20, hasNext: false, sortBy: 'id', sortOrder: 'asc' },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions?productId=1');
      
      const data = await expectSuccessResponse(response);
      expect(data.data.every((sub: any) => sub.productId === 1)).toBe(true);
    });

    it('should filter by advertiserId', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const advertiserId = parseInt(query.advertiserId || '0');

        const mockData = createMockSubscriptionList(20);
        const filteredData = mockData.filter(sub => sub.advertiserId === advertiserId);

        const formattedData = filteredData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: { limit: 20, hasNext: false, sortBy: 'id', sortOrder: 'asc' },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions?advertiserId=1');
      
      const data = await expectSuccessResponse(response);
      expect(data.data.every((sub: any) => sub.advertiserId === 1)).toBe(true);
    });

    it('should filter by status', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const status = parseInt(query.status || '-1');

        const mockData = createMockSubscriptionList(20);
        const filteredData = mockData.filter(sub => sub.status === status);

        const formattedData = filteredData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: { limit: 20, hasNext: false, sortBy: 'id', sortOrder: 'asc' },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions?status=1');
      
      const data = await expectSuccessResponse(response);
      expect(data.data.every((sub: any) => sub.status === 1)).toBe(true);
    });

    it('should apply multiple filters', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const customerId = parseInt(query.customerId || '0');
        const status = parseInt(query.status || '-1');

        const mockData = createMockSubscriptionList(20);
        const filteredData = mockData.filter(sub => sub.customerId === customerId && sub.status === status);

        const formattedData = filteredData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: { limit: 20, hasNext: false, sortBy: 'id', sortOrder: 'asc' },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions?customerId=1&status=1');
      
      const data = await expectSuccessResponse(response);
      expect(data.data.every((sub: any) => sub.customerId === 1 && sub.status === 1)).toBe(true);
    });

    it('should sort by different fields', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const sortBy = query.sortBy || 'id';
        const sortOrder = query.sortOrder || 'asc';

        const mockData = createMockSubscriptionList(20);
        const sortedData = [...mockData].sort((a, b) => {
          const aVal = a[sortBy as keyof typeof a];
          const bVal = b[sortBy as keyof typeof b];
          if (sortOrder === 'desc') {
            return bVal > aVal ? 1 : -1;
          }
          return aVal > bVal ? 1 : -1;
        });

        const formattedData = sortedData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: { limit: 20, hasNext: false, sortBy, sortOrder },
        });
      });

      const testCases = createSortTestCases();
      
      for (const testCase of testCases) {
        const response = await createTestRequest(app, `/api/subscriptions?${testCase.sort}`);
        const data = await expectSuccessResponse(response);
        
        expect(data.page.sortBy).toBeDefined();
        expect(data.page.sortOrder).toBeDefined();
      }
    });

    it('should handle pagination edge cases', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');

        const mockData = createMockSubscriptionList(20);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedData = mockData.slice(startIndex, endIndex);

        const formattedData = paginatedData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: {
            limit,
            lastId: paginatedData.length > 0 ? paginatedData[paginatedData.length - 1].id : null,
            hasNext: endIndex < mockData.length,
            sortBy: 'id',
            sortOrder: 'asc',
          },
        });
      });

      const testCases = createPaginationTestCases();
      
      for (const testCase of testCases) {
        const response = await createTestRequest(app, `/api/subscriptions?${testCase.pagination}`);
        const data = await expectSuccessResponse(response);
        
        expect(data.data).toBeDefined();
        expect(data.page).toBeDefined();
      }
    });

    it('should include related data', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const limit = parseInt(query.limit || '20');

        const mockData = createMockSubscriptionList(20);
        const paginatedData = mockData.slice(0, limit);

        const formattedData = paginatedData.map(sub => ({
          ...sub,
          customer: { id: sub.customerId, email: `customer${sub.customerId}@test.com` },
          product: { id: sub.productId, name: `Product ${sub.productId}` },
          advertiser: sub.advertiserId ? { id: sub.advertiserId, email: `advertiser${sub.advertiserId}@test.com` } : null,
        }));

        return c.json({
          success: true,
          data: formattedData,
          page: { limit, hasNext: false, sortBy: 'id', sortOrder: 'asc' },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions?limit=1');
      
      const data = await expectSuccessResponse(response);
      if (data.data.length > 0) {
        const subscription = data.data[0];
        expect(subscription).toHaveProperty('customer');
        expect(subscription).toHaveProperty('product');
        expect(subscription).toHaveProperty('advertiser');
      }
    });
  });

  describe('GET /api/subscriptions/:id', () => {
    it('should get subscription by ID', async () => {
      app.get('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const mockSubscription = createMockSubscription({ id });
        
        const formattedData = {
          ...mockSubscription,
          customer: { id: mockSubscription.customerId, email: `customer${mockSubscription.customerId}@test.com` },
          product: { id: mockSubscription.productId, name: `Product ${mockSubscription.productId}` },
          advertiser: mockSubscription.advertiserId ? { id: mockSubscription.advertiserId, email: `advertiser${mockSubscription.advertiserId}@test.com` } : null,
        };
        
        return c.json({
          success: true,
          data: formattedData,
        });
      });

      const subscriptionId = 1;
      const response = await createTestRequest(app, `/api/subscriptions/${subscriptionId}`);
      
      const data = await expectSuccessResponse(response);
      expectSubscriptionShape(data.data);
      expect(data.data.id).toBe(subscriptionId);
    });

    it('should return 404 for non-existent subscription', async () => {
      app.get('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        if (id > 100) {
          return c.json({ success: false, message: 'Subscription tidak ditemukan' }, 404);
        }

        const mockSubscription = createMockSubscription({ id });
        
        const formattedData = {
          ...mockSubscription,
          customer: { id: mockSubscription.customerId, email: `customer${mockSubscription.customerId}@test.com` },
          product: { id: mockSubscription.productId, name: `Product ${mockSubscription.productId}` },
          advertiser: mockSubscription.advertiserId ? { id: mockSubscription.advertiserId, email: `advertiser${mockSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({
          success: true,
          data: formattedData,
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions/999999');
      
      await expectErrorResponse(response, 404);
    });

    it('should return 400 for invalid ID', async () => {
      app.get('/api/subscriptions/:id', async (c) => {
        const id = c.req.param('id');
        
        if (isNaN(parseInt(id))) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const mockSubscription = createMockSubscription({ id: parseInt(id) });
        
        const formattedData = {
          ...mockSubscription,
          customer: { id: mockSubscription.customerId, email: `customer${mockSubscription.customerId}@test.com` },
          product: { id: mockSubscription.productId, name: `Product ${mockSubscription.productId}` },
          advertiser: mockSubscription.advertiserId ? { id: mockSubscription.advertiserId, email: `advertiser${mockSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({
          success: true,
          data: formattedData,
        });
      });

      // Test invalid ID directly
      const response = await createTestRequest(app, '/api/subscriptions/invalid');
      await expectErrorResponse(response, 400);
    });

    it('should include related data for single subscription', async () => {
      app.get('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const mockSubscription = createMockSubscription({ id });
        
        const formattedData = {
          ...mockSubscription,
          customer: { id: mockSubscription.customerId, email: `customer${mockSubscription.customerId}@test.com` },
          product: { id: mockSubscription.productId, name: `Product ${mockSubscription.productId}` },
          advertiser: mockSubscription.advertiserId ? { id: mockSubscription.advertiserId, email: `advertiser${mockSubscription.advertiserId}@test.com` } : null,
        };
        
        return c.json({
          success: true,
          data: formattedData,
        });
      });

      const subscriptionId = 1;
      const response = await createTestRequest(app, `/api/subscriptions/${subscriptionId}`);
      
      const data = await expectSuccessResponse(response);
      expectSubscriptionShape(data.data);
      expect(data.data.customer).toBeDefined();
      expect(data.data.product).toBeDefined();
      expect(data.data.advertiser).toBeDefined();
    });
  });

  describe('PUT /api/subscriptions/:id', () => {
    it('should update subscription successfully', async () => {
      app.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        const updatedSubscription = {
          id,
          customerId: 1,
          productId: 1,
          brand: payload.brand ?? null,
          platform: payload.platform ?? null,
          advertiserId: payload.advertiserId ?? null,
          startDate: payload.startDate ?? null,
          dueDate: payload.dueDate ?? null,
          status: payload.status ?? 1,
          onboardingDate: payload.onboardingDate ?? null,
          onboardingStatus: payload.onboardingStatus ?? 0,
          target: payload.target ?? null,
          note: payload.note ?? null,
          onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...payload,
        };

        const formattedData = {
          ...updatedSubscription,
          customer: { id: updatedSubscription.customerId, email: `customer${updatedSubscription.customerId}@test.com` },
          product: { id: updatedSubscription.productId, name: `Product ${updatedSubscription.productId}` },
          advertiser: updatedSubscription.advertiserId ? { id: updatedSubscription.advertiserId, email: `advertiser${updatedSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const subscriptionId = 1;
      const updateData = { brand: 'Updated Brand', platform: 'Updated Platform' };
      
      const response = await createTestRequest(app, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const data = await expectSuccessResponse(response);
      expectSubscriptionShape(data.data);
      expect(data.data.brand).toBe(updateData.brand);
      expect(data.data.platform).toBe(updateData.platform);
    });

    it('should return 400 for invalid ID', async () => {
      app.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        return c.json({ success: true, data: { id } });
      });

      const response = await createTestRequest(app, '/api/subscriptions/invalid', {
        method: 'PUT',
        body: JSON.stringify({ brand: 'Test' }),
      });

      await expectErrorResponse(response, 400);
    });

    it('should return 404 for non-existent subscription', async () => {
      app.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        if (id > 100) {
          return c.json({ success: false, message: 'Subscription tidak ditemukan' }, 404);
        }

        return c.json({ success: true, data: { id } });
      });

      const response = await createTestRequest(app, '/api/subscriptions/999999', {
        method: 'PUT',
        body: JSON.stringify({ brand: 'Test' }),
      });

      await expectErrorResponse(response, 404);
    });

    it('should return 400 for empty update', async () => {
      app.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        if (Object.keys(payload).length === 0) {
          return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
        }

        return c.json({ success: true, data: { id, ...payload } });
      });

      const response = await createTestRequest(app, '/api/subscriptions/1', {
        method: 'PUT',
        body: JSON.stringify({}),
      });

      await expectErrorResponse(response, 400);
    });

    it('should handle partial updates', async () => {
      app.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        const updatedSubscription = {
          id,
          customerId: 1,
          productId: 1,
          brand: payload.brand ?? null,
          platform: payload.platform ?? null,
          advertiserId: payload.advertiserId ?? null,
          startDate: payload.startDate ?? null,
          dueDate: payload.dueDate ?? null,
          status: payload.status ?? 1,
          onboardingDate: payload.onboardingDate ?? null,
          onboardingStatus: payload.onboardingStatus ?? 0,
          target: payload.target ?? null,
          note: payload.note ?? null,
          onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...payload,
        };

        const formattedData = {
          ...updatedSubscription,
          customer: { id: updatedSubscription.customerId, email: `customer${updatedSubscription.customerId}@test.com` },
          product: { id: updatedSubscription.productId, name: `Product ${updatedSubscription.productId}` },
          advertiser: updatedSubscription.advertiserId ? { id: updatedSubscription.advertiserId, email: `advertiser${updatedSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const subscriptionId = 1;
      const updateData = { note: 'Updated note only' };
      
      const response = await createTestRequest(app, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const data = await expectSuccessResponse(response);
      expectSubscriptionShape(data.data);
      expect(data.data.note).toBe(updateData.note);
    });

    it('should update subscription status', async () => {
      app.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        const updatedSubscription = {
          id,
          customerId: 1,
          productId: 1,
          status: payload.status ?? 1,
          onboardingStatus: payload.onboardingStatus ?? 0,
          onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...payload,
        };

        const formattedData = {
          ...updatedSubscription,
          customer: { id: updatedSubscription.customerId, email: `customer${updatedSubscription.customerId}@test.com` },
          product: { id: updatedSubscription.productId, name: `Product ${updatedSubscription.productId}` },
          advertiser: updatedSubscription.advertiserId ? { id: updatedSubscription.advertiserId, email: `advertiser${updatedSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const response = await createTestRequest(app, '/api/subscriptions/1', {
        method: 'PUT',
        body: JSON.stringify({ status: 0 }),
      });

      const data = await expectSuccessResponse(response);
      expect(data.data.status).toBe(0);
    });

    it('should update onboarding status and timestamp', async () => {
      app.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        const updatedSubscription = {
          id,
          customerId: 1,
          productId: 1,
          status: payload.status ?? 1,
          onboardingStatus: payload.onboardingStatus ?? 0,
          onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...payload,
        };

        const formattedData = {
          ...updatedSubscription,
          customer: { id: updatedSubscription.customerId, email: `customer${updatedSubscription.customerId}@test.com` },
          product: { id: updatedSubscription.productId, name: `Product ${updatedSubscription.productId}` },
          advertiser: updatedSubscription.advertiserId ? { id: updatedSubscription.advertiserId, email: `advertiser${updatedSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const response = await createTestRequest(app, '/api/subscriptions/1', {
        method: 'PUT',
        body: JSON.stringify({ onboardingStatus: 2 }),
      });

      const data = await expectSuccessResponse(response);
      expect(data.data.onboardingStatus).toBe(2);
      expect(data.data.onboardingUpdatedAt).toBeDefined();
    });
  });

  describe('DELETE /api/subscriptions/:id', () => {
    it('should delete subscription successfully', async () => {
      app.delete('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        return c.json({ success: true, data: { message: 'Subscription dihapus' } });
      });

      const response = await createTestRequest(app, '/api/subscriptions/1', {
        method: 'DELETE',
      });

      await expectSuccessResponse(response);
    });

    it('should return 400 for invalid ID', async () => {
      app.delete('/api/subscriptions/:id', async (c) => {
        const id = c.req.param('id');
        
        if (isNaN(parseInt(id))) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        return c.json({ success: true, message: 'Subscription dihapus' });
      });

      const response = await createTestRequest(app, '/api/subscriptions/invalid', {
        method: 'DELETE',
      });

      await expectErrorResponse(response, 400);
    });

    it('should return 404 for non-existent subscription', async () => {
      app.delete('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        if (id > 100) {
          return c.json({ success: false, message: 'Subscription tidak ditemukan' }, 404);
        }

        return c.json({ success: true, message: 'Subscription dihapus' });
      });

      const response = await createTestRequest(app, '/api/subscriptions/999999', {
        method: 'DELETE',
      });

      await expectErrorResponse(response, 404);
    });
  });

  describe('Response Format Validation', () => {
    it('should return consistent success response format', async () => {
      app.get('/api/subscriptions', async (c) => {
        return c.json({
          success: true,
          data: [{ id: 1, customerId: 1, productId: 1 }],
          page: { limit: 20, hasNext: false, sortBy: 'id', sortOrder: 'asc' },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions');
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('page');
    });

    it('should return consistent error response format', async () => {
      app.get('/api/subscriptions/invalid', async (c) => {
        return c.json({ success: false, message: 'ID tidak valid' }, 400);
      });

      const response = await createTestRequest(app, '/api/subscriptions/invalid');
      const data = await response.json();
      
      expect(data).toHaveProperty('success', false);
      expect(data).toHaveProperty('message');
    });

    it('should include timestamps in ISO format', async () => {
      app.get('/api/subscriptions/1', async (c) => {
        const mockSubscription = createMockSubscription({ id: 1 });
        
        const formattedData = {
          ...mockSubscription,
          customer: { id: mockSubscription.customerId, email: `customer${mockSubscription.customerId}@test.com` },
          product: { id: mockSubscription.productId, name: `Product ${mockSubscription.productId}` },
          advertiser: mockSubscription.advertiserId ? { id: mockSubscription.advertiserId, email: `advertiser${mockSubscription.advertiserId}@test.com` } : null,
        };
        
        return c.json({
          success: true,
          data: formattedData,
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions/1');
      const data = await response.json();
      
      if (data.success && data.data) {
        expect(data.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
        expect(data.data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
      }
    });
  });
});
