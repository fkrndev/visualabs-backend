import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const host = process.env.DB_HOST ?? '127.0.0.1';
const port = Number(process.env.DB_PORT ?? '3306');
const user = process.env.DB_USER ?? 'root';
const password = process.env.DB_PASSWORD ?? '';
const database = process.env.DB_NAME ?? 'eos';

// Drizzle Kit menganggap password kosong sebagai tidak valid.
// Jika password kosong, gunakan URL tanpa password sebagai alternatif valid.
const useUrl = password === '';
const url = `mysql://${user}@${host}:${port}/${database}`;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: useUrl
    ? { url }
    : {
        host,
        port,
        user,
        password,
        database,
      },
  verbose: true,
  strict: true,
});
