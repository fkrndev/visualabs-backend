import { createPool } from 'mysql2/promise';
import { config } from 'dotenv';

config();

const pool = createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  user: process.env.DB_USER ?? 'root',
  database: process.env.DB_NAME ?? 'vlabs',
  password: process.env.DB_PASSWORD ?? '',
  port: Number(process.env.DB_PORT ?? '3306'),
  multipleStatements: true,
});

const sql = `
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE todo_repeat_histories;
TRUNCATE TABLE repeat_tasks;
TRUNCATE TABLE todos;
TRUNCATE TABLE meeting_members;
TRUNCATE TABLE meetings;
TRUNCATE TABLE ticket_issues;
TRUNCATE TABLE scorecard_data;
TRUNCATE TABLE scorecards;
TRUNCATE TABLE subscriptions;
TRUNCATE TABLE products;
TRUNCATE TABLE customer_profiles;
TRUNCATE TABLE customers;
TRUNCATE TABLE profiles;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;
`;

await pool.query(sql);
console.log('✓ All seed tables truncated');
await pool.end();
