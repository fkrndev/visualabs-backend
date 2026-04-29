/**
 * Input sanitization utilities to prevent XSS attacks
 */

/**
 * Sanitize string input by removing potentially dangerous characters
 */
export function sanitizeString(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  
  // Remove common XSS attack patterns
  let sanitized = input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .trim();
  
  return sanitized;
}

/**
 * Sanitize email input
 */
export function sanitizeEmail(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  
  // Only allow valid email characters
  const sanitized = input
    .toLowerCase()
    .replace(/[^\w\.\-@]/g, '')
    .trim();
  
  return sanitized || null;
}

/**
 * Sanitize phone number input
 */
export function sanitizePhone(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  
  // Only allow digits, +, -, space, (, )
  const sanitized = input
    .replace(/[^\d\+\-\s\(\)]/g, '')
    .trim();
  
  return sanitized || null;
}

/**
 * Sanitize username input
 */
export function sanitizeUsername(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  
  // Only allow alphanumeric, underscore, and hyphen
  const sanitized = input
    .toLowerCase()
    .replace(/[^\w\-]/g, '')
    .trim();
  
  return sanitized || null;
}

/**
 * Sanitize object by recursively sanitizing all string values
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized: any = { ...obj };

  for (const key in sanitized) {
    if (sanitized[key] === null || sanitized[key] === undefined) {
      continue;
    }

    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key]);
    } else if (typeof sanitized[key] === 'object' && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeObject(sanitized[key]);
    } else if (Array.isArray(sanitized[key])) {
      sanitized[key] = sanitized[key].map((item: any) => {
        if (typeof item === 'string') {
          return sanitizeString(item);
        } else if (typeof item === 'object' && item !== null) {
          return sanitizeObject(item);
        }
        return item;
      });
    }
  }

  return sanitized as T;
}

/**
 * Validate and sanitize HTML content (for rich text fields)
 * This is a basic implementation - for production, consider using a library like DOMPurify
 */
export function sanitizeHtml(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  
  // Remove script tags and event handlers
  let sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '');
  
  return sanitized;
}
