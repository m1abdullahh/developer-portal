import { describe, expect, it } from 'vitest';
import { spineSpec } from '@idp/core';
import { InProcessDriver, JobCancelledError, type JobHandler } from './in-process.js';
import { isCancellable, type JobEvent, type ProvisionJob } from './types.js';

const spec = spineSpec();

function job(specHash = 'hash-1'): ProvisionJob {
  return { spec, requestedById: 'user-1', specHash };
}

const succeeds: JobHandler = async () => ({
  repoUrl: 'https://github.com/acme/acme-health-backend',
  catalogId: 'cat-1',
});

/** A handler that blocks until the test releases it. */
function gated(): { handler: JobHandler; release: () => void; started: Promise<void> } {
  let release!: () => void;
  let markStarted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const handler: JobHandler = async (ctx) => {
    markStarted();
    await gate;
    if (ctx.signal.aborted) throw new JobCancelledError();
    return { repoUrl: 'https://github.com/acme/x', catalogId: 'cat' };
  };

  return { handler, release, started };
}

describe('lifecycle', () => {
  it('runs a job to completion and records the repo url', async () => {
    const queue = new InProcessDriver({ handler: succeeds });

    const id = await queue.enqueue(job());
    const record = await queue.waitFor(id);

    expect(record?.status).toBe('completed');
    expect(record?.repoUrl).toBe('https://github.com/acme/acme-health-backend');
    expect(record?.finishedAt).toBeInstanceOf(Date);
  });

  it('returns an id immediately without waiting for the work', async () => {
    const { handler, release, started } = gated();
    const queue = new InProcessDriver({ handler });

    const id = await queue.enqueue(job());
    await started;

    expect((await queue.get(id))?.status).toBe('resolving');
    release();
    await queue.waitFor(id);
  });

  it('reports completed_with_warnings when the handler returns warnings', async () => {
    const queue = new InProcessDriver({
      handler: async () => ({
        repoUrl: 'https://github.com/acme/x',
        catalogId: 'cat',
        warnings: [{ severity: 'warn', code: 'W1', message: 'a placeholder was left behind' }],
      }),
    });

    const record = await queue.waitFor(await queue.enqueue(job()));
    expect(record?.status).toBe('completed_with_warnings');
    expect(record?.warnings).toHaveLength(1);
  });

  it('records a handler failure as failed, with the message', async () => {
    const queue = new InProcessDriver({
      handler: async () => {
        throw new Error('template render blew up');
      },
    });

    const record = await queue.waitFor(await queue.enqueue(job()));
    expect(record?.status).toBe('failed');
    expect(record?.errorMessage).toBe('template render blew up');
    expect(record?.errorCode).toBe('Error');
  });

  it('returns null for an unknown job', async () => {
    const queue = new InProcessDriver({ handler: succeeds });
    expect(await queue.get('nope')).toBeNull();
  });

  // Handing out the live record would let a route handler mutate queue state by accident.
  it('returns a copy, not the live record', async () => {
    const queue = new InProcessDriver({ handler: succeeds });
    const id = await queue.enqueue(job());
    await queue.waitFor(id);

    const first = await queue.get(id);
    first!.status = 'failed';
    expect((await queue.get(id))?.status).toBe('completed');
  });
});

describe('idempotency', () => {
  // The common case is a user double-clicking "Create". Two jobs would race into the same
  // repository name and one would fail with a confusing collision error.
  it('deduplicates an in-flight job by specHash', async () => {
    const { handler, release, started } = gated();
    const queue = new InProcessDriver({ handler });

    const first = await queue.enqueue(job('same'));
    await started;
    const second = await queue.enqueue(job('same'));

    expect(second).toBe(first);
    release();
    await queue.waitFor(first);
  });

  it('allows the same spec again once the previous job has finished', async () => {
    const queue = new InProcessDriver({ handler: succeeds });

    const first = await queue.enqueue(job('same'));
    await queue.waitFor(first);
    const second = await queue.enqueue(job('same'));

    expect(second).not.toBe(first);
  });

  it('does not deduplicate different specs', async () => {
    const { handler, release, started } = gated();
    const queue = new InProcessDriver({ handler });

    const first = await queue.enqueue(job('a'));
    await started;
    const second = await queue.enqueue(job('b'));

    expect(second).not.toBe(first);
    release();
    await queue.drain();
  });
});

