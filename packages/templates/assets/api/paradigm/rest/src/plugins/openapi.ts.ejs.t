---
to: src/plugins/openapi.ts
---
import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import scalarReference from '@scalar/fastify-api-reference';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { env } from '../config/env.js';

/**
 * OpenAPI 3.0, generated from the route schemas rather than hand-written.
 *
 * One Zod schema per route serves three consumers at once: runtime request validation, the
 * OpenAPI document, and the TypeScript types of handler arguments. Hand-written specs drift
 * from the implementation within weeks — this cannot, because there is only one definition.
 *
 * `/openapi.json` is a CONTRACT: the portal's Service Catalog fetches the document from exactly
 * that path (doc 07 §4). Changing it makes this service's API docs disappear from the catalog.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  // Teaches Fastify to validate with Zod and to serialise Zod-typed responses. Must be set
  // before any route is registered, or those routes are validated by the default compiler
  // and silently omitted from the document.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: '<%= spec.meta.projectName %> API',
        description: <%- h.json(spec.meta.description ?? `API for ${spec.meta.projectName}`) %>,
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}`, description: 'Local development' }],
      tags: [{ name: 'system', description: 'Health and readiness' }],
    },
    transform: jsonSchemaTransform,
  });

  // @fastify/swagger exposes app.swagger() as a METHOD; it does not register a route.
  // Swagger UI would normally provide /openapi.json, but we use Scalar, so the endpoint has to
  // be declared explicitly — and the Service Catalog fetches from exactly this path.
  //
  // `hide` keeps the docs endpoint itself out of the document it serves.
  app.get('/openapi.json', { schema: { hide: true } }, () => app.swagger());

  // Scalar rather than Swagger UI: lighter, better dark mode, and the same renderer the
  // portal's catalog uses — so the docs look identical in both places.
  await app.register(scalarReference, {
    routePrefix: '/docs',
    configuration: {
      title: '<%= spec.meta.projectName %> API',
      url: '/openapi.json',
    },
  });
}
