import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spineSpec, uiOnlyVercelSpec } from '@idp/core';
import type { VirtualFile } from '@idp/generator';
import { FilesystemDriver } from './filesystem-driver.js';
import {
  ProvisionFailedError,
  SlugTakenError,
  provision,
  topicsFor,
  type ProvisionStage,
} from './provision.js';
import type { Availability, CommitMeta, RepoRef, Sha, VcsDriver } from './types.js';

let root: string;
let driver: FilesystemDriver;

const spec = spineSpec();

const files: VirtualFile[] = [
  { path: 'README.md', content: '# svc\n', producedBy: 'test' },
  { path: 'src/index.ts', content: 'export {};\n', producedBy: 'test' },
];

const generated = { files };

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'idp-prov-'));
  driver = new FilesystemDriver(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Wraps the real driver so chosen operations fail while the rest behave normally. */
function withFailures(base: VcsDriver, overrides: Partial<VcsDriver>): VcsDriver {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop in overrides) return overrides[prop as keyof VcsDriver];
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function rejects(message: string) {
  return () => Promise.reject(new Error(message));
}

describe('happy path', () => {
  it('creates, pushes and reports the file count', async () => {
    const result = await provision({ driver, spec, generated });

    expect(result.repo.name).toBe(spec.meta.slug);
    expect(result.fileCount).toBe(2);
    expect(result.sha).toMatch(/^fs-/);
    expect(result.warnings).toEqual([]);
  });

  it('runs the stages in order, external calls last', async () => {
    const seen: ProvisionStage[] = [];
    await provision({
      driver,
      spec,
      generated,
      onStage: (stage, status) => {
        if (status === 'start') seen.push(stage);
      },
    });

    expect(seen).toEqual(['availability', 'create', 'push', 'configure']);
  });

  it('protects the branch last — GitHub rejects protection on a branch with no commits', async () => {
    await provision({ driver, spec, generated });

    const operations = driver.calls.map((c) => c.operation);
    expect(operations.at(-1)).toBe('protectBranch');
  });

  it('grants the teams named in the spec', async () => {
    await provision({
      driver,
      spec: spineSpec({ meta: { repo: { teamSlugs: ['platform', 'sre'] } } }),
      generated,
    });

    const grant = driver.calls.find((c) => c.operation === 'grantTeams');
    expect(grant?.payload).toEqual([
      { teamSlug: 'platform', permission: 'push' },
      { teamSlug: 'sre', permission: 'push' },
    ]);
  });

  it('skips team grants and protection when the spec asks for neither', async () => {
    await provision({
      driver,
      spec: spineSpec({ meta: { repo: { teamSlugs: [], branchProtection: false } } }),
      generated,
    });

    expect(driver.calls.map((c) => c.operation)).toEqual(['setTopics']);
  });
});

describe('availability', () => {
  it('refuses a taken slug before creating anything', async () => {
    const repo = await driver.createRepo({
      org: spec.meta.repo.org,
      name: spec.meta.slug,
      visibility: 'private',
      defaultBranch: 'main',
    });
    await driver.pushTree(repo, files, { message: 'x', authorName: 'a', authorEmail: 'b@c.d' });

    await expect(provision({ driver, spec, generated })).rejects.toThrow(SlugTakenError);
  });

  // A failed lookup must not block provisioning — repo creation is itself atomic and rejects a
  // genuine collision. Treating an outage as a collision would halt every job.
  it('proceeds when availability is unknown', async () => {
    const unknown = withFailures(driver, {
      checkAvailability: (): Promise<Availability> =>
        Promise.resolve({ status: 'unknown', reason: 'API down' }),
    });

    await expect(provision({ driver: unknown, spec, generated })).resolves.toMatchObject({
      fileCount: 2,
    });
  });
});

describe('failure and rollback', () => {
  it('does not roll back when creation itself fails — there is nothing to remove', async () => {
    const broken = withFailures(driver, { createRepo: rejects('org not found') });

    await expect(provision({ driver: broken, spec, generated })).rejects.toMatchObject({
      name: 'ProvisionFailedError',
      stage: 'create',
      rolledBack: false,
    });
  });

  it('deletes the repository when the push fails', async () => {
    let deleted: string | undefined;
    const broken = withFailures(driver, {
      pushTree: rejects('network died'),
      deleteRepo: (repo: RepoRef): Promise<void> => {
        deleted = `${repo.org}/${repo.name}`;
        return Promise.resolve();
      },
    });

    const error = await provision({ driver: broken, spec, generated }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProvisionFailedError);
    expect(error).toMatchObject({ stage: 'push', rolledBack: true });
    expect(deleted).toBe(`${spec.meta.repo.org}/${spec.meta.slug}`);
    expect((error as Error).message).toContain('network died');
  });

  it('still reports the push failure when the rollback also fails', async () => {
    const broken = withFailures(driver, {
      pushTree: rejects('push exploded'),
      deleteRepo: rejects('delete also failed'),
    });

    const error = await provision({ driver: broken, spec, generated }).catch((e: unknown) => e);

    // The push failure is the actionable one; a leftover empty repo is minor cleanup.
    expect((error as Error).message).toContain('push exploded');
    expect(error).toMatchObject({ rolledBack: false });
  });

  // The core rule from doc 06 §6: once the code is pushed the repository is real and someone
  // may already have cloned it. Configuration failures degrade; they never destroy.
  it('never rolls back after a successful push', async () => {
    const broken = withFailures(driver, { protectBranch: rejects('protection API 500') });

    const result = await provision({ driver: broken, spec, generated });

    expect(result.sha).toMatch(/^fs-/);
    expect(result.warnings).toEqual([
      { operation: 'protectBranch', message: 'protection API 500' },
    ]);
    const after = await driver.checkAvailability(spec.meta.repo.org, spec.meta.slug);
    expect(after.status).toBe('taken');
  });

  it('collects every configuration failure rather than stopping at the first', async () => {
    const broken = withFailures(driver, {
      setTopics: rejects('setTopics failed'),
      protectBranch: rejects('protectBranch failed'),
    });

    const result = await provision({ driver: broken, spec, generated });

    expect(result.warnings.map((w) => w.operation)).toEqual(['setTopics', 'protectBranch']);
  });
});

describe('secrets', () => {
  it('skips the call when no secrets are supplied', async () => {
    await provision({ driver, spec, generated });
    expect(driver.calls.some((c) => c.operation === 'setSecrets')).toBe(false);
  });

  it('sets the supplied secrets', async () => {
    await provision({
      driver,
      spec,
      generated,
      secrets: [{ name: 'DATABASE_URL', value: 'REPLACE_ME' }],
    });

    expect(driver.calls.find((c) => c.operation === 'setSecrets')?.payload).toEqual([
      'DATABASE_URL',
    ]);
  });
});

describe('topics', () => {
  it('describes the stack so generated repos are findable later', () => {
    const topics = topicsFor(spec);

    expect(topics).toContain('idp-generated');
    expect(topics).toContain(spec.api?.runtime);
    expect(topics).toContain(spec.ui?.framework);
  });

  it('omits the database topic when there is none', () => {
    expect(topicsFor(uiOnlyVercelSpec())).not.toContain('none');
  });

  // GitHub rejects the entire call if one topic is invalid, so a client name with spaces or
  // punctuation must not cost the repository all of its topics.
  it('normalises client names into valid topics', () => {
    const topics = topicsFor(spineSpec({ meta: { clientName: 'ACME (UK) Ltd.' } }));

    expect(topics).toContain('client-acme-uk-ltd');
    for (const topic of topics) {
      expect(topic).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(topic.length).toBeLessThanOrEqual(50);
    }
  });

  it('deduplicates and caps at twenty', () => {
    const topics = topicsFor(spec);
    expect(new Set(topics).size).toBe(topics.length);
    expect(topics.length).toBeLessThanOrEqual(20);
  });
});

describe('commit metadata', () => {
  it('uses the requesting user as author when supplied', async () => {
    let captured: CommitMeta | undefined;
    const capturing = withFailures(driver, {
      pushTree: (_r: RepoRef, _f: readonly VirtualFile[], commit: CommitMeta): Promise<Sha> => {
        captured = commit;
        return Promise.resolve('sha');
      },
    });

    await provision({
      driver: capturing,
      spec,
      generated,
      commitAuthor: { name: 'Hamza', email: 'hamza@example.com' },
    });

    expect(captured?.authorName).toBe('Hamza');
    expect(captured?.message).toContain(spec.meta.projectName);
    expect(captured?.message.split('\n')[0]).toMatch(/^feat: /);
  });

  it('falls back to the portal identity', async () => {
    let captured: CommitMeta | undefined;
    const capturing = withFailures(driver, {
      pushTree: (_r: RepoRef, _f: readonly VirtualFile[], commit: CommitMeta): Promise<Sha> => {
        captured = commit;
        return Promise.resolve('sha');
      },
    });

    await provision({ driver: capturing, spec, generated });

    expect(captured?.authorEmail).toContain('@');
    expect(captured?.authorName).toBe('Internal Developer Portal');
  });
});
