import { Context, Next } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';

const CSRF_SECRET = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production';
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * Generate a random CSRF token
 */
function generateToken(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const signature = Buffer.from(`${timestamp}:${random}:${CSRF_SECRET}`).toString('base64');
  return signature;
}

/**
 * Verify a CSRF token
 */
function verifyToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return false;
    
    const [timestamp, random, secret] = parts;
    if (secret !== CSRF_SECRET) return false;
    
    // Check if token is not too old (1 hour)
    const tokenTime = parseInt(timestamp, 10);
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    return now - tokenTime < maxAge;
  } catch {
    return false;
  }
}

/**
 * CSRF Protection Middleware
 * - Generates and sets CSRF token cookie for GET requests
 * - Validates CSRF token for non-GET requests
 * - Disabled in development if DISABLE_CSRF=true
 */
export async function csrfProtection(c: Context, next: Next) {
  // Skip CSRF protection if disabled (for testing/development)
  if (process.env.DISABLE_CSRF === 'true') {
    await next();
    return;
  }

  const method = c.req.method;

  // For GET requests, generate and set CSRF token
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    const token = generateToken();
    setCookie(c, CSRF_COOKIE_NAME, token, {
      httpOnly: process.env.NODE_ENV === 'production',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600, // 1 hour
      path: '/',
    });
    c.set('csrfToken', token);
    c.header(CSRF_HEADER_NAME, token); // Also return in header for easier access
    await next();
    return;
  }

  // For state-changing requests, validate CSRF token
  const cookieToken = getCookie(c, CSRF_COOKIE_NAME);
  const headerToken = c.req.header(CSRF_HEADER_NAME);

  if (!cookieToken && !headerToken) {
    return c.json(
      {
        success: false,
        message: 'CSRF token missing. Please refresh the page and try again.',
      },
      403
    );
  }

  const tokenToValidate = (headerToken || cookieToken) as string;

  if (!verifyToken(tokenToValidate)) {
    return c.json(
      {
        success: false,
        message: 'Invalid CSRF token. Please refresh the page and try again.',
      },
      403
    );
  }

  // Generate new token after successful validation (token rotation)
  const newToken = generateToken();
  setCookie(c, CSRF_COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600,
    path: '/',
  });
  c.set('csrfToken', newToken);

  await next();
}

/**
 * Get CSRF token from context (for use in handlers)
 */
export function getCsrfToken(c: Context): string | undefined {
  return c.get('csrfToken');
}
