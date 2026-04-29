import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import { config } from 'dotenv';
import { customers, customerProfiles } from '../src/db/schema';
import { eq, or, like } from 'drizzle-orm';

config();

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'vlabs',
} = process.env;

const connection = createPool({
  host: DB_HOST,
  user: DB_USER,
  database: DB_NAME,
  password: DB_PASSWORD,
  port: Number(DB_PORT),
  connectionLimit: 1,
});

const db = drizzle(connection, { mode: 'default' });

async function main() {
  console.log('Cleaning up test customer data...');
  
  // Delete all customers with test email domains
  const result1 = await db.delete(customers).where(
    like(customers.email, '%@example.com')
  );
  console.log(`Deleted customers with @example.com email`);
  
  const result2 = await db.delete(customers).where(
    like(customers.email, '%@test.local')
  );
  console.log(`Deleted customers with @test.local email`);
  
  const result3 = await db.delete(customers).where(
    like(customers.email, '%@%.vims.local')
  );
  console.log(`Deleted customers with @*.vims.local email`);
  
  // Delete customers with username pattern starting with u followed by numbers
  const result4 = await db.delete(customers).where(
    like(customers.username, 'u%')
  );
  console.log(`Deleted customers with username pattern u%`);
  
  // Delete customers with username pattern starting with newcustomer
  const result5 = await db.delete(customers).where(
    like(customers.username, 'newcustomer%')
  );
  console.log(`Deleted customers with username pattern newcustomer%`);
  
  // Delete customers with username pattern starting with minimal
  const result6 = await db.delete(customers).where(
    like(customers.username, 'minimal%')
  );
  console.log(`Deleted customers with username pattern minimal%`);
  
  console.log('Cleanup complete');
  await connection.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
