// Database-backed rate limiting middleware for Hono
// Uses database to persist rate limit data across multiple server instances

import { db } from "../db/client";
import { rateLimitEntries } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxRequests, skipSuccessfulRequests = false } = options;

  return async (c: any, next: any) => {
    const identifier = getClientIdentifier(c);
    const now = new Date();
    const resetTime = new Date(now.getTime() + windowMs);

    try {
      // Get existing entry or create new one
      const existing = await db.query.rateLimitEntries.findFirst({
        where: eq(rateLimitEntries.identifier, identifier),
      });

      let count = 1;
      let entryResetTime = resetTime;

      if (existing) {
        // Check if window has expired
        if (new Date(existing.resetTime) <= now) {
          // Reset the entry
          await db
            .update(rateLimitEntries)
            .set({
              count: 1,
              resetTime,
              updatedAt: now,
            })
            .where(eq(rateLimitEntries.identifier, identifier));
        } else {
          // Increment count
          count = existing.count + 1;
          entryResetTime = new Date(existing.resetTime);

          await db
            .update(rateLimitEntries)
            .set({
              count,
              updatedAt: now,
            })
            .where(eq(rateLimitEntries.identifier, identifier));
        }
      } else {
        // Create new entry
        await db.insert(rateLimitEntries).values({
          identifier,
          count: 1,
          resetTime,
        });
      }

      // Check if limit exceeded
      if (count > maxRequests) {
        const resetSeconds = Math.ceil((entryResetTime.getTime() - now.getTime()) / 1000);
        c.header('X-RateLimit-Limit', maxRequests.toString());
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', Math.floor(entryResetTime.getTime() / 1000).toString());
        c.header('Retry-After', resetSeconds.toString());

        return c.json(
          {
            success: false,
            message: 'Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat.',
          },
          429,
        );
      }

      // Set rate limit headers
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', (maxRequests - count).toString());
      c.header('X-RateLimit-Reset', Math.floor(entryResetTime.getTime() / 1000).toString());

      await next();

      // Optionally skip counting successful requests
      if (skipSuccessfulRequests && c.res.status < 400) {
        await db
          .update(rateLimitEntries)
          .set({
            count: count - 1,
            updatedAt: new Date(),
          })
          .where(eq(rateLimitEntries.identifier, identifier));
      }
    } catch (error) {
      // On database error, allow request to proceed (fail-open)
      console.error('Rate limit database error:', error);
      await next();
    }
  };
}

function getClientIdentifier(c: any): string {
  // Try to get IP from various headers (common in reverse proxy setups)
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to connection info
  const connInfo = c.req.raw?.connInfo;
  if (connInfo?.remoteAddress) {
    return connInfo.remoteAddress;
  }

  // Ultimate fallback
  return 'unknown';
}

// Cleanup old entries periodically to prevent database bloat
setInterval(async () => {
  try {
    const now = new Date();
    await db
      .delete(rateLimitEntries)
      .where(gt(rateLimitEntries.resetTime, now));
  } catch (error) {
    console.error('Rate limit cleanup error:', error);
  }
}, 300000); // Cleanup every 5 minutes
