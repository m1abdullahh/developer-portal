---
to: <%= framework.sourceRoot %>lib/settings-api.ts
---
import type { Permission, Role } from './permissions';

export type { Permission, Role };

export interface OrgSettings {
  id: string;
  name: string;
  allowedEmailDomain: string | null;
  defaultRole: Role;
  requireApproval: boolean;
  updatedAt: string;
}

export interface PermissionEntry {
  role: Role;
  permission: Permission;
  allowed: boolean;
  /** False once an administrator has changed it away from the compiled-in policy. */
  isDefault: boolean;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

/** Only ever returned by `createApiKey`, and only once. */
export interface CreatedApiKey extends ApiKey {
  plaintext: string;
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
 * The API's base URL, from Nuxt's runtime config rather than an `env.ts` module.
 *
 * `useRuntimeConfig()` is called inside the helper, not at module scope: at module scope it runs
 * before Nuxt has a request context and throws.
 */
function apiBase(): string {
  return String(useRuntimeConfig().public.apiUrl ?? '').replace(/\/+$/, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiBase() + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    credentials: 'include',
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? response.statusText);
  }

  return (await response.json()) as T;
}

export function getSettings(): Promise<OrgSettings> {
  return request<OrgSettings>('/settings');
}

export function updateSettings(
  body: Partial<Omit<OrgSettings, 'id' | 'updatedAt'>>,
): Promise<OrgSettings> {
  return request<OrgSettings>('/settings', { method: 'PATCH', body: JSON.stringify(body) });
}

export async function getPermissions(): Promise<PermissionEntry[]> {
  return (await request<{ data: PermissionEntry[] }>('/settings/permissions')).data;
}

export async function savePermissions(entries: PermissionEntry[]): Promise<PermissionEntry[]> {
  const body = JSON.stringify({
    entries: entries.map(({ role, permission, allowed }) => ({ role, permission, allowed })),
  });
  return (await request<{ data: PermissionEntry[] }>('/settings/permissions', {
    method: 'PUT',
    body,
  })).data;
}

export async function getAuditLog(
  query: { cursor?: string; action?: string } = {},
): Promise<{ data: AuditEntry[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return request('/audit-logs' + (qs ? '?' + qs : ''));
}

export async function getApiKeys(): Promise<ApiKey[]> {
  return (await request<{ data: ApiKey[] }>('/api-keys')).data;
}

export function createApiKey(body: {
  name: string;
  expiresInDays?: number;
}): Promise<CreatedApiKey> {
  return request<CreatedApiKey>('/api-keys', { method: 'POST', body: JSON.stringify(body) });
}

export function revokeApiKey(id: string): Promise<ApiKey> {
  return request<ApiKey>('/api-keys/' + encodeURIComponent(id), { method: 'DELETE' });
}
