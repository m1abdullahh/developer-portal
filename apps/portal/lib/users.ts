/**
 * Reconciles the session identity with the `User` table.
 *
 * A JWT session carries an identity but creates no row, and `Draft.userId` and
 * `ProvisionJob.requestedById` are real foreign keys. Without this, saving a draft fails with a
 * constraint violation and the job's requester is silently dropped — which is exactly what
 * happened the first time the portal ran end to end.
 *
 * Upsert rather than create: the row is keyed on the GitHub id, so signing in again updates the
 * display fields instead of colliding.
 */

import { getPrisma } from '@idp/db';
import type { PortalUser } from './auth';

/**
 * A stable database key for a session.
 *
 * The dev identity is namespaced so it can never collide with a real GitHub numeric id — a
 * local `AUTH_DEV_LOGIN=1234` must not adopt the account of GitHub user 1234.
 */
export function githubIdFor(user: PortalUser): string {
  return user.id && user.id !== user.login ? user.id : `dev:${user.login}`;
}

/** Ensures the row exists and returns its database id. */
export async function ensureUser(user: PortalUser): Promise<string> {
  const githubId = githubIdFor(user);

  const record = await getPrisma().user.upsert({
    where: { githubId },
    create: {
      githubId,
      githubLogin: user.login,
      name: user.name,
      email: user.email ?? null,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role,
    },
    update: {
      githubLogin: user.login,
      name: user.name,
      // The role comes from GitHub team membership, so a promotion or removal there takes
      // effect on next sign-in rather than needing a manual database edit.
      role: user.role,
      ...(user.email ? { email: user.email } : {}),
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    },
  });

  return record.id;
}
