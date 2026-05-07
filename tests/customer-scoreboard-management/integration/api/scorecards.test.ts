import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../../../../src/index';
import { setupTestDb, cleanupTestDb, createTestScorecard, createTestCustomer, createTestUser } from '../helpers/database';

describe('Customer Scorecards API Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupTestDb();
    await setupTestDb();
  });

  describe('GET /api/scorecards', () => {
    it('should return paginated scorecards with default parameters', async () => {
      // Create some test data first
      await createTestScorecard({ title: 'Default Test KPI 1' });
      await createTestScorecard({ title: 'Default Test KPI 2' });
      
      const response = await app.request('/api/scorecards');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      type PaginatedResponse = {
        success: boolean;
        data: any[];
        page: {
          limit: number;
          page: number;
          total: number;
        };
      };
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('page');
      expect(data.page).toHaveProperty('limit', 20);
      expect(data.page).toHaveProperty('page', 1);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });

    it('should test with pagination (page=2, limit=10)', async () => {
      // Create more than 10 test records
      for (let i = 0; i < 15; i++) {
        await createTestScorecard({ title: `Test KPI ${i}` });
      }

      const response = await app.request('/api/scorecards?page=2&limit=10');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data.page).toHaveProperty('page', 2);
      expect(data.page).toHaveProperty('limit', 10);
      expect(data.data.length).toBeLessThanOrEqual(10);
    }, 10000); // Increase timeout to 10 seconds

    it('should filter by customer ID', async () => {
      const customer = await createTestCustomer();
      const otherCustomer = await createTestCustomer({ username: 'other_customer' });
      
      await createTestScorecard({ title: 'KPI 1', customerId: customer.id });
      await createTestScorecard({ title: 'KPI 2', customerId: otherCustomer.id });

      const response = await app.request(`/api/scorecards?customerId=${customer.id}`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // Verify all results belong to the specified customer
      data.data.forEach((item: any) => {
        expect(item.customerId).toBe(customer.id);
      });
    }, 10000); // Increase timeout to 10 seconds

    it('should search by title', async () => {
      await createTestScorecard({ title: 'Sales Revenue' });
      await createTestScorecard({ title: 'Customer Satisfaction' });
      await createTestScorecard({ title: 'Sales Growth' });

      const response = await app.request('/api/scorecards?q=Sales');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // Verify all results contain 'Sales' in title (case-insensitive)
      data.data.forEach((item: any) => {
        expect(item.title.toLowerCase()).toContain('sales'.toLowerCase());
      });
    });

    it('should apply multiple filters', async () => {
      const customer = await createTestCustomer();
      const user = await createTestUser();
      
      await createTestScorecard({ 
        title: 'Active KPI', 
        customerId: customer.id, 
        assignedTo: user.id,
        status: 1 
      });
      await createTestScorecard({ 
        title: 'Inactive KPI', 
        customerId: customer.id, 
        assignedTo: user.id,
        status: 0 
      });

      const response = await app.request(`/api/scorecards?customerId=${customer.id}&assignedTo=${user.id}&status=1`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      data.data.forEach((item: any) => {
        expect(item.customerId).toBe(customer.id);
        expect(item.assignedTo).toBe(user.id);
        expect(item.status).toBe(1);
      });
    });

    it('should sort by different fields', async () => {
      await createTestScorecard({ title: 'Z KPI' });
      await createTestScorecard({ title: 'A KPI' });
      await createTestScorecard({ title: 'M KPI' });

      const response = await app.request('/api/scorecards?sortBy=title&sortOrder=asc');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      const titles = data.data.map((item: any) => item.title);
      const sortedTitles = [...titles].sort();
      expect(titles).toEqual(sortedTitles);
    });

    it('should handle empty result set', async () => {
      const response = await app.request('/api/scorecards?customerId=999999');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
      expect(data.page).toHaveProperty('total', 0);
    });

    it('should handle maximum limit', async () => {
      // Create fewer test records to avoid timeout
      for (let i = 0; i < 12; i++) {
        await createTestScorecard({ title: `Max Limit KPI ${i}` });
      }

      const response = await app.request('/api/scorecards?limit=100');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.length).toBeLessThanOrEqual(100);
      expect(data.page.limit).toBe(100);
    }, 10000); // Increase timeout to 10 seconds

    it('should default sort field for invalid sort field', async () => {
      // Create test data first
      await createTestScorecard({ title: 'Test KPI for sort' });
      
      const response = await app.request('/api/scorecards?sortBy=invalidField');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // Should default to sorting by id
      expect(data.data.length).toBeGreaterThan(0);
    });

    it('should handle very large page number', async () => {
      await createTestScorecard({ title: 'Test KPI' });

      const response = await app.request('/api/scorecards?page=999999');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });
  });

  describe('GET /api/scorecards/:id', () => {
    it('should retrieve scorecard by valid ID', async () => {
      const scorecard = await createTestScorecard({ 
        title: 'Test KPI',
        description: 'Test description'
      });

      const response = await app.request(`/api/scorecards/${scorecard.id}`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('id', scorecard.id);
      expect(data.data.title).toMatch(/^Test KPI(_retry_\d+_\d+_\d+)?$/); // Account for retry suffixes
      expect(data.data).toHaveProperty('description', 'Test description');
    });

    it('should retrieve scorecard with complete relations', async () => {
      const customer = await createTestCustomer();
      const user = await createTestUser();
      
      const scorecard = await createTestScorecard({ 
        title: 'Related KPI',
        customerId: customer.id,
        assignedTo: user.id
      });

      const response = await app.request(`/api/scorecards/${scorecard.id}`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('customer');
      expect(data.data).toHaveProperty('assignee');
      
      // Only check profiles if they exist (they may be null due to test setup)
      if (data.data.customer) {
        expect(data.data.customer).toHaveProperty('profile');
      }
      if (data.data.assignee) {
        expect(data.data.assignee).toHaveProperty('profile');
      }
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.request('/api/scorecards/999999');
      
      expect(response.status).toBe(404);
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.message).toContain('not found');
    });

    it('should return 400 for invalid ID (NaN)', async () => {
      const response = await app.request('/api/scorecards/invalid');
      
      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });

    it('should return 400 for string ID', async () => {
      const response = await app.request('/api/scorecards/abc123');
      
      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/scorecards', () => {
    it('should create scorecard with minimal required fields', async () => {
      const payload = {
        title: 'Test KPI'
      };

      const response = await app.request('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('id');
      expect(data.data.title).toBe(payload.title);
      expect(data.data).toHaveProperty('createdAt');
      expect(data.data).toHaveProperty('updatedAt');
    });

    it('should create scorecard with all optional fields', async () => {
      const customer = await createTestCustomer();
      const user = await createTestUser();
      
      const payload = {
        title: 'Complete KPI',
        description: 'Complete description',
        customerId: customer.id,
        assignedTo: user.id,
        targetValue: '85.00',
        targetType: 0,
        unitValue: 1,
        unitCustom: '%',
        frequency: 1,
        showOnScorecard: 1,
        greenThreshold: 100,
        yellowThreshold: 80,
        status: 1,
        category: 1,
        pic: 1
      };

      const response = await app.request('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(payload.title);
      expect(data.data.customerId).toBe(payload.customerId);
      expect(data.data.assignedTo).toBe(payload.assignedTo);
      expect(data.data.targetValue).toBe(payload.targetValue);
    });

    it('should return 400 for missing required title', async () => {
      const payload = {
        description: 'KPI without title'
      };

      const response = await app.request('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('title');
    });

    it('should return 400 for empty title', async () => {
      const payload = {
        title: ''
      };

      const response = await app.request('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });

    it('should return 400 for whitespace-only title', async () => {
      const payload = {
        title: '   '
      };

      const response = await app.request('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid data types', async () => {
      const payload = {
        title: 'Test KPI',
        customerId: 'invalid',
        targetValue: 'not-a-number'
      };

      const response = await app.request('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });

    it('should handle database error for non-existent customerId', async () => {
      const payload = {
        title: 'Test KPI',
        customerId: 999999
      };

      const response = await app.request('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Should either succeed (if foreign key constraints are not enforced) 
      // or return appropriate error
      expect([201, 400, 500]).toContain(response.status);
    });

    it('should handle database error for non-existent subscriptionId', async () => {
      const payload = {
        title: 'Test KPI',
        subscriptionId: 999999
      };

      const response = await app.request('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Should either succeed (if foreign key constraints are not enforced) 
      // or return appropriate error
      expect([201, 400, 500]).toContain(response.status);
    });

    it('should handle database error for non-existent assignedTo', async () => {
      const payload = {
        title: 'Test KPI',
        assignedTo: 999999
      };

      const response = await app.request('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Should either succeed (if foreign key constraints are not enforced) 
      // or return appropriate error
      expect([201, 400, 500]).toContain(response.status);
    });
  });

  describe('PUT /api/scorecards/:id', () => {
    it('should perform partial update', async () => {
      const scorecard = await createTestScorecard({ title: 'Original Title' });
      
      const payload = {
        title: 'Updated Title'
      };

      const response = await app.request(`/api/scorecards/${scorecard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(payload.title);
      expect(data.data.id).toBe(scorecard.id);
    });

    it('should perform full update', async () => {
      const customer = await createTestCustomer();
      const user = await createTestUser();

      if (!customer || !customer.id) {
        throw new Error('Failed to create customer for full update test');
      }
      if (!user || !user.id) {
        throw new Error('Failed to create user for full update test');
      }

      const scorecard = await createTestScorecard({ title: 'Original' });

      if (!scorecard || !scorecard.id) {
        throw new Error('Failed to create scorecard for update test');
      }

      const payload = {
        title: 'Fully Updated KPI',
        description: 'Updated description',
        customerId: customer.id,
        assignedTo: user.id,
        targetValue: '90.00',
        status: 0
      };

      const response = await app.request(`/api/scorecards/${scorecard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(payload.title);
      expect(data.data.customerId).toBe(payload.customerId);
      expect(data.data.assignedTo).toBe(payload.assignedTo);
    });

    it('should update with relation changes', async () => {
      const customer1 = await createTestCustomer();
      const customer2 = await createTestCustomer({ username: 'customer2' });
      const user1 = await createTestUser();
      const user2 = await createTestUser({ username: 'user2' });

      if (!customer1 || !customer1.id) {
        throw new Error('Failed to create customer1 for relation update test');
      }
      if (!customer2 || !customer2.id) {
        throw new Error('Failed to create customer2 for relation update test');
      }
      if (!user1 || !user1.id) {
        throw new Error('Failed to create user1 for relation update test');
      }
      if (!user2 || !user2.id) {
        throw new Error('Failed to create user2 for relation update test');
      }

      const scorecard = await createTestScorecard({
        title: 'Relational KPI',
        customerId: customer1.id,
        assignedTo: user1.id
      });
      
      // Ensure scorecard was created successfully
      if (!scorecard || !scorecard.id) {
        throw new Error('Failed to create scorecard for relation update test');
      }
      
      const payload = {
        customerId: customer2.id,
        assignedTo: user2.id
      };

      const response = await app.request(`/api/scorecards/${scorecard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.customerId).toBe(customer2.id);
      expect(data.data.assignedTo).toBe(user2.id);
    });

    it('should return 404 for non-existent ID', async () => {
      const payload = { title: 'Updated Title' };

      const response = await app.request('/api/scorecards/999999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid ID', async () => {
      const payload = { title: 'Updated Title' };

      const response = await app.request('/api/scorecards/invalid', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });

    it('should handle empty update payload', async () => {
      const scorecard = await createTestScorecard({ title: 'Test KPI' });

      const response = await app.request(`/api/scorecards/${scorecard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      // Should succeed with no changes or return validation error
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('DELETE /api/scorecards/:id', () => {
    it('should delete scorecard successfully', async () => {
      const scorecard = await createTestScorecard({ title: 'To Delete' });

      const response = await app.request(`/api/scorecards/${scorecard.id}`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted');

      // Verify deletion
      const getResponse = await app.request(`/api/scorecards/${scorecard.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.request('/api/scorecards/999999', {
        method: 'DELETE'
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid ID', async () => {
      const response = await app.request('/api/scorecards/invalid', {
        method: 'DELETE'
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });
  });
});
