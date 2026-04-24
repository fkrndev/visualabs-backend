import { db } from "../src/db/client";
import { rateLimitEntries, accountLockoutEntries } from "../src/db/schema";

async function clearRateLimit() {
  try {
    // Clear rate limit entries
    await db.delete(rateLimitEntries);
    console.log("✓ Rate limit entries cleared");

    // Clear account lockout entries
    await db.delete(accountLockoutEntries);
    console.log("✓ Account lockout entries cleared");

    console.log("========================================");
    console.log("CLEARED SUCCESSFULLY");
    console.log("========================================");
    console.log("You can now run the test scripts again.");

    process.exit(0);
  } catch (error) {
    console.error("Error clearing rate limit:", error);
    process.exit(1);
  }
}

clearRateLimit();
