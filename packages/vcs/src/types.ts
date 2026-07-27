/**
 * VCS contracts — see docs/plan/06-orchestration-queue-vcs.md §4
 *
 * Two drivers implement this: GitHubDriver (Octokit) and FilesystemDriver (local, offline).
 * Every test runs against the filesystem driver, which is what keeps the suite runnable
 * without network access or GitHub rate limits.
 */

import type { VirtualFile } from '@idp/generator';

export interface RepoRef {
  org: string;
  name: string;
  /** Provider-side id; absent for the filesystem driver. */
  id?: string;
  url: string;
  defaultBranch: string;
}

export type AvailabilityStatus = 'available' | 'taken' | 'unknown';

export interface Availability {
  status: AvailabilityStatus;
  /**
   * `unknown` is distinct from `available` on purpose: a failed lookup must not be reported as
   * free, or two users race into the same slug (doc 01 §1.2).
   */
  reason?: string;
}

export interface CreateRepoOpts {
  org: string;
  name: string;
  description?: string;
  visibility: 'private' | 'internal';
  defaultBranch: string;
  topics?: string[];
}

export interface CommitMeta {
  message: string;
  authorName: string;
  authorEmail: string;
}

export interface ProtectionRules {
  requirePullRequest: boolean;
  requiredApprovals: number;
  dismissStaleReviews: boolean;
  requiredStatusChecks: string[];
  allowForcePush: boolean;
  allowDeletion: boolean;
}

export interface TeamGrant {
  teamSlug: string;
  permission: 'pull' | 'push' | 'maintain' | 'admin';
}

/** Only placeholder values are ever set — real secrets are a deliberate human step (doc 00 §7). */
export interface SecretRef {
  name: string;
  value: string;
}

export type Sha = string;

export interface VcsDriver {
  readonly kind: 'github' | 'filesystem';

  checkAvailability(org: string, name: string): Promise<Availability>;
  createRepo(opts: CreateRepoOpts): Promise<RepoRef>;
  /**
   * Pushes the entire tree as ONE atomic commit.
   *
   * The GitHub implementation uses the Git Data API (createTree + createCommit + updateRef),
   * which is a fixed number of calls regardless of file count. The Contents API would be one
   * call per file — ~200 calls, minutes of latency, and a partially-pushed repo on failure.
   */
  pushTree(repo: RepoRef, files: readonly VirtualFile[], commit: CommitMeta): Promise<Sha>;
  protectBranch(repo: RepoRef, branch: string, rules: ProtectionRules): Promise<void>;
  grantTeams(repo: RepoRef, teams: readonly TeamGrant[]): Promise<void>;
  setSecrets(repo: RepoRef, secrets: readonly SecretRef[]): Promise<void>;
  setTopics(repo: RepoRef, topics: readonly string[]): Promise<void>;
  /** Compensating action only — see the rollback rules in doc 06 §6. */
  deleteRepo(repo: RepoRef): Promise<void>;
}

export const DEFAULT_PROTECTION_RULES: ProtectionRules = {
  requirePullRequest: true,
  requiredApprovals: 1,
  dismissStaleReviews: true,
  requiredStatusChecks: ['lint', 'test', 'build'],
  allowForcePush: false,
  allowDeletion: false,
};
