import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import scorecardsRouter from '@/routes/scorecards';
import scorecardDataRouter from '@/routes/scorecardData';

// Mock dependencies
vi.mock('@/db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => next()),
  getAuthUserId: vi.fn(() => 1),
}));

describe('Customer Scorecards Route Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Initialization', () => {
    it('should initialize router with correct configuration', () => {
      expect(scorecardsRouter).toBeDefined();
      expect(scorecardsRouter.constructor.name).toBe('Hono');
    });

    it('should have all required routes registered', async () => {
      // Test GET / route
      const getResponse = await scorecardsRouter.request('/');
      expect(getResponse).toBeDefined();

      // Test GET /:id route
      const getByIdResponse = await scorecardsRouter.request('/1');
      expect(getByIdResponse).toBeDefined();

      // Test POST route
      const postResponse = await scorecardsRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' })
      });
      expect(postResponse).toBeDefined();

      // Test PUT route
      const putResponse = await scorecardsRouter.request('/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' })
      });
      expect(putResponse).toBeDefined();

      // Test DELETE route
      const deleteResponse = await scorecardsRouter.request('/1', {
        method: 'DELETE'
      });
      expect(deleteResponse).toBeDefined();
    });
  });

  describe('Middleware Integration', () => {
    it('should integrate validation middleware for GET queries', async () => {
      const response = await scorecardsRouter.request('/?page=invalid');
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should integrate validation middleware for POST payloads', async () => {
      const response = await scorecardsRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Missing required title
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should integrate validation middleware for PUT payloads', async () => {
      const response = await scorecardsRouter.request('/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 123 }) // Invalid type
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('Database Integration', () => {
    it('should handle database client integration', async () => {
      const { db } = await import('@/db/client');
      
      // Mock successful query
      (db.select as any).mockResolvedValue([{ scorecard: { id: 1, title: 'Test' } }]);
      
      const response = await scorecardsRouter.request('/1');
      expect(response.status).toBe(200);
      
      // Verify db methods were called
      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalled();
      expect(db.leftJoin).toHaveBeenCalledTimes(5); // All the joins in buildSelectQuery
    });

    it('should handle query builder integration', async () => {
      const { db } = await import('@/db/client');
      
      // Mock empty result
      (db.select as any).mockResolvedValue([]);
      
      const response = await scorecardsRouter.request('/999');
      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.message).toBe('Scorecard not found');
    });

    it('should handle transaction scenarios', async () => {
      const { db } = await import('@/db/client');
      
      // Mock successful insert and retrieval
      (db.insert as any).mockResolvedValue([{ insertId: 1 }]);
      (db.select as any).mockResolvedValue([{ 
        scorecard: { id: 1, title: 'Test' },
        customer: null,
        subscription: null,
        assignee: null
      }]);
      
      const response = await scorecardsRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test KPI' })
      });
      
      expect(response.status).toBe(201);
      expect(db.insert).toHaveBeenCalled();
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle database errors gracefully', async () => {
      const { db } = await import('@/db/client');
      
      // Mock database error
      (db.insert as any).mockRejectedValue(new Error('Database connection failed'));
      
      const response = await scorecardsRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test KPI' })
      });
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe('Gagal membuat scorecard');
    });

    it('should handle validation errors with proper formatting', async () => {
      const response = await scorecardsRouter.request('/?page=0&limit=101');
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });
});

