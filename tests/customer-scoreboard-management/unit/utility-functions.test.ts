import { describe, it, expect, vi } from 'vitest';

// Mock utility functions that would typically be in utils directory
describe('Utility Functions', () => {
  describe('ID Validation', () => {
    it('should handle NaN ID values correctly', () => {
      const validateId = (id: any): number | null => {
        if (id === null || id === undefined) return null;
        const numId = Number(id);
        return Number.isNaN(numId) ? null : numId;
      };

      expect(validateId(1)).toBe(1);
      expect(validateId('1')).toBe(1);
      expect(validateId('abc')).toBeNull();
      expect(validateId(NaN)).toBeNull();
      expect(validateId(null)).toBeNull();
      expect(validateId(undefined)).toBeNull();
    });

    it('should handle edge cases for ID validation', () => {
      const validateId = (id: any): number | null => {
        if (id === null || id === undefined) return null;
        const numId = Number(id);
        return Number.isNaN(numId) || numId < 0 ? null : numId;
      };

      expect(validateId(0)).toBe(0);
      expect(validateId(-1)).toBeNull();
      expect(validateId(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
      expect(validateId(Number.MIN_SAFE_INTEGER)).toBeNull();
    });
  });

  describe('Numeric Conversion Functions', () => {
    it('should convert strings to numbers safely', () => {
      const safeParseFloat = (value: any): number | null => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = parseFloat(String(value));
        return Number.isNaN(parsed) ? null : parsed;
      };

      expect(safeParseFloat('123.45')).toBe(123.45);
      expect(safeParseFloat('123')).toBe(123);
      expect(safeParseFloat('abc')).toBeNull();
      expect(safeParseFloat('')).toBeNull();
      expect(safeParseFloat(null)).toBeNull();
      expect(safeParseFloat(undefined)).toBeNull();
      expect(safeParseFloat('12.34.56')).toBe(12.34);
    });

    it('should handle integer conversion', () => {
      const safeParseInt = (value: any): number | null => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = parseInt(String(value), 10);
        return Number.isNaN(parsed) ? null : parsed;
      };

      expect(safeParseInt('123')).toBe(123);
      expect(safeParseInt('123.45')).toBe(123);
      expect(safeParseInt('abc')).toBeNull();
      expect(safeParseInt('')).toBeNull();
      expect(safeParseInt(null)).toBeNull();
    });
  });

  describe('String Sanitization Functions', () => {
    it('should trim and validate strings', () => {
      const sanitizeString = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        const str = String(value).trim();
        return str === '' ? null : str;
      };

      expect(sanitizeString('  hello world  ')).toBe('hello world');
      expect(sanitizeString('hello')).toBe('hello');
      expect(sanitizeString('   ')).toBeNull();
      expect(sanitizeString('')).toBeNull();
      expect(sanitizeString(null)).toBeNull();
      expect(sanitizeString(123)).toBe('123');
    });

    it('should escape HTML characters', () => {
      const escapeHtml = (text: string): string => {
        const map: { [key: string]: string } = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
      };

      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml('Hello & "world"')).toBe('Hello &amp; &quot;world&quot;');
    });

    it('should validate string length', () => {
      const validateLength = (str: string, min: number, max: number): boolean => {
        return str.length >= min && str.length <= max;
      };

      expect(validateLength('hello', 1, 10)).toBe(true);
      expect(validateLength('hello', 6, 10)).toBe(false); // Too short
      expect(validateLength('hello world', 1, 5)).toBe(false); // Too long
      expect(validateLength('', 0, 10)).toBe(true);
    });
  });

  describe('Email Validation', () => {
    it('should validate email format correctly', () => {
      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('user.name@example.com')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });

    it('should handle edge cases for email validation', () => {
      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+(?:\.[^\s@]+)*\.[^\s@]+$/;
        return emailRegex.test(email) && !email.includes('..');
      };

      expect(isValidEmail('a@b.co')).toBe(true); // Minimal valid email
      expect(isValidEmail('user@sub.example.com')).toBe(true);
      expect(isValidEmail('user with spaces@example.com')).toBe(false);
      expect(isValidEmail('user@example..com')).toBe(false);
    });
  });

  describe('Password Strength Validation', () => {
    it('should validate password strength requirements', () => {
      const validatePassword = (password: string): {
        isValid: boolean;
        errors: string[];
      } => {
        const errors: string[] = [];
        
        if (password.length < 8) {
          errors.push('Password must be at least 8 characters');
        }
        
        if (!/[A-Z]/.test(password)) {
          errors.push('Password must contain at least one uppercase letter');
        }
        
        if (!/[a-z]/.test(password)) {
          errors.push('Password must contain at least one lowercase letter');
        }
        
        if (!/\d/.test(password)) {
          errors.push('Password must contain at least one number');
        }
        
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
          errors.push('Password must contain at least one special character');
        }
        
        return {
          isValid: errors.length === 0,
          errors
        };
      };

      const strongPassword = 'StrongPass123!';
      const result1 = validatePassword(strongPassword);
      expect(result1.isValid).toBe(true);
      expect(result1.errors).toHaveLength(0);

      const weakPassword = 'weak';
      const result2 = validatePassword(weakPassword);
      expect(result2.isValid).toBe(false);
      expect(result2.errors.length).toBeGreaterThan(0);
    });

    it('should handle password edge cases', () => {
      const validatePassword = (password: string): {
        isValid: boolean;
        errors: string[];
      } => {
        const errors: string[] = [];
        
        if (password.length < 8) {
          errors.push('Password must be at least 8 characters');
        }
        
        if (!/[A-Z]/.test(password)) {
          errors.push('Password must contain at least one uppercase letter');
        }
        
        if (!/[a-z]/.test(password)) {
          errors.push('Password must contain at least one lowercase letter');
        }
        
        if (!/\d/.test(password)) {
          errors.push('Password must contain at least one number');
        }
        
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
          errors.push('Password must contain at least one special character');
        }
        
        return {
          isValid: errors.length === 0,
          errors
        };
      };

      const emptyPassword = '';
      const result1 = validatePassword(emptyPassword);
      expect(result1.isValid).toBe(false);

      const longPassword = 'A'.repeat(100) + 'a1!';
      const result2 = validatePassword(longPassword);
      expect(result2.isValid).toBe(true);
    });
  });

  describe('Phone Number Validation', () => {
    it('should validate phone number formats', () => {
      const isValidPhone = (phone: string): boolean => {
        const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
        const digitsOnly = phone.replace(/\D/g, '');
        return phoneRegex.test(phone) && digitsOnly.length >= 10 && digitsOnly.length <= 15;
      };

      expect(isValidPhone('+1234567890')).toBe(true);
      expect(isValidPhone('123-456-7890')).toBe(true);
      expect(isValidPhone('(123) 456-7890')).toBe(true);
      expect(isValidPhone('1234567890')).toBe(true);
      expect(isValidPhone('12345')).toBe(false); // Too short
      expect(isValidPhone('abc1234567')).toBe(false); // Contains letters
      expect(isValidPhone('')).toBe(false);
    });
  });
});

