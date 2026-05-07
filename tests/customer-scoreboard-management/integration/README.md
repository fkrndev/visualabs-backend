# Customer Scorecard Management Integration Tests

This directory contains comprehensive integration tests for the Customer Scorecard Management module, covering API endpoints, authentication, database operations, and performance scenarios.

## Directory Structure

```
tests/customer-scoreboard-management/integration/
├── README.md                           # This file
├── helpers/
│   └── database.ts                     # Database setup, cleanup, and test utilities
├── api/
│   ├── scorecards.test.ts               # Scorecards API integration tests
│   └── scorecard-data.test.ts          # Scorecard Data API integration tests
├── auth/
│   └── authentication.test.ts          # Authentication & authorization tests
├── database/
│   └── transactions.test.ts            # Database transaction and connection tests
├── data-integrity/
│   ├── referential-integrity.test.ts   # Data integrity and referential integrity tests
│   └── backup-restore.test.ts         # Backup and restore integrity tests
└── performance/
    └── load-tests.test.ts               # Performance and load testing
```

## Test Categories

### API Integration Tests

#### Scorecards API (`api/scorecards.test.ts`)
- **GET /api/scorecards**: Pagination, filtering, searching, sorting
- **GET /api/scorecards/:id**: Individual scorecard retrieval
- **POST /api/scorecards**: Scorecard creation with validation
- **PUT /api/scorecards/:id**: Scorecard updates
- **DELETE /api/scorecards/:id**: Scorecard deletion

#### Scorecard Data API (`api/scorecard-data.test.ts`)
- **GET /api/scorecard-data/dashboard**: Current period dashboard data
- **GET /api/scorecard-data/history/:scorecardId**: Historical data retrieval
- **GET /api/scorecard-data**: List with pagination and filtering
- **POST /api/scorecard-data**: Data creation with auto-calculations
- **PUT /api/scorecard-data/:id**: Data updates with field recalculation

### Authentication & Authorization Tests (`auth/authentication.test.ts`)

#### JWT Authentication
- Valid token authentication
- Invalid token rejection
- Expired token handling
- Missing token handling
- Token refresh mechanism
- Token revocation

#### User Authorization
- User data ownership validation
- Admin user permissions
- Cross-user data access prevention
- Role-based access control
- Resource ownership validation

### Database Integration Tests (`database/transactions.test.ts`)
- Transaction handling (success, rollback, concurrency)
- Connection resilience and timeout handling
- Data consistency and referential integrity

### Data Integrity Tests (`data-integrity/`)
#### Referential Integrity (`referential-integrity.test.ts`)
- Foreign key constraints enforcement
- Cascade delete behavior testing
- Orphaned data prevention
- Circular reference prevention
- Concurrent data modification
- Data synchronization
- Data integrity during rollback scenarios

#### Backup and Restore (`backup-restore.test.ts`)
- Data backup integrity simulation
- Large dataset backup handling
- Concurrent backup scenarios
- Data restore with relationships
- Partial restore scenarios
- Data accuracy after restore
- Data migration accuracy testing

### Performance & Load Tests (`performance/load-tests.test.ts`)

#### API Performance
- Concurrent request handling
- Response time under load
- Database query optimization
- Memory usage during peak load

#### Bulk Operations
- Bulk scorecard creation
- Bulk data entry
- Bulk update operations
- Bulk deletion performance

#### Stress Testing
- High request volume handling
- Sustained load performance
- Complex query performance

## Running Tests

### All Integration Tests
```bash
npm run test:scorecards:integration
```

### Specific Test Categories
```bash
# API integration tests
npm run test:scorecards:api

# Authentication tests
npm run test:scorecards:auth

# Database integration tests
npm run test:scorecards:database

# Performance and load tests
npm run test:scorecards:load
```

### Individual Test Files
```bash
# Scorecards API tests
npm run test:scorecards:api tests/customer-scoreboard-management/integration/api/scorecards.test.ts

# Scorecard data API tests
npm run test:scorecards:api tests/customer-scoreboard-management/integration/api/scorecard-data.test.ts

# Authentication tests
npm run test:scorecards:auth tests/customer-scoreboard-management/integration/auth/authentication.test.ts

# Database transaction tests
npm run test:scorecards:database tests/customer-scoreboard-management/integration/database/transactions.test.ts

# Data integrity tests
npm run test:scorecards:data-integrity

# Performance tests
npm run test:scorecards:load tests/customer-scoreboard-management/integration/performance/load-tests.test.ts
```

### Watch Mode
```bash
# Run integration tests in watch mode
npm run test:scorecards:integration -- --watch
```

### Coverage Report
```bash
# Generate coverage for integration tests
npm run test:scorecards:coverage
```

## Test Environment Setup

### Database Configuration
Integration tests use a dedicated test database to avoid conflicts with development data:

```bash
# Set up test database
mysql -u root -p -e "CREATE DATABASE vims_test;"

# Configure environment
cp .env.example .env.test
```

### Environment Variables
Required environment variables for integration tests:

