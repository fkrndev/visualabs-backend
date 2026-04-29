// Role definitions
export const ROLE_ADMIN = 1;
export const ROLE_MANAGER = 2;
export const ROLE_STAFF = 3;
export const ROLE_VIEWER = 4;

// Permission definitions
export const PERMISSION = {
  // Customer permissions
  CUSTOMER_VIEW: 'customer:view',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_UPDATE: 'customer:update',
  CUSTOMER_DELETE: 'customer:delete',
  CUSTOMER_RESTORE: 'customer:restore',
  CUSTOMER_EXPORT: 'customer:export',
  CUSTOMER_BULK_DELETE: 'customer:bulk_delete',
  CUSTOMER_BULK_UPDATE: 'customer:bulk_update',

  // User permissions
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  // Admin permissions
  ADMIN_VIEW: 'admin:view',
  ADMIN_CREATE: 'admin:create',
  ADMIN_UPDATE: 'admin:update',
  ADMIN_DELETE: 'admin:delete',
} as const;

// Role permissions mapping
export const ROLE_PERMISSIONS: Record<number, string[]> = {
  [ROLE_ADMIN]: [
    // All permissions
    ...Object.values(PERMISSION),
  ],
  [ROLE_MANAGER]: [
    PERMISSION.CUSTOMER_VIEW,
    PERMISSION.CUSTOMER_CREATE,
    PERMISSION.CUSTOMER_UPDATE,
    PERMISSION.CUSTOMER_DELETE,
    PERMISSION.CUSTOMER_RESTORE,
    PERMISSION.CUSTOMER_EXPORT,
    PERMISSION.CUSTOMER_BULK_DELETE,
    PERMISSION.CUSTOMER_BULK_UPDATE,
    PERMISSION.USER_VIEW,
  ],
  [ROLE_STAFF]: [
    PERMISSION.CUSTOMER_VIEW,
    PERMISSION.CUSTOMER_CREATE,
    PERMISSION.CUSTOMER_UPDATE,
  ],
  [ROLE_VIEWER]: [
    PERMISSION.CUSTOMER_VIEW,
  ],
};

export function hasPermission(userRole: number, requiredPermission: string): boolean {
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(requiredPermission);
}

export function requirePermission(requiredPermission: string) {
  return (userRole: number): boolean => {
    return hasPermission(userRole, requiredPermission);
  };
}
