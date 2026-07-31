---
to: <%= framework.sourceRoot %>lib/users-api.ts
---
import { env } from '@/lib/env';
import { ROLES, type Role } from '@/lib/permissions';

/**
 * Typed client for the users API.
 *
 * Deliberately free of any state library. Four are on offer and this module is shared by all of
 * them, so it exposes plain async functions instead: pass them straight to `useQuery` if the
 * project uses TanStack Query, call them from a thunk under Redux, or await them in an effect.
 * Binding it to one library here would make the module unusable under the other three.
 */
const BASE = env.<%= framework.publicEnvPrefix %>API_URL.replace(/\/+$/, '');

/**
 * Re-exported from the policy, not redeclared.
 *
 * `lib/permissions.ts` is emitted into this app *and* into the API from one template, so the role
 * list here is the same one the server enforces and the same one the database stores. This module
 * did once declare its own, which is how a project came to ship `OWNER | ADMIN | MEMBER | VIEWER`
 * in the browser against `viewer | editor | admin` on the server.
 */
export const USER_ROLES = ROLES;
export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED'] as const;

export type UserRole = Role;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ListUsersQuery {
  cursor?: string;
  limit?: number;
  role?: UserRole;
  status?: UserStatus;
  q?: string;
}

/**
 * Carries the status alongside the message.
 *
 * The distinction is the whole reason the API answers 409 rather than 400 for a duplicate
 * address or the last owner — a caller that only sees a string cannot tell "you sent something
 * malformed" from "this is valid but conflicts right now", and ends up showing the wrong advice.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    // Sends the session cookie cross-origin. The API's CORS_ORIGINS must name this origin
    // exactly — a wildcard is rejected by the browser whenever credentials are included.
    credentials: 'include',
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    // The API's error envelope, from src/schemas/common.ts. Falling back to statusText covers a
    // proxy or gateway answering before the application ever sees the request.
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? response.statusText);
  }

  return (await response.json()) as T;
}

export function listUsers(query: ListUsersQuery = {}): Promise<Page<User>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return request<Page<User>>(`/users${qs ? `?${qs}` : ''}`);
}

export function inviteUser(body: {
  email: string;
  name?: string;
  role: Exclude<UserRole, 'owner'>;
}): Promise<User> {
  return request<User>('/users', { method: 'POST', body: JSON.stringify(body) });
}

export function updateUser(
  id: string,
  body: { name?: string | null; role?: UserRole; status?: UserStatus },
): Promise<User> {
  return request<User>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteUser(id: string): Promise<void> {
  return request<void>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
