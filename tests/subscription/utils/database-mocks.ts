import { vi } from 'vitest';

// Mock database structure
export const mockDatabase = {
  subscriptions: [],
  customers: [],
  customerProfiles: [],
  products: [],
  users: [],
  profiles: [],
};

// Mock query builders
const createMockQueryBuilder = (data: any[] = []) => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          offset: vi.fn(() => Promise.resolve(data))
        }))
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          offset: vi.fn(() => Promise.resolve(data))
        }))
      })),
      limit: vi.fn(() => ({
        offset: vi.fn(() => Promise.resolve(data))
      }))
    })),
    orderBy: vi.fn(() => ({
      limit: vi.fn(() => ({
        offset: vi.fn(() => Promise.resolve(data))
      }))
    })),
    limit: vi.fn(() => ({
      offset: vi.fn(() => Promise.resolve(data))
    }))
  }))
});

const createMockInsertBuilder = (table: keyof typeof mockDatabase) => ({
  values: vi.fn((values: any) => {
    const newId = mockDatabase[table].length + 1;
    const newItem = { id: newId, ...values, createdAt: new Date(), updatedAt: new Date() };
    mockDatabase[table].push(newItem);
    return Promise.resolve([{ insertId: newId }]);
  })
});

const createMockUpdateBuilder = (table: keyof typeof mockDatabase) => ({
  set: vi.fn((values: any) => ({
    where: vi.fn((condition: any) => {
      // Simple mock update - find and update record
      const conditionField = Object.keys(condition)[0];
      const conditionValue = condition[conditionField];
      const index = mockDatabase[table].findIndex((item: any) => item[conditionField] === conditionValue);
      
      if (index !== -1) {
        mockDatabase[table][index] = { 
          ...mockDatabase[table][index], 
          ...values, 
          updatedAt: new Date() 
        };
      }
      
      return Promise.resolve([]);
    })
  }))
});

const createMockDeleteBuilder = (table: keyof typeof mockDatabase) => ({
  where: vi.fn((condition: any) => {
    const conditionField = Object.keys(condition)[0];
    const conditionValue = condition[conditionField];
    const index = mockDatabase[table].findIndex((item: any) => item[conditionField] === conditionValue);
    
    if (index !== -1) {
      mockDatabase[table].splice(index, 1);
    }
    
    return Promise.resolve([]);
  })
});

// Setup database mocks
export const setupDatabaseMocks = () => {
  vi.mock('@/db/client', () => ({
    db: {
      select: vi.fn(() => createMockQueryBuilder()),
      insert: vi.fn((table: any) => createMockInsertBuilder(table)),
      update: vi.fn((table: any) => createMockUpdateBuilder(table)),
      delete: vi.fn((table: any) => createMockDeleteBuilder(table)),
    },
  }));
};

// Reset mock database
export const resetMockDatabase = () => {
  Object.keys(mockDatabase).forEach(key => {
    mockDatabase[key as keyof typeof mockDatabase] = [];
  });
};

// Seed mock database with test data
export const seedMockDatabase = (data: Partial<typeof mockDatabase> = {}) => {
  resetMockDatabase();
  
  Object.entries(data).forEach(([table, records]) => {
    if (records) {
      mockDatabase[table as keyof typeof mockDatabase] = [...records];
    }
  });
};

// Mock schema exports
export const mockSchema = {
  subscriptions: {
    id: 'id',
    customerId: 'customerId',
    productId: 'productId',
    advertiserId: 'advertiserId',
    brand: 'brand',
    platform: 'platform',
    startDate: 'startDate',
    dueDate: 'dueDate',
    status: 'status',
    onboardingDate: 'onboardingDate',
    onboardingStatus: 'onboardingStatus',
    target: 'target',
    note: 'note',
    dataJson: 'dataJson',
    onboardingUpdatedAt: 'onboardingUpdatedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  customers: {
    id: 'id',
    email: 'email',
    phone: 'phone',
    address: 'address',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  customerProfiles: {
    id: 'id',
    customerId: 'customerId',
    firstName: 'firstName',
    lastName: 'lastName',
    company: 'company',
    position: 'position',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  products: {
    id: 'id',
    name: 'name',
    description: 'description',
    price: 'price',
    category: 'category',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  users: {
    id: 'id',
    email: 'email',
    password: 'password',
    role: 'role',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  profiles: {
    id: 'id',
    userId: 'userId',
    firstName: 'firstName',
    lastName: 'lastName',
    avatar: 'avatar',
    bio: 'bio',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
};

// Setup schema mocks
export const setupSchemaMocks = () => {
  vi.mock('@/db/schema', () => mockSchema);
};
