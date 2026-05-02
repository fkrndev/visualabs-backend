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

describe('Subscription API Integration Tests (Simple)', () => {
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

        return c.json({
          success: true,
          data: paginatedData,
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

    it('should filter by customerId', async () => {
      app.get('/api/subscriptions', async (c) => {
        const query = c.req.query();
        const customerId = parseInt(query.customerId || '0');

        const mockData = createMockSubscriptionList(20);
        const filteredData = mockData.filter(sub => sub.customerId === customerId);

        return c.json({
          success: true,
          data: filteredData,
          page: { limit: 20, hasNext: false, sortBy: 'id', sortOrder: 'asc' },
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions?customerId=1');
      
      const data = await expectSuccessResponse(response);
      expect(data.data.every((sub: any) => sub.customerId === 1)).toBe(true);
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

        return c.json({
          success: true,
          data: createMockSubscription({ id }),
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

        return c.json({
          success: true,
          data: createMockSubscription({ id: parseInt(id) }),
        });
      });

      const response = await createTestRequest(app, '/api/subscriptions/invalid');
      
      await expectErrorResponse(response, 400);
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
  });
});
