# Customer Scorecard Management Test Suite

This directory contains comprehensive test coverage for the Customer Scorecard Management module, including unit tests, integration tests, and component tests as specified in the testing guide.

## Directory Structure

```
tests/customer-scoreboard-management/
├── README.md                                    # This file
├── setup.ts                                     # Global test setup and utilities
├── fixtures/                                    # Test data fixtures and factories
│   └── scorecard-fixtures.ts                    # Test data generators and factories
├── unit/                                        # Unit tests
│   ├── scorecards.validation-tests.test.ts         # Validation schema tests
│   ├── scorecards.business-logic.test.ts         # Business logic tests (formatRow, buildSelectQuery)
│   ├── scorecards.data-processing.test.ts         # Data processing tests (filter, sort, pagination)
│   ├── scorecardData.business-logic.test.ts      # Scorecard data business logic tests
│   ├── scorecardData.data-processing.test.ts     # Scorecard data data processing tests (dashboard & history queries)
│   ├── database-schema.test.ts                  # Database schema tests
│   ├── utility-functions.test.ts                # Utility function tests
│   ├── performance-tests.test.ts                # Performance tests
│   └── security-tests.test.ts                   # Security tests (to be implemented)
└── component/                                   # Component tests (to be implemented)
```

## Test Categories

### Unit Tests

#### 1. Validation Tests (`scorecards.validation-tests.test.ts`)
- **Pagination Query Schema**: Tests page boundaries, limit validation, and optional parameters
- **Scorecard Payload Schema**: Tests required fields, optional fields, and data type coercion
- **Update Scorecard Payload**: Tests partial updates and field validation
- **Edge Cases**: Tests error messages and boundary conditions

#### 2. Business Logic Tests (`scorecards.business-logic.test.ts`)
- **formatRow Function**: Tests data formatting with complete/missing relations
- **buildSelectQuery Function**: Tests query structure and joins
- **Integration**: Tests complete data flow between functions

#### 3. Data Processing Tests (`scorecards.data-processing.test.ts`)
- **Filter Logic**: Tests search, individual filters, and combined filters
- **Sorting Logic**: Tests all valid sort fields and order combinations
- **Pagination Logic**: Tests offset calculation, boundaries, and hasNext detection

#### 4. Scorecard Data Business Logic (`scorecardData.business-logic.test.ts`)
- **isCurrentPeriod Function**: Tests period detection for year/month/week
- **computeAutoFields Function**: Tests threshold calculation and status computation
- **computeTrend Function**: Tests trend calculation with various scenarios

#### 5. Utility Functions (`utility-functions.test.ts`)
- **Validation Utilities**: ID validation, numeric conversion, string sanitization
- **Error Handling**: Error formatting, HTTP status mapping, database errors
- **Performance Utilities**: Debounce and throttle functions

### Test Fixtures (`fixtures/scorecard-fixtures.ts`)

Comprehensive test data generators including:
- **Basic Fixtures**: Individual entity creators
- **Factory Classes**: Complex scenario generators
- **Complete Data Sets**: Related entity collections
- **Performance Data**: Large dataset generators
- **Error Scenarios**: Invalid and malicious input generators

## Running Tests

### All Tests
```bash
npm run test:scorecards
```

### Unit Tests Only
```bash
npm run test:scorecards:unit
```

### Specific Test Categories
```bash
# Validation tests
npm run test:scorecards:validation

# Business logic tests
npm run test:scorecards:business

# Data processing tests
npm run test:scorecards:data-processing

# Scorecard data tests
npm run test:scorecards:scorecard-data
npm run test:scorecards:scorecard-data-processing

# Utility function tests
npm run test:scorecards:utilities
```

### Watch Mode
```bash
npm run test:scorecards:watch
```

### Coverage Report
```bash
npm run test:scorecards:coverage
```

## Test Coverage Requirements

Based on the testing guide, the following coverage thresholds are enforced:

- **Global Coverage**: 80% minimum
- **Critical Path Coverage**: 100%
- **Business Logic Coverage**: 90% minimum

