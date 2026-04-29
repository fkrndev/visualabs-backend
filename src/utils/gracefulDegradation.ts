/**
 * Graceful degradation utilities
 * Allows the application to continue functioning even when some components fail
 */

import { createLogger } from './logger';

const logger = createLogger('GracefulDegradation');

export interface FallbackOptions<T> {
  primary: () => Promise<T>;
  fallback: () => Promise<T> | T;
  fallbackCondition?: (error: any) => boolean;
  onFallback?: (error: any) => void;
}

/**
 * Execute primary function with fallback on failure
 */
export async function withFallback<T>(options: FallbackOptions<T>): Promise<T> {
  try {
    return await options.primary();
  } catch (error) {
    const shouldFallback = options.fallbackCondition
      ? options.fallbackCondition(error)
      : true;

    if (shouldFallback) {
      logger.warn('Primary operation failed, using fallback', error);
      if (options.onFallback) {
        options.onFallback(error);
      }
      return await options.fallback();
    }

    throw error;
  }
}

/**
 * Execute multiple operations and return partial results if some fail
 */
export async function withPartialResults<T>(
  operations: Array<() => Promise<T>>,
  options: {
    continueOnError?: boolean;
    minSuccessCount?: number;
  } = {}
): Promise<{ results: T[]; errors: Array<{ index: number; error: any }> }> {
  const { continueOnError = true, minSuccessCount = 0 } = options;
  const results: T[] = [];
  const errors: Array<{ index: number; error: any }> = [];

  for (let i = 0; i < operations.length; i++) {
    try {
      const result = await operations[i]();
      results[i] = result;
    } catch (error) {
      errors.push({ index: i, error });
      if (!continueOnError) {
        throw error;
      }
    }
  }

  if (minSuccessCount > 0 && results.length < minSuccessCount) {
    throw new Error(
      `Minimum success count not met: ${results.length}/${minSuccessCount}`
    );
  }

  return { results, errors };
}

/**
 * Cache with fallback to database
 */
export class CacheWithFallback<T> {
  private cache: Map<string, { data: T; timestamp: number }>;
  private ttl: number;

  constructor(ttl: number = 60000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  async get(
    key: string,
    dbFetcher: () => Promise<T>
  ): Promise<T | null> {
    // Try cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }

    // Fallback to database
    try {
      const data = await dbFetcher();
      if (data !== null) {
        this.cache.set(key, { data, timestamp: Date.now() });
      }
      return data;
    } catch (error) {
      logger.error('Database fetch failed, returning cached data if available', error);
      // Return stale cache if available
      return cached?.data ?? null;
    }
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Circuit breaker pattern to prevent cascading failures
 */
export class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private isOpen: boolean = false;

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    // Check if circuit should reset
    if (this.isOpen && Date.now() - this.lastFailureTime > this.timeout) {
      this.isOpen = false;
      this.failureCount = 0;
      logger.info('Circuit breaker reset');
    }

    // Reject if circuit is open
    if (this.isOpen) {
      if (fallback) {
        logger.warn('Circuit breaker is open, using fallback');
        return await fallback();
      }
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await operation();
      this.failureCount = 0;
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.threshold) {
        this.isOpen = true;
        logger.error(`Circuit breaker opened after ${this.failureCount} failures`, error);
      }

      if (fallback) {
        logger.warn('Operation failed, using fallback', error);
        return await fallback();
      }

      throw error;
    }
  }

  reset(): void {
    this.isOpen = false;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  getState(): { isOpen: boolean; failureCount: number } {
    return {
      isOpen: this.isOpen,
      failureCount: this.failureCount,
    };
  }
}
