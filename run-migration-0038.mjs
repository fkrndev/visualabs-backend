import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",
  database: "vlabs",
});

try {
  await conn.query(`ALTER TABLE shopee_scrape_sessions MODIFY COLUMN status ENUM('scraping','analyzing','done','failed','waiting_verify') NOT NULL DEFAULT 'scraping'`);
  console.log("Migration 0038 applied: added 'waiting_verify' to status enum");
} catch (err) {
  console.error("Migration failed:", err.message);
} finally {
  await conn.end();
}
