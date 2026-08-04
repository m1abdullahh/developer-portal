---
to: src/db/schema.ts
---
/**
 * The database schema, in TypeScript.
 *
 * Every table is declared here (or re-exported from here): `drizzle-kit generate` diffs THIS
 * module against the migration journal, so a table defined in a file this one does not export is
 * invisible to migrations — the same trap as an unimported model in Alembic, and the reason this
 * file is the single entry point.
 *
 * Example:
 *
 *   import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
 *
 *   export const widgets = pgTable('widgets', {
 *     id: serial('id').primaryKey(),
 *     name: text('name').notNull(),
 *     createdAt: timestamp('created_at').defaultNow().notNull(),
 *   });
 *
 * After editing: `npm run db:generate` writes the SQL migration, `npm run db:migrate` applies it.
 * Read what generate produced before applying — renames are detected as drop-plus-add, which
 * applies cleanly and discards the data in the column.
 */

// >>> idp:models
// <<< idp:models

// Keeps this module a valid ES module while the schema above is empty. Remove alongside your
// first table if you like — drizzle only cares that the file exports its tables.
export {};
