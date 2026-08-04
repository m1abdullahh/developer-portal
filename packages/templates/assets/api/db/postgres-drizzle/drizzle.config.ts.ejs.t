---
to: drizzle.config.ts
---
import { defineConfig } from 'drizzle-kit';

/*
 * drizzle-kit does not load .env on its own, and Node 20.6+ can do it without a dotenv
 * dependency. The try/catch is for environments where no .env exists — CI, containers — and the
 * variable arrives through the real environment instead.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file; process.env is already the source of truth.
}

export default defineConfig({
  dialect: 'postgresql',
  // The schema is TypeScript, so `db:generate` diffs this file against the journal in ./drizzle
  // and writes plain SQL migrations there. Commit both — the SQL is what deploys.
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Non-null assertion rather than a fallback: a migration against a guessed localhost URL is
    // worse than a failed one.
    url: process.env.DATABASE_URL!,
  },
});
