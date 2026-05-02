import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { validSubscriptionData } from './utils/mock-data';
import { createTestRequest } from './utils/test-helpers';

describe('Debug Test', () => {
  it('should test basic JSON response', async () => {
    const app = new Hono();
    
    app.get('/test', async (c) => {
      return c.json({ success: true, data: { id: 1 } });
    });
    
    const response = await app.request('/test');
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('Response text:', text);
    console.log('Response text length:', text.length);
    console.log('Response text chars:', Array.from(text).map(c => `${c} (${c.charCodeAt(0)})`));
    
    const data = JSON.parse(text);
    console.log('Parsed data:', data);
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should test mock router setup', async () => {
    const app = new Hono();
    
    // Mock router setup similar to integration tests
    const mockData = {
      subscriptions: [{ id: 1, customerId: 1, productId: 1 }],
    };

    app.get('/api/subscriptions', async (c) => {
      return c.json({
        success: true,
        data: mockData.subscriptions,
        page: { limit: 20, hasNext: false, sortBy: 'id', sortOrder: 'asc' },
      });
    });

    const response = await app.request('/api/subscriptions');
    console.log('Mock router response status:', response.status);
    
    const text = await response.text();
    console.log('Mock router response text:', text);
    
    const data = JSON.parse(text);
    console.log('Mock router parsed data:', data);
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should test POST request with createTestRequest helper', async () => {
    const app = new Hono();
    
    app.post('/api/subscriptions', async (c) => {
      const payload = await c.req.json();
      return c.json({
        success: true,
        data: { id: 1, ...payload },
      }, 201);
    });

    const response = await createTestRequest(app, '/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(validSubscriptionData),
    });

    console.log('POST Response status:', response.status);
    console.log('POST Response headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('POST Response text:', text);
    console.log('POST Response text length:', text.length);
    console.log('POST Response text chars:', Array.from(text.slice(0, 50)).map(c => `${c} (${c.charCodeAt(0)})`));
    
    try {
      const data = JSON.parse(text);
      console.log('POST Parsed data:', data);
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    } catch (error) {
      console.log('JSON Parse Error:', error.message);
      console.log('First 100 chars:', text.slice(0, 100));
      console.log('Last 100 chars:', text.slice(-100));
      throw error;
    }
  });

  it('should test the actual integration test scenario', async () => {
    const app = new Hono();
    let subscriptions: any[] = [];
    let nextId = 1;

    app.post('/api/subscriptions', async (c) => {
      const payload = await c.req.json();
      
      try {
        const newSubscription = {
          id: nextId++,
          ...payload,
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
      } catch (error) {
        return c.json({ success: false, message: 'Gagal membuat subscription' }, 500);
      }
    });

    const response = await createTestRequest(app, '/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(validSubscriptionData),
    });

    console.log('Integration POST Response status:', response.status);
    
    const text = await response.text();
    console.log('Integration POST Response text:', text);
    
    try {
      const data = JSON.parse(text);
      console.log('Integration POST Parsed data:', data);
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    } catch (error) {
      console.log('Integration JSON Parse Error:', error.message);
      console.log('Integration First 100 chars:', text.slice(0, 100));
      console.log('Integration Last 100 chars:', text.slice(-100));
      throw error;
    }
  });
});
