/**
 * InProcessDriver — the default job queue.
 *
 * Phase 1 deliberately ships without Redis. A single portal instance provisioning a handful of
 * repositories a day does not need a distributed broker, and every dependency added to the
 * critical path is one more thing that can be down when someone is trying to start a project.
 * BullMQ arrives in P2 behind this same interface (doc 06 §2).
 *
 * What this driver does NOT do is pretend to be durable: an in-memory queue loses its jobs when
 * the process restarts. That is why `JobRecord` is persisted by the caller and why jobs are
 * keyed by `specHash` — a lost job can be resubmitted safely.
 *
 * The queue knows nothing about generation or GitHub. It runs an injected handler, which is
 * what keeps it testable without a network and keeps provisioning policy in the worker.
 */

import type { Diagnostic, MergeReport } from '@idp/generator';
import {
  isCancellable,
  isTerminal,
  type JobEvent,
  type JobEventListener,
  type JobId,
  type JobQueue,
  type JobRecord,
  type JobStatus,
  type ProvisionJob,
  type StageRecord,
  type SubscribeOptions,
  type Unsubscribe,
} from './types.js';

export interface JobContext {
  readonly id: JobId;
  readonly job: ProvisionJob;
  /** Aborted when the job is cancelled. Handlers should check it between stages. */
  readonly signal: AbortSignal;
  /** Advances the job's status. Moving to a side-effecting status disables cancellation. */
  setStatus(status: JobStatus): void;
  stage(stage: StageRecord['stage'], status: 'start' | 'done' | 'fail', ms?: number): void;
  log(level: 'info' | 'warn' | 'error', message: string): void;
  progress(current: number, total: number, label: string): void;
}

export interface JobResult {
  repoUrl: string;
  catalogId: string;
  warnings?: Diagnostic[];
  mergeReport?: MergeReport;
}

export type JobHandler = (ctx: JobContext) => Promise<JobResult>;

export class JobCancelledError extends Error {
  constructor() {
    super('The job was cancelled before any external changes were made.');
    this.name = 'JobCancelledError';
  }
}

export interface InProcessDriverOptions {
  handler: JobHandler;
  /**
   * How many jobs run at once. One by default: generation is CPU-bound and a single portal
   * instance provisioning two repositories in parallel only makes both slower.
   */
  concurrency?: number;
  /** Injected so tests are not at the mercy of the clock. */
  now?: () => Date;
  idFactory?: () => JobId;
}

interface Entry {
  record: JobRecord;
  job: ProvisionJob;
  controller: AbortController;
  subscribers: Set<JobEventListener>;
  /** Replayed to late subscribers — an SSE client that reconnects must not miss stages. */
  history: JobEvent[];
  settled: Promise<void>;
  resolveSettled: () => void;
}

export class InProcessDriver implements JobQueue {
  readonly kind = 'in-process' as const;

  readonly #entries = new Map<JobId, Entry>();
  /** specHash → jobId, for the idempotency check in `enqueue`. */
  readonly #activeByHash = new Map<string, JobId>();
  readonly #pending: JobId[] = [];
  readonly #handler: JobHandler;
  readonly #concurrency: number;
  readonly #now: () => Date;
  readonly #nextId: () => JobId;
  #running = 0;
  #sequence = 0;

  constructor(options: InProcessDriverOptions) {
    this.#handler = options.handler;
    this.#concurrency = Math.max(1, options.concurrency ?? 1);
    this.#now = options.now ?? ((): Date => new Date());
    this.#nextId = options.idFactory ?? ((): JobId => `job_${++this.#sequence}`);
  }