## Test Data Management

### Using Fixtures
```typescript
import { createTestScorecard, ScorecardFactory } from '../fixtures/scorecard-fixtures';

// Create a basic test scorecard
const scorecard = createTestScorecard({ title: 'Test KPI' });

// Create a complete scorecard with all relations
const completeScorecard = ScorecardFactory.createComplete();

// Create batch data
const batch = ScorecardFactory.createBatch(10);
```

### Factory Patterns
```typescript
// Performance-based scorecards
const goodPerf = ScorecardFactory.createWithPerformance('good');
const avgPerf = ScorecardFactory.createWithPerformance('average');
const poorPerf = ScorecardFactory.createWithPerformance('poor');

// Scorecard data with specific trends
const trendUp = ScorecardDataFactory.createWithTrend('naik');
const trendStable = ScorecardDataFactory.createWithTrend('stabil');
const trendDown = ScorecardDataFactory.createWithTrend('turun');
```

## Mock Strategy

### Database Mocks
Database operations are mocked using Vitest's mocking system:
```typescript
vi.mock('../../../src/db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    // ... other methods
  },
}));
```

### Schema Mocks
Database schema objects are mocked to avoid import issues:
```typescript
vi.mock('../../../src/db/schema', () => ({
  scorecards: { /* mock schema */ },
  customers: { /* mock schema */ },
  // ... other tables
}));
```

## Best Practices

### Test Organization
- **Descriptive Names**: Use clear, descriptive test names
- **AAA Pattern**: Arrange-Act-Assert structure
- **Test Isolation**: Each test should be independent
- **Minimal Mocks**: Mock only what's necessary

### Data Management
- **Use Fixtures**: Leverage provided fixtures for consistent test data
- **Factory Pattern**: Use factories for complex scenarios
- **Edge Cases**: Test boundary conditions and error scenarios

### Error Testing
- **Happy Path**: Test successful scenarios
- **Edge Cases**: Test boundary conditions
- **Error Scenarios**: Test failure modes
- **Validation**: Test input validation

## CI/CD Integration

The test suite is designed to run in CI/CD environments:

```yaml
# Example GitHub Actions workflow
- name: Run Scorecard Tests
  run: |
    npm run test:scorecards:coverage
    npm run test:scorecards:unit
```

## Coverage Reports

Coverage reports are generated in multiple formats:
- **Text**: Console output
- **HTML**: Interactive web report (`coverage/index.html`)
- **JSON**: Machine-readable format

## Troubleshooting

### Common Issues

1. **Mock Conflicts**: Clear mocks between tests
   ```typescript
   afterEach(() => {
     vi.clearAllMocks();
   });
   ```

2. **Async Test Timeouts**: Increase timeout for slow tests
   ```typescript
   it('slow test', async () => {
     // test implementation
   }, 15000); // 15 second timeout
   ```

3. **Database Connection Errors**: Ensure test database is configured
   ```bash
   # Check test database configuration
   echo $DATABASE_URL
   ```

### Performance Optimization

- **Parallel Execution**: Tests run in parallel by default
- **Mock Efficiency**: Use efficient mock implementations
- **Test Isolation**: Avoid shared state between tests

## Contributing

When adding new tests:

1. **Follow Naming Convention**: `*.test.ts` for test files
2. **Use Fixtures**: Leverage existing fixtures when possible
3. **Add Coverage**: Ensure new code is covered
4. **Update Documentation**: Keep this README current
5. **Test Locally**: Verify tests pass before committing

## Future Enhancements

Planned improvements to the test suite:

- [ ] Integration tests for API endpoints
- [ ] Component tests for route handlers
- [ ] Performance tests for large datasets
- [ ] Security tests for input validation
- [ ] Load tests for concurrent access

## References

- [Main Testing Guide](../../../docs/testing-guide.md)
- [Vitest Documentation](https://vitest.dev/)
- [Zod Validation](https://zod.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)
