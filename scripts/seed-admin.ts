import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import { eq } from 'drizzle-orm';
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

const { users, profiles } = schema;

const ADMIN = {
  name: 'Saiful Mukhlis',
  email: 'saiful.mukhlis@gmail.com',
  password: 'dev1dev1',
  phone: '085730005887',
};

async function main() {
  const email = ADMIN.email.trim().toLowerCase().replace(/^([^@]+)/, (local) => local.replace(/\./g, ''));
  const phone = ADMIN.phone.replace(/\D/g, '').replace(/^0/, '62');
  const hashedPassword = await Bun.password.hash(ADMIN.password, { algorithm: 'bcrypt', cost: 12 });

  // Cek apakah sudah ada
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    console.log(`User dengan email ${email} sudah ada (id: ${existing.id})`);
    await connection.end();
    return;
  }

  const [result] = await db.insert(users).values({
    email,
    phone,
    password: hashedPassword,
  });

  const insertId = Number(result.insertId);

  await db.insert(profiles).values({
    userId: insertId,
    name: ADMIN.name,
    email: ADMIN.email,
    phone: ADMIN.phone,
  });

  console.log(`✓ User berhasil dibuat`);
  console.log(`  ID      : ${insertId}`);
  console.log(`  Nama    : ${ADMIN.name}`);
  console.log(`  Email   : ${email}`);
  console.log(`  Phone   : ${phone}`);

  await connection.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