  /**
   * Enqueues a provisioning job.
   *
   * A job whose `specHash` matches one already in flight returns that job's id instead of
   * queueing a second one. Double-submitting the wizard is the common case — a user clicking
   * "Create" twice must not race two provisions into the same repository name.
   */
  async enqueue(job: ProvisionJob): Promise<JobId> {
    const existing = this.#activeByHash.get(job.specHash);
    if (existing !== undefined) return existing;

    const id = this.#nextId();
    let resolveSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
      resolveSettled = resolve;
    });

    this.#entries.set(id, {
      job,
      controller: new AbortController(),
      subscribers: new Set(),
      history: [],
      settled,
      resolveSettled,
      record: {
        id,
        status: 'queued',
        spec: job.spec,
        stages: [],
        warnings: [],
        createdAt: this.#now(),
      },
    });

    this.#activeByHash.set(job.specHash, id);
    this.#pending.push(id);
    this.#pump();

    return id;
  }

  async get(id: JobId): Promise<JobRecord | null> {
    const entry = this.#entries.get(id);
    // A copy: callers must not be able to mutate queue state through a returned record.
    return entry ? structuredClone(entry.record) : null;
  }

  subscribe(id: JobId, cb: JobEventListener, options: SubscribeOptions = {}): Unsubscribe {
    const entry = this.#entries.get(id);
    if (!entry) return () => {};

    /*
     * Replay first. A subscriber that attaches after the job started — which is every SSE client,
     * since the HTTP round trip takes longer than reaching 'resolving' — would otherwise show an
     * empty progress list until the next stage happens to fire.
     *
     * `after` narrows that to what the subscriber actually missed. A browser reconnecting with
     * `Last-Event-ID: 6` has already rendered events 0–6, and re-sending them would duplicate
     * every stage line it is displaying.
     *
     * An index into `history` IS the sequence number, so no separate counter can drift from it.
     */
    const from = options.after === undefined ? 0 : options.after + 1;
    for (let sequence = Math.max(0, from); sequence < entry.history.length; sequence++) {
      // Guarded exactly like live delivery: a callback that throws mid-replay must not propagate
      // out of subscribe() into the route handler that called it.
      deliver(cb, entry.history[sequence]!, sequence);
    }

    if (isTerminal(entry.record.status)) return () => {};

    entry.subscribers.add(cb);
    return () => entry.subscribers.delete(cb);
  }

  /**
   * Cancels a job that has not yet touched GitHub.
   *
   * Returns false once the job reaches `pushing` — at that point a repository exists, and
   * "cancellation" would mean deleting someone's repository, which is a destructive act the
   * queue has no business performing implicitly (doc 06 §6).
   */
  async cancel(id: JobId): Promise<boolean> {
    const entry = this.#entries.get(id);
    if (!entry || !isCancellable(entry.record.status)) return false;

    entry.controller.abort();

    // A queued job has no handler running to observe the abort, so it is settled here. A
    // running one is left to unwind through its own abort check, which keeps the handler in
    // charge of releasing whatever it holds.
    if (entry.record.status === 'queued') {
      const index = this.#pending.indexOf(id);
      if (index !== -1) this.#pending.splice(index, 1);
      this.#fail(entry, 'cancelled', 'Cancelled before provisioning started.');
    }

    return true;
  }

  /**
   * Re-queues a finished job as a new one.
   *
   * A new id rather than a reset: the original record is the audit trail of what was attempted
   * and why it failed, and overwriting it loses exactly the information someone retrying wants.
   */
  async retry(id: JobId): Promise<JobId> {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error(`Unknown job "${id}".`);
    if (!isTerminal(entry.record.status)) {
      throw new Error(`Job "${id}" is still ${entry.record.status}; it cannot be retried yet.`);
    }

    // The original hash is no longer active, so this enqueue is not deduplicated against it.
    this.#activeByHash.delete(entry.job.specHash);
    return this.enqueue(entry.job);
  }

  /** Resolves when the given job reaches a terminal state. Test and shutdown affordance. */
  async waitFor(id: JobId): Promise<JobRecord | null> {
    const entry = this.#entries.get(id);
    if (!entry) return null;
    await entry.settled;
    return this.get(id);
  }

  /** Resolves when nothing is queued or running. Used by the worker's graceful shutdown. */
  async drain(): Promise<void> {
    while (this.#pending.length > 0 || this.#running > 0) {
      await Promise.all([...this.#entries.values()].map((e) => e.settled));
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  #pump(): void {
    while (this.#running < this.#concurrency && this.#pending.length > 0) {
      const id = this.#pending.shift();
      if (id === undefined) return;
      const entry = this.#entries.get(id);
      if (!entry) continue;

      this.#running++;
      // Deliberately not awaited: enqueue() returns an id immediately and the HTTP request
      // that called it must not block on provisioning.
      void this.#run(entry).finally(() => {
        this.#running--;
        this.#pump();
      });
    }
  }

  async #run(entry: Entry): Promise<void> {
    // Cancelled while queued.
    if (entry.controller.signal.aborted) return;

    entry.record.startedAt = this.#now();
    entry.record.status = 'resolving';

    const context: JobContext = {
      id: entry.record.id,
      job: entry.job,
      signal: entry.controller.signal,
      setStatus: (status) => {
        if (isTerminal(entry.record.status)) return;
        entry.record.status = status;
      },
      stage: (stage, status, ms) => {
        entry.record.stages.push({ stage, status, ...(ms === undefined ? {} : { ms }) });
        this.#emit(entry, { type: 'stage', stage, status, ...(ms === undefined ? {} : { ms }) });
      },
      log: (level, message) => this.#emit(entry, { type: 'log', level, message }),
      progress: (current, total, label) =>
        this.#emit(entry, { type: 'progress', current, total, label }),
    };

    try {
      const result = await this.#handler(context);

      entry.record.repoUrl = result.repoUrl;
      if (result.mergeReport) entry.record.mergeReport = result.mergeReport;
      if (result.warnings?.length) entry.record.warnings = [...result.warnings];

      entry.record.status =
        entry.record.warnings.length > 0 ? 'completed_with_warnings' : 'completed';
      entry.record.finishedAt = this.#now();
      this.#emit(entry, { type: 'done', repoUrl: result.repoUrl, catalogId: result.catalogId });
      this.#settle(entry);
    } catch (cause) {
      if (cause instanceof JobCancelledError || entry.controller.signal.aborted) {
        this.#fail(entry, 'cancelled', 'Cancelled before provisioning completed.');
        return;
      }

      const code =
        typeof cause === 'object' && cause !== null && 'name' in cause
          ? String((cause as Error).name)
          : 'unknown_error';
      this.#fail(entry, code, cause instanceof Error ? cause.message : String(cause), cause);
    }
  }

  #fail(entry: Entry, code: string, message: string, cause?: unknown): void {
    entry.record.status = 'failed';
    entry.record.errorCode = code;
    entry.record.errorMessage = message;
    entry.record.finishedAt = this.#now();

    this.#emit(entry, {
      type: 'error',
      code,
      message,
      // A push that already happened is not something a blind retry can fix; anything before
      // that point costs only CPU to redo.
      recoverable: !hasPushed(entry.record) && !(cause instanceof RangeError),
    });
    this.#settle(entry);
  }

  #settle(entry: Entry): void {
    this.#activeByHash.delete(entry.job.specHash);
    entry.subscribers.clear();
    entry.resolveSettled();
  }

  #emit(entry: Entry, event: JobEvent): void {
    const sequence = entry.history.push(event) - 1;
    for (const subscriber of entry.subscribers) deliver(subscriber, event, sequence);
  }
}

/**
 * Delivers one event to one subscriber, swallowing whatever it throws.
 *
 * A subscriber that throws is almost always a closed SSE stream — a browser tab shut mid-
 * provision. That must not take down a job that is already half committed to GitHub: nobody
 * watching is not a failure.
 */
function deliver(subscriber: JobEventListener, event: JobEvent, sequence: number): void {
  try {
    subscriber(event, sequence);
  } catch {
    // Intentionally ignored — see above.
  }
}

function hasPushed(record: JobRecord): boolean {
  return record.stages.some((s) => s.stage === 'push' && s.status === 'done');
}
