import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { VirtualFile } from '@idp/generator';
import { FilesystemDriver } from './filesystem-driver.js';
import { DEFAULT_PROTECTION_RULES, type RepoRef } from './types.js';

let root: string;
let driver: FilesystemDriver;

const commit = { message: 'init', authorName: 'IDP', authorEmail: 'idp@example.com' };

function file(p: string, content: string | Uint8Array = 'x'): VirtualFile {
  return { path: p, content, producedBy: 'test' };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'idp-fs-'));
  driver = new FilesystemDriver(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('availability', () => {
  it('reports a fresh name as available', async () => {
    expect(await driver.checkAvailability('acme', 'new-svc')).toEqual({ status: 'available' });
  });

  it('reports an empty directory as available', async () => {
    await mkdir(path.join(root, 'acme', 'empty'), { recursive: true });
    expect((await driver.checkAvailability('acme', 'empty')).status).toBe('available');
  });

  it('reports a non-empty directory as taken', async () => {
    await mkdir(path.join(root, 'acme', 'used'), { recursive: true });
    await writeFile(path.join(root, 'acme', 'used', 'a.txt'), 'x');
    expect((await driver.checkAvailability('acme', 'used')).status).toBe('taken');
  });
});

describe('pushTree', () => {
  let repo: RepoRef;

  beforeEach(async () => {
    repo = await driver.createRepo({
      org: 'acme',
      name: 'svc',
      visibility: 'private',
      defaultBranch: 'main',
    });
  });

  it('writes every file, creating nested directories', async () => {
    await driver.pushTree(
      repo,
      [file('README.md', '# hi\n'), file('src/deep/a.ts', 'export const a = 1;\n')],
      commit,
    );

    expect(await readFile(path.join(root, 'acme/svc/README.md'), 'utf8')).toBe('# hi\n');
    expect(await readFile(path.join(root, 'acme/svc/src/deep/a.ts'), 'utf8')).toContain('const a');
  });

  it('writes binary content unchanged', async () => {
    await driver.pushTree(repo, [file('logo.png', new Uint8Array([137, 80, 78, 71]))], commit);
    expect([...(await readFile(path.join(root, 'acme/svc/logo.png')))]).toEqual([137, 80, 78, 71]);
  });

  it('refuses to write outside the repository', async () => {
    await expect(driver.pushTree(repo, [file('../../escape.txt')], commit)).rejects.toThrow(
      /outside the repository/,
    );
  });

  // Golden-file tests compare provisioning results, so the same tree must yield the same sha.
  it('returns a deterministic sha for identical content', async () => {
    const files = [file('a.ts', 'const a = 1;'), file('b.ts', 'const b = 2;')];
    const first = await driver.pushTree(repo, files, commit);
    const second = await driver.pushTree(repo, [...files].reverse(), commit);
    expect(second).toBe(first);
  });

  it('returns a different sha when content changes', async () => {
    const a = await driver.pushTree(repo, [file('a.ts', 'one')], commit);
    const b = await driver.pushTree(repo, [file('a.ts', 'two')], commit);
    expect(b).not.toBe(a);
  });
});

describe('recorded remote-only operations', () => {
  let repo: RepoRef;

  beforeEach(async () => {
    repo = await driver.createRepo({
      org: 'acme',
      name: 'svc',
      visibility: 'private',
      defaultBranch: 'main',
    });
  });

  it('records branch protection instead of performing it', async () => {
    await driver.protectBranch(repo, 'main', DEFAULT_PROTECTION_RULES);
    expect(driver.calls).toContainEqual({
      operation: 'protectBranch',
      repo: 'acme/svc',
      payload: { branch: 'main', rules: DEFAULT_PROTECTION_RULES },
    });
  });

  it('records team grants and topics', async () => {
    await driver.grantTeams(repo, [{ teamSlug: 'platform', permission: 'push' }]);
    await driver.setTopics(repo, ['idp-generated']);
    expect(driver.calls.map((c) => c.operation)).toEqual(['grantTeams', 'setTopics']);
  });

  // Recording values — even placeholders — would put them into test output and CI logs.
  it('records only secret NAMES, never values', async () => {
    await driver.setSecrets(repo, [{ name: 'JWT_SECRET', value: 'super-secret-value' }]);

    const recorded = driver.calls.find((c) => c.operation === 'setSecrets');
    expect(recorded?.payload).toEqual(['JWT_SECRET']);
    expect(JSON.stringify(driver.calls)).not.toContain('super-secret-value');
  });

  it('deleteRepo removes the directory', async () => {
    await driver.pushTree(repo, [file('a.ts')], commit);
    await driver.deleteRepo(repo);
    expect((await driver.checkAvailability('acme', 'svc')).status).toBe('available');
  });
});
