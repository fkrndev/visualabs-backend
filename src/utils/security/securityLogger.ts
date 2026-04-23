// Security logging utility for tracking security events
// In production, consider using a proper logging service like Winston, Pino, or cloud logging

export enum SecurityEventType {
    LOGIN_SUCCESS = "LOGIN_SUCCESS",
    LOGIN_FAILED = "LOGIN_FAILED",
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    SUSPICIOUS_ACTIVITY = "SUSPICIOUS_ACTIVITY",
    LOGOUT = "LOGOUT",
    TOKEN_REFRESH = "TOKEN_REFRESH",
    OAUTH_SUCCESS = "OAUTH_SUCCESS",
    OAUTH_FAILED = "OAUTH_FAILED",
}

export interface SecurityLogEntry {
    eventType: SecurityEventType;
    userId?: number;
    customerId?: number;
    identifier?: string; // email, phone, or username
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, any>;
}

export function logSecurityEvent(entry: SecurityLogEntry): void {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ...entry,
    };

    // In development, log to console
    if (process.env.NODE_ENV !== "production") {
        console.log(`[SECURITY] ${logEntry.eventType}`, JSON.stringify(logEntry, null, 2));
    }

    // In production, send to logging service
    // TODO: Integrate with Winston, Pino, or cloud logging service
    // Example: securityLogger.info(logEntry);
}

export function logLoginSuccess(userId: number | undefined, customerId: number | undefined, identifier: string, ipAddress?: string, userAgent?: string): void {
    logSecurityEvent({
        eventType: SecurityEventType.LOGIN_SUCCESS,
        userId,
        customerId,
        identifier,
        ipAddress,
        userAgent,
    });
}

export function logLoginFailed(identifier: string, reason: string, ipAddress?: string, userAgent?: string): void {
    logSecurityEvent({
        eventType: SecurityEventType.LOGIN_FAILED,
        identifier,
        ipAddress,
        userAgent,
        details: {reason},
    });
}

export function logAccountLocked(identifier: string, attempts: number, lockDuration: number, ipAddress?: string): void {
    logSecurityEvent({
        eventType: SecurityEventType.ACCOUNT_LOCKED,
        identifier,
        ipAddress,
        details: {attempts, lockDuration},
    });
}

export function logRateLimitExceeded(identifier: string, ipAddress?: string, userAgent?: string): void {
    logSecurityEvent({
        eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
        identifier,
        ipAddress,
        userAgent,
    });
}

export function logSuspiciousActivity(description: string, details?: Record<string, any>, ipAddress?: string): void {
    logSecurityEvent({
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        ipAddress,
        details: {description, ...details},
    });
}

export function logLogout(userId: number | undefined, customerId: number | undefined, ipAddress?: string): void {
    logSecurityEvent({
        eventType: SecurityEventType.LOGOUT,
        userId,
        customerId,
        ipAddress,
    });
}

export function logTokenRefresh(userId: number | undefined, customerId: number | undefined, ipAddress?: string): void {
    logSecurityEvent({
        eventType: SecurityEventType.TOKEN_REFRESH,
        userId,
        customerId,
        ipAddress,
    });
}

export function logOAuthSuccess(provider: string, userId: number | undefined, customerId: number | undefined, ipAddress?: string): void {
    logSecurityEvent({
        eventType: SecurityEventType.OAUTH_SUCCESS,
        userId,
        customerId,
        ipAddress,
        details: {provider},
    });
}

export function logOAuthFailed(provider: string, reason: string, ipAddress?: string): void {
    logSecurityEvent({
        eventType: SecurityEventType.OAUTH_FAILED,
        ipAddress,
        details: {provider, reason},
    });
}
