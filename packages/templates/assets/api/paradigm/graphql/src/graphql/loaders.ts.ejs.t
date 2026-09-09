---
to: src/graphql/loaders.ts
---
import DataLoader from 'dataloader';
<% if (spec.api.orm === 'prisma') { -%>
import { prisma } from '../lib/prisma.js';
import type { Example } from '../generated/graphql/types.js';
<% } -%>

/**
 * DataLoaders — the N+1 guard.
 *
 * A list field resolves once per row, so a resolver that queries the database directly turns a
 * page of 50 rows into 51 queries. A loader collects every `load(key)` made during one tick of the
 * event loop, issues a single batched query, and hands each caller its row. Created per request in
 * context.ts, so the cache never outlives the operation that filled it.
 *
 * Add a loader here for every entity a resolver looks up by key. Page modules contribute theirs
 * through the marker regions.
 */
<% if (spec.api.orm !== 'prisma') { -%>
// Empty until a page module or your own code adds a loader — the wiring is what matters.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
<% } -%>
export interface Loaders {
<% if (spec.api.orm === 'prisma') { -%>
  exampleById: DataLoader<string, Example | null>;
<% } -%>
  // >>> idp:graphql-loaders
  // <<< idp:graphql-loaders
}

export function createLoaders(): Loaders {
  return {
<% if (spec.api.orm === 'prisma') { -%>
    exampleById: new DataLoader(async (ids) => {
      const rows = await prisma.example.findMany({ where: { id: { in: [...ids] } } });
      const byId = new Map(rows.map((row) => [row.id, toExample(row)]));
      // DataLoader requires one result per key, in key order. A miss is null, never a gap —
      // a shorter array than the keys is rejected as a batch-function error.
      return ids.map((id) => byId.get(id) ?? null);
    }),
<% } -%>
    // >>> idp:graphql-loader-instances
    // <<< idp:graphql-loader-instances
  };
}
<% if (spec.api.orm === 'prisma') { -%>

/** Prisma row → GraphQL type. Dates become ISO-8601 strings, which is what the schema declares. */
export function toExample(row: {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): Example {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
<% } -%>
