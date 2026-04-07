// import { drizzle } from 'drizzle-orm/bun-sql';
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { config } from 'dotenv';
import * as schema from './schema';

config();

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'dbxxx',
  DB_POOL_SIZE = '10',
} = process.env;

const connection = createPool({
  host: DB_HOST,
  user: DB_USER,
  database: DB_NAME,
  password: DB_PASSWORD,
  port: Number(DB_PORT),
  connectionLimit: Number(DB_POOL_SIZE),
});

export const db = drizzle(connection, { schema, mode: 'default' });

// export const db = drizzle({
//   schema,
//   connection: {
//     adapter: 'mysql',
//     host: DB_HOST,
//     port: Number(DB_PORT),
//     username: DB_USER,
//     password: DB_PASSWORD,
//     database: DB_NAME,
//     max: Number(DB_POOL_SIZE),
//   },
// });

export type DB = typeof db;
