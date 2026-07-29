/**
 * GitHubDriver — real repository provisioning via Octokit.
 *
 * ── Why the Git Data API and not the Contents API ────────────────────────────
 * The obvious implementation is `PUT /repos/{o}/{r}/contents/{path}` per file. For a 62-file
 * project that is 62 sequential requests — minutes of latency, meaningful rate-limit spend,
 * 62 commits in the history, and worst of all a *partially pushed repository* if any one call
 * fails halfway through.
 *
 * The Git Data API builds the whole tree first and moves the branch ref once: a fixed handful
 * of calls regardless of file count, one commit, and nothing visible in the repository until
 * the final `updateRef` succeeds. Failure leaves an empty repo rather than half a project.
 *
 * See docs/plan/06-orchestration-queue-vcs.md §4.1.
 */

import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
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

const ThrottledOctokit = Octokit.plugin(retry, throttling);

export interface GitHubDriverOptions {
  /** Installation access token, minted per job. */
  auth: string;
  /** Override for GitHub Enterprise. */
  baseUrl?: string;
  /** Called on rate-limit backoff so the worker can surface it in job logs. */
  onRateLimit?: (message: string) => void;
}

export class GitHubApiError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number | undefined,
    cause: unknown,
  ) {
    super(`GitHub ${operation} failed${status ? ` (${status})` : ''}: ${describe(cause)}`);
    this.name = 'GitHubApiError';
    this.cause = cause;
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function statusOf(cause: unknown): number | undefined {
  return typeof cause === 'object' && cause !== null && 'status' in cause
    ? (cause as { status?: number }).status
    : undefined;
}

export class GitHubDriver implements VcsDriver {
  readonly kind = 'github' as const;
  readonly #octokit: Octokit;

  constructor(options: GitHubDriverOptions) {
    const notify = options.onRateLimit ?? (() => {});

    this.#octokit = new ThrottledOctokit({
      auth: options.auth,
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      throttle: {
        // Retrying rather than failing: a provisioning job that dies on a transient rate limit
        // has already created a repository, and the compensating path is far more disruptive
        // than waiting.
        onRateLimit: (retryAfter, requestOptions, _o, retryCount) => {
          notify(
            `Rate limited on ${requestOptions.method} ${requestOptions.url}; retrying in ${retryAfter}s`,
          );
          return retryCount < 3;
        },
        onSecondaryRateLimit: (retryAfter, requestOptions, _o, retryCount) => {
          notify(`Secondary rate limit on ${requestOptions.url}; retrying in ${retryAfter}s`);
          return retryCount < 3;
        },
      },
    });
  }

  async checkAvailability(org: string, name: string): Promise<Availability> {
    try {
      await this.#octokit.repos.get({ owner: org, repo: name });
      return { status: 'taken', reason: 'A repository with this name already exists.' };
    } catch (cause) {
      if (statusOf(cause) === 404) return { status: 'available' };

      // Anything else — 403, 5xx, network — is UNKNOWN, never available. Reporting a failed
      // lookup as free is how two provisions race into the same name.
      return { status: 'unknown', reason: describe(cause) };
    }
  }

  async createRepo(opts: CreateRepoOpts): Promise<RepoRef> {
    try {
      const { data } = await this.#octokit.repos.createInOrg({
        org: opts.org,
        name: opts.name,
        ...(opts.description ? { description: opts.description } : {}),
        // Both `private` and `internal` are non-public.
        private: true,
        // Octokit types `visibility` as 'private' | 'public'. `internal` is a real value for
        // GitHub Enterprise Cloud org-visible repositories that their typings have not caught
        // up with, so it is asserted rather than dropped — dropping it would silently create a
        // private repo where the user asked for an org-visible one.
        visibility: opts.visibility as 'private' | 'public',
        /*
         * Initialised with a commit, deliberately.
         *
         * The Git Data API cannot operate on a repository that has no commits at all:
         * `createTree` answers 409 "Git Repository is empty". So the repo needs a base commit
         * before the real tree can be written. `pushTree` then force-updates the branch to a
         * fresh root commit, which leaves the auto-generated commit unreferenced — the history
         * still shows exactly one commit, which is the property we wanted from `auto_init: false`
         * in the first place.
         */
        auto_init: true,
        has_issues: true,
        has_wiki: false,
        has_projects: false,
        delete_branch_on_merge: true,
      });

      // GitHub names the initial branch from the org's default, which may not be what was asked
      // for. Renaming keeps a single branch rather than leaving an orphaned `main` behind.
      if (data.default_branch && data.default_branch !== opts.defaultBranch) {
        await this.#octokit.repos.renameBranch({
          owner: opts.org,
          repo: data.name,
          branch: data.default_branch,
          new_name: opts.defaultBranch,
        });
      }

      return {
        org: opts.org,
        name: data.name,
        id: String(data.id),
        url: data.html_url,
        defaultBranch: opts.defaultBranch,
      };
    } catch (cause) {
      throw new GitHubApiError('createRepo', statusOf(cause), cause);
    }
  }

  /**
   * Pushes the entire project as one atomic commit.
   *
   * Binary files become blobs first (the tree API takes base64 only via a blob sha); text is
   * inlined, which avoids a round trip per file.
   */
  async pushTree(repo: RepoRef, files: readonly VirtualFile[], commit: CommitMeta): Promise<Sha> {
    const owner = repo.org;
    const name = repo.name;

    try {
      const tree = await Promise.all(
        files.map(async (file) => {
          const base = { path: file.path, mode: fileMode(file), type: 'blob' } as const;

          if (typeof file.content === 'string') {
            return { ...base, content: file.content };
          }

          const { data: blob } = await this.#octokit.git.createBlob({
            owner,
            repo: name,
            content: Buffer.from(file.content).toString('base64'),
            encoding: 'base64',
          });
          return { ...base, sha: blob.sha };
        }),
      );

      const { data: createdTree } = await this.#octokit.git.createTree({
        owner,
        repo: name,
        tree,
      });

      const { data: createdCommit } = await this.#octokit.git.createCommit({
        owner,
        repo: name,
        message: commit.message,
        // A root commit, with no parent — so the repository's history is exactly this one
        // commit rather than ours stacked on top of GitHub's auto-generated README commit.
        parents: [],
        tree: createdTree.sha,
        author: { name: commit.authorName, email: commit.authorEmail },
      });

      // Nothing above is visible in the repository until the ref moves — which is what makes the
      // whole push atomic from an observer's point of view.
      //
      // `force` because the new commit is unrelated to the auto-init commit the branch currently
      // points at; without it GitHub rejects the update as a non-fast-forward.
      try {
        await this.#octokit.git.updateRef({
          owner,
          repo: name,
          ref: `heads/${repo.defaultBranch}`,
          sha: createdCommit.sha,
          force: true,
        });
      } catch (cause) {
        // The branch may legitimately not exist — a repository created outside this driver, or
        // a rename that did not take. Creating it is the correct fallback, not a failure.
        if (statusOf(cause) !== 422 && statusOf(cause) !== 404) throw cause;
        await this.#octokit.git.createRef({
          owner,
          repo: name,
          ref: `refs/heads/${repo.defaultBranch}`,
          sha: createdCommit.sha,
        });
      }

      return createdCommit.sha;
    } catch (cause) {
      throw new GitHubApiError('pushTree', statusOf(cause), cause);
    }
  }

  /**
   * Applies branch protection.
   *
   * Must run AFTER the initial commit: GitHub rejects protection rules on a branch that does
   * not exist yet, and an empty repository has no branches.
   */
  async protectBranch(repo: RepoRef, branch: string, rules: ProtectionRules): Promise<void> {
    try {
      await this.#octokit.repos.updateBranchProtection({
        owner: repo.org,
        repo: repo.name,
        branch,
        required_status_checks:
          rules.requiredStatusChecks.length > 0
            ? { strict: true, contexts: [...rules.requiredStatusChecks] }
            : null,
        enforce_admins: false,
        required_pull_request_reviews: rules.requirePullRequest
          ? {
              required_approving_review_count: rules.requiredApprovals,
              dismiss_stale_reviews: rules.dismissStaleReviews,
              require_code_owner_reviews: false,
            }
          : null,
        restrictions: null,
        allow_force_pushes: rules.allowForcePush,
        allow_deletions: rules.allowDeletion,
      });
    } catch (cause) {
      throw new GitHubApiError('protectBranch', statusOf(cause), cause);
    }
  }

  async grantTeams(repo: RepoRef, teams: readonly TeamGrant[]): Promise<void> {
    for (const team of teams) {
      try {
        await this.#octokit.teams.addOrUpdateRepoPermissionsInOrg({
          org: repo.org,
          team_slug: team.teamSlug,
          owner: repo.org,
          repo: repo.name,
          permission: team.permission,
        });
      } catch (cause) {
        throw new GitHubApiError(`grantTeams(${team.teamSlug})`, statusOf(cause), cause);
      }
    }
  }

  /**
   * Sets Actions secrets.
   *
   * Values are encrypted with the repository's public key before transmission — GitHub never
   * accepts a plaintext secret. Only placeholders are ever written by the provisioner; real
   * values remain a deliberate human step (doc 00 §7).
   */
  async setSecrets(repo: RepoRef, secrets: readonly SecretRef[]): Promise<void> {
    if (secrets.length === 0) return;

    try {
      const { data: key } = await this.#octokit.actions.getRepoPublicKey({
        owner: repo.org,
        repo: repo.name,
      });

      const sodium = (await import('libsodium-wrappers')).default;
      await sodium.ready;

      for (const secret of secrets) {
        const encrypted = sodium.crypto_box_seal(
          sodium.from_string(secret.value),
          sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL),
        );

        await this.#octokit.actions.createOrUpdateRepoSecret({
          owner: repo.org,
          repo: repo.name,
          secret_name: secret.name,
          encrypted_value: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL),
          key_id: key.key_id,
        });
      }
    } catch (cause) {
      throw new GitHubApiError('setSecrets', statusOf(cause), cause);
    }
  }

  async setTopics(repo: RepoRef, topics: readonly string[]): Promise<void> {
    try {
      await this.#octokit.repos.replaceAllTopics({
        owner: repo.org,
        repo: repo.name,
        names: [...topics],
      });
    } catch (cause) {
      throw new GitHubApiError('setTopics', statusOf(cause), cause);
    }
  }

  /**
   * Deletes a repository.
   *
   * A compensating action only — see the rollback rules in doc 06 §6. The worker calls this
   * exclusively for a repo it created in the same job that has no commits from anyone else.
   */
  async deleteRepo(repo: RepoRef): Promise<void> {
    try {
      await this.#octokit.repos.delete({ owner: repo.org, repo: repo.name });
    } catch (cause) {
      throw new GitHubApiError('deleteRepo', statusOf(cause), cause);
    }
  }
}

/** Git tree modes: 100644 regular, 100755 executable. */
function fileMode(file: VirtualFile): '100644' | '100755' {
  return file.mode !== undefined && (file.mode & 0o111) !== 0 ? '100755' : '100644';
}
