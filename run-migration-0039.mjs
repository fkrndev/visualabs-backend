import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",
  database: "vlabs",
});

try {
  await conn.query(`ALTER TABLE shopee_scores
    ADD COLUMN name_score INT NULL AFTER bio_score,
    ADD COLUMN stats_score INT NULL AFTER name_score,
    ADD COLUMN hero_score INT NULL AFTER stats_score,
    ADD COLUMN bottom_hero_score INT NULL AFTER hero_score,
    ADD COLUMN categories_score INT NULL AFTER photo_score,
    ADD COLUMN specs_score INT NULL AFTER categories_score`);
  console.log("Migration 0039 applied: added expanded score columns");
} catch (err) {
  console.error("Migration failed:", err.message);
} finally {
  await conn.end();
}
