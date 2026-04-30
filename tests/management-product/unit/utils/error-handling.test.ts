import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Error Handling Utils - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Network errors', () => {
    it('should handle connection timeout errors', () => {
      const error = new Error('Connection timeout');
      error.name = 'TimeoutError';
      
      const handledError = handleNetworkError(error);
      
      expect(handledError.type).toBe('TIMEOUT');
      expect(handledError.message).toBe('Connection timeout. Please try again.');
      expect(handledError.statusCode).toBe(408);
      expect(handledError.retryable).toBe(true);
    });

    it('should handle connection refused errors', () => {
      const error = new Error('ECONNREFUSED');
      error.name = 'ConnectionError';
      
      const handledError = handleNetworkError(error);
      
      expect(handledError.type).toBe('CONNECTION_REFUSED');
      expect(handledError.message).toBe('Unable to connect to server. Please check your connection.');
      expect(handledError.statusCode).toBe(503);
      expect(handledError.retryable).toBe(true);
    });

    it('should handle DNS resolution errors', () => {
      const error = new Error('ENOTFOUND');
      error.name = 'DNSError';
      
      const handledError = handleNetworkError(error);
      
      expect(handledError.type).toBe('DNS_ERROR');
      expect(handledError.message).toBe('Unable to resolve server address.');
      expect(handledError.statusCode).toBe(503);
      expect(handledError.retryable).toBe(true);
    });

    it('should handle rate limiting errors', () => {
      const error = new Error('Too many requests');
      error.name = 'RateLimitError';
      
      const handledError = handleNetworkError(error);
      
      expect(handledError.type).toBe('RATE_LIMIT');
      expect(handledError.message).toBe('Too many requests. Please try again later.');
      expect(handledError.statusCode).toBe(429);
      expect(handledError.retryable).toBe(true);
      expect(handledError.retryAfter).toBe(60);
    });

    it('should handle unknown network errors', () => {
      const error = new Error('Unknown network error');
      error.name = 'UnknownError';
      
      const handledError = handleNetworkError(error);
      
      expect(handledError.type).toBe('NETWORK_ERROR');
      expect(handledError.message).toBe('Network error occurred. Please try again.');
      expect(handledError.statusCode).toBe(500);
      expect(handledError.retryable).toBe(true);
    });
  });

  describe('Database errors', () => {
    it('should handle connection pool exhaustion', () => {
      const error = new Error('Connection pool exhausted');
      error.name = 'PoolError';
      
      const handledError = handleDatabaseError(error);
      
      expect(handledError.type).toBe('POOL_EXHAUSTED');
      expect(handledError.message).toBe('Database connection pool is busy. Please try again.');
      expect(handledError.statusCode).toBe(503);
      expect(handledError.retryable).toBe(true);
    });

    it('should handle unique constraint violations', () => {
      const error = new Error('Duplicate entry');
      error.name = 'UniqueViolationError';
      (error as any).code = 'ER_DUP_ENTRY';
      
      const handledError = handleDatabaseError(error);
      
      expect(handledError.type).toBe('DUPLICATE_ENTRY');
      expect(handledError.message).toBe('Record already exists.');
      expect(handledError.statusCode).toBe(409);
      expect(handledError.retryable).toBe(false);
    });

    it('should handle foreign key constraint violations', () => {
      const error = new Error('Foreign key constraint fails');
      error.name = 'ForeignKeyViolationError';
      (error as any).code = 'ER_NO_REFERENCED_ROW_2';
      
      const handledError = handleDatabaseError(error);
      
      expect(handledError.type).toBe('FOREIGN_KEY_VIOLATION');
      expect(handledError.message).toBe('Referenced record does not exist.');
      expect(handledError.statusCode).toBe(400);
      expect(handledError.retryable).toBe(false);
    });

    it('should handle database connection timeouts', () => {
      const error = new Error('Database connection timeout');
      error.name = 'ConnectionTimeoutError';
      
      const handledError = handleDatabaseError(error);
      
      expect(handledError.type).toBe('DB_TIMEOUT');
      expect(handledError.message).toBe('Database operation timed out. Please try again.');
      expect(handledError.statusCode).toBe(408);
      expect(handledError.retryable).toBe(true);
    });

    it('should handle query syntax errors', () => {
      const error = new Error('SQL syntax error');
      error.name = 'QueryError';
      (error as any).code = 'ER_PARSE_ERROR';
      
      const handledError = handleDatabaseError(error);
      
      expect(handledError.type).toBe('SYNTAX_ERROR');
      expect(handledError.message).toBe('Invalid query format.');
      expect(handledError.statusCode).toBe(500);
      expect(handledError.retryable).toBe(false);
    });

    it('should handle unknown database errors', () => {
      const error = new Error('Unknown database error');
      error.name = 'UnknownDBError';
      
      const handledError = handleDatabaseError(error);
      
      expect(handledError.type).toBe('DATABASE_ERROR');
      expect(handledError.message).toBe('Database operation failed.');
      expect(handledError.statusCode).toBe(500);
      expect(handledError.retryable).toBe(true);
    });
  });

  describe('Timeout handling', () => {
    it('should handle operation timeouts', () => {
      const error = new Error('Operation timeout');
      error.name = 'TimeoutError';
      
      const handledError = handleTimeoutError(error, 5000);
      
      expect(handledError.type).toBe('OPERATION_TIMEOUT');
      expect(handledError.message).toBe('Operation timed out after 5000ms.');
      expect(handledError.statusCode).toBe(408);
      expect(handledError.retryable).toBe(true);
      expect(handledError.timeout).toBe(5000);
    });

    it('should handle request timeouts', () => {
      const error = new Error('Request timeout');
      error.name = 'RequestTimeoutError';
      
      const handledError = handleTimeoutError(error, 10000);
      
      expect(handledError.type).toBe('REQUEST_TIMEOUT');
      expect(handledError.message).toBe('Request timed out after 10000ms.');
      expect(handledError.statusCode).toBe(408);
      expect(handledError.retryable).toBe(true);
    });

    it('should provide appropriate retry strategy for timeouts', () => {
      const error = new Error('Timeout');
      error.name = 'TimeoutError';
      
      const handledError = handleTimeoutError(error, 3000);
      
      expect(handledError.retryStrategy).toBeDefined();
      expect(handledError.retryStrategy.type).toBe('exponential_backoff');
      expect(handledError.retryStrategy.maxRetries).toBe(3);
      expect(handledError.retryStrategy.initialDelay).toBe(1000);
    });
  });

  describe('Offline detection', () => {
    it('should detect offline status', () => {
      const isOffline = detectOfflineStatus();
      
      // Mock navigator.offline for testing
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });
      
      const offlineStatus = detectOfflineStatus();
      expect(offlineStatus.isOffline).toBe(true);
      expect(offlineStatus.message).toBe('You appear to be offline. Please check your internet connection.');
    });

    it('should detect online status', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });
      
      const onlineStatus = detectOfflineStatus();
      expect(onlineStatus.isOffline).toBe(false);
      expect(onlineStatus.message).toBeUndefined();
    });

    it('should handle offline errors appropriately', () => {
      const error = new Error('Failed to fetch');
      error.name = 'OfflineError';
      
      const handledError = handleOfflineError(error);
      
      expect(handledError.type).toBe('OFFLINE');
      expect(handledError.message).toBe('No internet connection. Please check your network settings.');
      expect(handledError.statusCode).toBe(503);
      expect(handledError.retryable).toBe(true);
      expect(handledError.whenOnline).toBeDefined();
    });

    it('should provide retry mechanism for offline errors', () => {
      const error = new Error('Network error');
      error.name = 'OfflineError';
      
      const handledError = handleOfflineError(error);
      
      expect(handledError.retryStrategy).toBeDefined();
      expect(handledError.retryStrategy.type).toBe('linear_backoff');
      expect(handledError.retryStrategy.maxRetries).toBe(10);
      expect(handledError.retryStrategy.delay).toBe(5000);
    });
  });

  describe('Error recovery strategies', () => {
    it('should implement exponential backoff retry', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(mockFn, {
        maxRetries: 3,
        initialDelay: 10,
        maxDelay: 100,
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        retryWithBackoff(mockFn, {
          maxRetries: 2,
          initialDelay: 10,
          maxDelay: 100,
        })
      ).rejects.toThrow('Persistent failure');

      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should implement circuit breaker pattern', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Service unavailable'));
      const circuitBreaker = createCircuitBreaker(mockFn, {
        failureThreshold: 3,
        timeout: 1000,
        resetTimeout: 5000,
      });

      // Trigger failures to open circuit
      await expect(circuitBreaker()).rejects.toThrow();
      await expect(circuitBreaker()).rejects.toThrow();
      await expect(circuitBreaker()).rejects.toThrow();

      // Circuit should be open now
      await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is open');

      expect(circuitBreaker.getState()).toBe('open');
    });

    it('should reset circuit breaker after timeout', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValue('success');

      const circuitBreaker = createCircuitBreaker(mockFn, {
        failureThreshold: 3,
        timeout: 50,
        resetTimeout: 100,
      });

      // Trigger failures
      await expect(circuitBreaker()).rejects.toThrow();
      await expect(circuitBreaker()).rejects.toThrow();
      await expect(circuitBreaker()).rejects.toThrow();

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should work now
      const result = await circuitBreaker();
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe('closed');
    });
  });

  describe('Error logging and monitoring', () => {
    it('should format error for logging', () => {
      const error = new Error('Test error');
      error.name = 'TestError';
      (error as any).stack = 'Error: Test error\n    at test.js:1:1';

      const formatted = formatErrorForLogging(error, {
        userId: 123,
        requestId: 'req-123',
        action: 'createProduct',
      });

      expect(formatted.timestamp).toBeDefined();
      expect(formatted.error.name).toBe('TestError');
      expect(formatted.error.message).toBe('Test error');
      expect(formatted.error.stack).toBe('Error: Test error\n    at test.js:1:1');
      expect(formatted.context.userId).toBe(123);
      expect(formatted.context.requestId).toBe('req-123');
      expect(formatted.context.action).toBe('createProduct');
    });

    it('should sanitize sensitive information in errors', () => {
      const error = new Error('Database error: password=secret123');
      error.name = 'DatabaseError';

      const sanitized = sanitizeError(error);

      expect(sanitized.message).not.toContain('secret123');
      expect(sanitized.message).toContain('[REDACTED]');
    });

    it('should categorize errors by severity', () => {
      const testCases = [
        { error: new Error('Network timeout'), expectedSeverity: 'medium' },
        { error: new Error('Database connection failed'), expectedSeverity: 'high' },
        { error: new Error('Invalid input'), expectedSeverity: 'low' },
        { error: new Error('System crash'), expectedSeverity: 'critical' },
      ];

      testCases.forEach(({ error, expectedSeverity }) => {
        const severity = categorizeErrorSeverity(error);
        expect(severity).toBe(expectedSeverity);
      });
    });

    it('should generate error metrics', () => {
      const errors = [
        { type: 'NETWORK_ERROR', timestamp: Date.now() - 1000 },
        { type: 'DATABASE_ERROR', timestamp: Date.now() - 2000 },
        { type: 'NETWORK_ERROR', timestamp: Date.now() - 3000 },
      ];

      const metrics = generateErrorMetrics(errors);

      expect(metrics.total).toBe(3);
      expect(metrics.byType.NETWORK_ERROR).toBe(2);
      expect(metrics.byType.DATABASE_ERROR).toBe(1);
      expect(metrics.ratePerMinute).toBeGreaterThan(0);
    });
  });

  describe('User-friendly error messages', () => {
    it('should convert technical errors to user-friendly messages', () => {
      const testCases = [
        {
          technical: 'ER_DUP_ENTRY',
          expected: 'This item already exists. Please use a different name.',
        },
        {
          technical: 'ECONNREFUSED',
          expected: 'Unable to connect to the server. Please check your internet connection.',
        },
        {
          technical: 'ENOTFOUND',
          expected: 'Server address not found. Please check the server URL.',
        },
        {
          technical: 'ETIMEDOUT',
          expected: 'Request timed out. Please try again.',
        },
        {
          technical: 'UNKNOWN_ERROR',
          expected: 'An unexpected error occurred. Please try again.',
        },
      ];

      testCases.forEach(({ technical, expected }) => {
        const userMessage = convertToUserFriendlyMessage(technical);
        expect(userMessage).toBe(expected);
      });
    });

    it('should provide actionable error messages', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      (error as any).details = {
        field: 'name',
        message: 'Name is required',
      };

      const actionable = createActionableErrorMessage(error);

      expect(actionable.message).toBe('Name is required');
      expect(actionable.action).toBeDefined();
      expect(actionable.action.type).toBe('field_input');
      expect(actionable.action.target).toBe('name');
    });

    it('should handle internationalization of error messages', () => {
      const error = new Error('Required field');
      const messages = {
        en: 'This field is required.',
        id: 'Field ini wajib diisi.',
        es: 'Este campo es obligatorio.',
      };

      Object.entries(messages).forEach(([locale, expectedMessage]) => {
        const localizedMessage = localizeErrorMessage(error, locale);
        expect(localizedMessage).toBe(expectedMessage);
      });
    });
  });
});

