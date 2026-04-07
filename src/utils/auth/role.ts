import { eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { businessUsers } from '../../db/schema';

export async function fetchBusinessUserRolesByUserId(
  userId: number
): Promise<{ businessId: number; role: number }[]> {
  if (!Number.isInteger(userId)) {
    throw new Error('userId harus berupa integer');
  }

  return db
    .select({
      businessId: businessUsers.businessId,
      role: businessUsers.role,
    })
    .from(businessUsers)
    .where(eq(businessUsers.userId, userId));
}

export async function role(userId: number) {
  const roles = await fetchBusinessUserRolesByUserId(userId);
  return roles.reduce((acc, { businessId, role }) => {
    acc[businessId] = role;
    return acc;
  }, {} as Record<number, number>);
}
