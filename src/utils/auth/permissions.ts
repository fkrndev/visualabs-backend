// Role definitions — MUST stay in sync with the frontend ROLE_OPTIONS
// (v-auto-frontend src/routes/users/admin/columns.ts). These IDs are the raw
// values stored in `users.role` (0–7).
export const ROLE_DEV = 0; // Developer / super admin
export const ROLE_ADMIN = 1; // Administrator
export const ROLE_OWNER = 2; // Business owner
export const ROLE_CSS = 3; // Customer Support Specialist
export const ROLE_ADVERTISER = 4; // Ad manager (data-scoped via advertiserScope)
export const ROLE_HRD = 5; // Human Resources
export const ROLE_AKUNTAN = 6; // Accountant
export const ROLE_HEAD_ADVERTISER = 7; // Head of advertising (management level)

/**
 * Access model (kept intentionally simple):
 *   - Any logged-in user may perform any normal action (e.g. customer CRUD).
 *   - Only Dev / Admin / Owner / Head Advertiser are "management level":
 *       • users list + CRUD
 *       • /chrome-histories (admin list/delete)
 *       • /team-insights (admin)
 *       • full data scope in ads monitoring (advertiserScope / adsMonitoring);
 *         other roles are scoped to their own subscriptions.
 *
 * There is no fine-grained permission-string system anymore.
 */
export function isManagementLevel(role: number | null | undefined): boolean {
  return (
    role === ROLE_DEV ||
    role === ROLE_ADMIN ||
    role === ROLE_OWNER ||
    role === ROLE_HEAD_ADVERTISER
  );
}
