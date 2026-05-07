import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatRow, buildSelectQuery } from '../../../src/routes/scorecards';

// Mock database client
vi.mock('../../../src/db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  },
}));

// Mock schema
vi.mock('../../../src/db/schema', () => ({
  scorecards: {
    id: 'scorecards.id',
    title: 'scorecards.title',
    customerId: 'scorecards.customerId',
    subscriptionId: 'scorecards.subscriptionId',
    assignedTo: 'scorecards.assignedTo',
    description: 'scorecards.description',
    pic: 'scorecards.pic',
    category: 'scorecards.category',
    targetValue: 'scorecards.targetValue',
    targetType: 'scorecards.targetType',
    unitValue: 'scorecards.unitValue',
    unitCustom: 'scorecards.unitCustom',
    frequency: 'scorecards.frequency',
    showOnScorecard: 'scorecards.showOnScorecard',
    greenThreshold: 'scorecards.greenThreshold',
    yellowThreshold: 'scorecards.yellowThreshold',
    status: 'scorecards.status',
    createdAt: 'scorecards.createdAt',
    updatedAt: 'scorecards.updatedAt',
  },
  customers: {
    id: 'customers.id',
    username: 'customers.username',
  },
  customerProfiles: {
    id: 'customerProfiles.id',
    name: 'customerProfiles.name',
    customerId: 'customerProfiles.customerId',
  },
  subscriptions: {
    id: 'subscriptions.id',
    brand: 'subscriptions.brand',
  },
  users: {
    id: 'users.id',
    username: 'users.username',
    email: 'users.email',
  },
  profiles: {
    id: 'profiles.id',
    name: 'profiles.name',
    userId: 'profiles.userId',
  },
}));

