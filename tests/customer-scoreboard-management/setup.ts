import { vi } from 'vitest';

// Global test setup for customer-scorecard-management tests

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  // Uncomment to ignore specific console methods during tests
  // log: vi.fn(),
  // debug: vi.fn(),
  // info: vi.fn(),
  // warn: vi.fn(),
  // error: vi.fn(),
};

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/vims_test';

// Global test utilities
declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      toBeValidScorecard(): T;
      toBeValidScorecardData(): T;
      toBeValidPaginationQuery(): T;
    }
  }
}

// Custom matchers
expect.extend({
  toBeValidScorecard(received: any) {
    const pass = received && 
      typeof received.title === 'string' && 
      received.title.length > 0 &&
      (received.customerId === null || typeof received.customerId === 'number') &&
      (received.subscriptionId === null || typeof received.subscriptionId === 'number') &&
      (received.assignedTo === null || typeof received.assignedTo === 'number');

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid scorecard`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid scorecard`,
        pass: false,
      };
    }
  },

  toBeValidScorecardData(received: any) {
    const pass = received && 
      typeof received.scorecardId === 'number' && 
      typeof received.year === 'number' &&
      (received.month === null || typeof received.month === 'number') &&
      (received.week === null || typeof received.week === 'number') &&
      typeof received.status === 'number' &&
      typeof received.threshold === 'number';

    if (pass) {
      return {
        message: () => `expected ${received} not to be valid scorecard data`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be valid scorecard data`,
        pass: false,
      };
    }
  },

  toBeValidPaginationQuery(received: any) {
    const pass = received && 
      typeof received.page === 'number' && 
      received.page >= 1 &&
      typeof received.limit === 'number' && 
      received.limit >= 1 && 
      received.limit <= 100;

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid pagination query`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid pagination query`,
        pass: false,
      };
    }
  },
});

// Test timeout configuration
vi.setConfig({
  testTimeout: 10000, // 10 seconds
});

// Mock Date.now for consistent testing
const mockDate = new Date('2024-06-15T10:00:00Z');
vi.useFakeTimers().setSystemTime(mockDate);

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});