// Helper functions implementing error handling logic
function handleNetworkError(error: Error) {
  const errorMap: Record<string, any> = {
    TimeoutError: {
      type: 'TIMEOUT',
      message: 'Connection timeout. Please try again.',
      statusCode: 408,
      retryable: true,
    },
    ConnectionError: {
      type: 'CONNECTION_REFUSED',
      message: 'Unable to connect to server. Please check your connection.',
      statusCode: 503,
      retryable: true,
    },
    DNSError: {
      type: 'DNS_ERROR',
      message: 'Unable to resolve server address.',
      statusCode: 503,
      retryable: true,
    },
    RateLimitError: {
      type: 'RATE_LIMIT',
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
      retryable: true,
      retryAfter: 60,
    },
  };

  const handler = errorMap[error.name] || {
    type: 'NETWORK_ERROR',
    message: 'Network error occurred. Please try again.',
    statusCode: 500,
    retryable: true,
  };

  return { ...handler, originalError: error };
}

function handleDatabaseError(error: any) {
  const errorMap: Record<string, any> = {
    PoolError: {
      type: 'POOL_EXHAUSTED',
      message: 'Database connection pool is busy. Please try again.',
      statusCode: 503,
      retryable: true,
    },
    UniqueViolationError: {
      type: 'DUPLICATE_ENTRY',
      message: 'Record already exists.',
      statusCode: 409,
      retryable: false,
    },
    ForeignKeyViolationError: {
      type: 'FOREIGN_KEY_VIOLATION',
      message: 'Referenced record does not exist.',
      statusCode: 400,
      retryable: false,
    },
    ConnectionTimeoutError: {
      type: 'DB_TIMEOUT',
      message: 'Database operation timed out. Please try again.',
      statusCode: 408,
      retryable: true,
    },
    QueryError: {
      type: 'SYNTAX_ERROR',
      message: 'Invalid query format.',
      statusCode: 500,
      retryable: false,
    },
  };

  const handler = errorMap[error.name] || {
    type: 'DATABASE_ERROR',
    message: 'Database operation failed.',
    statusCode: 500,
    retryable: true,
  };

  return { ...handler, originalError: error };
}

