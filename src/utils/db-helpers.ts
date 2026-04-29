import { eq, and, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { customers, users } from '../db/schema';

/**
 * Helper functions to reduce code duplication in database operations
 */

// Common validation patterns
export async function validateUniqueEmail(email: string, excludeId?: number, table: any = customers) {
  const conditions = [eq(table.email, email)];
  if (excludeId) {
    conditions.push(sql`${table.id} != ${excludeId}`);
  }
  const existing = await db.select({ id: table.id }).from(table).where(
    conditions.length > 1 ? and(...conditions) : conditions[0]
  ).limit(1);
  return existing.length === 0;
}

export async function validateUniqueUsername(username: string, excludeId?: number, table: any = customers) {
  const conditions = [eq(table.username, username)];
  if (excludeId) {
    conditions.push(sql`${table.id} != ${excludeId}`);
  }
  const existing = await db.select({ id: table.id }).from(table).where(
    conditions.length > 1 ? and(...conditions) : conditions[0]
  ).limit(1);
  return existing.length === 0;
}

export async function validateUniquePhone(phone: string, excludeId?: number, table: any = customers) {
  const conditions = [eq(table.phone, phone)];
  if (excludeId) {
    conditions.push(sql`${table.id} != ${excludeId}`);
  }
  const existing = await db.select({ id: table.id }).from(table).where(
    conditions.length > 1 ? and(...conditions) : conditions[0]
  ).limit(1);
  return existing.length === 0;
}

// Common entity fetch patterns
export async function fetchEntityById<T extends { id: number }>(
  table: any,
  id: number,
  columns?: (keyof T)[]
) {
  return db.query[table.name].findFirst({
    columns: columns as any,
    where: eq(table.id, id),
  });
}

export async function fetchEntityWithProfile<T extends { id: number }, P extends Record<string, any>>(
  table: any,
  profileTable: any,
  id: number,
  customerIdField: string = 'customerId'
): Promise<(T & { profile: P | null }) | null> {
  const rows = await db
    .select({ entity: table, profile: profileTable })
    .from(table)
    .leftJoin(profileTable, eq(profileTable[customerIdField], table.id))
    .where(eq(table.id, id))
    .limit(1);
  
  const row = rows[0] as { entity: T; profile: P | null } | undefined;
  return row
    ? { ...row.entity, profile: row.profile ?? null }
    : null;
}

// Common bulk operation patterns
export async function checkBulkExistence(
  table: any,
  ids: number[]
): Promise<{ found: number[]; missing: number[] }> {
  const existing = await db.query[table.name].findMany({
    columns: { id: true },
    where: sql`${table.id} IN ${ids}`,
  });
  
  const foundIds = existing.map((e: any) => e.id);
  const missingIds = ids.filter((id) => !foundIds.includes(id));
  
  return { found: foundIds, missing: missingIds };
}

// Common soft delete patterns
export async function softDeleteEntity(table: any, id: number) {
  return db
    .update(table)
    .set({ deletedAt: new Date() })
    .where(eq(table.id, id));
}

export async function restoreEntity(table: any, id: number) {
  return db
    .update(table)
    .set({ deletedAt: null })
    .where(eq(table.id, id));
}

// Common filter builders
export function buildSearchFilter(
  table: any,
  searchFields: (keyof any)[],
  query: string
): SQL {
  const value = `%${query}%`;
  const conditions = searchFields.map((field) => like(table[field], value));
  return or(...conditions);
}

import { like } from 'drizzle-orm';
