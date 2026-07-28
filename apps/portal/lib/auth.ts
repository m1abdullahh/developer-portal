/**
 * Authentication — Auth.js v5, GitHub OAuth, gated on organisation membership.
 *
 * Two rules from doc 00 §7 shape this file:
 *
 *   1. A valid GitHub login is NOT sufficient. Anyone can authenticate with GitHub; only members
 *      of the configured organisation may use the portal, because using it means creating
 *      repositories in that organisation. Membership is checked at sign-in against the API, not
 *      inferred from the token.
 *   2. Roles are assigned from org team membership, never self-declared. `provisioner` is the
 *      role that can actually create repositories.
 *
 * ── On the development fallback ──────────────────────────────────────────────
 * Without OAuth credentials the portal would be impossible to run or test at all. When
 * AUTH_DEV_LOGIN is set AND the app is not in production, a fixed local identity is used
 * instead. It is refused outright in production — a misconfigured deployment must fail closed,
 * not quietly accept an unauthenticated user as an admin.
 */

import NextAuth, { type NextAuthConfig, type Session } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';

export type Role = 'viewer' | 'provisioner' | 'admin';

export interface PortalUser {
  id: string;
  login: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  role: Role;
}

/** Roles permitted to create repositories. Viewing the catalog needs no such right. */
export const PROVISION_ROLES: readonly Role[] = ['provisioner', 'admin'];

export function canProvision(role: Role | undefined): boolean {
  return role !== undefined && PROVISION_ROLES.includes(role);
}

export function isDevAuth(): boolean {
  return process.env.NODE_ENV !== 'production' && Boolean(process.env.AUTH_DEV_LOGIN);
}

export function githubOrg(): string | undefined {
  return process.env.GITHUB_ORG;
}

/**
 * Checks organisation membership against the GitHub API.
 *
 * A failed lookup returns false, never true. Treating an API outage as "probably a member" would
 * turn a GitHub incident into an authorisation bypass — the failure mode has to be lockout.
 */
export async function checkOrgMembership(
  login: string,
  accessToken: string,
  org: string,
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/orgs/${org}/members/${login}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(8000),
    });
    // 204 = a member. 302 = requester is not an org member so cannot see. 404 = not a member.
    return response.status === 204;
  } catch {
    return false;
  }
}

/**
 * Resolves a role from org team membership.
 *
 * Unknown or unreachable resolves to `viewer`: the least privilege that still lets someone read
 * the catalog, so a GitHub blip degrades the experience rather than escalating anyone.
 */
export async function resolveRole(login: string, accessToken: string, org: string): Promise<Role> {
  const adminTeam = process.env.GITHUB_ADMIN_TEAM;
  const provisionerTeam = process.env.GITHUB_PROVISIONER_TEAM;

  for (const [team, role] of [
    [adminTeam, 'admin'],
    [provisionerTeam, 'provisioner'],
  ] as const) {
    if (!team) continue;
    try {
      const response = await fetch(
        `https://api.github.com/orgs/${org}/teams/${team}/memberships/${login}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (response.ok) {
        const body = (await response.json()) as { state?: string };
        if (body.state === 'active') return role;
      }
    } catch {
      // Fall through to the next team, then to viewer.
    }
  }

  // No teams configured at all means the org itself is the boundary, which is a legitimate
  // small-team setup — everyone in the org may provision.
  if (!adminTeam && !provisionerTeam) return 'provisioner';
  return 'viewer';
}

const providers: NextAuthConfig['providers'] = [];

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      // `read:org` is required to see team membership; without it every role resolves to viewer.
      authorization: { params: { scope: 'read:user user:email read:org' } },
    }),
  );
}

if (isDevAuth()) {
  providers.push(
    Credentials({
      id: 'dev',
      name: 'Development sign-in',
      credentials: {},
      authorize: () => ({
        id: 'dev-user',
        name: process.env.AUTH_DEV_LOGIN ?? 'dev',
        email: `${process.env.AUTH_DEV_LOGIN ?? 'dev'}@localhost`,
      }),
    }),
  );
}

export const authConfig: NextAuthConfig = {
  providers,
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },

  callbacks: {
    async signIn({ account, profile }) {
      // The dev provider has already been gated on NODE_ENV at construction time.
      if (account?.provider === 'dev') return true;

      const org = githubOrg();
      const login = typeof profile?.login === 'string' ? profile.login : undefined;
      const token = account?.access_token;

      // No org configured means no membership boundary can be enforced. Refusing is the only
      // safe reading: the alternative is an internal portal open to every GitHub account.
      if (!org) return false;
      if (!login || !token) return false;

      return checkOrgMembership(login, token, org);
    },

    async jwt({ token, account, profile }) {
      if (account?.provider === 'dev') {
        token.login = process.env.AUTH_DEV_LOGIN ?? 'dev';
        token.role = (process.env.AUTH_DEV_ROLE as Role) ?? 'admin';
        return token;
      }

      // Roles are resolved once at sign-in rather than per request: a team-membership lookup on
      // every page load would spend the API rate limit on something that changes monthly.
      if (account?.access_token && typeof profile?.login === 'string') {
        const org = githubOrg();
        token.login = profile.login;
        token.avatarUrl = typeof profile.avatar_url === 'string' ? profile.avatar_url : undefined;
        token.role = org ? await resolveRole(profile.login, account.access_token, org) : 'viewer';
      }
      return token;
    },

    session({ session, token }) {
      const enriched = session as Session & { user: Session['user'] & Partial<PortalUser> };
      if (enriched.user) {
        enriched.user.login = typeof token.login === 'string' ? token.login : '';
        enriched.user.role = (token.role as Role) ?? 'viewer';
        if (typeof token.avatarUrl === 'string') enriched.user.avatarUrl = token.avatarUrl;
      }
      return enriched;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

/** True when neither GitHub OAuth nor the dev fallback is configured. */
export function authUnconfigured(): boolean {
  return providers.length === 0;
}
