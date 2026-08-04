---
to: src/db/index.ts
---
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema.js';

/**
 * One pool for the process, sized modestly.
 *
 * pg's Pool connects lazily — nothing dials until the first query — which is what keeps boot
 * independent of the database. /ready reports connectivity; /health does not; and the process
 * must come up either way.
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  // Recycle before most managed Postgres services drop an idle connection. Without this the
  // first query after a quiet period fails once per stale connection — the classic "it only
  // breaks in the morning" bug.
  idleTimeoutMillis: 30_000,
});

/** The typed client. `schema` makes `db.query.<table>` relations available. */
export const db = drizzle(pool, { schema });

/** Used by `/ready`, and deliberately not by `/health` (doc 03 §5). */
export async function checkDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
