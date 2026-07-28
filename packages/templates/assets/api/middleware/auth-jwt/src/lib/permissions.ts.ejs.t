---
to: src/lib/permissions.ts
---
/**
 * Role and permission policy.
 *
 * This is the SINGLE definition of who may do what. The UI's route guards and this API's
 * middleware both read it, so the two enforcement points cannot drift — a UI that hides a
 * button the API still permits is a security bug waiting to be found, and the reverse is a
 * support ticket.
 */

export const ROLES = ['viewer', 'editor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'read',
  'write',
  'delete',
  'manage:users',
  'manage:settings',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: ['read'],
  editor: ['read', 'write', 'delete'],
  admin: ['read', 'write', 'delete', 'manage:users', 'manage:settings'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