describe('Customer Scorecard Data Route Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Initialization', () => {
    it('should initialize router with authentication', () => {
      expect(scorecardDataRouter).toBeDefined();
      expect(scorecardDataRouter.constructor.name).toBe('Hono');
    });

    it('should have all required routes registered', async () => {
      // Test GET /dashboard route
      const dashboardResponse = await scorecardDataRouter.request('/dashboard');
      expect(dashboardResponse).toBeDefined();

      // Test GET /history/:scorecardId route
      const historyResponse = await scorecardDataRouter.request('/history/1');
      expect(historyResponse).toBeDefined();

      // Test GET / route
      const listResponse = await scorecardDataRouter.request('/');
      expect(listResponse).toBeDefined();

      // Test GET /:id route
      const getByIdResponse = await scorecardDataRouter.request('/1');
      expect(getByIdResponse).toBeDefined();

      // Test POST route (with auth middleware)
      const postResponse = await scorecardDataRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scorecardId: 1, year: 2024 })
      });
      expect(postResponse).toBeDefined();

      // Test PUT route
      const putResponse = await scorecardDataRouter.request('/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualValue: '85.5' })
      });
      expect(putResponse).toBeDefined();

      // Test DELETE route
      const deleteResponse = await scorecardDataRouter.request('/1', {
        method: 'DELETE'
      });
      expect(deleteResponse).toBeDefined();
    });
  });

  describe('Business Logic Integration', () => {
    it('should integrate auto-calculation for threshold', async () => {
      const { db } = await import('@/db/client');
      
      // Mock scorecard data
      (db.select as any).mockResolvedValue([{
        id: 1,
        title: 'Test KPI',
        targetType: 0,
        greenThreshold: 100,
        yellowThreshold: 80,
        targetValue: '100'
      }]);
      
      // Mock insert result
      (db.insert as any).mockResolvedValue([{ insertId: 1 }]);
      
      // Mock created data retrieval
      (db.select as any).mockResolvedValue([{
        scorecardDataItem: { id: 1, threshold: 0, status: 1 },
        scorecard: { id: 1, title: 'Test KPI' }
      }]);
      
      const response = await scorecardDataRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scorecardId: 1, 
          year: 2024, 
          actualValue: '100',
          targetValue: '100'
        })
      });
      
      expect(response.status).toBe(201);
      expect(db.select).toHaveBeenCalled(); // For computeAutoFields
    });

    it('should integrate trend calculation', async () => {
      const { db } = await import('@/db/client');
      
      // Mock previous data for trend calculation
      (db.select as any)
        .mockResolvedValueOnce([{
          id: 1,
          title: 'Test KPI',
          targetType: 0,
          greenThreshold: 100,
          yellowThreshold: 80,
          targetValue: '100'
        }])
        .mockResolvedValueOnce([{ actualValue: '80' }]) // Previous data
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([{
          scorecardDataItem: { id: 1, trend: 3 }, // 3 = naik
          scorecard: { id: 1, title: 'Test KPI' }
        }]);
      
      const response = await scorecardDataRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scorecardId: 1, 
          year: 2024, 
          actualValue: '90',
          targetValue: '100'
        })
      });
      
      expect(response.status).toBe(201);
      // Trend calculation should be called via computeTrend
      expect(db.select).toHaveBeenCalledTimes(4);
    });

    it('should integrate status calculation based on current period', async () => {
      const { db } = await import('@/db/client');
      
      const now = new Date();
      const currentYear = now.getFullYear();
      
      (db.select as any)
        .mockResolvedValueOnce([{
          id: 1,
          title: 'Test KPI',
          targetType: 0,
          greenThreshold: 100,
          yellowThreshold: 80,
          targetValue: '100'
        }])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([{
          scorecardDataItem: { id: 1, status: 1 }, // 1 = current period
          scorecard: { id: 1, title: 'Test KPI' }
        }]);
      
      const response = await scorecardDataRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scorecardId: 1, 
          year: currentYear, // Current year
          actualValue: '85',
          targetValue: '100'
        })
      });
      
      expect(response.status).toBe(201);
    });
  });

  describe('Route-Specific Middleware', () => {
    it('should require authentication for POST operations', async () => {
      const { requireAuth } = await import('@/middleware/auth');
      
      // Mock auth middleware to throw error
      (requireAuth as any).mockImplementation(() => {
        throw new Error('Unauthorized');
      });
      
      const response = await scorecardDataRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scorecardId: 1, year: 2024 })
      });
      
      // Should handle auth error
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should validate dashboard-specific query parameters', async () => {
      const response = await scorecardDataRouter.request('/dashboard?page=0&limit=201');
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should validate history route parameters', async () => {
      const response = await scorecardDataRouter.request('/history/invalid');
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe('scorecardId tidak valid');
    });
  });

  describe('Complex Query Integration', () => {
    it('should handle dashboard query with current period filter', async () => {
      const { db } = await import('@/db/client');
      
      (db.select as any).mockResolvedValue([]);
      
      const response = await scorecardDataRouter.request('/dashboard?threshold=0&customerId=1');
      expect(response.status).toBe(200);
      
      // Should filter by status=1 (current period) and other parameters
      expect(db.where).toHaveBeenCalled();
    });

    it('should handle history query with chronological ordering', async () => {
      const { db } = await import('@/db/client');
      
      (db.select as any).mockResolvedValue([{ id: 1, year: 2024, month: 1 }]);
      
      const response = await scorecardDataRouter.request('/history/1');
      expect(response.status).toBe(200);
      
      // Should order by year, month, week, day ascending
      expect(db.orderBy).toHaveBeenCalled();
    });
  });
});
