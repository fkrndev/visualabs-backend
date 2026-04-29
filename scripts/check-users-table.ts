import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import { config } from 'dotenv';
import { customers, users } from '../src/db/schema';
import { eq, or } from 'drizzle-orm';

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
  const testEmail = 'newcustomer439833826741@test.local';
  const testUsername = 'u439833826741';
  
  console.log('Checking customers table:');
  const customerEmailMatch = await db.select().from(customers).where(eq(customers.email, testEmail));
  console.log('Customer email matches:', customerEmailMatch.length);
  
  const customerUsernameMatch = await db.select().from(customers).where(eq(customers.username, testUsername));
  console.log('Customer username matches:', customerUsernameMatch.length);
  
  console.log('\nChecking users table:');
  const userEmailMatch = await db.select().from(users).where(eq(users.email, testEmail));
  console.log('User email matches:', userEmailMatch.length);
  if (userEmailMatch.length > 0) {
    console.log('User email match details:', userEmailMatch[0]);
  }
  
  const userUsernameMatch = await db.select().from(users).where(eq(users.username, testUsername));
  console.log('User username matches:', userUsernameMatch.length);
  if (userUsernameMatch.length > 0) {
    console.log('User username match details:', userUsernameMatch[0]);
  }
  
  await connection.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
