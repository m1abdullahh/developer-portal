---
to: src/lib/prisma.ts
---
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

/**
 * Prisma client singleton.
 *
 * Prisma 7 requires an explicit driver adapter — the connection string is no longer read from
 * the schema. Swapping PostgreSQL for another database is a change to this file plus the
 * `provider` line in schema.prisma, and nothing else.
 *
 * Cached on globalThis because dev-mode hot reload re-evaluates modules on every change;
 * without the cache you accumulate a connection pool per reload until Postgres refuses
 * connections with "too many clients", which looks like a database problem rather than a
 * reload problem.
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.__prisma ?? createClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

/**
 * Readiness check.
 *
 * `SELECT 1` rather than a model query: it needs no table to exist, so readiness still works
 * before the first migration has run.
 */
export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
