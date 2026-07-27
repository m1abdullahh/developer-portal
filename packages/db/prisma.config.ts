/**
 * Prisma 7 CLI configuration.
 *
 * Two Prisma 7 behaviour changes are handled here:
 *   1. `url` was removed from the datasource block in schema.prisma — it lives here now.
 *   2. Prisma no longer auto-loads .env, so we load it explicitly via Node's built-in
 *      process.loadEnvFile (Node >= 20.12). Without this the CLI fails with
 *      "Cannot resolve environment variable: DATABASE_URL".
 *
 * The runtime connection is supplied separately through a driver adapter in src/client.ts.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
});
