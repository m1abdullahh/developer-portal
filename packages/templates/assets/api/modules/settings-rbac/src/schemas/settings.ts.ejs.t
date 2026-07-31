---
to: src/schemas/settings.ts
---
import { z } from 'zod';
import { PERMISSIONS, ROLES } from '../lib/permissions.js';
import { paginationQuerySchema } from './common.js';

/** Organisation settings. One row, created on first read — see routes/settings.ts. */
export const orgSettingsSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Sign-ups from this domain can be auto-approved. Empty means no domain is trusted. */
  allowedEmailDomain: z.string().nullable(),
  defaultRole: z.enum(ROLES),
  /** When true, a new account needs an administrator to activate it. */
  requireApproval: z.boolean(),
  updatedAt: z.date().or(z.string()),
});

export const updateOrgSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    // Normalised the way the invite flow normalises addresses, or `Example.com` and `example.com`
    // would be two different trusted domains.
    allowedEmailDomain: z.string().trim().toLowerCase().max(253).nullable().optional(),
    // `owner` is absent: a default that grants ownership to everyone who signs up is not a setting
    // anyone wants, and the last-owner invariant makes it actively confusing.
    defaultRole: z.enum(ROLES.filter((r) => r !== 'owner') as [string, ...string[]]).optional(),
    requireApproval: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'No fields to update.' });

export const permissionEntrySchema = z.object({
  role: z.enum(ROLES),
  permission: z.enum(PERMISSIONS),
  allowed: z.boolean(),
  /** True when the value still matches the compiled-in policy. Read-only; the server derives it. */
  isDefault: z.boolean(),
});

export const permissionMatrixSchema = z.object({ entries: z.array(permissionEntrySchema) });

/** The whole grid is sent back, not a patch — see saveMatrix() for why. */
export const saveMatrixSchema = z.object({
  entries: z
    .array(permissionEntrySchema.omit({ isDefault: true }))
    .min(1)
    .max(ROLES.length * PERMISSIONS.length),
});

export const auditLogSchema = z.object({
  id: z.string(),
  /** The JWT subject that performed the action, or `system` for anything unauthenticated. */
  actorId: z.string(),
  action: z.string(),
  target: z.string().nullable(),
  detail: z.string().nullable(),
  createdAt: z.date().or(z.string()),
});

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().max(100).optional(),
  actorId: z.string().max(320).optional(),
});

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The leading characters only. The key itself is not recoverable. */
  prefix: z.string(),
  createdAt: z.date().or(z.string()),
  lastUsedAt: z.date().or(z.string()).nullable(),
  expiresAt: z.date().or(z.string()).nullable(),
  revokedAt: z.date().or(z.string()).nullable(),
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** Days until expiry. Omitted means it never expires, which is worth choosing deliberately. */
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
});

/**
 * The creation response, and the only time the key is ever visible.
 *
 * A separate schema from `apiKeySchema` so the plaintext field cannot leak into the list endpoint
 * by someone reusing the wrong one.
 */
export const createdApiKeySchema = apiKeySchema.extend({
  plaintext: z.string().describe('Shown once. It is stored hashed and cannot be retrieved again.'),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
