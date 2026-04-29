/**
 * Custom error classes for different error scenarios
 * Provides better error handling and type safety
 */

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: number | string) {
    const message = id ? `${resource} dengan ID ${id} tidak ditemukan` : `${resource} tidak ditemukan`;
    super(message, 404, 'NOT_FOUND', { resource, id });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 500, 'DATABASE_ERROR', { originalError: originalError?.message });
  }
}

export class DuplicateError extends ConflictError {
  constructor(field: string, value: string) {
    super(`${field} "${value}" sudah digunakan`, { field, value });
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Terlalu banyak permintaan') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service} error: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', { service });
  }
}