describe('cancellation', () => {
  it('cancels a queued job before it ever starts', async () => {
    const { handler, release, started } = gated();
    const queue = new InProcessDriver({ handler, concurrency: 1 });

    const running = await queue.enqueue(job('a'));
    await started;
    const waiting = await queue.enqueue(job('b'));

    expect(await queue.cancel(waiting)).toBe(true);
    const record = await queue.get(waiting);
    expect(record?.status).toBe('failed');
    expect(record?.errorCode).toBe('cancelled');

    release();
    await queue.waitFor(running);
  });

  it('aborts the signal of a running job', async () => {
    let observed: boolean | undefined;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });

    const queue = new InProcessDriver({
      handler: async (ctx) => {
        markStarted();
        await new Promise<void>((resolve) => ctx.signal.addEventListener('abort', () => resolve()));
        observed = ctx.signal.aborted;
        throw new JobCancelledError();
      },
    });

    const id = await queue.enqueue(job());
    await started;
    expect(await queue.cancel(id)).toBe(true);

    const record = await queue.waitFor(id);
    expect(observed).toBe(true);
    expect(record?.errorCode).toBe('cancelled');
  });

  // The rule that matters: once a repository exists on GitHub, "cancel" would mean deleting
  // someone's repository. The queue refuses rather than doing that implicitly (doc 06 §6).
  it('refuses to cancel once the job is pushing', async () => {
    let markPushing!: () => void;
    const pushing = new Promise<void>((resolve) => {
      markPushing = resolve;
    });
    let gateResolve!: () => void;
    const gate = new Promise<void>((resolve) => {
      gateResolve = resolve;
    });

    const queue = new InProcessDriver({
      handler: async (ctx) => {
        ctx.setStatus('pushing');
        markPushing();
        await gate;
        return { repoUrl: 'https://github.com/acme/x', catalogId: 'cat' };
      },
    });

    const id = await queue.enqueue(job());
    await pushing;

    expect(await queue.cancel(id)).toBe(false);
    expect((await queue.get(id))?.status).toBe('pushing');

    gateResolve();
    expect((await queue.waitFor(id))?.status).toBe('completed');
  });

  it('refuses to cancel a job that already finished', async () => {
    const queue = new InProcessDriver({ handler: succeeds });
    const id = await queue.enqueue(job());
    await queue.waitFor(id);

    expect(await queue.cancel(id)).toBe(false);
  });

  it('agrees with isCancellable on every status', () => {
    expect(isCancellable('queued')).toBe(true);
    expect(isCancellable('generating')).toBe(true);
    expect(isCancellable('pushing')).toBe(false);
    expect(isCancellable('configuring')).toBe(false);
    expect(isCancellable('completed')).toBe(false);
    expect(isCancellable('failed')).toBe(false);
  });
});

describe('retry', () => {
  it('creates a new job and leaves the original record intact', async () => {
    let attempt = 0;
    const queue = new InProcessDriver({
      handler: async () => {
        attempt++;
        if (attempt === 1) throw new Error('transient GitHub 500');
        return { repoUrl: 'https://github.com/acme/x', catalogId: 'cat' };
      },
    });

    const first = await queue.enqueue(job());
    await queue.waitFor(first);

    const second = await queue.retry(first);
    expect(second).not.toBe(first);
    expect((await queue.waitFor(second))?.status).toBe('completed');

    // The audit trail of the failed attempt survives — that is what someone debugging wants.
    const original = await queue.get(first);
    expect(original?.status).toBe('failed');
    expect(original?.errorMessage).toBe('transient GitHub 500');
  });

  it('refuses to retry a job that is still running', async () => {
    const { handler, release, started } = gated();
    const queue = new InProcessDriver({ handler });

    const id = await queue.enqueue(job());
    await started;
    await expect(queue.retry(id)).rejects.toThrow(/still resolving/);

    release();
    await queue.waitFor(id);
  });

  it('throws for an unknown job', async () => {
    const queue = new InProcessDriver({ handler: succeeds });
    await expect(queue.retry('nope')).rejects.toThrow(/Unknown job/);
  });
});

