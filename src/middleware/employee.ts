import type { Context, MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { employees } from "../db/schema";
import { getHrUserId } from "./hrAccess";
import { isManagementLevel, ROLE_HRD, ROLE_AKUNTAN } from "../utils/auth/permissions";

export type EmployeeContext = {
  employeeId: number;
  employee: typeof employees.$inferSelect;
};

/**
 * Resolve the employee record for the currently authenticated user (single-tenant).
 * Must run AFTER `requireAuth`.
 *
 * Maps the auth user id (JWT `sub`) -> `employees` row (via `employees.user_id`).
 * This is what lets a logged-in user act on THEIR OWN data in the self-service
 * portal without ever passing an `employeeId` from the client.
 *
 * Attaches the resolved context to `c.var.employee` (EmployeeContext).
 */
export const requireEmployeeContext: MiddlewareHandler = async (c, next) => {
  const userId = getHrUserId(c);
  if (!userId || Number.isNaN(userId)) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  const [emp] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);

  if (!emp) {
    return c.json(
      {
        success: false,
        message:
          "Akun ini belum ditautkan ke data karyawan. Hubungi admin/HR untuk mengaitkan akun Anda.",
      },
      403,
    );
  }

  c.set("employee", { employeeId: emp.id, employee: emp } satisfies EmployeeContext);
  await next();
};

export const getEmployee = (c: Context): EmployeeContext => {
  const e = c.get("employee") as EmployeeContext | undefined;
  if (!e) throw new Error("Employee context missing. Did you forget requireEmployeeContext?");
  return e;
};

/**
 * True if the role can approve requests in the self-service portal.
 * Management (Dev/Admin/Owner/Head Advertiser) + HRD + Akuntan may approve;
 * plain roles cannot.
 */
export const isApprover = (role: number | null | undefined): boolean =>
  isManagementLevel(role) || role === ROLE_HRD || role === ROLE_AKUNTAN;
