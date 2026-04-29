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
  const users = await db.query.users.findMany({
    where: (t, { eq }) => eq(t.role, 2)
  });
  console.log('Admin users (role=2):');
  for (const user of users) {
    console.log(`  ID: ${user.id}, Email: ${user.email}, Username: ${user.username}, Role: ${user.role}`);
  }
  await connection.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
