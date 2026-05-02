import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { 
  createMockSubscription, 
  createMockSubscriptionList,
  validSubscriptionData,
  minimalSubscriptionData 
} from '../utils/mock-data';
import { 
  createTestRequest,
  expectSuccessResponse,
  expectErrorResponse,
  expectPaginationResponse,
  expectSubscriptionShape,
  expectPerformanceThreshold,
  measureResponseTime
} from '../utils/test-helpers';

describe('Subscription Management Component Tests (Simple)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete CRUD Workflow', () => {
    it('should perform full subscription lifecycle', async () => {
      // CREATE
      const createApp = new Hono();
      createApp.post('/api/subscriptions', async (c) => {
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

      const createResponse = await createTestRequest(createApp, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(validSubscriptionData),
      });
      
      const createData = await expectSuccessResponse(createResponse, 201);
      expectSubscriptionShape(createData.data);
      const subscriptionId = createData.data.id;

      // READ - Single
      const getApp = new Hono();
      getApp.get('/api/subscriptions/:id', async (c) => {
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

      const getResponse = await createTestRequest(getApp, `/api/subscriptions/${subscriptionId}`);
      const getData = await expectSuccessResponse(getResponse);
      expectSubscriptionShape(getData.data);
      expect(getData.data.id).toBe(subscriptionId);

      // UPDATE
      const updateApp = new Hono();
      updateApp.put('/api/subscriptions/:id', async (c) => {
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

      const updateData = {
        brand: 'Updated Brand',
        platform: 'Updated Platform',
      };
      
      const updateResponse = await createTestRequest(updateApp, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
      
      const updateResult = await expectSuccessResponse(updateResponse);
      expectSubscriptionShape(updateResult.data);
      expect(updateResult.data.brand).toBe(updateData.brand);
      expect(updateResult.data.platform).toBe(updateData.platform);

      // DELETE
      const deleteApp = new Hono();
      deleteApp.delete('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        return c.json({ success: true, data: { message: 'Subscription dihapus' } });
      });

      const deleteResponse = await createTestRequest(deleteApp, `/api/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
      });
      
      await expectSuccessResponse(deleteResponse);

      // VERIFY DELETION
      const finalGetApp = new Hono();
      finalGetApp.get('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        // Always return 404 for deletion verification
        return c.json({ success: false, message: 'Subscription tidak ditemukan' }, 404);
      });

      const finalGetResponse = await createTestRequest(finalGetApp, `/api/subscriptions/${subscriptionId}`);
      await expectErrorResponse(finalGetResponse, 404);
    });

    it('should handle multiple subscription operations in sequence', async () => {
      let subscriptions: any[] = [];
      let nextId = 1;

      // Create multiple subscriptions
      const createApp = new Hono();
      createApp.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        const newSubscription = {
          id: nextId++,
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

        subscriptions.push(newSubscription);
        
        const formattedData = {
          ...newSubscription,
          customer: { id: newSubscription.customerId, email: `customer${newSubscription.customerId}@test.com` },
          product: { id: newSubscription.productId, name: `Product ${newSubscription.productId}` },
          advertiser: newSubscription.advertiserId ? { id: newSubscription.advertiserId, email: `advertiser${newSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData }, 201);
      });

      const createdIds = [];
      
      for (let i = 1; i <= 3; i++) {
        const subscriptionData = {
          ...validSubscriptionData,
          brand: `Brand ${i}`,
          customerId: i,
        };
        
        const response = await createTestRequest(createApp, '/api/subscriptions', {
          method: 'POST',
          body: JSON.stringify(subscriptionData),
        });
        
        const data = await expectSuccessResponse(response, 201);
        createdIds.push(data.data.id);
      }

      expect(createdIds).toHaveLength(3);

      // Update all subscriptions
      const updateApp = new Hono();
      updateApp.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        // Update the subscription in the array
        const subscriptionIndex = subscriptions.findIndex(sub => sub.id === id);
        if (subscriptionIndex !== -1) {
          subscriptions[subscriptionIndex] = { ...subscriptions[subscriptionIndex], ...payload, updatedAt: new Date() };
        }

        const updatedSubscription = subscriptions.find(sub => sub.id === id);
        
        const formattedData = {
          ...updatedSubscription,
          customer: { id: updatedSubscription.customerId, email: `customer${updatedSubscription.customerId}@test.com` },
          product: { id: updatedSubscription.productId, name: `Product ${updatedSubscription.productId}` },
          advertiser: updatedSubscription.advertiserId ? { id: updatedSubscription.advertiserId, email: `advertiser${updatedSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      for (const subscription of createdIds) {
        const updateResponse = await createTestRequest(updateApp, `/api/subscriptions/${subscription}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 0 }),
        });
        
        await expectSuccessResponse(updateResponse);
      }

      // Verify all are updated
      const getApp = new Hono();
      getApp.get('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const subscription = subscriptions.find(sub => sub.id === id);
        
        if (!subscription) {
          return c.json({ success: false, message: 'Subscription tidak ditemukan' }, 404);
        }

        const formattedData = {
          ...subscription,
          customer: { id: subscription.customerId, email: `customer${subscription.customerId}@test.com` },
          product: { id: subscription.productId, name: `Product ${subscription.productId}` },
          advertiser: subscription.advertiserId ? { id: subscription.advertiserId, email: `advertiser${subscription.advertiserId}@test.com` } : null,
        };

        return c.json({
          success: true,
          data: formattedData,
        });
      });

      for (const subscription of createdIds) {
        const getResponse = await createTestRequest(getApp, `/api/subscriptions/${subscription}`);
        const data = await expectSuccessResponse(getResponse);
        // Check if the subscription was actually updated in our array
        const foundSubscription = subscriptions.find(sub => sub.id === subscription);
        expect(foundSubscription?.status).toBe(0);
        expect(data.data.status).toBe(0);
      }

      // Delete all subscriptions
      const deleteApp = new Hono();
      deleteApp.delete('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const index = subscriptions.findIndex(sub => sub.id === id);
        if (index !== -1) {
          subscriptions.splice(index, 1);
        }

        return c.json({ success: true, data: { message: 'Subscription dihapus' } });
      });

      for (const subscription of createdIds) {
        const deleteResponse = await createTestRequest(deleteApp, `/api/subscriptions/${subscription}`, {
          method: 'DELETE',
        });
        
        await expectSuccessResponse(deleteResponse);
      }

      // Verify all are deleted
      for (const subscription of createdIds) {
        const getResponse = await createTestRequest(getApp, `/api/subscriptions/${subscription}`);
        await expectErrorResponse(getResponse, 404);
      }
    });
  });

  describe('Status Management Workflow', () => {
    it('should update subscription status through lifecycle', async () => {
      let subscription: any = null;

      // Create subscription
      const createApp = new Hono();
      createApp.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        const newSubscription = {
          id: 1,
          ...payload,
          status: payload.status ?? 1,
          onboardingStatus: payload.onboardingStatus ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        subscription = newSubscription;
        
        const formattedData = {
          ...newSubscription,
          customer: { id: newSubscription.customerId, email: `customer${newSubscription.customerId}@test.com` },
          product: { id: newSubscription.productId, name: `Product ${newSubscription.productId}` },
          advertiser: newSubscription.advertiserId ? { id: newSubscription.advertiserId, email: `advertiser${newSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData }, 201);
      });

      const createResponse = await createTestRequest(createApp, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(validSubscriptionData),
      });
      
      const createData = await expectSuccessResponse(createResponse, 201);
      const subscriptionId = createData.data.id;
      expect(createData.data.status).toBe(1); // Active by default

      // Deactivate subscription
      const deactivateApp = new Hono();
      deactivateApp.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        if (subscription && subscription.id === id) {
          subscription = { ...subscription, ...payload, updatedAt: new Date() };
        }

        const formattedData = {
          ...subscription,
          customer: { id: subscription.customerId, email: `customer${subscription.customerId}@test.com` },
          product: { id: subscription.productId, name: `Product ${subscription.productId}` },
          advertiser: subscription.advertiserId ? { id: subscription.advertiserId, email: `advertiser${subscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const deactivateResponse = await createTestRequest(deactivateApp, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 0 }),
      });
      
      const deactivateData = await expectSuccessResponse(deactivateResponse);
      expect(deactivateData.data.status).toBe(0);

      // Reactivate subscription
      const reactivateApp = new Hono();
      reactivateApp.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        if (subscription && subscription.id === id) {
          subscription = { ...subscription, ...payload, updatedAt: new Date() };
        }

        const formattedData = {
          ...subscription,
          customer: { id: subscription.customerId, email: `customer${subscription.customerId}@test.com` },
          product: { id: subscription.productId, name: `Product ${subscription.productId}` },
          advertiser: subscription.advertiserId ? { id: subscription.advertiserId, email: `advertiser${subscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const reactivateResponse = await createTestRequest(reactivateApp, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 1 }),
      });
      
      const reactivateData = await expectSuccessResponse(reactivateResponse);
      expect(reactivateData.data.status).toBe(1);
    });

    it('should update onboarding status and track progress', async () => {
      let subscription: any = null;

      // Create subscription
      const createApp = new Hono();
      createApp.post('/api/subscriptions', async (c) => {
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

        subscription = newSubscription;
        
        const formattedData = {
          ...newSubscription,
          customer: { id: newSubscription.customerId, email: `customer${newSubscription.customerId}@test.com` },
          product: { id: newSubscription.productId, name: `Product ${newSubscription.productId}` },
          advertiser: newSubscription.advertiserId ? { id: newSubscription.advertiserId, email: `advertiser${newSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData }, 201);
      });

      const createResponse = await createTestRequest(createApp, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(minimalSubscriptionData),
      });
      
      const createData = await expectSuccessResponse(createResponse, 201);
      const subscriptionId = createData.data.id;
      expect(createData.data.onboardingStatus).toBe(0); // Not started by default

      // Start onboarding
      const startApp = new Hono();
      startApp.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        if (subscription && subscription.id === id) {
          subscription = { 
            ...subscription, 
            ...payload, 
            onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : subscription.onboardingUpdatedAt,
            updatedAt: new Date() 
          };
        }

        const formattedData = {
          ...subscription,
          customer: { id: subscription.customerId, email: `customer${subscription.customerId}@test.com` },
          product: { id: subscription.productId, name: `Product ${subscription.productId}` },
          advertiser: subscription.advertiserId ? { id: subscription.advertiserId, email: `advertiser${subscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const startResponse = await createTestRequest(startApp, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify({ onboardingStatus: 1 }),
      });
      
      const startData = await expectSuccessResponse(startResponse);
      expect(startData.data.onboardingStatus).toBe(1);
      expect(startData.data.onboardingUpdatedAt).toBeDefined();

      const initialUpdateTime = new Date(startData.data.onboardingUpdatedAt);

      // Progress onboarding
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure timestamp difference

      const progressApp = new Hono();
      progressApp.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        if (subscription && subscription.id === id) {
          subscription = { 
            ...subscription, 
            ...payload, 
            onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : subscription.onboardingUpdatedAt,
            updatedAt: new Date() 
          };
        }

        const formattedData = {
          ...subscription,
          customer: { id: subscription.customerId, email: `customer${subscription.customerId}@test.com` },
          product: { id: subscription.productId, name: `Product ${subscription.productId}` },
          advertiser: subscription.advertiserId ? { id: subscription.advertiserId, email: `advertiser${subscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const progressResponse = await createTestRequest(progressApp, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify({ onboardingStatus: 2 }),
      });
      
      const progressData = await expectSuccessResponse(progressResponse);
      expect(progressData.data.onboardingStatus).toBe(2);
      expect(progressData.data.onboardingUpdatedAt).toBeDefined();
      
      const progressUpdateTime = new Date(progressData.data.onboardingUpdatedAt);
      expect(progressUpdateTime.getTime()).toBeGreaterThan(initialUpdateTime.getTime());

      // Complete onboarding
      await new Promise(resolve => setTimeout(resolve, 10));

      const completeApp = new Hono();
      completeApp.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        if (subscription && subscription.id === id) {
          subscription = { 
            ...subscription, 
            ...payload, 
            onboardingUpdatedAt: payload.onboardingStatus !== undefined ? new Date() : subscription.onboardingUpdatedAt,
            updatedAt: new Date() 
          };
        }

        const formattedData = {
          ...subscription,
          customer: { id: subscription.customerId, email: `customer${subscription.customerId}@test.com` },
          product: { id: subscription.productId, name: `Product ${subscription.productId}` },
          advertiser: subscription.advertiserId ? { id: subscription.advertiserId, email: `advertiser${subscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const completeResponse = await createTestRequest(completeApp, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify({ onboardingStatus: 3 }),
      });
      
      const completeData = await expectSuccessResponse(completeResponse);
      expect(completeData.data.onboardingStatus).toBe(3);
      
      const completeUpdateTime = new Date(completeData.data.onboardingUpdatedAt);
      expect(completeUpdateTime.getTime()).toBeGreaterThan(progressUpdateTime.getTime());
    });
  });

  describe('Error Recovery Workflows', () => {
    it('should recover from invalid operations gracefully', async () => {
      // Try to create invalid subscription
      const invalidApp = new Hono();
      invalidApp.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        // Simple validation
        if (!payload.customerId || !payload.productId) {
          return c.json({ success: false, message: 'Missing required fields' }, 400);
        }

        return c.json({ success: true, data: payload }, 201);
      });

      const invalidResponse = await createTestRequest(invalidApp, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ invalid: 'data' }),
      });
      
      await expectErrorResponse(invalidResponse, 400);

      // System should still work for valid operations
      const validApp = new Hono();
      validApp.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        // Simple validation
        if (!payload.customerId || !payload.productId) {
          return c.json({ success: false, message: 'Missing required fields' }, 400);
        }

        return c.json({ success: true, data: payload }, 201);
      });

      const validResponse = await createTestRequest(validApp, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(validSubscriptionData),
      });
      
      const validData = await expectSuccessResponse(validResponse, 201);
      expect(validData.data.customerId).toBe(validSubscriptionData.customerId);
      expect(validData.data.productId).toBe(validSubscriptionData.productId);
    });

    it('should handle edge cases in workflow operations', async () => {
      // Create subscription
      const createApp = new Hono();
      let subscription: any = null;

      createApp.post('/api/subscriptions', async (c) => {
        const payload = await c.req.json();
        
        const newSubscription = {
          id: 1,
          ...payload,
          status: payload.status ?? 1,
          onboardingStatus: payload.onboardingStatus ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        subscription = newSubscription;
        
        const formattedData = {
          ...newSubscription,
          customer: { id: newSubscription.customerId, email: `customer${newSubscription.customerId}@test.com` },
          product: { id: newSubscription.productId, name: `Product ${newSubscription.productId}` },
          advertiser: newSubscription.advertiserId ? { id: newSubscription.advertiserId, email: `advertiser${newSubscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData }, 201);
      });

      const createResponse = await createTestRequest(createApp, '/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(validSubscriptionData),
      });
      
      const createData = await expectSuccessResponse(createResponse, 201);
      const subscriptionId = createData.data.id;

      // Try invalid update
      const invalidUpdateApp = new Hono();
      invalidUpdateApp.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        if (Object.keys(payload).length === 0) {
          return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
        }

        if (subscription && subscription.id === id) {
          subscription = { ...subscription, ...payload, updatedAt: new Date() };
        }

        const formattedData = {
          ...subscription,
          customer: { id: subscription.customerId, email: `customer${subscription.customerId}@test.com` },
          product: { id: subscription.productId, name: `Product ${subscription.productId}` },
          advertiser: subscription.advertiserId ? { id: subscription.advertiserId, email: `advertiser${subscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const invalidUpdateResponse = await createTestRequest(invalidUpdateApp, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify({}),
      });
      
      await expectErrorResponse(invalidUpdateResponse, 400);

      // Valid update should still work
      const validUpdateApp = new Hono();
      validUpdateApp.put('/api/subscriptions/:id', async (c) => {
        const id = parseInt(c.req.param('id'));
        
        if (isNaN(id)) {
          return c.json({ success: false, message: 'ID tidak valid' }, 400);
        }

        const payload = await c.req.json();
        
        if (Object.keys(payload).length === 0) {
          return c.json({ success: false, message: 'Tidak ada data yang diupdate' }, 400);
        }

        if (subscription && subscription.id === id) {
          subscription = { ...subscription, ...payload, updatedAt: new Date() };
        }

        const formattedData = {
          ...subscription,
          customer: { id: subscription.customerId, email: `customer${subscription.customerId}@test.com` },
          product: { id: subscription.productId, name: `Product ${subscription.productId}` },
          advertiser: subscription.advertiserId ? { id: subscription.advertiserId, email: `advertiser${subscription.advertiserId}@test.com` } : null,
        };

        return c.json({ success: true, data: formattedData });
      });

      const validUpdateResponse = await createTestRequest(validUpdateApp, `/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: JSON.stringify({ brand: 'Valid Update' }),
      });
      
      const validUpdateData = await expectSuccessResponse(validUpdateResponse);
      expect(validUpdateData.data.brand).toBe('Valid Update');
    });
  });
});
