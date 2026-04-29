/**
 * Data versioning utility
 * Tracks changes to entities with version numbers and history
 */

import { db } from '../db/client';
import { eq } from 'drizzle-orm';

export interface VersionedEntity {
  id: number;
  version: number;
  updatedAt?: Date;
}

/**
 * Increment version of an entity
 */
export async function incrementVersion(
  table: any,
  id: number
): Promise<number> {
  const [entity] = await db
    .select({ version: table.version })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);

  if (!entity) {
    throw new Error(`Entity with ID ${id} not found`);
  }

  const newVersion = (entity.version || 0) + 1;

  await db
    .update(table)
    .set({ 
      version: newVersion,
      updatedAt: new Date(),
    })
    .where(eq(table.id, id));

  return newVersion;
}

/**
 * Check if entity version matches expected version (optimistic locking)
 */
export async function checkVersion(
  table: any,
  id: number,
  expectedVersion: number
): Promise<boolean> {
  const [entity] = await db
    .select({ version: table.version })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);

  if (!entity) {
    return false;
  }

  return entity.version === expectedVersion;
}

/**
 * Update entity with version check (optimistic concurrency control)
 */
export async function updateWithVersionCheck<T>(
  table: any,
  id: number,
  updates: Partial<T>,
  expectedVersion: number
): Promise<{ success: boolean; newVersion?: number; error?: string }> {
  const currentVersion = await checkVersion(table, id, expectedVersion);

  if (!currentVersion) {
    return {
      success: false,
      error: 'Entity not found or version mismatch',
    };
  }

  const newVersion = expectedVersion + 1;

  try {
    await db
      .update(table)
      .set({
        ...updates,
        version: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(table.id, id));

    return {
      success: true,
      newVersion,
    };
  } catch (error) {
    return {
      success: false,
      error: 'Failed to update entity',
    };
  }
}

/**
 * Get version history for an entity
 * This would require a separate history table in production
 */
export async function getVersionHistory(
  historyTable: any,
  entityId: number,
  limit: number = 10
): Promise<any[]> {
  const history = await db
    .select()
    .from(historyTable)
    .where(eq(historyTable.entityId, entityId))
    .orderBy(historyTable.createdAt)
    .limit(limit);

  return history;
}

/**
 * Create a history record for an entity change
 */
export async function createHistoryRecord(
  historyTable: any,
  data: {
    entityId: number;
    entityType: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    changes: Record<string, any>;
    changedBy?: number;
    version: number;
  }
): Promise<void> {
  await db.insert(historyTable).values({
    ...data,
    createdAt: new Date(),
  });
}
