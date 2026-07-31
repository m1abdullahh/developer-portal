---
to: <%= framework.sourceRoot %>lib/settings-api.ts
---
import { env } from '@/lib/env';
import { PERMISSIONS, ROLES, type Permission, type Role } from '@/lib/permissions';

/**
 * Typed client for the settings, permissions, audit and API-key endpoints.
 *
 * Free of any state library, like `users-api.ts` — plain async functions the project's own choice
 * of data layer can wrap. `ROLES` and `PERMISSIONS` are re-exported from the shared policy rather
 * than restated, so the grid this renders is the grid the server enforces.
 */
const BASE = env.<%= framework.publicEnvPrefix %>API_URL.replace(/\/+$/, '');

export { PERMISSIONS, ROLES };
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
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

export function updateSettings(body: Partial<Omit<OrgSettings, 'id' | 'updatedAt'>>) {
  return request<OrgSettings>('/settings', { method: 'PATCH', body: JSON.stringify(body) });
}

export async function getPermissions(): Promise<PermissionEntry[]> {
  return (await request<{ entries: PermissionEntry[] }>('/settings/permissions')).entries;
}

/**
 * Sends the whole grid, not a patch.
 *
 * The server replaces its stored differences wholesale, so a permission revoked here actually
 * disappears — a patch would leave the old row in place and keep granting it.
 */
export async function savePermissions(entries: PermissionEntry[]): Promise<PermissionEntry[]> {
  const body = {
    entries: entries.map(({ role, permission, allowed }) => ({ role, permission, allowed })),
  };
  return (
    await request<{ entries: PermissionEntry[] }>('/settings/permissions', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  ).entries;
}

export function getAuditLog(query: { cursor?: string; action?: string } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return request<{ data: AuditEntry[]; nextCursor: string | null }>(
    `/audit-logs${qs ? `?${qs}` : ''}`,
  );
}

export async function getApiKeys(): Promise<ApiKey[]> {
  return (await request<{ data: ApiKey[] }>('/api-keys')).data;
}

export function createApiKey(body: { name: string; expiresInDays?: number }) {
  return request<CreatedApiKey>('/api-keys', { method: 'POST', body: JSON.stringify(body) });
}

export function revokeApiKey(id: string): Promise<ApiKey> {
  return request<ApiKey>(`/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
