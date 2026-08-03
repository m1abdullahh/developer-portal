---
to: <%= framework.sourceRoot %>lib/users-api.ts
---
import { ROLES, type Role } from './permissions';

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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The API's base URL, from Nuxt's runtime config.
 *
 * NOT from an `env.ts` module, which is what the React clients import. Nuxt has no such file: it
 * reads `runtimeConfig.public` at request time, overridden by `NUXT_PUBLIC_*` environment
 * variables. That difference is worth the divergence — a Next or Vite bundle inlines its public
 * variables at build time, so one image per environment; a Nuxt server reads them at runtime, so
 * the same image runs in staging and production.
 *
 * `useRuntimeConfig()` is called inside the helper rather than at module scope. At module scope it
 * runs before Nuxt has a request context and throws.
 */
function apiBase(): string {
  return String(useRuntimeConfig().public.apiUrl ?? '').replace(/\/+$/, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiBase() + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    // Sends the session cookie cross-origin. The API's CORS_ORIGINS must name this origin
    // exactly — a wildcard is rejected by the browser whenever credentials are included.
    credentials: 'include',
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? response.statusText);
  }

  return (await response.json()) as T;
}

export async function listUsers(
  query: { q?: string; role?: UserRole } = {},
): Promise<Page<User>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return request<Page<User>>('/users' + (qs ? '?' + qs : ''));
}

export function inviteUser(body: {
  email: string;
  name?: string;
  role: Exclude<UserRole, 'owner'>;
}): Promise<User> {
  return request<User>('/users', { method: 'POST', body: JSON.stringify(body) });
}

export function updateUser(id: string, body: { role?: UserRole }): Promise<User> {
  return request<User>('/users/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteUser(id: string): Promise<void> {
  return request<void>('/users/' + encodeURIComponent(id), { method: 'DELETE' });
}