function handleTimeoutError(error: Error, timeout: number) {
  return {
    type: error.name === 'RequestTimeoutError' ? 'REQUEST_TIMEOUT' : 'OPERATION_TIMEOUT',
    message: `${error.name === 'RequestTimeoutError' ? 'Request' : 'Operation'} timed out after ${timeout}ms.`,
    statusCode: 408,
    retryable: true,
    timeout,
    retryStrategy: {
      type: 'exponential_backoff',
      maxRetries: 3,
      initialDelay: 1000,
    },
    originalError: error,
  };
}

function handleOfflineError(error: Error) {
  return {
    type: 'OFFLINE',
    message: 'No internet connection. Please check your network settings.',
    statusCode: 503,
    retryable: true,
    whenOnline: 'Retry when connection is restored',
    retryStrategy: {
      type: 'linear_backoff',
      maxRetries: 10,
      delay: 5000,
    },
    originalError: error,
  };
}

function detectOfflineStatus() {
  const isOffline = !navigator.onLine;
  
  if (isOffline) {
    return {
      isOffline: true,
      message: 'You appear to be offline. Please check your internet connection.',
    };
  }
  
  return { isOffline: false };
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
  }
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === options.maxRetries) {
        throw lastError;
      }
      
      const delay = Math.min(
        options.initialDelay * Math.pow(2, attempt),
        options.maxDelay
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

function createCircuitBreaker<T>(
  fn: () => Promise<T>,
  options: {
    failureThreshold: number;
    timeout: number;
    resetTimeout: number;
  }
) {
  let state: 'closed' | 'open' | 'half-open' = 'closed';
  let failureCount = 0;
  let lastFailureTime = 0;

  const circuitBreaker = async (): Promise<T> => {
    if (state === 'open') {
      if (Date.now() - lastFailureTime > options.resetTimeout) {
        state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Circuit breaker timeout')), options.timeout)
        ),
      ]);

      if (state === 'half-open') {
        state = 'closed';
        failureCount = 0;
      }

      return result;
    } catch (error) {
      failureCount++;
      lastFailureTime = Date.now();

      if (failureCount >= options.failureThreshold) {
        state = 'open';
      }

      throw error;
    }
  };

  circuitBreaker.getState = () => state;

  return circuitBreaker;
}

