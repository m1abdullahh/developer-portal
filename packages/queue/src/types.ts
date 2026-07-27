/**
 * Job queue contracts — see docs/plan/06-orchestration-queue-vcs.md §2
 *
 * Two drivers implement this: InProcessDriver (default, no Redis) and BullMQDriver (P2, once
 * Redis exists). The interface is defined first precisely so that swap is a one-line change in
 * the composition root rather than a rewrite.
 */

import type { ProjectSpec } from '@idp/core';
import type { Diagnostic, MergeReport, StageName } from '@idp/generator';

export type JobId = string;

export type JobStatus =
  | 'queued'
  | 'resolving'
  | 'generating'
  | 'pushing'
  | 'configuring'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed';

/**
 * Statuses at or after which GitHub has been touched. A job interrupted here cannot simply be
 * re-run; it needs the idempotent replay path.
 */
export const SIDE_EFFECTING: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'pushing',
  'configuring',
]);

export function isTerminal(status: JobStatus): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed';
}

/** Cancellation is only honoured before any external side effect exists. */
export function isCancellable(status: JobStatus): boolean {
  return !isTerminal(status) && !SIDE_EFFECTING.has(status);
}

export interface ProvisionJob {
  spec: ProjectSpec;
  requestedById: string;
  /** hash(org, slug, spec) — the idempotency key (doc 06 §5). */
  specHash: string;
}

export interface StageRecord {
  stage: StageName | 'push' | 'configure' | 'register';
  status: 'start' | 'done' | 'fail';
  ms?: number;
  message?: string;
}

export interface JobRecord {
  id: JobId;
  status: JobStatus;
  spec: ProjectSpec;
  stages: StageRecord[];
  warnings: Diagnostic[];
  mergeReport?: MergeReport;
  repoUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
}

export type JobEvent =
  | { type: 'stage'; stage: StageRecord['stage']; status: 'start' | 'done' | 'fail'; ms?: number }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'progress'; current: number; total: number; label: string }
  | { type: 'done'; repoUrl: string; catalogId: string }
  | { type: 'error'; code: string; message: string; recoverable: boolean };

export type Unsubscribe = () => void;

export interface JobQueue {
  readonly kind: 'in-process' | 'bullmq';

  enqueue(job: ProvisionJob): Promise<JobId>;
  get(id: JobId): Promise<JobRecord | null>;
  subscribe(id: JobId, cb: (event: JobEvent) => void): Unsubscribe;
  /** Returns false if the job has already produced external side effects. */
  cancel(id: JobId): Promise<boolean>;
  retry(id: JobId): Promise<JobId>;
}
