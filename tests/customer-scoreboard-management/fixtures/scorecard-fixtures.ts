import { faker } from '@faker-js/faker';

// Base types for test data
export interface TestScorecard {
  id?: number;
  title: string;
  customerId?: number | null;
  subscriptionId?: number | null;
  assignedTo?: number | null;
  description?: string | null;
  pic?: number;
  category?: number;
  targetValue?: string | null;
  targetType?: number;
  unitValue?: number;
  unitCustom?: string | null;
  frequency?: number;
  showOnScorecard?: number;
  greenThreshold?: number;
  yellowThreshold?: number;
  status?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestCustomer {
  id?: number;
  username: string;
  email?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestCustomerProfile {
  id?: number;
  customerId?: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestSubscription {
  id?: number;
  customerId?: number;
  brand: string;
  plan?: string | null;
  status?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestUser {
  id?: number;
  username: string;
  email: string;
  role?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestProfile {
  id?: number;
  userId?: number;
  name: string;
  avatar?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestScorecardData {
  id?: number;
  scorecardId: number;
  year: number;
  month?: number | null;
  week?: number | null;
  day?: number | null;
  actualValue?: string | null;
  targetValue?: string | null;
  status?: number;
  threshold?: number;
  trend?: number;
  enteredBy?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Test fixture creators
export const createTestScorecard = (overrides: Partial<TestScorecard> = {}): TestScorecard => ({
  id: faker.datatype.number({ min: 1 }),
  title: faker.lorem.words(3),
  customerId: faker.datatype.number({ min: 1 }),
  subscriptionId: faker.datatype.number({ min: 1 }),
  assignedTo: faker.datatype.number({ min: 1 }),
  description: faker.lorem.sentence(),
  pic: faker.datatype.number({ min: 0, max: 1 }),
  category: faker.datatype.number({ min: 0, max: 5 }),
  targetValue: faker.datatype.float({ min: 0, max: 100, precision: 0.01 }).toFixed(2),
  targetType: faker.datatype.number({ min: 0, max: 1 }),
  unitValue: faker.datatype.number({ min: 0, max: 10 }),
  unitCustom: faker.lorem.word(),
  frequency: faker.datatype.number({ min: 1, max: 4 }),
  showOnScorecard: faker.datatype.number({ min: 0, max: 1 }),
  greenThreshold: faker.datatype.number({ min: 80, max: 100 }),
  yellowThreshold: faker.datatype.number({ min: 60, max: 90 }),
  status: faker.datatype.number({ min: 0, max: 1 }),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createTestCustomer = (overrides: Partial<TestCustomer> = {}): TestCustomer => ({
  id: faker.datatype.number({ min: 1 }),
  username: faker.internet.userName(),
  email: faker.internet.email(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createTestCustomerProfile = (overrides: Partial<TestCustomerProfile> = {}): TestCustomerProfile => ({
  id: faker.datatype.number({ min: 1 }),
  customerId: faker.datatype.number({ min: 1 }),
  name: faker.company.name(),
  address: faker.address.streetAddress(),
  phone: faker.phone.number(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createTestSubscription = (overrides: Partial<TestSubscription> = {}): TestSubscription => ({
  id: faker.datatype.number({ min: 1 }),
  customerId: faker.datatype.number({ min: 1 }),
  brand: faker.company.name(),
  plan: faker.lorem.words(2),
  status: faker.datatype.number({ min: 0, max: 1 }),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => ({
  id: faker.datatype.number({ min: 1 }),
  username: faker.internet.userName(),
  email: faker.internet.email(),
  role: faker.helpers.arrayElement(['admin', 'user', 'manager']),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createTestProfile = (overrides: Partial<TestProfile> = {}): TestProfile => ({
  id: faker.datatype.number({ min: 1 }),
  userId: faker.datatype.number({ min: 1 }),
  name: faker.name.fullName(),
  avatar: faker.internet.avatar(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createTestScorecardData = (overrides: Partial<TestScorecardData> = {}): TestScorecardData => ({
  id: faker.datatype.number({ min: 1 }),
  scorecardId: faker.datatype.number({ min: 1 }),
  year: faker.datatype.number({ min: 2020, max: 2024 }),
  month: faker.datatype.number({ min: 1, max: 12 }),
  week: faker.datatype.number({ min: 1, max: 5 }),
  day: faker.datatype.number({ min: 1, max: 31 }),
  actualValue: faker.datatype.float({ min: 0, max: 150, precision: 0.01 }).toFixed(2),
  targetValue: faker.datatype.float({ min: 50, max: 100, precision: 0.01 }).toFixed(2),
  status: faker.datatype.number({ min: 0, max: 1 }),
  threshold: faker.datatype.number({ min: 0, max: 2 }),
  trend: faker.datatype.number({ min: 0, max: 3 }),
  enteredBy: faker.datatype.number({ min: 1 }),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

// Factory classes for more complex scenarios
export class ScorecardFactory {
  static createMinimal(overrides: Partial<TestScorecard> = {}): TestScorecard {
    return createTestScorecard({
      title: 'Minimal Test KPI',
      ...overrides,
    });
  }

  static createComplete(overrides: Partial<TestScorecard> = {}): TestScorecard {
    return createTestScorecard({
      title: 'Complete Test KPI',
      description: 'This is a complete test scorecard with all fields',
      customerId: 1,
      subscriptionId: 1,
      assignedTo: 1,
      pic: 1,
      category: 2,
      targetValue: '85.00',
      targetType: 0,
      unitValue: 1,
      unitCustom: 'percentage',
      frequency: 1,
      showOnScorecard: 1,
      greenThreshold: 100,
      yellowThreshold: 80,
      status: 1,
      ...overrides,
    });
  }

  static createWithPerformance(performance: 'good' | 'average' | 'poor', overrides: Partial<TestScorecard> = {}): TestScorecard {
    const performanceConfig = {
      good: { targetValue: '80.00', greenThreshold: 90, yellowThreshold: 70 },
      average: { targetValue: '60.00', greenThreshold: 80, yellowThreshold: 60 },
      poor: { targetValue: '40.00', greenThreshold: 70, yellowThreshold: 50 },
    };

    return createTestScorecard({
      title: `${performance} Performance KPI`,
      ...performanceConfig[performance],
      ...overrides,
    });
  }

  static createBatch(count: number, baseOverrides: Partial<TestScorecard> = {}): TestScorecard[] {
    return Array.from({ length: count }, (_, index) =>
      createTestScorecard({
        ...baseOverrides,
        id: baseOverrides.id ? baseOverrides.id + index : index + 1,
        title: `${baseOverrides.title || 'Test KPI'} ${index + 1}`,
      })
    );
  }
}

export class ScorecardDataFactory {
  static createForCurrentPeriod(overrides: Partial<TestScorecardData> = {}): TestScorecardData {
    const now = new Date();
    return createTestScorecardData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      week: Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7),
      status: 1, // Current period
      ...overrides,
    });
  }

  static createForPreviousPeriod(overrides: Partial<TestScorecardData> = {}): TestScorecardData {
    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    
    return createTestScorecardData({
      year: prevYear,
      month: prevMonth,
      status: 0, // Not current period
      ...overrides,
    });
  }

  static createWithTrend(trend: 'naik' | 'stabil' | 'turun', overrides: Partial<TestScorecardData> = {}): TestScorecardData {
    const trendMap = { naik: 3, stabil: 2, turun: 1 };
    return createTestScorecardData({
      trend: trendMap[trend],
      ...overrides,
    });
  }

  static createWithThreshold(threshold: 0 | 1 | 2, overrides: Partial<TestScorecardData> = {}): TestScorecardData {
    return createTestScorecardData({
      threshold,
      ...overrides,
    });
  }

  static createBatch(count: number, baseOverrides: Partial<TestScorecardData> = {}): TestScorecardData[] {
    return Array.from({ length: count }, (_, index) =>
      createTestScorecardData({
        ...baseOverrides,
        id: baseOverrides.id ? baseOverrides.id + index : index + 1,
      })
    );
  }
}

// Complete data set creators
export const createCompleteScorecardSet = (scorecardId: number = 1) => {
  const scorecard = ScorecardFactory.createComplete({ id: scorecardId });
  const customer = createTestCustomer({ id: scorecard.customerId });
  const customerProfile = createTestCustomerProfile({ customerId: customer.id });
  const subscription = createTestSubscription({ 
    id: scorecard.subscriptionId, 
    customerId: customer.id 
  });
  const assignee = createTestUser({ id: scorecard.assignedTo });
  const assigneeProfile = createTestProfile({ userId: assignee.id });

  return {
    scorecard,
    customer,
    customerProfile,
    subscription,
    assignee,
    assigneeProfile,
  };
};

export const createCompleteScorecardDataRow = (overrides: Partial<TestScorecardData> = {}) => {
  const scorecardData = createTestScorecardData(overrides);
  const scorecardSet = createCompleteScorecardSet(scorecardData.scorecardId);

  return {
    scorecardDataItem: scorecardData,
    scorecard: {
      id: scorecardSet.scorecard.id,
      title: scorecardSet.scorecard.title,
      customerId: scorecardSet.scorecard.customerId,
      subscriptionId: scorecardSet.scorecard.subscriptionId,
      assignedTo: scorecardSet.scorecard.assignedTo,
      pic: scorecardSet.scorecard.pic,
      category: scorecardSet.scorecard.category,
      frequency: scorecardSet.scorecard.frequency,
      targetType: scorecardSet.scorecard.targetType,
    },
    customer: {
      id: scorecardSet.customer.id,
      username: scorecardSet.customer.username,
    },
    customerProfile: {
      id: scorecardSet.customerProfile.id,
      name: scorecardSet.customerProfile.name,
    },
    subscription: {
      id: scorecardSet.subscription.id,
      brand: scorecardSet.subscription.brand,
    },
    assignee: {
      id: scorecardSet.assignee.id,
      username: scorecardSet.assignee.username,
      email: scorecardSet.assignee.email,
    },
    assigneeProfile: {
      id: scorecardSet.assigneeProfile.id,
      name: scorecardSet.assigneeProfile.name,
    },
  };
};

// Query parameter fixtures
export const createPaginationQuery = (overrides: any = {}) => ({
  page: 1,
  limit: 20,
  q: undefined,
  customerId: undefined,
  subscriptionId: undefined,
  assignedTo: undefined,
  status: undefined,
  category: undefined,
  pic: undefined,
  sortBy: undefined,
  sortOrder: undefined,
  ...overrides,
});

export const createScorecardPayload = (overrides: Partial<TestScorecard> = {}) => {
  const scorecard = createTestScorecard(overrides);
  const { id, createdAt, updatedAt, ...payload } = scorecard;
  return payload;
};

export const createScorecardDataPayload = (overrides: Partial<TestScorecardData> = {}) => {
  const scorecardData = createTestScorecardData(overrides);
  const { id, createdAt, updatedAt, ...payload } = scorecardData;
  return payload;
};

// Performance test data generators
export const generateLargeDataset = (count: number): TestScorecard[] => {
  return ScorecardFactory.createBatch(count);
};

export const generatePerformanceTestData = () => {
  const good = ScorecardFactory.createWithPerformance('good');
  const average = ScorecardFactory.createWithPerformance('average');
  const poor = ScorecardFactory.createWithPerformance('poor');

  return { good, average, poor };
};

// Error scenario fixtures
export const createInvalidScorecardData = () => ({
  title: '', // Invalid: empty title
  customerId: 'invalid', // Invalid: not a number
  targetValue: 'not-a-number', // Invalid: not a valid number
});

export const createMaliciousInput = () => ({
  title: '<script>alert("xss")</script>',
  description: '"; DROP TABLE scorecards; --',
  q: '../../../etc/passwd',
});
