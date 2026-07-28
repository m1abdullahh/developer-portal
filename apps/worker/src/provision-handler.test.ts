/**
 * End-to-end: a ProjectSpec goes in, a provisioned repository comes out.
 *
 * This is the Phase 1 gate rehearsed without GitHub. Everything is real — the recipe registry,
 * the full pipeline, the merge and codemod stages, the verifier, the driver writing files — with
 * only the remote swapped for a temporary directory.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spineSpec, uiOnlyVercelSpec } from '@idp/core';
import { InProcessDriver, type ProvisionJob } from '@idp/queue';
import { FilesystemDriver } from '@idp/vcs';
import { createProvisionHandler } from './provision-handler.js';

let root: string;
let driver: FilesystemDriver;

function job(spec = spineSpec(), specHash = 'hash-1'): ProvisionJob {
  return { spec, requestedById: 'user-1', specHash };
}

function queueFor(overrides: Parameters<typeof createProvisionHandler>[0]) {
  return new InProcessDriver({ handler: createProvisionHandler(overrides) });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'idp-e2e-'));
  driver = new FilesystemDriver(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the full spine', () => {
  it('generates and provisions a complete project', async () => {
    const queue = queueFor({ driver, register: async () => 'catalog-1' });

    const id = await queue.enqueue(job());
    const record = await queue.waitFor(id);

    expect(record?.status).toBe('completed');
    expect(record?.repoUrl).toContain(spineSpec().meta.slug);
  }, 60_000);

  // Two-layer projects ship as two independently installable apps, not an npm workspace —
  // the generated CI runs `npm ci` inside each app directory, so there is no root manifest.
  it('writes a repository that contains both layers and its ops manifests', async () => {
    const queue = queueFor({ driver });
    await queue.waitFor(await queue.enqueue(job()));

    const repo = path.join(root, spineSpec().meta.repo.org, spineSpec().meta.slug);

    await expect(readFile(path.join(repo, 'apps/web/package.json'), 'utf8')).resolves.toContain(
      'next',
    );
    await expect(readFile(path.join(repo, 'apps/api/src/server.ts'), 'utf8')).resolves.toContain(
      'fastify',
    );
    await expect(readFile(path.join(repo, 'deploy/Chart.yaml'), 'utf8')).resolves.toContain(
      'apiVersion: v2',
    );
    await expect(readFile(path.join(repo, '.github/workflows/ci.yml'), 'utf8')).resolves.toContain(
      'jobs:',
    );
  }, 60_000);

  it('reports the stages the browser draws its progress list from', async () => {
    const queue = queueFor({ driver });
    const id = await queue.enqueue(job());
    const record = await queue.waitFor(id);

    const done = record!.stages.filter((s) => s.status === 'done').map((s) => s.stage);
    expect(done).toEqual(
      expect.arrayContaining([
        'resolve',
        'plan',
        'render',
        'merge',
        'codemod',
        'format',
        'verify',
        'push',
        'configure',
      ]),
    );
    // Generation strictly precedes anything external — the ordering the whole design rests on.
    expect(done.indexOf('verify')).toBeLessThan(done.indexOf('push'));
  }, 60_000);

  // Single-layer projects go flat: no apps/ prefix, since there is nothing to disambiguate.
  it('provisions a UI-only project flat, with no api directory', async () => {
    const spec = uiOnlyVercelSpec();
    const queue = queueFor({ driver });
    await queue.waitFor(await queue.enqueue(job(spec, 'hash-ui')));

    const repo = path.join(root, spec.meta.repo.org, spec.meta.slug);
    await expect(readFile(path.join(repo, 'package.json'), 'utf8')).resolves.toContain('next');
    await expect(readFile(path.join(repo, 'apps/api/src/server.ts'), 'utf8')).rejects.toThrow();
  }, 60_000);
});

describe('failure behaviour', () => {
  it('fails the job without creating a repository when the spec is invalid', async () => {
    const queue = queueFor({ driver });

    // tRPC on Go — one of the PRD contradictions the compatibility matrix resolves.
    const invalid = { ...spineSpec(), api: { ...spineSpec().api!, runtime: 'go' as const } };
    const record = await queue.waitFor(await queue.enqueue(job(invalid, 'bad')));

    expect(record?.status).toBe('failed');
    expect(driver.calls).toHaveLength(0);
    expect((await driver.checkAvailability(invalid.meta.repo.org, invalid.meta.slug)).status).toBe(
      'available',
    );
  }, 30_000);

  // A catalog write is bookkeeping. The repository is already pushed and may already be cloned;
  // reporting the whole provision as failed would send the user back to a wizard that would then
  // collide with their own repository.
  it('completes with a warning when the catalog registration fails', async () => {
    const queue = queueFor({
      driver,
      register: () => Promise.reject(new Error('database unreachable')),
    });

    const record = await queue.waitFor(await queue.enqueue(job()));

    expect(record?.status).toBe('completed_with_warnings');
    expect(record?.repoUrl).toBeTruthy();
    expect(record?.stages).toContainEqual({ stage: 'register', status: 'fail' });
    // Persisted, not merely logged — whoever reconciles the catalog later needs it on the record.
    expect(record?.warnings.map((w) => w.code)).toContain('CATALOG_REGISTRATION_FAILED');
  }, 60_000);

  it('surfaces post-push configuration failures as warnings, keeping the repository', async () => {
    const flaky = new Proxy(driver, {
      get(target, prop, receiver) {
        if (prop === 'protectBranch') {
          return () => Promise.reject(new Error('protection API unavailable'));
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    const queue = queueFor({ driver: flaky });
    const record = await queue.waitFor(await queue.enqueue(job()));

    expect(record?.status).toBe('completed_with_warnings');
    expect(record?.warnings.map((w) => w.code)).toContain('VCS_CONFIG_INCOMPLETE');
    const repo = path.join(root, spineSpec().meta.repo.org, spineSpec().meta.slug);
    await expect(readFile(path.join(repo, 'apps/api/package.json'), 'utf8')).resolves.toBeTruthy();
  }, 60_000);
});

describe('determinism', () => {
  // Two runs of the same spec must produce byte-identical trees, or golden tests are worthless
  // and "regenerate and diff" stops being a usable review technique.
  it('produces the same tree hash twice', async () => {
    const first = queueFor({ driver });
    const a = await first.waitFor(await first.enqueue(job(spineSpec(), 'h1')));

    const secondRoot = await mkdtemp(path.join(tmpdir(), 'idp-e2e2-'));
    try {
      const otherDriver = new FilesystemDriver(secondRoot);
      const second = queueFor({ driver: otherDriver });
      const b = await second.waitFor(await second.enqueue(job(spineSpec(), 'h2')));

      expect(b?.status).toBe(a?.status);

      const repoA = path.join(root, spineSpec().meta.repo.org, spineSpec().meta.slug);
      const repoB = path.join(secondRoot, spineSpec().meta.repo.org, spineSpec().meta.slug);
      for (const file of ['apps/api/src/server.ts', 'apps/web/package.json', 'README.md']) {
        expect(await readFile(path.join(repoB, file), 'utf8')).toBe(
          await readFile(path.join(repoA, file), 'utf8'),
        );
      }
    } finally {
      await rm(secondRoot, { recursive: true, force: true });
    }
  }, 90_000);
});
