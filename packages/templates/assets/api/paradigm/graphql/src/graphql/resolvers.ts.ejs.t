---
to: src/graphql/resolvers.ts
---
<% if (spec.api.orm === 'prisma') { -%>
import { prisma } from '../lib/prisma.js';
<% } -%>
import type { Resolvers } from '../generated/graphql/types.js';
<% if (spec.api.orm === 'prisma') { -%>
import { toExample } from './loaders.js';
<% } -%>

/**
 * The resolver map, typed against the schema.
 *
 * `Resolvers` is generated into src/generated/graphql/ from schema.graphql by `npm run codegen`.
 * Add a field to the schema without a resolver here and the compiler names it; return the wrong
 * shape and the compiler names that too. The schema stays the single definition.
 *
 * Look entities up through `ctx.loaders`, never directly — see loaders.ts for why.
 */
export const resolvers: Resolvers = {
  Query: {
    health: () => ({
      status: 'ok',
      service: '<%= spec.meta.slug %>',
      uptime: process.uptime(),
    }),
<% if (spec.api.orm === 'prisma') { -%>
    // One database query however many of these appear in an operation — the loader batches them.
    example: (_parent, { id }, ctx) => ctx.loaders.exampleById.load(id),
    examples: async (_parent, { limit }) => {
      const rows = await prisma.example.findMany({
        take: limit ?? 20,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toExample);
    },
<% } -%>
  },
  // Page modules and your own code add their resolver maps below.
  // >>> idp:graphql-resolvers
  // <<< idp:graphql-resolvers
};