function formatErrorForLogging(error: Error, context: any) {
  return {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
  };
}

function sanitizeError(error: Error): Error {
  const sanitized = new Error(error.message);
  sanitized.name = error.name;
  
  // Remove sensitive information
  sanitized.message = error.message
    .replace(/password=\w+/gi, 'password=[REDACTED]')
    .replace(/token=\w+/gi, 'token=[REDACTED]')
    .replace(/key=\w+/gi, 'key=[REDACTED]');
  
  return sanitized;
}

function categorizeErrorSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
  const message = error.message.toLowerCase();
  
  if (message.includes('critical') || message.includes('crash')) {
    return 'critical';
  }
  if (message.includes('database') || message.includes('connection')) {
    return 'high';
  }
  if (message.includes('network') || message.includes('timeout')) {
    return 'medium';
  }
  
  return 'low';
}

function generateErrorMetrics(errors: Array<{ type: string; timestamp: number }>) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const recentErrors = errors.filter(e => e.timestamp > oneMinuteAgo);
  
  const byType = errors.reduce((acc, error) => {
    acc[error.type] = (acc[error.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    total: errors.length,
    recent: recentErrors.length,
    ratePerMinute: recentErrors.length,
    byType,
  };
}

function convertToUserFriendlyMessage(technicalMessage: string): string {
  const messageMap: Record<string, string> = {
    'ER_DUP_ENTRY': 'This item already exists. Please use a different name.',
    'ECONNREFUSED': 'Unable to connect to the server. Please check your internet connection.',
    'ENOTFOUND': 'Server address not found. Please check the server URL.',
    'ETIMEDOUT': 'Request timed out. Please try again.',
  };

  return messageMap[technicalMessage] || 'An unexpected error occurred. Please try again.';
}

function createActionableErrorMessage(error: any) {
  if (error.name === 'ValidationError' && error.details) {
    return {
      message: error.details.message,
      action: {
        type: 'field_input',
        target: error.details.field,
        instruction: `Please enter a valid ${error.details.field}`,
      },
    };
  }

  return {
    message: error.message,
    action: {
      type: 'general',
      instruction: 'Please try again or contact support if the problem persists.',
    },
  };
}

function localizeErrorMessage(error: Error, locale: string): string {
  const messages: Record<string, Record<string, string>> = {
    en: {
      'Required field': 'This field is required.',
      'Invalid input': 'Please enter a valid value.',
    },
    id: {
      'Required field': 'Field ini wajib diisi.',
      'Invalid input': 'Silakan masukkan nilai yang valid.',
    },
    es: {
      'Required field': 'Este campo es obligatorio.',
      'Invalid input': 'Por favor ingrese un valor válido.',
    },
  };

  return messages[locale]?.[error.message] || error.message;
}
