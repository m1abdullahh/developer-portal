/**
 * Prisma client singleton.
 *
 * Prisma 7 requires an explicit driver adapter — the connection string is no longer read from
 * the schema. Swapping SQLite for PostgreSQL is therefore a change to this file plus the
 * schema's `provider` line, and nothing else (see the provider note in schema.prisma).
 *
 * The globalThis cache exists because Next.js dev-mode hot reload re-evaluates modules on every
 * change; without it you accumulate a new connection pool per reload until the database refuses
 * connections.
 */

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma/client.js';

const globalForPrisma = globalThis as unknown as { __idpPrisma?: PrismaClient };

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env (default: file:./dev.db) before starting.',
    );
  }
  return url;
}

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl() });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/**
 * Lazily constructed so that merely importing @idp/db does not require DATABASE_URL.
 * Tests and the generator import types from this package without ever opening a connection.
 */
export function getPrisma(): PrismaClient {
  const existing = globalForPrisma.__idpPrisma;
  if (existing) return existing;

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__idpPrisma = client;
  }
  return client;
}

export type { PrismaClient };
