/**
 * Retry utility for transient errors
 * Provides exponential backoff for retrying failed operations
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[] | ((error: any) => boolean);
  onRetry?: (attempt: number, error: any) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE'],
  onRetry: () => {},
};

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const isRetryable = typeof opts.retryableErrors === 'function'
        ? opts.retryableErrors(error)
        : opts.retryableErrors.some(code => 
            (error as any)?.code === code || 
            (error as any)?.message?.includes(code)
          );

      if (!isRetryable || attempt === opts.maxAttempts) {
        throw error;
      }

      // Call onRetry callback
      opts.onRetry(attempt, error);

      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Retry a database operation with specific error codes
 */
export async function retryDbOperation<T>(
  fn: () => Promise<T>,
  options?: Omit<RetryOptions, 'retryableErrors'>
): Promise<T> {
  return retry(fn, {
    ...options,
    retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'],
  });
}

/**
 * Retry an external API call
 */
export async function retryExternalApi<T>(
  fn: () => Promise<T>,
  options?: Omit<RetryOptions, 'retryableErrors'>
): Promise<T> {
  return retry(fn, {
    ...options,
    retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND'],
    maxAttempts: 5,
  });
}
