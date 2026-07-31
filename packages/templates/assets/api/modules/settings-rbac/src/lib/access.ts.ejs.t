---
to: src/lib/access.ts
---
import { prisma } from './prisma.js';
import {
  PERMISSIONS,
  ROLES,
  defaultPermissionsFor,
  setPermissionResolver,
  type Permission,
  type Role,
} from './permissions.js';

/**
 * The editable half of the permission policy.
 *
 * `permissions.ts` compiles in the defaults; this loads the differences an administrator has saved
 * and installs them as the resolver every `hasPermission()` call consults. The middleware never
 * learns that this table exists.
 *
 * ── Why it is cached ────────────────────────────────────────────────────────
 * `requirePermission` runs on every guarded request. Reading four rows from Postgres each time
 * would put a database round-trip in front of every authenticated call, and the matrix changes
 * perhaps once a quarter. The cache is invalidated on write rather than expiring on a timer, so a
 * saved change takes effect immediately in the process that saved it.
 *
 * ── The part to know before you scale out ───────────────────────────────────
 * The cache is per process. With more than one replica, a change saved on pod A is not seen by
 * pod B until that pod restarts or reloads. For a matrix edited this rarely that is usually
 * acceptable; if it is not, publish invalidation over Redis and call `reload()` on receipt.
 */
type Matrix = Map<string, boolean>;

const key = (role: Role, permission: Permission): string => `${role}:${permission}`;

let overrides: Matrix = new Map();
let loaded = false;

/** Reads the stored differences and installs them. Call once at boot, and after every write. */
export async function reload(): Promise<void> {
  const rows = await prisma.rolePermission.findMany();

  const next: Matrix = new Map();
  for (const row of rows) {
    // Rows that merely restate a default are dropped: keeping them would make the table grow
    // every time someone opens the editor and presses save without changing anything.
    const isDefault = defaultPermissionsFor(row.role).includes(row.permission as Permission);
    if (row.allowed !== isDefault) next.set(key(row.role, row.permission as Permission), row.allowed);
  }

  overrides = next;
  loaded = true;
  setPermissionResolver((role, permission) => overrides.get(key(role, permission)));
}

/**
 * The full effective matrix, for the editor to render.
 *
 * Every role against every permission, so the UI never has to reconstruct which pairs exist —
 * a client that derives the grid from a sparse list will silently omit a permission added here.
 */
export function effectiveMatrix(): Array<{
  role: Role;
  permission: Permission;
  allowed: boolean;
  isDefault: boolean;
}> {
  return ROLES.flatMap((role) =>
    PERMISSIONS.map((permission) => {
      const fallback = defaultPermissionsFor(role).includes(permission);
      const override = overrides.get(key(role, permission));

      return {
        role,
        permission,
        allowed: override ?? fallback,
        isDefault: override === undefined,
      };
    }),
  );
}

/**
 * Persists a whole matrix, then reloads.
 *
 * The write is a `deleteMany` followed by a `createMany` inside one transaction: sending the
 * complete grid means a permission revoked in the editor actually disappears, where an upsert-only
 * write would leave the old row in place and silently keep granting it.
 */
export async function saveMatrix(
  entries: ReadonlyArray<{ role: Role; permission: Permission; allowed: boolean }>,
): Promise<void> {
  const differing = entries.filter(
    ({ role, permission, allowed }) => allowed !== defaultPermissionsFor(role).includes(permission),
  );

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({}),
    prisma.rolePermission.createMany({ data: differing.map((e) => ({ ...e })) }),
  ]);

  await reload();
}

/** Guards against enforcing an empty matrix because nothing loaded it. */
export function isLoaded(): boolean {
  return loaded;
}

interface Logger {
  error: (context: unknown, message: string) => void;
  warn: (context: unknown, message: string) => void;
  info: (context: unknown, message: string) => void;
}

/**
 * Loads the matrix at startup WITHOUT making it a condition of starting.
 *
 * This is the one thing in this file worth reading twice. The obvious implementation — `await
 * reload()` in the server builder — means the process exits if the database is briefly
 * unreachable, so a short Postgres blip stops every replica from starting and turns a recoverable
 * outage into a total one. It is the same mistake as checking the database in a liveness probe,
 * which `routes/health.ts` explains at length; this is that mistake wearing a different hat.
 *
 * So a failure here is logged, not thrown, and retried in the background. Until it succeeds no
 * resolver is installed and `hasPermission()` answers from the compiled-in defaults.
 *
 * ── Be clear about what that means ──────────────────────────────────────────
 * While the load is failing, stored overrides are not applied. An override that *granted* extra
 * access is simply absent, which is safe. An override that *revoked* access is also absent, which
 * is not — that permission is briefly allowed again. The window is "database unavailable", the
 * alternative is "service unavailable", and for a matrix edited this rarely the trade is worth
 * making. If your threat model says otherwise, throw here instead and accept the boot dependency.
 */
export async function initAccessPolicy(logger: Logger, retryMs = 30_000): Promise<void> {
  try {
    await reload();
    logger.info({ overrides: overrides.size }, 'permission overrides loaded');
  } catch (error) {
    logger.error(
      { err: error },
      'permission overrides could not be loaded — enforcing compiled-in defaults and retrying',
    );

    // `unref` so a retry pending at shutdown does not hold the event loop open. Without it, a
    // SIGTERM during an outage would wait out the full interval before the process could exit,
    // and Kubernetes would eventually SIGKILL it.
    const timer = setTimeout(() => void initAccessPolicy(logger, retryMs), retryMs);
    timer.unref();
  }
}
