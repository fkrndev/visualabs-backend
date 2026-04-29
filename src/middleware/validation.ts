import type { Context, Next } from 'hono';

/**
 * Middleware to validate that a route parameter is a valid number
 * Usage: router.get('/:id', validateIdParam('id'), async (c) => { ... })
 */
export function validateIdParam(paramName: string = 'id') {
  return async (c: Context, next: Next) => {
    const paramValue = c.req.param(paramName);
    const id = Number(paramValue);
    
    if (Number.isNaN(id) || id <= 0) {
      return c.json({ 
        success: false, 
        message: `${paramName} tidak valid` 
      }, 400);
    }
    
    // Store the validated ID in context for use in handlers
    c.set('validatedId', id);
    
    await next();
  };
}

/**
 * Helper to get validated ID from context
 * Should be used after validateIdParam middleware
 */
export function getValidatedId(c: Context): number {
  return c.get('validatedId') as number;
}
