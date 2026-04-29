/**
 * Error recovery mechanisms
 * Provides strategies for recovering from various error scenarios
 */

import { createLogger } from './logger';
import { retry } from './retry';

const logger = createLogger('ErrorRecovery');

export interface RecoveryStrategy<T> {
  canRecover: (error: any) => boolean;
  recover: (error: any) => Promise<T>;
}

/**
 * Execute operation with recovery strategies
 */
export async function withRecovery<T>(
  operation: () => Promise<T>,
  strategies: RecoveryStrategy<T>[]
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    for (const strategy of strategies) {
      if (strategy.canRecover(error)) {
        logger.info('Attempting recovery with strategy', { error: error.message });
        try {
          return await strategy.recover(error);
        } catch (recoveryError) {
          logger.error('Recovery strategy failed', recoveryError);
          continue;
        }
      }
    }
    throw error;
  }
}

/**
 * Database connection recovery strategy
 */
export function dbConnectionRecoveryStrategy<T>(
  fallbackOperation: () => Promise<T>
): RecoveryStrategy<T> {
  return {
    canRecover: (error: any) => {
      const dbErrorCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST'];
      return dbErrorCodes.some(code => 
        error?.code === code || 
        error?.message?.includes(code) ||
        error?.message?.includes('connection')
      );
    },
    recover: async (error: any) => {
      logger.warn('Database connection lost, attempting recovery', error);
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return await retry(fallbackOperation, {
        maxAttempts: 3,
        initialDelay: 1000,
      });
    },
  };
}

/**
 * Deadlock recovery strategy
 */
export function deadlockRecoveryStrategy<T>(
  retryOperation: () => Promise<T>
): RecoveryStrategy<T> {
  return {
    canRecover: (error: any) => {
      return error?.code === 'ER_LOCK_DEADLOCK' || 
             error?.message?.includes('deadlock');
    },
    recover: async (error: any) => {
      logger.warn('Deadlock detected, retrying transaction', error);
      // Wait a random amount of time to avoid another deadlock
      const delay = Math.random() * 1000 + 500;
      await new Promise(resolve => setTimeout(resolve, delay));
      return await retryOperation();
    },
  };
}

/**
 * Timeout recovery strategy
 */
export function timeoutRecoveryStrategy<T>(
  fallbackOperation: () => Promise<T>
): RecoveryStrategy<T> {
  return {
    canRecover: (error: any) => {
      return error?.code === 'ETIMEDOUT' || 
             error?.message?.includes('timeout');
    },
    recover: async (error: any) => {
      logger.warn('Operation timed out, retrying with longer timeout', error);
      return await retry(fallbackOperation, {
        maxAttempts: 2,
        initialDelay: 2000,
      });
    },
  };
}

/**
 * Resource exhausted recovery strategy
 */
export function resourceExhaustedRecoveryStrategy<T>(
  fallbackOperation: () => Promise<T>
): RecoveryStrategy<T> {
  return {
    canRecover: (error: any) => {
      return error?.code === 'ER_TOO_MANY_CONNECTIONS' || 
             error?.message?.includes('too many connections') ||
             error?.message?.includes('resource exhausted');
    },
    recover: async (error: any) => {
      logger.warn('Resource exhausted, waiting before retry', error);
      // Wait longer for resources to free up
      await new Promise(resolve => setTimeout(resolve, 5000));
      return await fallbackOperation();
    },
  };
}

/**
 * Composite recovery strategy with multiple fallbacks
 */
export class RecoveryChain<T> {
  private strategies: RecoveryStrategy<T>[] = [];

  addStrategy(strategy: RecoveryStrategy<T>): this {
    this.strategies.push(strategy);
    return this;
  }

  async execute(operation: () => Promise<T>): Promise<T> {
    return withRecovery(operation, this.strategies);
  }
}

/**
 * Automatic recovery for common database errors
 */
export async function withDbRecovery<T>(
  operation: () => Promise<T>
): Promise<T> {
  const chain = new RecoveryChain<T>()
    .addStrategy(deadlockRecoveryStrategy(operation))
    .addStrategy(timeoutRecoveryStrategy(operation))
    .addStrategy(dbConnectionRecoveryStrategy(operation))
    .addStrategy(resourceExhaustedRecoveryStrategy(operation));

  return chain.execute(operation);
}

/**
 * Health check and recovery for external services
 */
export class ServiceHealthChecker {
  private healthy: boolean = true;
  private lastCheck: number = 0;
  private checkInterval: number;

  constructor(checkInterval: number = 30000) {
    this.checkInterval = checkInterval;
  }

  async checkHealth(healthCheckFn: () => Promise<boolean>): Promise<boolean> {
    const now = Date.now();
    
    // Only check if interval has passed
    if (now - this.lastCheck < this.checkInterval && this.healthy) {
      return true;
    }

    try {
      this.healthy = await healthCheckFn();
      this.lastCheck = now;
      
      if (!this.healthy) {
        logger.warn('Service health check failed');
      }
      
      return this.healthy;
    } catch (error) {
      logger.error('Health check error', error);
      this.healthy = false;
      this.lastCheck = now;
      return false;
    }
  }

  markUnhealthy(): void {
    this.healthy = false;
    this.lastCheck = Date.now();
  }

  markHealthy(): void {
    this.healthy = true;
    this.lastCheck = Date.now();
  }

  isHealthy(): boolean {
    return this.healthy;
  }
}
