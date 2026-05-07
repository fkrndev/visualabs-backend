import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../../../../src/index';
import { setupTestDb, cleanupTestDb, createTestScorecard, createTestScorecardData, createTestCustomer } from '../helpers/database';
import { sign } from 'hono/jwt';

// Helper function to generate test JWT token
async function generateTestToken(userId: number = 1): Promise<string> {
  const payload = {
    sub: String(userId),
    typ: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
  };
  return await sign(payload, process.env.JWT_SECRET || 'super-secret-dev-key');
}

describe('Customer Scorecard Data API Integration Tests', () => {
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

  describe('GET /api/scorecard-data/dashboard', () => {
    it('should retrieve current period data', async () => {
      const scorecard = await createTestScorecard({ title: 'Dashboard KPI' });
      const now = new Date();
      
      // Create current period data
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        status: 1, // Current period
        threshold: 0
      });

      const response = await app.request('/api/scorecard-data/dashboard');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
      
      // Should return current period data
      if (data.data.length > 0) {
        expect(data.data[0]).toHaveProperty('scorecard');
        expect(data.data[0].status).toBe(1);
      }
    });

    it('should filter by customer', async () => {
      const customer = await createTestCustomer();
      const otherCustomer = await createTestCustomer({ username: 'other_customer' });
      
      const scorecard1 = await createTestScorecard({ 
        title: 'Customer 1 KPI', 
        customerId: customer.id 
      });
      const scorecard2 = await createTestScorecard({ 
        title: 'Customer 2 KPI', 
        customerId: otherCustomer.id 
      });
      
      const now = new Date();
      await createTestScorecardData({
        scorecardId: scorecard1.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        status: 1
      });
      await createTestScorecardData({
        scorecardId: scorecard2.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        status: 1
      });

      const response = await app.request(`/api/scorecard-data/dashboard?customerId=${customer.id}`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // All results should belong to the specified customer
      data.data.forEach((item: any) => {
        expect(item.scorecard.customerId).toBe(customer.id);
      });
    });

    it('should filter by threshold', async () => {
      const scorecard = await createTestScorecard({ title: 'Threshold KPI' });
      const now = new Date();
      
      // Create data with different thresholds
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        status: 1,
        threshold: 0 // Green
      });
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        status: 1,
        threshold: 1 // Yellow
      });

      const response = await app.request('/api/scorecard-data/dashboard?threshold=0');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // All results should have the specified threshold
      data.data.forEach((item: any) => {
        expect(item.threshold).toBe(0);
      });
    });

    it('should sort by performance metrics', async () => {
      const scorecard = await createTestScorecard({ title: 'Performance KPI' });
      const now = new Date();
      
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        actualValue: '50.00',
        targetValue: '100.00',
        status: 1
      });
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        actualValue: '80.00',
        targetValue: '100.00',
        status: 1
      });

      const response = await app.request('/api/scorecard-data/dashboard?sortBy=actualValue&sortOrder=desc');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      if (data.data.length >= 2) {
        const actualValues = data.data.map((item: any) => parseFloat(item.actualValue || '0'));
        expect(actualValues[0]).toBeGreaterThanOrEqual(actualValues[1]);
      }
    });

    it('should handle no current period data', async () => {
      const response = await app.request('/api/scorecard-data/dashboard');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should handle maximum limit', async () => {
      const scorecard = await createTestScorecard({ title: 'Bulk KPI' });
      const now = new Date();
      
      // Create fewer records to avoid timeout
      for (let i = 0; i < 50; i++) {
        await createTestScorecardData({
          scorecardId: scorecard.id,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          status: 1
        });
      }

      const response = await app.request('/api/scorecard-data/dashboard?limit=200');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.length).toBeLessThanOrEqual(200);
    }, 10000); // 10 second timeout
  });

  describe('GET /api/scorecard-data/history/:scorecardId', () => {
    it('should retrieve historical data', async () => {
      const scorecard = await createTestScorecard({ title: 'Historical KPI' });
      
      // Create historical data
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 1,
        actualValue: '100.00'
      });
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 2,
        actualValue: '110.00'
      });

      const response = await app.request(`/api/scorecard-data/history/${scorecard.id}`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
      
      // All results should belong to the specified scorecard
      data.data.forEach((item: any) => {
        expect(item.scorecardId).toBe(scorecard.id);
      });
    });

    it('should maintain chronological ordering', async () => {
      const scorecard = await createTestScorecard({ title: 'Ordered KPI' });
      
      // Create data in reverse chronological order
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 3,
        actualValue: '130.00'
      });
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 1,
        actualValue: '100.00'
      });
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 2,
        actualValue: '110.00'
      });

      const response = await app.request(`/api/scorecard-data/history/${scorecard.id}`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      if (data.data.length >= 2) {
        // Should be ordered by year, month, week, day
        for (let i = 1; i < data.data.length; i++) {
          const current = data.data[i];
          const previous = data.data[i - 1];
          
          // Compare year, then month, then week
          if (current.year === previous.year) {
            if (current.month === previous.month) {
              if (current.week !== null && previous.week !== null) {
                expect(current.week).toBeGreaterThanOrEqual(previous.week);
              }
            } else {
              expect(current.month).toBeGreaterThanOrEqual(previous.month);
            }
          } else {
            expect(current.year).toBeGreaterThanOrEqual(previous.year);
          }
        }
      }
    });

    it('should return 404 for invalid scorecardId', async () => {
      const response = await app.request('/api/scorecard-data/history/999999');
      
      expect(response.status).toBe(404);
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.message).toContain('tidak ditemukan');
    });

    it('should return 400 for non-numeric scorecardId', async () => {
      const response = await app.request('/api/scorecard-data/history/invalid');
      
      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });

    it('should handle empty history', async () => {
      const scorecard = await createTestScorecard({ title: 'Empty History KPI' });

      const response = await app.request(`/api/scorecard-data/history/${scorecard.id}`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });
  });

  describe('GET /api/scorecard-data', () => {
    it('should retrieve list with pagination', async () => {
      const scorecard = await createTestScorecard({ title: 'List KPI' });
      
      // Create test data
      for (let i = 0; i < 25; i++) {
        await createTestScorecardData({
          scorecardId: scorecard.id,
          year: 2024,
          month: (i % 12) + 1,
          actualValue: `${i * 10}.00`
        });
      }

      const response = await app.request('/api/scorecard-data?page=1&limit=10');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('page');
      expect(data.page).toHaveProperty('limit', 10);
      expect(data.page).toHaveProperty('page', 1);
      expect(data.data.length).toBeLessThanOrEqual(10);
    }, 10000); // Increase timeout to 10 seconds

    it('should filter by period (year, month, week)', async () => {
      const scorecard = await createTestScorecard({ title: 'Period KPI' });
      
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 1,
        week: 1
      });
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 2,
        week: 1
      });
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2023,
        month: 1,
        week: 1
      });

      const response = await app.request('/api/scorecard-data?year=2024&month=1');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      data.data.forEach((item: any) => {
        expect(item.year).toBe(2024);
        expect(item.month).toBe(1);
      });
    }, 10000); // Increase timeout to 10 seconds

    it('should filter by status', async () => {
      const scorecard = await createTestScorecard({ title: 'Status KPI' });
      
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 1,
        status: 1 // Active
      });
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 2,
        status: 0 // Inactive
      });

      const response = await app.request('/api/scorecard-data?status=1');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      data.data.forEach((item: any) => {
        expect(item.status).toBe(1);
      });
    }, 10000); // Increase timeout to 10 seconds

    it('should filter by scorecardId', async () => {
      const scorecard1 = await createTestScorecard({ title: 'KPI 1' });
      const scorecard2 = await createTestScorecard({ title: 'KPI 2' });
      
      await createTestScorecardData({
        scorecardId: scorecard1.id,
        year: 2024,
        month: 1
      });
      await createTestScorecardData({
        scorecardId: scorecard2.id,
        year: 2024,
        month: 1
      });

      const response = await app.request(`/api/scorecard-data?scorecardId=${scorecard1.id}`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      data.data.forEach((item: any) => {
        expect(item.scorecardId).toBe(scorecard1.id);
      });
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('POST /api/scorecard-data', () => {
    it('should create with auto-calculated fields', async () => {
      const scorecard = await createTestScorecard({ 
        title: 'Auto Calc KPI',
        targetValue: '100.00',
        targetType: 0 // Minimum
      });
      
      const token = await generateTestToken();
      const payload = {
        scorecardId: scorecard.id,
        year: 2024,
        month: 1,
        actualValue: '90.00',
        targetValue: '100.00'
      };

      const response = await app.request('/api/scorecard-data', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('id');
      expect(data.data.scorecardId).toBe(payload.scorecardId);
      expect(data.data.threshold).toBeDefined();
      expect(data.data.status).toBeDefined();
    });

    it('should calculate trend correctly', async () => {
      const scorecard = await createTestScorecard({ title: 'Trend KPI' });
      const now = new Date();
      
      // Create previous period data
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: now.getFullYear(),
        month: now.getMonth(),
        actualValue: '80.00'
      });
      
      const token = await generateTestToken();
      const payload = {
        scorecardId: scorecard.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        actualValue: '90.00'
      };

      const response = await app.request('/api/scorecard-data', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // Trend should be calculated (naik/stabil/turun)
      expect([1, 2, 3]).toContain(data.data.trend);
    });

    it('should calculate threshold correctly', async () => {
      const scorecard = await createTestScorecard({ 
        title: 'Threshold KPI',
        targetValue: '100.00',
        targetType: 0,
        greenThreshold: 100,
        yellowThreshold: 80
      });
      
      const token = await generateTestToken();
      const payload = {
        scorecardId: scorecard.id,
        year: 2024,
        month: 1,
        actualValue: '85.00', // 85% of target
        targetValue: '100.00'
      };

      const response = await app.request('/api/scorecard-data', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // 85% should be yellow threshold (1) for minimum target type
      expect(data.data.threshold).toBe(1);
    });

    it('should calculate status based on current period', async () => {
      const scorecard = await createTestScorecard({ title: 'Status KPI' });
      const now = new Date();
      
      const token = await generateTestToken();
      const payload = {
        scorecardId: scorecard.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1, // Current month
        actualValue: '100.00'
      };

      const response = await app.request('/api/scorecard-data', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // Current period should have status 1
      expect(data.data.status).toBe(1);
    });

    it('should require authentication', async () => {
      const payload = {
        scorecardId: 1,
        year: 2024,
        month: 1,
        actualValue: '100.00'
      };

      const response = await app.request('/api/scorecard-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Should return 401 when no authentication is provided
      expect(response.status).toBe(401);
    });

    it('should validate required fields', async () => {
      const token = await generateTestToken();
      const payload = {
        year: 2024,
        month: 1
        // Missing scorecardId
      };

      const response = await app.request('/api/scorecard-data', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('scorecardId');
    });
  });

  describe('PUT /api/scorecard-data/:id', () => {
    it('should update with field recalculation', async () => {
      const scorecard = await createTestScorecard({ 
        title: 'Update KPI',
        targetValue: '100.00',
        targetType: 0
      });
      
      const scorecardData = await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 1,
        actualValue: '80.00'
      });
      
      const token = await generateTestToken();
      const payload = {
        actualValue: '95.00'
      };

      const response = await app.request(`/api/scorecard-data/${scorecardData.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.actualValue).toBe(payload.actualValue);
      // Threshold should be recalculated
      expect(data.data.threshold).toBeDefined();
    });

    it('should recalculate trend on update', async () => {
      const scorecard = await createTestScorecard({ title: 'Trend Update KPI' });
      
      // Create previous data
      await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 1,
        actualValue: '80.00'
      });
      
      const scorecardData = await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 2,
        actualValue: '85.00'
      });
      
      const token = await generateTestToken();
      const payload = {
        actualValue: '75.00' // Decrease
      };

      const response = await app.request(`/api/scorecard-data/${scorecardData.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // Trend should be recalculated based on new value
      expect([1, 2, 3]).toContain(data.data.trend);
    });

    it('should recalculate threshold on update', async () => {
      const scorecard = await createTestScorecard({ 
        title: 'Threshold Update KPI',
        targetValue: '100.00',
        targetType: 0,
        greenThreshold: 100,
        yellowThreshold: 80
      });
      
      const scorecardData = await createTestScorecardData({
        scorecardId: scorecard.id,
        year: 2024,
        month: 1,
        actualValue: '85.00',
        targetValue: '100.00'
      });
      
      // Ensure scorecardData was created successfully
      if (!scorecardData || !scorecardData.id) {
        throw new Error('Failed to create scorecard data for threshold update test');
      }
      
      const token = await generateTestToken();
      const payload = {
        actualValue: '105.00' // Exceeds target
      };

      const response = await app.request(`/api/scorecard-data/${scorecardData.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      // 105% should be green threshold (0) for minimum target type
      expect(data.data.threshold).toBe(0);
    });

    it('should return 404 for non-existent record', async () => {
      const token = await generateTestToken();
      const payload = { actualValue: '100.00' };

      const response = await app.request('/api/scorecard-data/999999', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid ID', async () => {
      const token = await generateTestToken();
      const payload = { actualValue: '100.00' };

      const response = await app.request('/api/scorecard-data/invalid', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data.success).toBe(false);
    });
  });
});
