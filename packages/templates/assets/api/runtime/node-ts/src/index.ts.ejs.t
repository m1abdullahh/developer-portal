---
to: src/index.ts
---
import { buildServer } from './server.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

/**
 * Entry point, with graceful shutdown.
 *
 * Kubernetes sends SIGTERM and then waits `terminationGracePeriodSeconds` before SIGKILL.
 * Without draining, every rolling update drops the requests in flight on each terminating pod —
 * a low, constant error rate during deploys that is genuinely hard to trace back to its cause.
 */
async function main(): Promise<void> {
  const app = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      // Stops accepting new connections, then waits for in-flight requests to finish.
      await app.close();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // An unhandled rejection leaves the process in an unknown state. Exiting lets the
  // orchestrator replace the pod rather than serving from a half-broken one.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'unhandled rejection');
    process.exit(1);
  });

  // 0.0.0.0, not localhost: a container listening on the loopback interface is unreachable
  // from outside the pod, and the readiness probe fails with no useful error.
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, '<%= spec.meta.slug %> listening');
}

void main();
