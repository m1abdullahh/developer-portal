/**
 * Server-side session access.
 *
 * Every route handler and server component that needs an identity goes through here, so the
 * "who is this and may they do it" question has exactly one implementation. Route handlers that
 * check authorisation ad hoc are how one endpoint ends up missing the check.
 */

import { auth, authUnconfigured, canProvision, type PortalUser, type Role } from './auth';

export interface AuthResult {
  user: PortalUser;
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = 'Sign in to continue.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'Your role does not permit this action.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** The current user, or null when signed out. */
export async function currentUser(): Promise<PortalUser | null> {
  const session = await auth();
  const user = session?.user as (PortalUser & { name?: string | null }) | undefined;
  if (!user?.login) return null;

  return {
    id: user.id ?? user.login,
    login: user.login,
    name: user.name ?? user.login,
    ...(user.email ? { email: user.email } : {}),
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    role: (user.role as Role) ?? 'viewer',
  };
}

/** Throws rather than returning null — for routes where anonymous access is simply invalid. */
export async function requireUser(): Promise<PortalUser> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Requires a role that may create repositories.
 *
 * Enforced server-side even though the UI hides the button: hiding a control is a courtesy to
 * the user, not an access control.
 */
export async function requireProvisioner(): Promise<PortalUser> {
  const user = await requireUser();
  if (!canProvision(user.role)) {
    throw new ForbiddenError(
      'Creating projects requires the provisioner role. Ask an administrator for access.',
    );
  }
  return user;
}

/** Maps a thrown auth error to a Response; rethrows anything else. */
export function authErrorResponse(error: unknown): Response | null {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export { authUnconfigured, canProvision };
export type { PortalUser, Role };
