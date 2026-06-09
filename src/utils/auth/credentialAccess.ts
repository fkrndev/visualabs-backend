import { isManagementLevel } from './permissions';
import { CREDENTIAL_VISIBILITY, CREDENTIAL_PRINCIPAL, CREDENTIAL_PERMISSION } from '../../db/schema';

export type AccessUser = { id: number; role: number | null | undefined };

export type CredentialLike = {
  ownerId: number;
  visibility: number;
};

export type ShareLike = {
  principalType: number;
  principalId: number;
  permission: number;
};

function matchingShares(user: AccessUser, shares: ShareLike[]): ShareLike[] {
  return shares.filter(
    (s) =>
      (s.principalType === CREDENTIAL_PRINCIPAL.USER && s.principalId === user.id) ||
      (s.principalType === CREDENTIAL_PRINCIPAL.ROLE && s.principalId === user.role),
  );
}

/** May the user see this item at all (metadata + reveal)? */
export function canView(user: AccessUser, cred: CredentialLike, shares: ShareLike[]): boolean {
  if (user.id === cred.ownerId) return true;
  if (isManagementLevel(user.role)) return true; // management override
  if (cred.visibility === CREDENTIAL_VISIBILITY.TEAM) return true;
  if (cred.visibility === CREDENTIAL_VISIBILITY.RESTRICTED) {
    return matchingShares(user, shares).length > 0;
  }
  return false;
}

/** May the user modify this item's data? */
export function canEdit(user: AccessUser, cred: CredentialLike, shares: ShareLike[]): boolean {
  if (user.id === cred.ownerId) return true;
  if (isManagementLevel(user.role)) return true;
  if (cred.visibility === CREDENTIAL_VISIBILITY.RESTRICTED) {
    return matchingShares(user, shares).some((s) => s.permission === CREDENTIAL_PERMISSION.EDIT);
  }
  return false;
}

/** May the user manage visibility + shares? (owner or management only) */
export function canManageShares(user: AccessUser, cred: CredentialLike): boolean {
  return user.id === cred.ownerId || isManagementLevel(user.role);
}

/** May the user delete this item? (owner or management only) */
export function canDelete(user: AccessUser, cred: CredentialLike): boolean {
  return user.id === cred.ownerId || isManagementLevel(user.role);
}