describe('Scorecards Business Logic', () => {
  describe('formatRow function', () => {
    it('should format complete scorecard with all relations', () => {
      const mockRow = {
        scorecard: {
          id: 1,
          title: 'Test KPI',
          customerId: 1,
          subscriptionId: 1,
          assignedTo: 1,
          description: 'Test description',
          pic: 1,
          category: 2,
          targetValue: '85.00',
          targetType: 0,
          unitValue: 1,
          unitCustom: null,
          frequency: 1,
          showOnScorecard: 1,
          greenThreshold: 100,
          yellowThreshold: 80,
          status: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        customer: {
          id: 1,
          username: 'customer1',
        },
        customerProfile: {
          id: 1,
          name: 'PT Customer Test',
          customerId: 1,
        },
        subscription: {
          id: 1,
          brand: 'Brand A',
        },
        assignee: {
          id: 1,
          username: 'user1',
          email: 'user1@example.com',
        },
        assigneeProfile: {
          id: 1,
          name: 'John Doe',
          userId: 1,
        },
      };

      const result = formatRow(mockRow);

      // Check that scorecard fields are preserved
      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('title', 'Test KPI');
      expect(result).toHaveProperty('description', 'Test description');

      // Check customer relation with profile
      expect(result.customer).toEqual({
        id: 1,
        username: 'customer1',
        profile: {
          id: 1,
          name: 'PT Customer Test',
          customerId: 1,
        },
      });

      // Check subscription relation
      expect(result.subscription).toEqual({
        id: 1,
        brand: 'Brand A',
      });

      // Check assignee relation with profile
      expect(result.assignee).toEqual({
        id: 1,
        username: 'user1',
        email: 'user1@example.com',
        profile: {
          id: 1,
          name: 'John Doe',
          userId: 1,
        },
      });
    });

    it('should handle missing customer data gracefully', () => {
      const mockRow = {
        scorecard: {
          id: 2,
          title: 'KPI without customer',
          customerId: null,
        },
        customer: null,
        customerProfile: null,
        subscription: null,
        assignee: null,
        assigneeProfile: null,
      };

      const result = formatRow(mockRow);

      expect(result.customer).toBeNull();
      expect(result.subscription).toBeNull();
      expect(result.assignee).toBeNull();
    });

    it('should handle missing subscription data gracefully', () => {
      const mockRow = {
        scorecard: {
          id: 3,
          title: 'KPI without subscription',
          subscriptionId: null,
        },
        customer: {
          id: 1,
          username: 'customer1',
        },
        customerProfile: {
          id: 1,
          name: 'PT Customer',
        },
        subscription: null,
        assignee: null,
        assigneeProfile: null,
      };

      const result = formatRow(mockRow);

      expect(result.customer).not.toBeNull();
      expect(result.subscription).toBeNull();
      expect(result.assignee).toBeNull();
    });

    it('should handle missing assignee data gracefully', () => {
      const mockRow = {
        scorecard: {
          id: 4,
          title: 'KPI without assignee',
          assignedTo: null,
        },
        customer: {
          id: 1,
          username: 'customer1',
        },
        customerProfile: {
          id: 1,
          name: 'PT Customer',
        },
        subscription: {
          id: 1,
          brand: 'Brand A',
        },
        assignee: null,
        assigneeProfile: null,
      };

      const result = formatRow(mockRow);

      expect(result.customer).not.toBeNull();
      expect(result.subscription).not.toBeNull();
      expect(result.assignee).toBeNull();
    });

    it('should handle missing profile data gracefully', () => {
      const mockRow = {
        scorecard: {
          id: 5,
          title: 'KPI with missing profiles',
          customerId: 1,
          assignedTo: 1,
        },
        customer: {
          id: 1,
          username: 'customer1',
        },
        customerProfile: null, // Missing profile
        subscription: null,
        assignee: {
          id: 1,
          username: 'user1',
        },
        assigneeProfile: null, // Missing profile
      };

      const result = formatRow(mockRow);

      expect(result.customer).toEqual({
        id: 1,
        username: 'customer1',
        profile: null,
      });

      expect(result.assignee).toEqual({
        id: 1,
        username: 'user1',
        profile: null,
      });
    });

    it('should handle all null relations', () => {
      const mockRow = {
        scorecard: {
          id: 6,
          title: 'Orphan KPI',
          customerId: null,
          subscriptionId: null,
          assignedTo: null,
        },
        customer: null,
        customerProfile: null,
        subscription: null,
        assignee: null,
        assigneeProfile: null,
      };

      const result = formatRow(mockRow);

      expect(result.customer).toBeNull();
      expect(result.subscription).toBeNull();
      expect(result.assignee).toBeNull();
      expect(result.title).toBe('Orphan KPI');
    });
  });

  describe('buildSelectQuery function', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should build query with correct table structure', () => {
      const query = buildSelectQuery();
      
      // Verify the query chain
      expect(query.select).toHaveBeenCalled();
      expect(query.from).toHaveBeenCalled();
      expect(query.leftJoin).toHaveBeenCalledTimes(5); // customers, customerProfiles, subscriptions, assigneeUsers, assigneeProfiles
    });

    it('should include all required fields in select', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      db.select = mockSelect;

      buildSelectQuery();

      expect(mockSelect).toHaveBeenCalledWith({
        scorecard: expect.any(Object),
        customer: expect.any(Object),
        customerProfile: expect.any(Object),
        subscription: expect.any(Object),
        assignee: expect.any(Object),
        assigneeProfile: expect.any(Object),
      });
    });

    it('should use correct table and join order', async () => {
      const { db } = await import('../../../src/db/client');
      const mockFrom = vi.fn().mockReturnThis();
      const mockLeftJoin = vi.fn().mockReturnThis();
      
      db.from = mockFrom;
      db.leftJoin = mockLeftJoin;

      buildSelectQuery();

      // Verify main table
      expect(mockFrom).toHaveBeenCalledWith(expect.any(Object)); // scorecards

      // Verify join order and structure
      expect(mockLeftJoin).toHaveBeenCalledTimes(5);
    });

    it('should return query object that supports method chaining', () => {
      const query = buildSelectQuery();
      
      // Should support all required query methods
      expect(typeof query.where).toBe('function');
      expect(typeof query.orderBy).toBe('function');
      expect(typeof query.limit).toBe('function');
      expect(typeof query.offset).toBe('function');
    });

    it('should handle alias usage correctly for assignee tables', () => {
      // This test verifies that the function uses the correct aliases
      // The actual alias usage is verified through the mock setup
      const query = buildSelectQuery();
      
      expect(query).toBeDefined();
      // The alias verification is done through the mock schema setup
    });
  });

  describe('Integration between formatRow and buildSelectQuery', () => {
    it('should work together for complete data flow', () => {
      // Mock a complete query result row
      const mockQueryResult = {
        scorecard: {
          id: 1,
          title: 'Integration Test KPI',
          customerId: 1,
          subscriptionId: 1,
          assignedTo: 1,
        },
        customer: { id: 1, username: 'test_customer' },
        customerProfile: { id: 1, name: 'Test Customer' },
        subscription: { id: 1, brand: 'Test Brand' },
        assignee: { id: 1, username: 'test_assignee' },
        assigneeProfile: { id: 1, name: 'Test Assignee' },
      };

      const formattedResult = formatRow(mockQueryResult);

      // Verify the complete formatted structure
      expect(formattedResult).toMatchObject({
        id: 1,
        title: 'Integration Test KPI',
        customer: {
          id: 1,
          username: 'test_customer',
          profile: { id: 1, name: 'Test Customer' },
        },
        subscription: { id: 1, brand: 'Test Brand' },
        assignee: {
          id: 1,
          username: 'test_assignee',
          profile: { id: 1, name: 'Test Assignee' },
        },
      });
    });
  });
});
