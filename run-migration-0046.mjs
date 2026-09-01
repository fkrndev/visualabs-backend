import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "drizzle", "0046_add_image_index.sql");
const sql = readFileSync(sqlPath, "utf8");

const host = process.env.DB_HOST || "127.0.0.1";
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || "root";
const password = process.env.DB_PASSWORD || "";
const database = process.env.DB_NAME || "vlabs";

console.log("[migration 0046] Running...");
const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });
await conn.query(sql);
await conn.end();
console.log("[migration 0046] OK — shopee_drafts.image_index column added");
