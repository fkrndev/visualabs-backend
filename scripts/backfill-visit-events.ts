import { config } from 'dotenv';
import { createPool } from 'mysql2/promise';

config();

const BATCH = 1000;

const pool = createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  user: process.env.DB_USER ?? 'root',
  database: process.env.DB_NAME ?? 'vlabs',
  password: process.env.DB_PASSWORD ?? '',
  port: Number(process.env.DB_PORT ?? '3306'),
});

async function main() {
  const [[{ total }]] = await pool.query<any>(
    'SELECT COUNT(*) AS total FROM chrome_histories'
  );
  console.log(`chrome_histories rows: ${total}`);

  let lastId = 0;
  let inserted = 0;

  while (true) {
    const [rows] = await pool.query<any[]>(
      `SELECT id, user_id, customer_id, updated_at
       FROM chrome_histories
       WHERE id > ?
       ORDER BY id ASC
       LIMIT ?`,
      [lastId, BATCH]
    );

    if (!rows.length) break;

    const values = rows.map((r: any) => [
      r.id,
      r.user_id,
      r.customer_id,
      r.updated_at,
      null,
      JSON.stringify({ backfilled: true }),
    ]);

    await pool.query(
      `INSERT INTO chrome_visit_events
       (history_id, user_id, customer_id, visited_at, duration_ms, data_json)
       VALUES ?`,
      [values]
    );

    inserted += rows.length;
    lastId = rows[rows.length - 1].id;
    console.log(`  backfilled ${inserted}/${total} (last id=${lastId})`);
  }

  console.log(`✓ Done. Inserted ${inserted} events.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
