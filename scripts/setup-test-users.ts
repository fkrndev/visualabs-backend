import { db } from "../src/db/client";
import { users, customers } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { cleanEmail, cleanPhone } from "../src/utils/normalizers";

async function setupTestUsers() {
  console.log("========================================");
  console.log("SETUP TEST USERS");
  console.log("========================================");
  console.log("");

  try {
    // Use bypass password from .env for testing
    const password = process.env.BYPASS_PASSWORD || "zP9c0JJI04P+";
    const hashedPassword = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 12,
    });

    console.log("Creating test admin user...");

    // Use normalized email and phone to match login logic
    const adminEmail = cleanEmail("test.admin@example.com");
    const adminPhone = cleanPhone("+6281234567890");

    // Delete existing test admin user if exists (by both email and username to handle normalization changes)
    await db.delete(users).where(eq(users.email, adminEmail));
    await db.delete(users).where(eq(users.username, "testadmin"));

    // Create test admin user
    await db.insert(users).values({
      email: adminEmail,
      username: "testadmin",
      phone: adminPhone,
      password: hashedPassword,
      role: 1, // 1 = admin (integer)
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("✓ Test admin user created successfully");

    console.log("");
    console.log("Creating test customer user...");

    // Use normalized email and phone to match login logic
    const customerEmail = cleanEmail("test.customer@example.com");
    const customerPhone = cleanPhone("+6289876543210");

    // Delete existing test customer user if exists (by both email and username to handle normalization changes)
    await db.delete(customers).where(eq(customers.email, customerEmail));
    await db.delete(customers).where(eq(customers.username, "testcustomer"));

    // Create test customer user
    await db.insert(customers).values({
      email: customerEmail,
      username: "testcustomer",
      phone: customerPhone,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("✓ Test customer user created successfully");

    console.log("");
    console.log("========================================");
    console.log("SETUP COMPLETE");
    console.log("========================================");
    console.log("");
    console.log("Test User Credentials:");
    console.log("");
    console.log("Admin:");
    console.log("  Email: test.admin@example.com");
    console.log("  Phone: +6281234567890");
    console.log("  Username: testadmin");
    console.log(`  Password: ${password}`);
    console.log("");
    console.log("Customer:");
    console.log("  Email: test.customer@example.com");
    console.log("  Phone: +6289876543210");
    console.log("  Username: testcustomer");
    console.log(`  Password: ${password}`);
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("Error creating test users:", error);
    process.exit(1);
  }
}

setupTestUsers();
