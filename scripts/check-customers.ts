import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import { config } from 'dotenv';
import * as schema from '../src/db/schema';

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

const db = drizzle(connection, { schema, mode: 'default' });

async function main() {
  const customers = await db.query.customers.findMany();
  console.log('Customers in database:');
  for (const customer of customers) {
    console.log(`  ID: ${customer.id}, Email: ${customer.email}, Username: ${customer.username}`);
  }
  await connection.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
