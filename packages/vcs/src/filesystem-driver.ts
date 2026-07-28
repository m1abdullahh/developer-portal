/**
 * FilesystemDriver — writes a generated project to a local directory.
 *
 * Used by every test, by the CLI, and by the portal's preview mode. Its existence is what
 * keeps the whole suite runnable offline, free of GitHub rate limits, and free of the
 * side effect of creating real repositories on every test run.
 *
 * Operations that only make sense against a remote (branch protection, team grants, secrets)
 * are recorded rather than performed, so tests can assert that the worker *would* have called
 * them without a network round trip.
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VirtualFile } from '@idp/generator';
import {
  type Availability,
  type CommitMeta,
  type CreateRepoOpts,
  type ProtectionRules,
  type RepoRef,
  type SecretRef,
  type Sha,
  type TeamGrant,
  type VcsDriver,
} from './types.js';

/** Everything the driver was asked to do but does not perform locally. */
export interface RecordedCall {
  operation: 'protectBranch' | 'grantTeams' | 'setSecrets' | 'setTopics' | 'deleteRepo';
  repo: string;
  payload: unknown;
}

export class FilesystemDriver implements VcsDriver {
  readonly kind = 'filesystem' as const;
  readonly calls: RecordedCall[] = [];

  constructor(private readonly root: string) {}

  private repoPath(org: string, name: string): string {
    return path.resolve(this.root, org, name);
  }

  async checkAvailability(org: string, name: string): Promise<Availability> {
    try {
      const entries = await readdir(this.repoPath(org, name));
      return entries.length === 0
        ? { status: 'available' }
        : { status: 'taken', reason: 'A directory of that name already exists and is not empty.' };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'available' };
      // Deliberately NOT reported as available — an unreadable path is unknown, and treating
      // unknown as free is how two jobs end up writing the same destination.
      return { status: 'unknown', reason: (err as Error).message };
    }
  }

  async createRepo(opts: CreateRepoOpts): Promise<RepoRef> {
    const dir = this.repoPath(opts.org, opts.name);
    await mkdir(dir, { recursive: true });
    return {
      org: opts.org,
      name: opts.name,
      url: `file://${dir.replace(/\\/g, '/')}`,
      defaultBranch: opts.defaultBranch,
    };
  }

  async pushTree(repo: RepoRef, files: readonly VirtualFile[], _commit: CommitMeta): Promise<Sha> {
    const root = this.repoPath(repo.org, repo.name);

    for (const file of files) {
      const target = path.resolve(root, file.path);

      // Re-validated here even though paths were normalised at insertion: this is the moment
      // they become real writes.
      if (target !== root && !target.startsWith(root + path.sep)) {
        throw new Error(`Refusing to write "${file.path}" — it resolves outside the repository.`);
      }

      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(
        target,
        typeof file.content === 'string' ? file.content : Buffer.from(file.content),
        file.mode === undefined ? {} : { mode: file.mode },
      );
    }

    // A deterministic stand-in for a commit SHA — derived from the content so two identical
    // pushes produce the same value, which keeps golden tests stable.
    return `fs-${hashTree(files)}`;
  }

  async protectBranch(repo: RepoRef, branch: string, rules: ProtectionRules): Promise<void> {
    this.record('protectBranch', repo, { branch, rules });
  }

  async grantTeams(repo: RepoRef, teams: readonly TeamGrant[]): Promise<void> {
    this.record('grantTeams', repo, teams);
  }

  async setSecrets(repo: RepoRef, secrets: readonly SecretRef[]): Promise<void> {
    // Names only. Recording values — even placeholders — would put them in test output.
    this.record(
      'setSecrets',
      repo,
      secrets.map((s) => s.name),
    );
  }

  async setTopics(repo: RepoRef, topics: readonly string[]): Promise<void> {
    this.record('setTopics', repo, topics);
  }

  async deleteRepo(repo: RepoRef): Promise<void> {
    this.record('deleteRepo', repo, null);
    await rm(this.repoPath(repo.org, repo.name), { recursive: true, force: true });
  }

  private record(operation: RecordedCall['operation'], repo: RepoRef, payload: unknown): void {
    this.calls.push({ operation, repo: `${repo.org}/${repo.name}`, payload });
  }
}

/** FNV-1a over sorted path+content. Not cryptographic — only needs to be stable and cheap. */
function hashTree(files: readonly VirtualFile[]): string {
  let hash = 0x811c9dc5;
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    const text =
      file.path +
      (typeof file.content === 'string' ? file.content : file.content.length.toString());
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}
