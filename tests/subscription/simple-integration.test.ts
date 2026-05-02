import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { validSubscriptionData } from './utils/mock-data';
import { createTestRequest, expectSuccessResponse } from './utils/test-helpers';

describe('Simple Integration Test', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    vi.clearAllMocks();
  });

  it('should handle simple POST request', async () => {
    app.post('/api/subscriptions', async (c) => {
      const payload = await c.req.json();
      return c.json({
        success: true,
        data: { id: 1, ...payload, createdAt: new Date() },
      }, 201);
    });

    const response = await createTestRequest(app, '/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(validSubscriptionData),
    });

    console.log('Response status:', response.status);
    const text = await response.text();
    console.log('Response text:', text);
    
    const data = JSON.parse(text);
    console.log('Parsed data:', data);

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
  });

  it('should handle simple GET request', async () => {
    app.get('/api/subscriptions', async (c) => {
      return c.json({
        success: true,
        data: [{ id: 1, customerId: 1, productId: 1 }],
        page: { limit: 20, hasNext: false },
      });
    });

    const response = await createTestRequest(app, '/api/subscriptions');
    
    console.log('GET Response status:', response.status);
    const text = await response.text();
    console.log('GET Response text:', text);
    
    const data = JSON.parse(text);
    console.log('GET Parsed data:', data);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
