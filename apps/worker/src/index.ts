/**
 * Provision worker — the composition root.
 *
 * This is the one place that decides which drivers the system runs on. Swapping InProcessDriver
 * for BullMQDriver when Redis lands, or GitHubDriver for FilesystemDriver in a local demo, is a
 * change here and nowhere else (doc 06 §2).
 */

import pino from 'pino';
import { InProcessDriver, type JobQueue, type ProvisionJob } from '@idp/queue';
import { FilesystemDriver, GitHubDriver, type VcsDriver } from '@idp/vcs';
import { createProvisionHandler } from './provision-handler.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'token', 'privateKey', '*.secret'],
});

export interface WorkerOptions {
  /** Overrides driver selection. Tests and the CLI pass their own; production passes nothing. */
  driver?: VcsDriver;
  concurrency?: number;
}

export interface Worker {
  queue: JobQueue;
  submit: (job: ProvisionJob) => Promise<string>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Chooses a VCS driver from the environment.
 *
 * The filesystem driver is the default deliberately. A misconfigured deployment should write
 * a directory nobody looks at, not create repositories in an organisation with credentials it
 * happened to inherit — provisioning against real GitHub is opt-in.
 */
export function selectDriver(env: NodeJS.ProcessEnv = process.env): VcsDriver {
  if (env.VCS_DRIVER === 'github') {
    const auth = env.GITHUB_TOKEN;
    if (!auth) {
      throw new Error('VCS_DRIVER=github requires GITHUB_TOKEN (or an App installation token).');
    }
    return new GitHubDriver({
      auth,
      ...(env.GITHUB_API_URL ? { baseUrl: env.GITHUB_API_URL } : {}),
      onRateLimit: (m) => logger.warn({ driver: 'github' }, m),
    });
  }

  return new FilesystemDriver(env.VCS_OUTPUT_DIR ?? './.idp-output');
}

export function createWorker(options: WorkerOptions = {}): Worker {
  const driver = options.driver ?? selectDriver();

  const queue = new InProcessDriver({
    handler: createProvisionHandler({ driver, logger }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });

  return {
    queue,
    submit: (job) => queue.enqueue(job),

    async start() {
      logger.info({ driver: driver.kind }, 'worker started');
    },

    /**
     * Waits for in-flight jobs before returning.
     *
     * A job killed between `createRepo` and `pushTree` leaves an empty repository that nobody
     * will clean up, so draining is worth the few seconds it costs on deploy.
     */
    async stop() {
      logger.info('worker draining');
      await queue.drain();
      logger.info('worker stopped');
    },
  };
}

export { logger };
export * from './provision-handler.js';
