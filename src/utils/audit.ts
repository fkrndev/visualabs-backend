import { db } from '../db/client';
import { auditLogs } from '../db/schema';
import { createLogger } from './logger';

const logger = createLogger('Audit');

export interface AuditLogPayload {
  userId?: number;
  customerId?: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'BULK_DELETE' | 'BULK_UPDATE';
  entityType: string;
  entityId?: number;
  changes?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Mask sensitive data for logging
 */
function maskSensitiveData(data: any): any {
  if (!data) return data;

  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'apiSecret', 'creditCard', 'ssn', 'fbid', 'googleId'];

  if (typeof data === 'string') {
    return data.length > 4 ? data.substring(0, 2) + '***' + data.substring(data.length - 2) : '***';
  }

  if (typeof data === 'object') {
    const masked: any = {};
    for (const key in data) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some((field) => lowerKey.includes(field));

      if (isSensitive) {
        masked[key] = '***MASKED***';
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        masked[key] = maskSensitiveData(data[key]);
      } else {
        masked[key] = data[key];
      }
    }
    return masked;
  }

  return data;
}

export async function logAuditEvent(payload: AuditLogPayload) {
  try {
    // Mask sensitive data before logging
    const maskedChanges = payload.changes ? maskSensitiveData(payload.changes) : null;

    await db.insert(auditLogs).values({
      userId: payload.userId || null,
      customerId: payload.customerId || null,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId || null,
      changes: maskedChanges,
      ipAddress: payload.ipAddress || null,
      userAgent: payload.userAgent || null,
    });
  } catch (error) {
    logger.error('Failed to log audit event', error as Error, { payload });
    // Don't throw - audit logging should not break the main flow
  }
}

export function getClientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
         c.req.header('x-real-ip') ||
         c.req.header('cf-connecting-ip') ||
         'unknown';
}

export function getUserAgent(c: any): string {
  return c.req.header('user-agent') || 'unknown';
}