describe('Error Handling Utilities', () => {
  describe('Error Message Formatting', () => {
    it('should format validation errors consistently', () => {
      const formatValidationError = (field: string, message: string): string => {
        return `${field}: ${message}`;
      };

      expect(formatValidationError('email', 'Invalid format'))
        .toBe('email: Invalid format');
      expect(formatValidationError('password', 'Too short'))
        .toBe('password: Too short');
    });

    it('should handle multiple error messages', () => {
      const formatErrors = (errors: { field: string; message: string }[]): string => {
        return errors.map(err => `${err.field}: ${err.message}`).join(', ');
      };

      const errors = [
        { field: 'email', message: 'Invalid format' },
        { field: 'password', message: 'Too short' },
        { field: 'name', message: 'Required' }
      ];

      expect(formatErrors(errors))
        .toBe('email: Invalid format, password: Too short, name: Required');
    });
  });

  describe('HTTP Status Code Mapping', () => {
    it('should map error types to HTTP status codes', () => {
      const getHttpStatus = (errorType: string): number => {
        const statusMap: { [key: string]: number } = {
          'validation': 400,
          'unauthorized': 401,
          'forbidden': 403,
          'not_found': 404,
          'conflict': 409,
          'server_error': 500
        };
        return statusMap[errorType] || 500;
      };

      expect(getHttpStatus('validation')).toBe(400);
      expect(getHttpStatus('unauthorized')).toBe(401);
      expect(getHttpStatus('forbidden')).toBe(403);
      expect(getHttpStatus('not_found')).toBe(404);
      expect(getHttpStatus('conflict')).toBe(409);
      expect(getHttpStatus('server_error')).toBe(500);
      expect(getHttpStatus('unknown')).toBe(500);
    });
  });

  describe('Database Error Handling', () => {
    it('should handle database connection errors', () => {
      const handleDatabaseError = (error: any): { message: string; code: string } => {
        if (error.code === 'ECONNREFUSED') {
          return { message: 'Database connection failed', code: 'DB_CONNECTION_ERROR' };
        }
        if (error.code === 'ER_DUP_ENTRY') {
          return { message: 'Duplicate entry', code: 'DB_DUPLICATE_ERROR' };
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
          return { message: 'Foreign key constraint violation', code: 'DB_FOREIGN_KEY_ERROR' };
        }
        return { message: 'Database error', code: 'DB_UNKNOWN_ERROR' };
      };

      expect(handleDatabaseError({ code: 'ECONNREFUSED' }))
        .toEqual({ message: 'Database connection failed', code: 'DB_CONNECTION_ERROR' });
      
      expect(handleDatabaseError({ code: 'ER_DUP_ENTRY' }))
        .toEqual({ message: 'Duplicate entry', code: 'DB_DUPLICATE_ERROR' });
      
      expect(handleDatabaseError({ code: 'UNKNOWN' }))
        .toEqual({ message: 'Database error', code: 'DB_UNKNOWN_ERROR' });
    });
  });

  describe('Network Error Handling', () => {
    it('should handle timeout errors', () => {
      const isTimeoutError = (error: any): boolean => {
        if (!error) return false;
        return Boolean(error.code === 'ETIMEDOUT' || (error.message && error.message.includes('timeout')));
      };

      expect(isTimeoutError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isTimeoutError({ message: 'Request timeout' })).toBe(true);
      expect(isTimeoutError({ code: 'ECONNREFUSED' })).toBe(false);
      expect(isTimeoutError({})).toBe(false);
      expect(isTimeoutError(null)).toBe(false);
      expect(isTimeoutError(undefined)).toBe(false);
    });

    it('should handle retry logic', () => {
      const shouldRetry = (error: any, attempt: number): boolean => {
        const retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
        return retryableErrors.includes(error.code) && attempt < 3;
      };

      expect(shouldRetry({ code: 'ECONNRESET' }, 1)).toBe(true);
      expect(shouldRetry({ code: 'ECONNRESET' }, 3)).toBe(false);
      expect(shouldRetry({ code: 'ER_DUP_ENTRY' }, 1)).toBe(false);
    });
  });

  describe('Async Error Handling', () => {
    it('should handle async function errors', async () => {
      const asyncOperation = async (shouldFail: boolean): Promise<string> => {
        if (shouldFail) {
          throw new Error('Async operation failed');
        }
        return 'Success';
      };

      const safeAsyncOperation = async (shouldFail: boolean): Promise<{ 
        success: boolean; 
        data?: string; 
        error?: string 
      }> => {
        try {
          const result = await asyncOperation(shouldFail);
          return { success: true, data: result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      };

      const successResult = await safeAsyncOperation(false);
      expect(successResult).toEqual({ success: true, data: 'Success' });

      const failureResult = await safeAsyncOperation(true);
      expect(failureResult).toEqual({ 
        success: false, 
        error: 'Async operation failed' 
      });
    });
  });
});

describe('Performance Utilities', () => {
  describe('Debounce Function', () => {
    it('should debounce function calls', async () => {
      vi.useFakeTimers();
      
      let callCount = 0;
      const debouncedFn = vi.fn(() => callCount++);
      
      const debounce = (fn: Function, delay: number) => {
        let timeoutId: NodeJS.Timeout;
        return (...args: any[]) => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => fn(...args), delay);
        };
      };
      
      const debounced = debounce(debouncedFn, 100);
      
      // Call multiple times quickly
      debounced();
      debounced();
      debounced();
      
      // Should not be called yet
      expect(debouncedFn).not.toHaveBeenCalled();
      
      // Fast forward time
      vi.advanceTimersByTime(100);
      
      // Should be called once
      expect(debouncedFn).toHaveBeenCalledTimes(1);
      expect(callCount).toBe(1);
      
      vi.useRealTimers();
    });
  });

  describe('Throttle Function', () => {
    it('should throttle function calls', async () => {
      vi.useFakeTimers();
      
      let callCount = 0;
      const throttledFn = vi.fn(() => callCount++);
      
      const throttle = (fn: Function, limit: number) => {
        let inThrottle = false;
        return (...args: any[]) => {
          if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
          }
        };
      };
      
      const throttled = throttle(throttledFn, 100);
      
      // Call multiple times quickly
      throttled();
      throttled();
      throttled();
      
      // Should be called once immediately
      expect(throttledFn).toHaveBeenCalledTimes(1);
      
      // Fast forward time
      vi.advanceTimersByTime(100);
      
      // Call again
      throttled();
      
      // Should be called again
      expect(throttledFn).toHaveBeenCalledTimes(2);
      
      vi.useRealTimers();
    });
  });
});
