import { eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { users } from '../../db/schema';

export async function role(userId: number): Promise<number | null> {
  if (!Number.isInteger(userId)) {
    throw new Error('userId harus berupa integer');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  return user ? 1 : null;
}
