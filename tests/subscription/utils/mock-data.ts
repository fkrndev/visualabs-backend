import { faker } from '@faker-js/faker';

// Mock data factories for subscription testing

export const createMockSubscription = (overrides = {}) => ({
  id: faker.number.int({ min: 1, max: 1000 }),
  customerId: faker.number.int({ min: 1, max: 100 }),
  productId: faker.number.int({ min: 1, max: 50 }),
  advertiserId: faker.number.int({ min: 1, max: 20 }),
  brand: faker.company.name(),
  platform: faker.helpers.arrayElement(['Meta', 'Google', 'TikTok', 'LinkedIn']),
  startDate: faker.date.past().toISOString().split('T')[0],
  dueDate: faker.date.future().toISOString().split('T')[0],
  status: faker.helpers.arrayElement([0, 1]),
  onboardingDate: faker.date.past().toISOString().split('T')[0],
  onboardingStatus: faker.helpers.arrayElement([0, 1, 2, 3]),
  target: faker.lorem.sentence(),
  note: faker.lorem.paragraph(),
  dataJson: null,
  onboardingUpdatedAt: faker.date.recent(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createMockSubscriptionList = (count = 10) => 
  Array.from({ length: count }, (_, i) => createMockSubscription({ id: i + 1 }));

export const createMockCustomer = (overrides = {}) => ({
  id: faker.number.int({ min: 1, max: 100 }),
  email: faker.internet.email(),
  phone: faker.phone.number(),
  address: faker.location.streetAddress(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createMockCustomerProfile = (overrides = {}) => ({
  id: faker.number.int({ min: 1, max: 100 }),
  customerId: faker.number.int({ min: 1, max: 100 }),
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  company: faker.company.name(),
  position: faker.person.jobTitle(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createMockProduct = (overrides = {}) => ({
  id: faker.number.int({ min: 1, max: 50 }),
  name: faker.commerce.productName(),
  description: faker.commerce.productDescription(),
  price: faker.commerce.price(),
  category: faker.commerce.department(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createMockUser = (overrides = {}) => ({
  id: faker.number.int({ min: 1, max: 20 }),
  email: faker.internet.email(),
  password: faker.internet.password(),
  role: faker.helpers.arrayElement(['admin', 'user', 'advertiser']),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

export const createMockProfile = (overrides = {}) => ({
  id: faker.number.int({ min: 1, max: 20 }),
  userId: faker.number.int({ min: 1, max: 20 }),
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  avatar: faker.image.avatar(),
  bio: faker.lorem.paragraph(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  ...overrides,
});

// Test data sets for different scenarios
export const validSubscriptionData = {
  customerId: 1,
  productId: 1,
  brand: 'Test Brand',
  platform: 'Meta',
  advertiserId: 1,
  startDate: '2024-01-01',
  dueDate: '2024-12-31',
  status: 1,
  onboardingDate: '2024-01-01',
  onboardingStatus: 0,
  target: 'Test target description',
  note: 'Test note for subscription',
};

export const invalidSubscriptionData = {
  customerId: 'invalid',
  productId: null,
  brand: '',
  platform: '',
  status: 'invalid',
  onboardingStatus: 5, // Invalid: should be 0-3
};

export const minimalSubscriptionData = {
  customerId: 1,
  productId: 1,
};

// Pagination test data
export const createPaginatedSubscriptionData = (page = 1, limit = 20, total = 100) => {
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, total);
  
  return {
    data: Array.from({ length: endIndex - startIndex }, (_, i) => 
      createMockSubscription({ id: startIndex + i + 1 })
    ),
    page: {
      limit,
      lastId: endIndex - startIndex > 0 ? endIndex : null,
      hasNext: endIndex < total,
      sortBy: 'id',
      sortOrder: 'asc' as const,
    },
  };
};
