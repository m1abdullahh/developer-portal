/**
 * Prisma 7 CLI configuration.
 *
 * Two Prisma 7 behaviour changes are handled here:
 *   1. `url` was removed from the datasource block in schema.prisma — it lives here now.
 *   2. Prisma no longer auto-loads .env, so we load it explicitly via Node's built-in
 *      process.loadEnvFile (Node >= 20.12).
 *
 * The runtime connection is supplied separately through a driver adapter in src/client.ts.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

/**
 * Resolves the connection string, tolerating an unset DATABASE_URL outside production.
 *
 * `prisma generate` reads only the schema — it never opens a connection — yet Prisma's `env()`
 * helper throws when the variable is missing. That turned a fresh clone (no .env, since it is
 * gitignored) into a hard build failure with a message that points at the database rather than
 * at the missing file.
 *
 * Production still fails loudly: silently defaulting to a local SQLite file there would let a
 * `migrate deploy` run against the wrong database, which is far worse than a failed build.
 */
function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL must be set in production. Refusing to fall back to a local SQLite file.',
    );
  }

  const fallback = 'file:./dev.db';
  // Announced rather than silent — a wrong-database surprise is worth one line of noise.
  console.warn(`[prisma] DATABASE_URL not set; using ${fallback} (development default).`);
  return fallback;
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
