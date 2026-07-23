import { db } from "../db/client";
import { activityLogs, notifications } from "../db/schema";
import { ActivityAction, NotificationType } from "../constants/hrEnums";

/**
 * Append an entry to the global activity log. Best-effort: never throws so it can
 * be fired from inside a request handler without risking the main operation.
 */
export async function logActivity(opts: {
  userId?: number | null;
  action: number; // ActivityAction.*
  module: string;
  referenceId?: number | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      userId: opts.userId ?? null,
      action: opts.action,
      module: opts.module,
      referenceId: opts.referenceId ?? null,
      oldValue: opts.oldValue ?? null,
      newValue: opts.newValue ?? null,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
    });
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}

/**
 * Create a notification row for a user. Best-effort (never throws). `userId` may be
 * null/undefined (e.g. an employee without a linked auth account) in which case it
 * is silently skipped since notifications require a user.
 */
export async function notify(opts: {
  userId?: number | null;
  title: string;
  message?: string | null;
  type?: number; // NotificationType.*
  module?: string | null;
  referenceId?: number | null;
}): Promise<void> {
  if (!opts.userId) return;
  try {
    await db.insert(notifications).values({
      userId: opts.userId,
      title: opts.title,
      message: opts.message ?? null,
      type: opts.type ?? NotificationType.INFO,
      module: opts.module ?? null,
      referenceId: opts.referenceId ?? null,
      isRead: 0,
    });
  } catch (err) {
    console.error("notify failed:", err);
  }
}

export { ActivityAction, NotificationType };
