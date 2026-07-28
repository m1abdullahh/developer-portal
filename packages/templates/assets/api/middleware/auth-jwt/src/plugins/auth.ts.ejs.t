---
to: src/plugins/auth.ts
---
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config/env.js';
import { hasPermission, type Permission, type Role } from '../lib/permissions.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      permission: Permission,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role };
    user: { sub: string; role: Role };
  }
}

/**
 * JWT authentication.
 *
 * Exposed as route guards rather than a global hook. A global `onRequest` hook would also
 * intercept `/health`, `/ready` and `/docs`, so the probes would start failing with 401 and
 * Kubernetes would restart a perfectly healthy pod — a failure that looks nothing like an
 * auth misconfiguration.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
    // Short access tokens are only tolerable with refresh; without it users are logged out
    // mid-session. See the refresh flow in the auth routes.
  });

  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      // The verification error is deliberately not echoed: distinguishing "expired" from
      // "malformed" from "wrong signature" hands an attacker a free oracle.
      await reply.status(401).send({
        error: 'Unauthorized',
        message: 'A valid access token is required.',
        statusCode: 401,
      });
    }
  });

  app.decorate(
    'requirePermission',
    (permission: Permission) => async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'A valid access token is required.',
          statusCode: 401,
        });
      }

      if (!hasPermission(request.user.role, permission)) {
        // 403, not 404: the caller is authenticated and the resource exists, they simply may
        // not act on it. Masking that as 404 makes legitimate permission bugs unreportable.
        return reply.status(403).send({
          error: 'Forbidden',
          message: `This action requires the "${permission}" permission.`,
          statusCode: 403,
        });
      }
      return undefined;
    },
  );
}
