import {randomBytes} from "crypto";
import {users, customers} from "../../db/schema";

/**
 * Parse JWT expiry time string to seconds
 * Supports formats: "1h", "30m", "60s", "7d" or plain number
 */
export function parseExpiry(value: string | undefined): number {
    if (!value) return 3600;
    const match = value.match(/^(\d+)([smhd])$/i);
    if (!match) return Number(value) || 3600;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const unitMap: Record<string, number> = {
        s: 1,
        m: 60,
        h: 3600,
        d: 86400,
    };
    return amount * (unitMap[unit] ?? 3600);
}

/**
 * Generate a cryptographically secure random refresh token
 */
export function generateRefreshToken(): string {
    return randomBytes(48).toString("hex");
}

/**
 * Add seconds to a date
 */
export function addSeconds(date: Date, seconds: number): Date {
    return new Date(date.getTime() + seconds * 1000);
}

/**
 * Resolve identifier to database column and normalized value for users
 * Handles email, phone, and username
 */
export function resolveUserIdentifierWhere(identifier: string) {
    if (identifier.includes("@")) {
        // Match cleanEmail logic: only remove dots from local part, not domain
        const trimmed = identifier.trim().toLowerCase();
        const [local, domain] = trimmed.split('@');
        const normalizedLocal = local.replace(/\./g, '');
        return {
            column: users.email,
            value: `${normalizedLocal}@${domain}`,
        };
    }

    const phoneCandidate = identifier.replace(/[\s-]/g, "");
    if (/^\+?\d+$/.test(phoneCandidate)) {
        // Strip + and replace leading 0 with 62 to match cleanPhone normalization
        let normalizedPhone = phoneCandidate.replace(/^\+/, "");
        if (normalizedPhone.startsWith("0")) {
            normalizedPhone = "62" + normalizedPhone.slice(1);
        }
        return {
            column: users.phone,
            value: normalizedPhone,
        };
    }

    return {
        column: users.username,
        value: identifier.trim(),
    };
}

/**
 * Resolve identifier to database column and normalized value for customers
 * Handles email, phone, and username
 */
export function resolveCustomerIdentifierWhere(identifier: string) {
    if (identifier.includes("@")) {
        // Match cleanEmail logic: only remove dots from local part, not domain
        const trimmed = identifier.trim().toLowerCase();
        const [local, domain] = trimmed.split('@');
        const normalizedLocal = local.replace(/\./g, '');
        return {
            column: customers.email,
            value: `${normalizedLocal}@${domain}`,
        };
    }

    const phoneCandidate = identifier.replace(/[\s-]/g, "");
    if (/^\+?\d+$/.test(phoneCandidate)) {
        // Strip + and replace leading 0 with 62 to match cleanPhone normalization
        let normalizedPhone = phoneCandidate.replace(/^\+/, "");
        if (normalizedPhone.startsWith("0")) {
            normalizedPhone = "62" + normalizedPhone.slice(1);
        }
        return {
            column: customers.phone,
            value: normalizedPhone,
        };
    }

    return {
        column: customers.username,
        value: identifier.trim(),
    };
}
