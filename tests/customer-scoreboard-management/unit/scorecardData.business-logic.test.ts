import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database client
vi.mock('../../../src/db/client', () => ({
  db: {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  },
}));

// Mock schema
vi.mock('../../../src/db/schema', () => ({
  scorecards: {},
  scorecardData: {},
}));

// Import the functions after mocking
let isCurrentPeriod, computeAutoFields, computeTrend, formatRow;

beforeAll(async () => {
  const module = await import('../../../src/routes/scorecardData');
  isCurrentPeriod = module.isCurrentPeriod;
  computeAutoFields = module.computeAutoFields;
  computeTrend = module.computeTrend;
  formatRow = module.formatRow;
});

describe('Scorecard Data Business Logic', () => {
  describe('isCurrentPeriod function', () => {
    beforeEach(() => {
      // Mock current date for consistent testing
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should identify current year correctly', () => {
      const mockDate = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(mockDate);

      expect(isCurrentPeriod(2024)).toBe(true);
      expect(isCurrentPeriod(2023)).toBe(false);
      expect(isCurrentPeriod(2025)).toBe(false);
    });

    it('should identify current month correctly', () => {
      const mockDate = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(mockDate);

      expect(isCurrentPeriod(2024, 6)).toBe(true);
      expect(isCurrentPeriod(2024, 5)).toBe(false);
      expect(isCurrentPeriod(2024, 7)).toBe(false);
    });

    it('should identify current week correctly', () => {
      const mockDate = new Date('2024-06-15T10:00:00Z'); // Saturday, 3rd week of June
      vi.setSystemTime(mockDate);

      // Calculate expected week of month
      const firstDay = new Date(2024, 5, 1); // June 1, 2024
      const expectedWeek = Math.ceil((15 + firstDay.getDay()) / 7);

      expect(isCurrentPeriod(2024, 6, expectedWeek)).toBe(true);
      expect(isCurrentPeriod(2024, 6, expectedWeek - 1)).toBe(false);
      expect(isCurrentPeriod(2024, 6, expectedWeek + 1)).toBe(false);
    });

    it('should handle month boundaries correctly', () => {
      // Test at the beginning of month
      const mockDate1 = new Date('2024-07-01T10:00:00Z');
      vi.setSystemTime(mockDate1);

      expect(isCurrentPeriod(2024, 7)).toBe(true);
      expect(isCurrentPeriod(2024, 6)).toBe(false);

      // Test at the end of month
      const mockDate2 = new Date('2024-07-31T10:00:00Z');
      vi.setSystemTime(mockDate2);

      expect(isCurrentPeriod(2024, 7)).toBe(true);
      expect(isCurrentPeriod(2024, 8)).toBe(false);
    });

    it('should handle year boundaries correctly', () => {
      // Test at the beginning of year
      const mockDate1 = new Date('2024-01-01T10:00:00Z');
      vi.setSystemTime(mockDate1);

      expect(isCurrentPeriod(2024)).toBe(true);
      expect(isCurrentPeriod(2023)).toBe(false);

      // Test at the end of year
      const mockDate2 = new Date('2024-12-31T10:00:00Z');
      vi.setSystemTime(mockDate2);

      expect(isCurrentPeriod(2024)).toBe(true);
      expect(isCurrentPeriod(2025)).toBe(false);
    });

    it('should handle different week scenarios', () => {
      // Test first week of month
      const mockDate1 = new Date('2024-06-03T10:00:00Z'); // Monday, first week
      vi.setSystemTime(mockDate1);

      // Calculate week using the same logic as the function
      const firstDay1 = new Date(2024, 5, 1); // June 1, 2024
      const curWeek1 = Math.ceil((3 + firstDay1.getDay()) / 7); // 3rd day of month
      expect(isCurrentPeriod(2024, 6, curWeek1)).toBe(true);

      // Test middle of month
      const mockDate2 = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(mockDate2);

      const firstDay2 = new Date(2024, 5, 1);
      const expectedWeek2 = Math.ceil((15 + firstDay2.getDay()) / 7);
      expect(isCurrentPeriod(2024, 6, expectedWeek2)).toBe(true);

      // Test end of month
      const mockDate3 = new Date('2024-06-30T10:00:00Z');
      vi.setSystemTime(mockDate3);

      const firstDay3 = new Date(2024, 5, 1);
      const expectedWeek3 = Math.ceil((30 + firstDay3.getDay()) / 7);
      expect(isCurrentPeriod(2024, 6, expectedWeek3)).toBe(true);
    });

    it('should handle null/undefined month and week', () => {
      const mockDate = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(mockDate);

      expect(isCurrentPeriod(2024, null)).toBe(true);
      expect(isCurrentPeriod(2024, undefined)).toBe(true);
      expect(isCurrentPeriod(2024, 6, null)).toBe(true);
      expect(isCurrentPeriod(2024, 6, undefined)).toBe(true);
    });

    it('should handle edge cases for week calculations', () => {
      // Test when month starts on Sunday (day 0)
      const mockDate = new Date('2024-09-01T10:00:00Z'); // September 1, 2024 (Sunday)
      vi.setSystemTime(mockDate);

      const firstDay = new Date(2024, 8, 1);
      const expectedWeek = Math.ceil((1 + firstDay.getDay()) / 7);
      expect(isCurrentPeriod(2024, 9, expectedWeek)).toBe(true);
    });
  });

  describe('computeAutoFields function', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should calculate threshold for minimum target type (targetType 0)', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        targetType: 0, // minimum target type
        greenThreshold: 100,
        yellowThreshold: 80,
        targetValue: '100.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const result = await computeAutoFields(
        1, // scorecardId
        2024, // year
        6, // month
        null, // week
        '105.00', // actualValue
        '100.00' // targetValue
      );

      expect(result.threshold).toBe(0); // Green threshold (105% >= 100%)
      expect(result.status).toBeDefined();
      expect(result.targetValue).toBe('100.00');
    });

    it('should calculate threshold for maximum target type (targetType 1)', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        targetType: 1, // maximum target type
        greenThreshold: 100,
        yellowThreshold: 80,
        targetValue: '100.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const result = await computeAutoFields(
        1,
        2024,
        6,
        null,
        '95.00', // actualValue (lower is better for max target)
        '100.00'
      );

      expect(result.threshold).toBe(0); // Green threshold (100/95*100 = 105% >= 100%)
    });

    it('should handle zero target values', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        targetType: 0,
        greenThreshold: 100,
        yellowThreshold: 80,
        targetValue: '0.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const result = await computeAutoFields(
        1,
        2024,
        6,
        null,
        '50.00',
        '0.00'
      );

      expect(result.threshold).toBe(0); // Default threshold when target is 0
    });

    it('should handle missing scorecard data', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([]); // No scorecard found

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const result = await computeAutoFields(
        999, // Non-existent scorecardId
        2024,
        6,
        null,
        '50.00',
        '100.00'
      );

      expect(result.threshold).toBe(0); // Default threshold
      expect(result.targetValue).toBe('100.00'); // Use provided target
    });

    it('should calculate status based on current period', async () => {
      vi.useFakeTimers();
      const mockDate = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(mockDate);

      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        targetType: 0,
        greenThreshold: 100,
        yellowThreshold: 80,
        targetValue: '100.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      // Test current period
      const result1 = await computeAutoFields(1, 2024, 6, null, '50.00', '100.00');
      expect(result1.status).toBe(1); // Current period status

      // Test non-current period
      const result2 = await computeAutoFields(1, 2023, 6, null, '50.00', '100.00');
      expect(result2.status).toBe(0); // Non-current period status

      vi.useRealTimers();
    });

    it('should use target value fallback from scorecard', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        targetType: 0,
        greenThreshold: 100,
        yellowThreshold: 80,
        targetValue: '90.00' // Scorecard target
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const result = await computeAutoFields(
        1,
        2024,
        6,
        null,
        '85.00',
        null // No target provided, should use scorecard target
      );

      expect(result.targetValue).toBe('90.00'); // Should use scorecard target
    });

    it('should calculate yellow threshold correctly', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        targetType: 0,
        greenThreshold: 100,
        yellowThreshold: 80,
        targetValue: '100.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const result = await computeAutoFields(
        1,
        2024,
        6,
        null,
        '85.00', // 85% performance
        '100.00'
      );

      expect(result.threshold).toBe(1); // Yellow threshold (80% <= 85% < 100%)
    });

    it('should calculate red threshold correctly', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        targetType: 0,
        greenThreshold: 100,
        yellowThreshold: 80,
        targetValue: '100.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const result = await computeAutoFields(
        1,
        2024,
        6,
        null,
        '75.00', // 75% performance
        '100.00'
      );

      expect(result.threshold).toBe(2); // Red threshold (75% < 80%)
    });
  });

  describe('computeTrend function', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should calculate trend with weekly data', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockOrderBy = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        id: 1,
        actualValue: '80.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });
      mockOrderBy.mockReturnValue({ limit: mockLimit });

      const trend = await computeTrend(
        1, // scorecardId
        2024, // year
        6, // month
        3, // week
        '90.00' // actualValue (current > previous)
      );

      expect(trend).toBe(3); // naik (increase)
    });

    it('should calculate trend with monthly data', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockOrderBy = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        id: 1,
        actualValue: '85.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });
      mockOrderBy.mockReturnValue({ limit: mockLimit });

      const trend = await computeTrend(
        1,
        2024,
        6, // month
        null, // no week
        '85.00' // actualValue (same as previous)
      );

      expect(trend).toBe(2); // stabil (stable)
    });

    it('should calculate trend with yearly data', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockOrderBy = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        id: 1,
        actualValue: '95.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });
      mockOrderBy.mockReturnValue({ limit: mockLimit });

      const trend = await computeTrend(
        1,
        2024, // year
        null, // no month
        null, // no week
        '90.00' // actualValue (lower than previous)
      );

      expect(trend).toBe(1); // turun (decrease)
    });

    it('should return 0 when no previous data exists', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockOrderBy = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([]); // No previous data

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });
      mockOrderBy.mockReturnValue({ limit: mockLimit });

      const trend = await computeTrend(
        1,
        2024,
        6,
        3,
        '90.00'
      );

      expect(trend).toBe(0); // No trend data
    });

    it('should return 0 when previous actual value is null', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockOrderBy = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        id: 1,
        actualValue: null
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });
      mockOrderBy.mockReturnValue({ limit: mockLimit });

      const trend = await computeTrend(
        1,
        2024,
        6,
        3,
        '90.00'
      );

      expect(trend).toBe(0); // No trend data
    });

    it('should test all trend values correctly', async () => {
      const { db } = await import('../../../src/db/client');
      
      // Test naik (increase)
      const mockSelect1 = vi.fn().mockReturnThis();
      const mockFrom1 = vi.fn().mockReturnThis();
      const mockWhere1 = vi.fn().mockReturnThis();
      const mockOrderBy1 = vi.fn().mockReturnThis();
      const mockLimit1 = vi.fn().mockResolvedValue([{ actualValue: '80.00' }]);
      
      db.select = mockSelect1;
      mockSelect1.mockReturnValue({ from: mockFrom1 });
      mockFrom1.mockReturnValue({ where: mockWhere1 });
      mockWhere1.mockReturnValue({ orderBy: mockOrderBy1 });
      mockOrderBy1.mockReturnValue({ limit: mockLimit1 });

      const trendNaik = await computeTrend(1, 2024, 6, 3, '90.00');
      expect(trendNaik).toBe(3); // naik

      // Test stabil (stable)
      mockLimit1.mockResolvedValue([{ actualValue: '85.00' }]);
      const trendStabil = await computeTrend(1, 2024, 6, 3, '85.00');
      expect(trendStabil).toBe(2); // stabil

      // Test turun (decrease)
      mockLimit1.mockResolvedValue([{ actualValue: '90.00' }]);
      const trendTurun = await computeTrend(1, 2024, 6, 3, '80.00');
      expect(trendTurun).toBe(1); // turun
    });

    it('should handle null actual values in current record', async () => {
      const { db } = await import('../../../src/db/client');
      const mockSelect = vi.fn().mockReturnThis();
      const mockFrom = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockReturnThis();
      const mockOrderBy = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue([{
        id: 1,
        actualValue: '80.00'
      }]);

      db.select = mockSelect;
      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });
      mockOrderBy.mockReturnValue({ limit: mockLimit });

      const trend = await computeTrend(
        1,
        2024,
        6,
        3,
        null // null actual value
      );

      expect(trend).toBe(1); // turun (0 < 80)
    });
  });

  describe('formatRow function', () => {
    it('should format scorecard relation correctly', () => {
      const mockRow = {
        scorecardDataItem: {
          id: 1,
          scorecardId: 1,
          year: 2024,
          month: 6,
          week: 3,
          actualValue: '85.00',
          targetValue: '100.00',
          status: 1,
          threshold: 1,
          trend: 3,
        },
        scorecard: {
          id: 1,
          title: 'Test KPI',
          customerId: 1,
          subscriptionId: 1,
          assignedTo: 1,
          pic: 1,
          category: 2,
          frequency: 1,
          targetType: 0,
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
        assignee: {
          id: 1,
          username: 'user1',
          email: 'user1@example.com',
        },
        assigneeProfile: {
          id: 1,
          name: 'John Doe',
        },
      };

      const result = formatRow(mockRow);

      expect(result).toMatchObject({
        id: 1,
        scorecardId: 1,
        year: 2024,
        month: 6,
        week: 3,
        actualValue: '85.00',
        targetValue: '100.00',
        status: 1,
        threshold: 1,
        trend: 3,
      });

      expect(result.scorecard).toEqual({
        id: 1,
        title: 'Test KPI',
        customerId: 1,
        subscriptionId: 1,
        assignedTo: 1,
        pic: 1,
        category: 2,
        frequency: 1,
        targetType: 0,
        customer: { id: 1, username: 'customer1' },
        customerProfile: { id: 1, name: 'PT Customer' },
        subscription: { id: 1, brand: 'Brand A' },
        assignee: { id: 1, username: 'user1', email: 'user1@example.com' },
        assigneeProfile: { id: 1, name: 'John Doe' },
      });
    });

    it('should handle nested relation formatting properly', () => {
      const mockRow = {
        scorecardDataItem: {
          id: 2,
          scorecardId: 2,
          year: 2024,
          month: 5,
          actualValue: '90.00',
        },
        scorecard: {
          id: 2,
          title: 'Nested Test KPI',
          customerId: 2,
          subscriptionId: 2,
          assignedTo: 2,
          pic: 0,
          category: 1,
          frequency: 2,
          targetType: 1,
        },
        customer: {
          id: 2,
          username: 'customer2',
        },
        customerProfile: {
          id: 2,
          name: 'PT Customer 2',
        },
        subscription: {
          id: 2,
          brand: 'Brand B',
        },
        assignee: {
          id: 2,
          username: 'user2',
          email: 'user2@example.com',
        },
        assigneeProfile: {
          id: 2,
          name: 'Jane Smith',
        },
      };

      const result = formatRow(mockRow);

      expect(result.scorecard.customer).toEqual({ id: 2, username: 'customer2' });
      expect(result.scorecard.customerProfile).toEqual({ id: 2, name: 'PT Customer 2' });
      expect(result.scorecard.subscription).toEqual({ id: 2, brand: 'Brand B' });
      expect(result.scorecard.assignee).toEqual({ 
        id: 2, 
        username: 'user2', 
        email: 'user2@example.com' 
      });
      expect(result.scorecard.assigneeProfile).toEqual({ id: 2, name: 'Jane Smith' });
    });

    it('should handle missing scorecard data gracefully', () => {
      const mockRow = {
        scorecardDataItem: {
          id: 3,
          scorecardId: 999, // Non-existent scorecard
          year: 2024,
          month: 6,
        },
        scorecard: null,
        customer: null,
        customerProfile: null,
        subscription: null,
        assignee: null,
        assigneeProfile: null,
      };

      const result = formatRow(mockRow);

      expect(result.id).toBe(3);
      expect(result.scorecardId).toBe(999);
      expect(result.scorecard).toBeNull();
    });

    it('should handle partial relation data', () => {
      const mockRow = {
        scorecardDataItem: {
          id: 4,
          scorecardId: 4,
          year: 2024,
          month: 6,
        },
        scorecard: {
          id: 4,
          title: 'Partial Relations KPI',
          customerId: 4,
          subscriptionId: null,
          assignedTo: 4,
          pic: 1,
          category: 2,
          frequency: 1,
          targetType: 0,
        },
        customer: {
          id: 4,
          username: 'customer4',
        },
        customerProfile: null, // Missing profile
        subscription: null, // Missing subscription
        assignee: {
          id: 4,
          username: 'user4',
          email: 'user4@example.com',
        },
        assigneeProfile: null, // Missing profile
      };

      const result = formatRow(mockRow);

      expect(result.scorecard.customer).toEqual({ id: 4, username: 'customer4' });
      expect(result.scorecard.customerProfile).toBeNull();
      expect(result.scorecard.subscription).toBeNull();
      expect(result.scorecard.assignee).toEqual({ 
        id: 4, 
        username: 'user4', 
        email: 'user4@example.com' 
      });
      expect(result.scorecard.assigneeProfile).toBeNull();
    });

    it('should preserve all scorecardDataItem fields', () => {
      const mockRow = {
        scorecardDataItem: {
          id: 5,
          scorecardId: 5,
          year: 2024,
          month: 6,
          week: 2,
          day: 15,
          actualValue: '95.50',
          targetValue: '100.00',
          status: 1,
          threshold: 0,
          trend: 3,
          enteredBy: 1,
          createdAt: new Date('2024-06-15T10:00:00Z'),
          updatedAt: new Date('2024-06-15T10:00:00Z'),
        },
        scorecard: null,
        customer: null,
        customerProfile: null,
        subscription: null,
        assignee: null,
        assigneeProfile: null,
      };

      const result = formatRow(mockRow);

      // All fields from scorecardDataItem should be preserved
      expect(result).toMatchObject({
        id: 5,
        scorecardId: 5,
        year: 2024,
        month: 6,
        week: 2,
        day: 15,
        actualValue: '95.50',
        targetValue: '100.00',
        status: 1,
        threshold: 0,
        trend: 3,
        enteredBy: 1,
      });
    });
  });
});