describe('events', () => {
  it('delivers stage, log and done events in order', async () => {
    const events: JobEvent[] = [];
    const queue = new InProcessDriver({
      handler: async (ctx) => {
        ctx.stage('render', 'start');
        ctx.log('info', 'rendering 11 recipes');
        ctx.stage('render', 'done', 42);
        return { repoUrl: 'https://github.com/acme/x', catalogId: 'cat' };
      },
    });

    const id = await queue.enqueue(job());
    queue.subscribe(id, (e) => events.push(e));
    await queue.waitFor(id);

    expect(events.map((e) => e.type)).toEqual(['stage', 'log', 'stage', 'done']);
    expect(events[2]).toMatchObject({ type: 'stage', status: 'done', ms: 42 });
  });

  // Every SSE client subscribes after the job started — the HTTP round trip takes longer than
  // reaching the first stage — so without replay the progress list renders empty.
  it('replays history to a late subscriber', async () => {
    const queue = new InProcessDriver({
      handler: async (ctx) => {
        ctx.stage('render', 'start');
        ctx.stage('render', 'done');
        return { repoUrl: 'https://github.com/acme/x', catalogId: 'cat' };
      },
    });

    const id = await queue.enqueue(job());
    await queue.waitFor(id);

    const replayed: JobEvent[] = [];
    queue.subscribe(id, (e) => replayed.push(e));

    expect(replayed.map((e) => e.type)).toEqual(['stage', 'stage', 'done']);
  });

  it('stops delivering after unsubscribe', async () => {
    const events: JobEvent[] = [];
    let gateResolve!: () => void;
    const gate = new Promise<void>((resolve) => {
      gateResolve = resolve;
    });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });

    const queue = new InProcessDriver({
      handler: async (ctx) => {
        ctx.stage('render', 'start');
        markStarted();
        await gate;
        ctx.stage('render', 'done');
        return { repoUrl: 'https://github.com/acme/x', catalogId: 'cat' };
      },
    });

    const id = await queue.enqueue(job());
    await started;

    const unsubscribe = queue.subscribe(id, (e) => events.push(e));
    unsubscribe();
    gateResolve();
    await queue.waitFor(id);

    // Only the replayed 'start' — nothing that fired after unsubscribing.
    expect(events.map((e) => e.type)).toEqual(['stage']);
  });

  // A browser tab closing mid-provision must not fail the job that is already half done.
  it('survives a subscriber that throws', async () => {
    const queue = new InProcessDriver({
      handler: async (ctx) => {
        ctx.stage('render', 'start');
        return { repoUrl: 'https://github.com/acme/x', catalogId: 'cat' };
      },
    });

    const id = await queue.enqueue(job());
    queue.subscribe(id, () => {
      throw new Error('stream closed');
    });

    expect((await queue.waitFor(id))?.status).toBe('completed');
  });

  it('marks a failure before the push as recoverable', async () => {
    const events: JobEvent[] = [];
    const queue = new InProcessDriver({
      handler: async (ctx) => {
        ctx.stage('render', 'start');
        throw new Error('render failed');
      },
    });

    const id = await queue.enqueue(job());
    queue.subscribe(id, (e) => events.push(e));
    await queue.waitFor(id);

    expect(events.at(-1)).toMatchObject({ type: 'error', recoverable: true });
  });

  it('marks a failure after the push as unrecoverable — a blind retry would collide', async () => {
    const events: JobEvent[] = [];
    const queue = new InProcessDriver({
      handler: async (ctx) => {
        ctx.stage('push', 'done');
        ctx.setStatus('configuring');
        throw new Error('branch protection API died');
      },
    });

    const id = await queue.enqueue(job());
    queue.subscribe(id, (e) => events.push(e));
    await queue.waitFor(id);

    expect(events.at(-1)).toMatchObject({ type: 'error', recoverable: false });
  });
});

describe('concurrency', () => {
  it('runs one job at a time by default', async () => {
    let active = 0;
    let peak = 0;
    const queue = new InProcessDriver({
      handler: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return { repoUrl: 'https://github.com/acme/x', catalogId: 'cat' };
      },
    });

    await Promise.all([0, 1, 2, 3].map((n) => queue.enqueue(job(`h${n}`))));
    await queue.drain();

    expect(peak).toBe(1);
  });

  it('honours a raised concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const queue = new InProcessDriver({
      concurrency: 3,
      handler: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return { repoUrl: 'https://github.com/acme/x', catalogId: 'cat' };
      },
    });

    await Promise.all([0, 1, 2, 3, 4].map((n) => queue.enqueue(job(`h${n}`))));
    await queue.drain();

    expect(peak).toBe(3);
  });

  it('drains every queued job', async () => {
    const queue = new InProcessDriver({ handler: succeeds });
    const ids = await Promise.all([0, 1, 2].map((n) => queue.enqueue(job(`h${n}`))));

    await queue.drain();

    for (const id of ids) {
      expect((await queue.get(id))?.status).toBe('completed');
    }
  });
});
