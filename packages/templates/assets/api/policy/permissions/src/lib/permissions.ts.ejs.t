---
to: <%= policyPath %>
---
/**
 * Role and permission policy — the SINGLE definition of who may do what.
 *
 * This exact file is emitted into every layer that enforces it: the API's middleware reads it, and
 * so do the browser app's route guards. Two enforcement points, one definition, because a UI that
 * hides a button the API still permits is a security bug waiting to be found, and the reverse is a
 * support ticket nobody can reproduce.
 *
 * The copies are generated from one template and asserted identical by the generator's own test
 * suite. Edit one and you must edit the other; regenerating rewrites both.
 *
 * ── Why the role names look like this ───────────────────────────────────────
 * These strings are used verbatim as the Prisma `UserRole` enum values, so there is no mapping
 * layer between what the database stores and what this policy checks. That is deliberate: a
 * translation table between `ADMIN` and `admin` is exactly the kind of seam where an unmapped
 * value silently becomes "no permissions" — which fails open or closed depending on the call site,
 * and neither is something you want to discover in production.
 */

export const ROLES = ['viewer', 'editor', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'read',
  'write',
  'delete',
  'manage:users',
  'manage:settings',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * `owner` holds exactly what `admin` holds.
 *
 * The difference between them is structural, not permissive: an organisation must always have at
 * least one active owner, and the API refuses any change that would remove the last one. Granting
 * owners an extra permission would suggest the distinction is about capability, which it is not.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: ['read'],
  editor: ['read', 'write', 'delete'],
  admin: ['read', 'write', 'delete', 'manage:users', 'manage:settings'],
  owner: ['read', 'write', 'delete', 'manage:users', 'manage:settings'],
};

/**
 * Consulted before the defaults, when something has installed one.
 *
 * The settings module makes the matrix editable and stores the differences in the database. Rather
 * than teach the auth middleware about that table — coupling authentication to a feature that may
 * not be installed — the store registers itself here, and every existing caller keeps working
 * unchanged. With nothing installed, the defaults below are the whole policy.
 *
 * Returning `undefined` means "no opinion, use the default", which is different from returning
 * `false`. Conflating the two would make every unlisted pair a denial the moment any override
 * existed.
 */
export type PermissionResolver = (role: Role, permission: Permission) => boolean | undefined;

let resolver: PermissionResolver | null = null;

export function setPermissionResolver(next: PermissionResolver | null): void {
  resolver = next;
}

export function hasPermission(role: Role, permission: Permission): boolean {
  const override = resolver?.(role, permission);
  if (override !== undefined) return override;

  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** The compiled-in defaults, ignoring any resolver. The matrix editor renders against these. */
export function defaultPermissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Narrows an untrusted string — a JWT claim, a query parameter — to a role. */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
