import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import { config } from 'dotenv';
import { customers } from '../src/db/schema';
import { eq } from 'drizzle-orm';

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
  const testEmail = 'newcustomer457649203791@test.local';
  const testUsername = 'u457649203791';
  
  console.log(`Checking for email: ${testEmail}`);
  const emailMatch = await db.select().from(customers).where(eq(customers.email, testEmail));
  console.log('Email matches:', emailMatch.length);
  
  console.log(`Checking for username: ${testUsername}`);
  const usernameMatch = await db.select().from(customers).where(eq(customers.username, testUsername));
  console.log('Username matches:', usernameMatch.length);
  
  await connection.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
