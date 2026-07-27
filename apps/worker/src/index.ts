/**
 * Provision worker.
 *
 * Consumes jobs from the JobQueue and runs the generation pipeline through to repo creation.
 * The queue driver is selected here — this is the composition root, and the single place that
 * changes when Redis becomes available and BullMQDriver replaces InProcessDriver (doc 06 §2).
 *
 * P0 scaffold; the pipeline lands in P1.4.
 */

import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'token', 'privateKey', '*.secret'],
});

export function createWorker(): { start: () => Promise<void>; stop: () => Promise<void> } {
  return {
    async start() {
      logger.info('worker starting');
      throw new Error(
        'Worker pipeline is not implemented yet — scheduled for P1.4 (docs/plan/09-execution-roadmap.md).',
      );
    },
    async stop() {
      logger.info('worker stopping');
    },
  };
}

export { logger };
