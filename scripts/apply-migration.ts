import { createPool } from 'mysql2/promise';
import { config } from 'dotenv';
import { readFileSync } from 'fs';

config();

const file = process.argv[2];
if (!file) {
  console.error('Usage: bun scripts/apply-migration.ts <sql-file>');
  process.exit(1);
}

const pool = createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  user: process.env.DB_USER ?? 'root',
  database: process.env.DB_NAME ?? 'vlabs',
  password: process.env.DB_PASSWORD ?? '',
  port: Number(process.env.DB_PORT ?? '3306'),
  multipleStatements: true,
});

const sql = readFileSync(file, 'utf-8');
await pool.query(sql);
console.log(`✓ Migration applied: ${file}`);
await pool.end();
