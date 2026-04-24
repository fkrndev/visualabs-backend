#!/usr/bin/env tsx
/**
 * Clear Account Lockout Utility
 * 
 * This script clears the account lockout for a specific identifier (email/username).
 * Useful for development and testing when accounts get locked due to failed login attempts.
 * 
 * Usage:
 *   tsx scripts/clear-account-lock.ts test.admin@example.com
 *   tsx scripts/clear-account-lock.ts --all
 */

import { db } from "../src/db/client";
import { accountLockoutEntries } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function clearLockout(identifier: string): Promise<void> {
  try {
    console.log(`Clearing lockout for: ${identifier}`);
    
    const result = await db
      .delete(accountLockoutEntries)
      .where(eq(accountLockoutEntries.identifier, identifier));
    
    console.log(`✓ Lockout cleared for ${identifier}`);
  } catch (error) {
    console.error(`✗ Error clearing lockout for ${identifier}:`, error);
    throw error;
  }
}

async function clearAllLockouts(): Promise<void> {
  try {
    console.log("Clearing ALL account lockouts...");
    
    const result = await db.delete(accountLockoutEntries);
    
    console.log(`✓ All lockouts cleared`);
  } catch (error) {
    console.error("✗ Error clearing all lockouts:", error);
    throw error;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("Usage:");
    console.log("  tsx scripts/clear-account-lock.ts <identifier>");
    console.log("  tsx scripts/clear-account-lock.ts --all");
    console.log("");
    console.log("Examples:");
    console.log("  tsx scripts/clear-account-lock.ts test.admin@example.com");
    console.log("  tsx scripts/clear-account-lock.ts --all");
    process.exit(1);
  }

  const identifier = args[0];
  
  if (identifier === "--all") {
    await clearAllLockouts();
  } else {
    await clearLockout(identifier);
  }
  
  console.log("\nDone! You can now try logging in again.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
