/**
 * XSS (Cross-Site Scripting) sanitization utilities
 * Helps prevent XSS attacks by sanitizing user-generated content
 */

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(unsafe: string): string {
    if (typeof unsafe !== "string") return unsafe;
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Sanitize an object by escaping all string values recursively
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
    if (!obj || typeof obj !== "object") return obj;

    const sanitized: Record<string, any> = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];

            if (typeof value === "string") {
                // Escape string values
                sanitized[key] = escapeHtml(value);
            } else if (typeof value === "object" && value !== null) {
                // Recursively sanitize nested objects
                sanitized[key] = sanitizeObject(value);
            } else {
                // Keep other types as-is
                sanitized[key] = value;
            }
        }
    }

    return sanitized as T;
}

/**
 * Sanitize specific fields in an object (whitelist approach)
 * Only sanitizes the specified fields
 */
export function sanitizeFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
    if (!obj || typeof obj !== "object") return obj;

    const sanitized = {...obj};

    for (const field of fields) {
        const value = sanitized[field];
        if (typeof value === "string") {
            (sanitized as any)[field] = escapeHtml(value);
        } else if (typeof value === "object" && value !== null) {
            (sanitized as any)[field] = sanitizeObject(value);
        }
    }

    return sanitized;
}

/**
 * Sanitize user profile data specifically
 */
export function sanitizeUserProfile(profile: any): any {
    if (!profile) return profile;

    const fieldsToSanitize: (keyof any)[] = ["name", "email", "phone", "username", "address", "city", "province", "country"];

    return sanitizeFields(profile, fieldsToSanitize);
}
