---
to: src/plugins/graphql.ts
---
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { ApolloServer } from '@apollo/server';
import fastifyApollo, { fastifyApolloDrainPlugin } from '@as-integrations/fastify';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { printSchema } from 'graphql';
import { env } from '../config/env.js';
import { createContext, type GraphqlContext } from '../graphql/context.js';
import { resolvers } from '../graphql/resolvers.js';

/**
 * The schema is read from disk rather than embedded in code, so the file the catalog fetches, the
 * file codegen reads and the file the server executes are one file. Resolved relative to this
 * module, which works from src/ under tsx and from dist/ under node — both sit one level below
 * the package root where schema.graphql lives. The container image copies it there for the same
 * reason (see the Dockerfile).
 */
const typeDefs = readFileSync(new URL('../../schema.graphql', import.meta.url), 'utf8');

/**
 * Mounts GraphQL at /graphql, behind every middleware registered before the routes.
 *
 * `/schema.graphql` is a CONTRACT: the portal's Service Catalog reads this API's shape from
 * exactly that path (doc 07 §4). Changing it removes the schema from the catalog.
 */
export async function registerGraphql(app: FastifyInstance): Promise<void> {
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const production = env.NODE_ENV === 'production';

  const apollo = new ApolloServer<GraphqlContext>({
    schema,
    // Introspection and the sandbox are development tools. In production the schema is still
    // available — at /schema.graphql, as a file, to whoever can reach the service.
    introspection: !production,
    plugins: [
      // Drains in-flight operations before Fastify closes, so a rolling update does not cut off
      // the requests already executing on a terminating pod.
      fastifyApolloDrainPlugin(app),
      production
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageLocalDefault({ embed: true }),
    ],
    // Stack traces and internal messages never cross the boundary in production — the same rule
    // the REST error handler applies. Errors thrown deliberately by resolvers keep their code and
    // message; only the unexpected ones are masked.
    formatError: (formatted) => {
      if (production && formatted.extensions?.['code'] === 'INTERNAL_SERVER_ERROR') {
        return { message: 'Internal Server Error', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
      }
      return formatted;
    },
  });

  await apollo.start();

  await app.register(fastifyApollo(apollo), {
    path: '/graphql',
    context: createContext,
  });

  app.get('/schema.graphql', async (_request, reply) => {
    return reply.type('text/plain; charset=utf-8').send(printSchema(schema));
  });
}
