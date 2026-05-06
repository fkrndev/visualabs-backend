import type { Context, Next } from 'hono';

/**
 * Security headers middleware
 * Adds various security headers to all responses
 * All features can be controlled via environment variables (default: off)
 */
export function securityHeaders() {
  return async (c: Context, next: Next) => {
    await next();

    // Content Security Policy - disabled by default
    if (process.env.ENABLE_CSP === 'true') {
      const cspPolicy = process.env.CSP_POLICY || 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none';";
      c.header('Content-Security-Policy', cspPolicy);
    }

    // Prevent clickjacking - disabled by default
    if (process.env.ENABLE_X_FRAME_OPTIONS === 'true') {
      c.header('X-Frame-Options', process.env.X_FRAME_OPTIONS || 'DENY');
    }

    // Prevent MIME type sniffing - disabled by default
    if (process.env.ENABLE_X_CONTENT_TYPE_OPTIONS === 'true') {
      c.header('X-Content-Type-Options', 'nosniff');
    }

    // Enable XSS protection - disabled by default
    if (process.env.ENABLE_X_XSS_PROTECTION === 'true') {
      c.header('X-XSS-Protection', '1; mode=block');
    }

    // Referrer policy - disabled by default
    if (process.env.ENABLE_REFERRER_POLICY === 'true') {
      c.header('Referrer-Policy', process.env.REFERRER_POLICY || 'strict-origin-when-cross-origin');
    }

    // Permissions policy (formerly Feature-Policy) - disabled by default
    if (process.env.ENABLE_PERMISSIONS_POLICY === 'true') {
      const permissionsPolicy = process.env.PERMISSIONS_POLICY || 
        'geolocation=(), ' +
        'microphone=(), ' +
        'camera=(), ' +
        'payment=()';
      c.header('Permissions-Policy', permissionsPolicy);
    }

    // HSTS (HTTP Strict Transport Security) - disabled by default, only in production if enabled
    if (process.env.ENABLE_HSTS === 'true' && process.env.NODE_ENV === 'production') {
      const hstsPolicy = process.env.HSTS_POLICY || 'max-age=31536000; includeSubDomains; preload';
      c.header('Strict-Transport-Security', hstsPolicy);
    }

    // Remove server information - disabled by default
    if (process.env.ENABLE_REMOVE_SERVER === 'true') {
      c.header('Server', '');
    }

    // Prevent caching of sensitive data - disabled by default
    if (process.env.ENABLE_CACHE_CONTROL === 'true') {
      if (c.req.method === 'POST' || c.req.method === 'PUT' || c.req.method === 'DELETE') {
        c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        c.header('Pragma', 'no-cache');
        c.header('Expires', '0');
      }
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
