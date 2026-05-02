import { vi } from 'vitest';
import type { Hono } from 'hono';

// Test helper utilities

export const setupTestApp = (app: Hono) => {
  // Setup any global test configuration for the app
  return app;
};

export const createTestRequest = (app: Hono, path: string, options: RequestInit = {}) => {
  return app.request(path, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
};

export const expectSuccessResponse = async (response: Response, expectedStatus = 200) => {
  const data = await response.json();
  expect(response.status).toBe(expectedStatus);
  expect(data.success).toBe(true);
  expect(data).toHaveProperty('data');
  return data;
};

export const expectErrorResponse = async (response: Response, expectedStatus = 400) => {
  const data = await response.json();
  expect(response.status).toBe(expectedStatus);
  expect(data.success).toBe(false);
  expect(data).toHaveProperty('message');
  return data;
};

export const expectPaginationResponse = async (response: Response) => {
  const data = await expectSuccessResponse(response);
  expect(data).toHaveProperty('page');
  expect(data.page).toHaveProperty('limit');
  expect(data.page).toHaveProperty('hasNext');
  expect(data.page).toHaveProperty('sortBy');
  expect(data.page).toHaveProperty('sortOrder');
  return data;
};

// Test isolation helpers
export const setupTestIsolation = () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });
};

// Performance testing helpers
export const measureResponseTime = async (fn: () => Promise<Response>) => {
  const startTime = performance.now();
  const response = await fn();
  const endTime = performance.now();
  return {
    response,
    responseTime: endTime - startTime,
  };
};

export const expectPerformanceThreshold = async (
  fn: () => Promise<Response>,
  maxResponseTime: number
) => {
  const { response, responseTime } = await measureResponseTime(fn);
  expect(responseTime).toBeLessThan(maxResponseTime);
  return response;
};

// Data validation helpers
export const expectSubscriptionShape = (subscription: any) => {
  expect(subscription).toHaveProperty('id');
  expect(subscription).toHaveProperty('customerId');
  expect(subscription).toHaveProperty('productId');
  expect(subscription).toHaveProperty('status');
  expect(subscription).toHaveProperty('createdAt');
  expect(subscription).toHaveProperty('updatedAt');
  
  // Optional fields
  expect(subscription).toHaveProperty('brand');
  expect(subscription).toHaveProperty('platform');
  expect(subscription).toHaveProperty('advertiserId');
  expect(subscription).toHaveProperty('startDate');
  expect(subscription).toHaveProperty('dueDate');
  expect(subscription).toHaveProperty('onboardingDate');
  expect(subscription).toHaveProperty('onboardingStatus');
  expect(subscription).toHaveProperty('target');
  expect(subscription).toHaveProperty('note');
  
  // Related data
  expect(subscription).toHaveProperty('customer');
  expect(subscription).toHaveProperty('product');
  expect(subscription).toHaveProperty('advertiser');
};

export const expectCustomerShape = (customer: any) => {
  expect(customer).toHaveProperty('id');
  expect(customer).toHaveProperty('email');
  expect(customer).toHaveProperty('createdAt');
  expect(customer).toHaveProperty('updatedAt');
};

export const expectProductShape = (product: any) => {
  expect(product).toHaveProperty('id');
  expect(product).toHaveProperty('name');
  expect(product).toHaveProperty('createdAt');
  expect(product).toHaveProperty('updatedAt');
};

export const expectUserShape = (user: any) => {
  expect(user).toHaveProperty('id');
  expect(user).toHaveProperty('email');
  expect(user).toHaveProperty('createdAt');
  expect(user).toHaveProperty('updatedAt');
};

// Error scenario helpers
export const createErrorScenarios = () => [
  {
    name: 'Invalid ID',
    path: '/invalid',
    expectedStatus: 400,
    expectedMessage: 'ID tidak valid',
  },
  {
    name: 'Non-existent ID',
    path: '/999999',
    expectedStatus: 404,
    expectedMessage: 'Subscription tidak ditemukan',
  },
  {
    name: 'Missing required fields',
    payload: {},
    expectedStatus: 400,
  },
  {
    name: 'Invalid data types',
    payload: {
      customerId: 'invalid',
      productId: null,
      status: 'invalid',
    },
    expectedStatus: 400,
  },
];

// Filter and sort test helpers
export const createFilterTestCases = () => [
  { filter: 'customerId=1', description: 'Filter by customer ID' },
  { filter: 'productId=2', description: 'Filter by product ID' },
  { filter: 'advertiserId=3', description: 'Filter by advertiser ID' },
  { filter: 'status=1', description: 'Filter by status' },
  { filter: 'customerId=1&productId=2', description: 'Multiple filters' },
];

export const createSortTestCases = () => [
  { sort: 'sortBy=id&sortOrder=asc', description: 'Sort by ID ascending' },
  { sort: 'sortBy=id&sortOrder=desc', description: 'Sort by ID descending' },
  { sort: 'sortBy=startDate&sortOrder=asc', description: 'Sort by start date' },
  { sort: 'sortBy=dueDate&sortOrder=desc', description: 'Sort by due date descending' },
  { sort: 'sortBy=status&sortOrder=asc', description: 'Sort by status' },
];

export const createPaginationTestCases = () => [
  { pagination: 'page=1&limit=10', description: 'First page, 10 items' },
  { pagination: 'page=2&limit=5', description: 'Second page, 5 items' },
  { pagination: 'page=1&limit=50', description: 'First page, 50 items' },
  { pagination: 'page=1&limit=1', description: 'First page, 1 item' },
];

// Mock response helpers
export const createMockResponse = (data: any, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

// Date validation helpers
export const expectValidDate = (dateString: string) => {
  const date = new Date(dateString);
  expect(date.toString()).not.toBe('Invalid Date');
  expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
};

export const expectDateInRange = (dateString: string, startDate: string, endDate: string) => {
  const date = new Date(dateString);
  const start = new Date(startDate);
  const end = new Date(endDate);
  expect(date.getTime()).toBeGreaterThanOrEqual(start.getTime());
  expect(date.getTime()).toBeLessThanOrEqual(end.getTime());
};

// Status validation helpers
export const expectValidStatus = (status: number) => {
  expect([0, 1]).toContain(status);
};

export const expectValidOnboardingStatus = (status: number) => {
  expect([0, 1, 2, 3]).toContain(status);
};

// Business logic validation helpers
export const expectOnboardingUpdatedAtChanged = (
  beforeUpdate: Date,
  afterUpdate: Date
) => {
  expect(afterUpdate.getTime()).toBeGreaterThan(beforeUpdate.getTime());
};

// Test data cleanup helpers
export const cleanupTestData = async () => {
  // This would be implemented based on actual database cleanup needs
  vi.clearAllMocks();
};

// Console logging for debugging (only in test environment)
export const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'test' && process.env.DEBUG_TESTS) {
    console.log(`[TEST DEBUG] ${message}`, data);
  }
};
