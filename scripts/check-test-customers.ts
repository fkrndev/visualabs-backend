import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import { config } from 'dotenv';
import { customers } from '../src/db/schema';
import { like, or } from 'drizzle-orm';

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
  console.log('Checking for test customers...');
  
  // Check for customers with test patterns
  const testCustomers = await db.select({
    id: customers.id,
    email: customers.email,
    username: customers.username,
    phone: customers.phone,
  }).from(customers).where(
    or(
      like(customers.email, '%@test.local'),
      like(customers.username, 'u%')
    )
  ).limit(20);
  
  console.log('Found test customers:');
  console.table(testCustomers);
  
  await connection.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
