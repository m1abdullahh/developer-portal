---
to: prisma.config.ts
---
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * Two Prisma 7 behaviours are handled here, both of which fail confusingly otherwise:
 *
 *   1. `url` was removed from the datasource block in schema.prisma — it lives here now.
 *   2. Prisma no longer auto-loads .env, so it is loaded explicitly. Without this, every CLI
 *      command fails with "Cannot resolve environment variable: DATABASE_URL" even when .env
 *      sits right beside the schema.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (configured) return configured;

  // Production fails loudly rather than silently pointing `migrate deploy` at a local database.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL must be set in production.');
  }

  const fallback = 'postgresql://postgres:postgres@localhost:5432/<%= h.snake(spec.meta.slug) %>';
  console.warn(`[prisma] DATABASE_URL not set; using the local development default.`);
  return fallback;
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: { url: resolveDatabaseUrl() },
});