```bash
DATABASE_URL="mysql://test:test@localhost:3306/vims_test"
NODE_ENV="test"
JWT_SECRET="test-jwt-secret"
```

## Test Data Management

### Database Helpers (`helpers/database.ts`)

#### Setup and Cleanup
- `setupTestDb()`: Initialize test database with basic data
- `cleanupTestDb()`: Clean up all test data

#### Data Creation
- `createTestScorecard()`: Create test scorecard with optional overrides
- `createTestScorecardData()`: Create test scorecard data
- `createTestCustomer()`: Create test customer with profile
- `createTestUser()`: Create test user with profile
- `createTestSubscription()`: Create test subscription

#### Batch Operations
- `createBatchScorecards()`: Create multiple scorecards for performance testing
- `createBatchScorecardData()`: Create multiple scorecard data records
- `createCompleteScorecardScenario()`: Create complete related data scenario
- `createPerformanceTestData()`: Create performance-based test data

### Using Test Fixtures
```typescript
import { createTestScorecard, createTestCustomer } from '../helpers/database';

// Create basic test data
const scorecard = await createTestScorecard({ title: 'Test KPI' });
const customer = await createTestCustomer({ username: 'test_customer' });

// Create related data
const relatedScorecard = await createTestScorecard({
  title: 'Related KPI',
  customerId: customer.id,
  assignedTo: userId
});
```

## Test Scenarios

### Happy Path Testing
All tests include successful scenario testing with valid inputs and expected outcomes.

### Edge Case Coverage
- Empty result sets
- Maximum limits
- Invalid inputs
- Boundary conditions

### Error Scenario Testing
- Validation errors
- Database errors
- Authentication failures
- Authorization failures
- Network errors

### Performance Testing
- Concurrent operations
- Large datasets
- Complex queries
- Memory usage

## Best Practices

### Test Organization
- **Descriptive Names**: Clear, descriptive test names explaining the scenario
- **AAA Pattern**: Arrange-Act-Assert structure
- **Test Isolation**: Each test is independent with proper setup/teardown
- **Realistic Data**: Use realistic test data that mirrors production scenarios

### Database Management
- **Transaction Wrapping**: Use transactions for test isolation
- **Cleanup**: Proper cleanup after each test
- **Consistent State**: Ensure consistent database state before each test

### Error Handling
- **Comprehensive Coverage**: Test all error scenarios
- **Proper Assertions**: Validate error messages and status codes
- **Graceful Degradation**: Test how the system handles partial failures

### Performance Considerations
- **Timeouts**: Appropriate timeouts for different test types
- **Resource Management**: Proper cleanup of resources
- **Concurrent Testing**: Test concurrent access scenarios

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Setup test database
        run: |
          mysql -e 'CREATE DATABASE vims_test;'
          cp .env.example .env.test
      
      - name: Run integration tests
        run: npm run test:scorecards:integration
      
      - name: Run performance tests
        run: npm run test:scorecards:load
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Check database configuration
   echo $DATABASE_URL
   
   # Verify database exists
   mysql -u root -p -e "SHOW DATABASES;"
   ```

2. **Test Isolation Issues**
   ```typescript
   // Ensure proper cleanup
   afterEach(async () => {
     await cleanupTestDb();
   });
   ```

3. **Timeout Issues**
   ```typescript
   // Increase timeout for slow tests
   it('slow test', async () => {
     // test implementation
   }, 15000); // 15 second timeout
   ```

4. **Authentication Issues**
   ```typescript
   // Verify JWT configuration
   const token = sign(
     { sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 },
     process.env.JWT_SECRET
   );
   ```

### Performance Optimization

1. **Parallel Execution**
   - Tests run in parallel by default
   - Use proper isolation to avoid conflicts

2. **Database Pooling**
   - Configure appropriate connection pool size
   - Use transactions for test isolation

3. **Memory Management**
   - Clean up resources after each test
   - Monitor memory usage during performance tests

## Coverage Requirements

Integration tests should achieve:
- **API Coverage**: 100% of all endpoints
- **Error Path Coverage**: 90% minimum
- **Authentication Coverage**: 100% of auth scenarios
- **Database Coverage**: 85% of database operations

## Contributing

When adding new integration tests:

1. **Follow Structure**: Use the established directory structure
2. **Use Helpers**: Leverage existing database helpers
3. **Test Isolation**: Ensure tests are independent
4. **Comprehensive Coverage**: Test happy paths, edge cases, and errors
5. **Performance Consideration**: Consider performance implications
6. **Documentation**: Update this README for new test categories

## Future Enhancements

Planned improvements to the integration test suite:

- [ ] Component tests for route handlers
- [ ] End-to-end tests with real browser
- [ ] Contract testing with external services
- [ ] Chaos engineering tests
- [ ] Security penetration tests
- [ ] Load testing with real traffic simulation

## References

- [Main Testing Guide](../../../docs/testing-guide-BE.md)
- [Unit Tests](../unit/)
- [Component Tests](../component/)
- [Vitest Documentation](https://vitest.dev/)
- [Hono Framework](https://hono.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)
