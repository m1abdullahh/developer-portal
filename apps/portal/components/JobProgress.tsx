'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Badge, Banner, Button, Card } from './ui';

interface Stage {
  stage: string;
  status: 'start' | 'done' | 'fail';
  ms?: number;
}

interface JobView {
  id: string;
  status: string;
  stages: Stage[];
  warnings: Array<{ code: string; message: string }>;
  repoUrl?: string | null;
  errorMessage?: string | null;
  org?: string;
  slug?: string;
}

const STAGE_LABELS: Record<string, string> = {
  resolve: 'Resolve recipes',
  plan: 'Plan the file tree',
  render: 'Render templates',
  merge: 'Merge contributions',
  codemod: 'Apply codemods',
  format: 'Format',
  verify: 'Verify',
  push: 'Push to GitHub',
  configure: 'Configure the repository',
  register: 'Register in the catalog',
};

const TERMINAL = new Set(['completed', 'completed_with_warnings', 'failed']);

/**
 * One row per stage, showing its latest state.
 *
 * The job record keeps every transition — a `start` entry *and* a `done` entry for each stage —
 * because that is the audit trail the catalog and any later debugging depend on. Rendering it
 * literally listed every stage twice: a pending row directly above its completed twin.
 *
 * Collapsing here rather than discarding the transitions keeps the record intact and fixes the
 * only place the distinction is noise.
 */
function collapseStages(stages: readonly Stage[]): Stage[] {
  const byStage = new Map<string, Stage>();

  for (const stage of stages) {
    const existing = byStage.get(stage.stage);
    // A `start` never overwrites a finished stage; ordering is not guaranteed across a reconnect.
    if (existing && stage.status === 'start' && existing.status !== 'start') continue;
    byStage.set(stage.stage, { ...existing, ...stage });
  }

  // Map preserves insertion order, so stages stay in the order they first ran.
  return [...byStage.values()];
}

/**
 * Live provisioning progress.
 *
 * Consumes the SSE stream, which replays whatever already happened before this component
 * mounted — the HTTP round trip is slower than the first stages, so without replay the list would
 * start half-empty and fill in from wherever the stream happened to join.
 */
export function JobProgress({ jobId, initial }: { jobId: string; initial: JobView }) {
  const [job, setJob] = useState<JobView>(initial);
  const [streamError, setStreamError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (TERMINAL.has(initial.status)) return;

    const source = new EventSource(`/api/jobs/${jobId}/events`);
    sourceRef.current = source;

    source.onmessage = (message) => {
      const event = JSON.parse(message.data as string) as
        | { type: 'snapshot'; record: JobView }
        | { type: 'stage'; stage: string; status: 'start' | 'done' | 'fail'; ms?: number }
        | { type: 'log'; level: string; message: string }
        | { type: 'progress'; current: number; total: number; label: string }
        | { type: 'done'; repoUrl: string }
        | { type: 'error'; code: string; message: string };

      setJob((current) => {
        switch (event.type) {
          case 'snapshot':
            return { ...current, ...event.record };
          case 'stage': {
            /*
             * Keyed by stage name, so applying an event twice changes nothing.
             *
             * The server renders the initial stage list, and the SSE stream then replays the
             * events that produced it — so every stage arrives a second time. Appending on
             * 'start' listed each one twice: a pending row and a completed row, one above the
             * other. Each stage runs exactly once per job, so the name is a safe identity.
             */
            const stages = [...current.stages];
            const index = stages.findIndex((s) => s.stage === event.stage);
            const next: Stage = {
              stage: event.stage,
              status: event.status,
              ...(event.ms === undefined ? {} : { ms: event.ms }),
            };

            if (index === -1) stages.push(next);
            // A late 'start' must not undo a 'done' already displayed — replay order is not
            // guaranteed to match arrival order once a reconnect is involved.
            else if (!(event.status === 'start' && stages[index]!.status !== 'start')) {
              stages[index] = next;
            }

            return { ...current, stages };
          }
          case 'done':
            return { ...current, status: 'completed', repoUrl: event.repoUrl };
          case 'error':
            return { ...current, status: 'failed', errorMessage: event.message };
          default:
            return current;
        }
      });

      if (event.type === 'done' || event.type === 'error') {
        source.close();
        // Re-read the authoritative record: the stream reports the outcome, but warnings and the
        // final status (completed vs completed_with_warnings) come from the job itself.
        void fetch(`/api/jobs/${jobId}`)
          .then((r) => r.json())
          .then((body: JobView) => setJob((current) => ({ ...current, ...body })))
          .catch(() => {});
      }
    };

    source.onerror = () => {
      // EventSource reconnects on its own; this only surfaces the interruption so a stalled page
      // does not look like a stalled provision.
      setStreamError('Connection interrupted — reconnecting.');
    };

    return () => source.close();
  }, [jobId, initial.status]);

  const done = TERMINAL.has(job.status);
  const stages = collapseStages(job.stages);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <StatusBadge status={job.status} />
        {job.org && job.slug ? (
          <span className="font-mono text-sm text-[hsl(var(--muted-foreground))]">
            {job.org}/{job.slug}
          </span>
        ) : null}
      </div>

      {streamError && !done ? <Banner tone="warning">{streamError}</Banner> : null}

      <Card>
        <ol className="space-y-2">
          {stages.length === 0 ? (
            <li className="text-sm text-[hsl(var(--muted-foreground))]">Waiting to start…</li>
          ) : null}
          {stages.map((stage) => (
            <li key={stage.stage} className="flex items-center gap-3 text-sm">
              <StageMark status={stage.status} />
              <span className="flex-1">{STAGE_LABELS[stage.stage] ?? stage.stage}</span>
              {stage.ms !== undefined ? (
                <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                  {stage.ms}ms
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      {job.errorMessage ? (
        <Banner tone="danger">
          <p className="font-medium">Provisioning failed</p>
          <p className="mt-1 font-mono text-xs break-all">{job.errorMessage}</p>
        </Banner>
      ) : null}

      {job.warnings.length > 0 ? (
        <Banner tone="warning">
          <p className="font-medium">Created, with warnings</p>
          <ul className="mt-2 space-y-1 text-xs">
            {job.warnings.map((warning, i) => (
              <li key={i}>
                <span className="font-mono">{warning.code}</span> — {warning.message}
              </li>
            ))}
          </ul>
        </Banner>
      ) : null}

      {job.repoUrl ? (
        <div className="flex items-center gap-3">
          <a href={job.repoUrl} target="_blank" rel="noreferrer">
            <Button>Open the repository</Button>
          </a>
          {job.slug ? (
            <Link href={`/catalog/${job.slug}`}>
              <Button variant="secondary">View in catalog</Button>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <Badge tone="success">Completed</Badge>;
  if (status === 'completed_with_warnings')
    return <Badge tone="warning">Completed with warnings</Badge>;
  if (status === 'failed') return <Badge tone="danger">Failed</Badge>;
  return <Badge tone="accent">{status}</Badge>;
}

function StageMark({ status }: { status: Stage['status'] }) {
  const common = 'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]';
  if (status === 'done') {
    return (
      <span className={`${common} bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]`}>✓</span>
    );
  }
  if (status === 'fail') {
    return (
      <span className={`${common} bg-[hsl(var(--destructive))]/20 text-[hsl(var(--destructive))]`}>
        ✕
      </span>
    );
  }
  return <span className={`${common} animate-pulse bg-[hsl(var(--accent))]/30`} />;
}
