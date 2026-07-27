/**
 * String-column enums.
 *
 * SQLite has no native enum type (see the provider note in schema.prisma), so these columns
 * are plain strings. These constants plus the guards below are the enforcement layer — without
 * them a typo in a status string would be silently persisted and only fail much later.
 */

export const LIFECYCLES = ['EXPERIMENTAL', 'PRODUCTION', 'DEPRECATED'] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export const JOB_STATUSES = [
  'queued',
  'resolving',
  'generating',
  'pushing',
  'configuring',
  'completed',
  'completed_with_warnings',
  'failed',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses from which no further transition occurs. */
export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'completed',
  'completed_with_warnings',
  'failed',
]);

/**
 * Statuses that have touched GitHub. A job interrupted at or after this point cannot simply
 * be re-run — it needs the idempotent replay path (doc 06 §5).
 */
export const SIDE_EFFECTING_JOB_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'pushing',
  'configuring',
]);

export const USER_ROLES = ['viewer', 'provisioner', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const ROLE_RANK: Record<UserRole, number> = { viewer: 0, provisioner: 1, admin: 2 };

/** Role check used by the portal's access gate. */
export function hasRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function isLifecycle(value: string): value is Lifecycle {
  return (LIFECYCLES as readonly string[]).includes(value);
}

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function isTerminal(status: string): boolean {
  return isJobStatus(status) && TERMINAL_JOB_STATUSES.has(status);
}
