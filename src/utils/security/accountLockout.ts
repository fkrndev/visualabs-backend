// Database-backed account lockout mechanism to prevent brute force attacks
// Tracks failed login attempts per user/IP and locks account after threshold

import {db} from "../../db/client";
import {accountLockoutEntries} from "../../db/schema";
import {eq, and, isNull, gt} from "drizzle-orm";
import {createLogger} from "../logger";

const logger = createLogger('AccountLockout');

interface LockoutOptions {
    maxAttempts: number; // Max failed attempts before lockout
    lockDurationMs: number; // How long to lock account
    resetDurationMs: number; // How long before attempts reset
}

const DEFAULT_OPTIONS: LockoutOptions = {
    maxAttempts: parseInt(process.env.ACCOUNT_LOCKOUT_MAX_ATTEMPTS || '5'),
    lockDurationMs: 15 * 60 * 1000, // 15 minutes
    resetDurationMs: 15 * 60 * 1000, // 15 minutes
};

export async function checkLockout(
    identifier: string,
    options: LockoutOptions = DEFAULT_OPTIONS,
): Promise<{
    isLocked: boolean;
    remainingAttempts: number;
    lockRemainingTime: number;
}> {
    const now = new Date();

    try {
        const existing = await db.query.accountLockoutEntries.findFirst({
            where: eq(accountLockoutEntries.identifier, identifier),
        });

        // No entry or lock expired, create/reset
        if (!existing || (existing.lockUntil && new Date(existing.lockUntil) <= now)) {
            if (existing) {
                // Reset the entry
                await db
                    .update(accountLockoutEntries)
                    .set({
                        attempts: 0,
                        lockUntil: null,
                        updatedAt: now,
                    })
                    .where(eq(accountLockoutEntries.identifier, identifier));
            } else {
                // Create new entry
                await db.insert(accountLockoutEntries).values({
                    identifier,
                    attempts: 0,
                    lockUntil: null,
                });
            }

            return {
                isLocked: false,
                remainingAttempts: options.maxAttempts,
                lockRemainingTime: 0,
            };
        }

        // Check if currently locked
        if (existing.lockUntil && new Date(existing.lockUntil) > now) {
            return {
                isLocked: true,
                remainingAttempts: 0,
                lockRemainingTime: new Date(existing.lockUntil).getTime() - now.getTime(),
            };
        }

        // Not locked, return remaining attempts
        return {
            isLocked: false,
            remainingAttempts: options.maxAttempts - existing.attempts,
            lockRemainingTime: 0,
        };
    } catch (error) {
        // On database error, allow login to proceed (fail-open)
        logger.error('Account lockout check error', error);
        return {
            isLocked: false,
            remainingAttempts: options.maxAttempts,
            lockRemainingTime: 0,
        };
    }
}

export async function recordFailedAttempt(
    identifier: string,
    options: LockoutOptions = DEFAULT_OPTIONS,
): Promise<{
    isLocked: boolean;
    remainingAttempts: number;
    lockRemainingTime: number;
}> {
    const now = new Date();

    try {
        const existing = await db.query.accountLockoutEntries.findFirst({
            where: eq(accountLockoutEntries.identifier, identifier),
        });

        if (!existing) {
            // Create new entry with 1 attempt
            await db.insert(accountLockoutEntries).values({
                identifier,
                attempts: 1,
                lockUntil: null,
            });

            return {
                isLocked: false,
                remainingAttempts: options.maxAttempts - 1,
                lockRemainingTime: 0,
            };
        }

        // Increment attempts
        const newAttempts = existing.attempts + 1;
        const lockUntil = newAttempts >= options.maxAttempts ? new Date(now.getTime() + options.lockDurationMs) : existing.lockUntil;

        await db
            .update(accountLockoutEntries)
            .set({
                attempts: newAttempts,
                lockUntil,
                updatedAt: now,
            })
            .where(eq(accountLockoutEntries.identifier, identifier));

        // Check if should lock
        if (newAttempts >= options.maxAttempts) {
            return {
                isLocked: true,
                remainingAttempts: 0,
                lockRemainingTime: options.lockDurationMs,
            };
        }

        return {
            isLocked: false,
            remainingAttempts: options.maxAttempts - newAttempts,
            lockRemainingTime: 0,
        };
    } catch (error) {
        // On database error, allow login to proceed (fail-open)
        logger.error('Account lockout record error', error);
        return {
            isLocked: false,
            remainingAttempts: options.maxAttempts - 1,
            lockRemainingTime: 0,
        };
    }
}

export async function recordSuccessfulAttempt(identifier: string): Promise<void> {
    try {
        const existing = await db.query.accountLockoutEntries.findFirst({
            where: eq(accountLockoutEntries.identifier, identifier),
        });

        if (existing) {
            // Reset attempts on successful login
            await db
                .update(accountLockoutEntries)
                .set({
                    attempts: 0,
                    lockUntil: null,
                    updatedAt: new Date(),
                })
                .where(eq(accountLockoutEntries.identifier, identifier));
        }
    } catch (error) {
        logger.error('Account lockout reset error', error);
    }
}

// Cleanup old entries periodically to prevent database bloat
setInterval(async () => {
    try {
        const now = new Date();
        // Delete entries that are not locked and haven't been updated recently (older than 30 days)
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        await db.delete(accountLockoutEntries).where(and(isNull(accountLockoutEntries.lockUntil), gt(accountLockoutEntries.updatedAt, thirtyDaysAgo)));
    } catch (error) {
        logger.error('Account lockout cleanup error', error);
    }
}, 300000); // Cleanup every 5 minutes
