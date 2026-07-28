---
to: src/plugins/request-context.ts
---
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * Request correlation and timing.
 *
 * Fastify already logs requests; this adds the two things that make those logs usable when
 * something goes wrong across services.
 *
 * A request id propagated from an inbound `X-Request-Id` header — rather than always freshly
 * generated — is what lets one identifier follow a request through the gateway, this service
 * and everything it calls. Without propagation each hop invents its own id and a distributed
 * trace has to be reassembled by timestamp, which stops working under load.
 *
 * Registered first (priority 10) so every later plugin's logs already carry the id.
 */
export async function registerRequestContext(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

    // Echoed back so a client can quote the id in a bug report, and so a browser can read it
    // (CORS exposes this header explicitly).
    void reply.header('x-request-id', requestId);
    request.requestContext = { requestId, startedAt: process.hrtime.bigint() };
  });

  app.addHook('onResponse', async (request, reply) => {
    const started = request.requestContext?.startedAt;
    if (started === undefined) return;

    // hrtime rather than Date.now(): monotonic, so an NTP correction mid-request cannot
    // produce a negative duration.
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;

    request.log.info(
      {
        requestId: request.requestContext?.requestId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      'request completed',
    );
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    requestContext?: { requestId: string; startedAt: bigint };
  }
}
