/**
 * The provisioning job handler.
 *
 * Generate everything first, then touch GitHub. That ordering is the whole reliability story:
 * validation, rendering, merging, codemods and verification are pure and in-memory, so a failure
 * there costs CPU and nothing else. Only a complete, verified tree earns an API call
 * (doc 06 §1).
 *
 * This is also the boundary where the two driver interfaces meet. Neither @idp/queue nor
 * @idp/vcs knows the other exists — the worker composes them, which is what lets the queue be
 * swapped for BullMQ and the VCS driver for the filesystem without touching either package.
 */

import { GenerationFailedError, createRegistry, runPipeline } from '@idp/generator';
import type { Diagnostic, RecipeRegistry } from '@idp/generator';
import { JobCancelledError, type JobContext, type JobHandler, type JobResult } from '@idp/queue';
import { provision, ProvisionFailedError, SlugTakenError, type VcsDriver } from '@idp/vcs';

export interface ProvisionHandlerOptions {
  driver: VcsDriver;
  registry?: RecipeRegistry;
  /** Registers the finished repository in the catalog. Injected so the handler stays testable. */
  register?: (input: {
    jobId: string;
    specHash: string;
    repoUrl: string;
    requestedById: string;
  }) => Promise<string>;
  logger?: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void };
}

export function createProvisionHandler(options: ProvisionHandlerOptions): JobHandler {
  const registry = options.registry ?? createRegistry();
  const log = options.logger ?? { info: () => {}, error: () => {} };

  return async function handleProvision(ctx: JobContext): Promise<JobResult> {
    const { spec, requestedById, specHash } = ctx.job;

    // ── generate ─────────────────────────────────────────────────────────────
    ctx.setStatus('generating');
    throwIfCancelled(ctx);

    let generated;
    try {
      generated = await runPipeline(spec, {
        registry,
        // The pipeline's stage events and the job's are the same shape by design, so progress
        // flows to the browser without a translation layer that could drift.
        onProgress: (event) => {
          if (event.type === 'stage') ctx.stage(event.stage, event.status, event.ms);
          else if (event.type === 'log') ctx.log(event.level, event.message);
          else ctx.progress(event.current, event.total, event.label);
        },
      });
    } catch (cause) {
      if (cause instanceof GenerationFailedError) {
        log.error({ jobId: ctx.id, stage: cause.stage }, 'generation failed');
      }
      throw cause;
    }

    log.info(
      { jobId: ctx.id, files: generated.files.length, ms: generated.durationMs },
      'generation complete',
    );

    // The last safe moment to cancel: nothing external exists yet. After this line, cancellation
    // would mean deleting a real repository, which the queue refuses to do implicitly.
    throwIfCancelled(ctx);

    // ── provision ────────────────────────────────────────────────────────────
    ctx.setStatus('pushing');

    const result = await provision({
      driver: options.driver,
      spec,
      generated,
      commitAuthor: { name: 'Internal Developer Portal', email: 'idp@users.noreply.github.com' },
      onStage: (stage, status) => {
        if (stage === 'push') ctx.stage('push', status);
        if (stage === 'configure') {
          if (status === 'start') ctx.setStatus('configuring');
          ctx.stage('configure', status);
        }
      },
    });

    for (const warning of result.warnings) {
      ctx.log('warn', `${warning.operation} did not complete: ${warning.message}`);
    }

    // Generation diagnostics and post-push warnings both reach the job record, so the detail
    // view shows "created, but check these" rather than a bare green tick.
    const warnings: Diagnostic[] = [
      ...generated.diagnostics.filter((d) => d.severity !== 'error'),
      ...result.warnings.map((w) => ({
        severity: 'warn' as const,
        code: 'VCS_CONFIG_INCOMPLETE',
        message: `${w.operation}: ${w.message}`,
      })),
    ];

    // ── register ─────────────────────────────────────────────────────────────
    ctx.stage('register', 'start');
    let catalogId = '';
    try {
      catalogId =
        (await options.register?.({
          jobId: ctx.id,
          specHash,
          repoUrl: result.repo.url,
          requestedById,
        })) ?? '';
      ctx.stage('register', 'done');
    } catch (cause) {
      // The repository exists and is pushed. A catalog row that failed to write is a
      // reconciliation problem, not a reason to report the whole provision as failed and send
      // the user back to a wizard that would then collide with their own repository.
      //
      // It goes into `warnings`, not just the event log: the log is transient, and someone
      // reconciling the catalog next week needs this on the persisted record.
      ctx.stage('register', 'fail');
      const detail = `The repository was created but the catalog entry failed: ${message(cause)}`;
      ctx.log('warn', detail);
      warnings.push({ severity: 'warn', code: 'CATALOG_REGISTRATION_FAILED', message: detail });
    }

    return {
      repoUrl: result.repo.url,
      catalogId,
      warnings,
      mergeReport: generated.mergeReport,
    };
  };
}

function throwIfCancelled(ctx: JobContext): void {
  if (ctx.signal.aborted) throw new JobCancelledError();
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export { GenerationFailedError, ProvisionFailedError, SlugTakenError };
