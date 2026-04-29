import type { Context, Next } from 'hono';

/**
 * Security headers middleware
 * Adds various security headers to all responses
 */
export function securityHeaders() {
  return async (c: Context, next: Next) => {
    await next();

    // Content Security Policy
    c.header('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none';"
    );

    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // Enable XSS protection
    c.header('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy (formerly Feature-Policy)
    c.header('Permissions-Policy', 
      'geolocation=(), ' +
      'microphone=(), ' +
      'camera=(), ' +
      'payment=()'
    );

    // HSTS (HTTP Strict Transport Security) - only in production
    if (process.env.NODE_ENV === 'production') {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Remove server information
    c.header('Server', '');

    // Prevent caching of sensitive data
    if (c.req.method === 'POST' || c.req.method === 'PUT' || c.req.method === 'DELETE') {
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
    }
  };
}

/**
 * CORS middleware for cross-origin requests
 */
export function corsHeaders(allowedOrigins: string[] = ['*']) {
  return async (c: Context, next: Next) => {
    await next();

    const origin = c.req.header('Origin');
    const isAllowed = allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin));

    if (isAllowed) {
      c.header('Access-Control-Allow-Origin', origin || '*');
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Access-Control-Max-Age', '86400');
    }

    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      return c.text('', 204 as any);
    }
  };
}
