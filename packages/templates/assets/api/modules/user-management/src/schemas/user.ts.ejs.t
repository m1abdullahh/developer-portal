---
to: src/schemas/user.ts
---
import { z } from 'zod';
import { ROLES, type Role } from '../lib/permissions.js';
import { paginationQuerySchema } from './common.js';

/**
 * The user schemas.
 *
 * One definition per shape, reused for request validation, the OpenAPI document and the handler's
 * TypeScript types.
 *
 * Roles come from `lib/permissions.ts` rather than being restated here. That file is the single
 * policy definition, and its strings are the Prisma enum's values verbatim — so a role added there
 * is immediately accepted by these schemas, stored by the database and understood by the browser
 * app's guards, with nothing to keep in step by hand.
 */
export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED'] as const;

export const userRoleSchema = z.enum(ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);

export type UserRole = Role;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: userRoleSchema,
  status: userStatusSchema,
  createdAt: z.date().or(z.string()).describe('ISO 8601 timestamp'),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: userRoleSchema.optional().describe('Filter to a single role'),
  status: userStatusSchema.optional().describe('Filter to a single status'),
  q: z.string().trim().min(1).max(200).optional().describe('Matches email or name, case-insensitive'),
});

export const inviteUserSchema = z.object({
  // Lowercased on the way in. Email addresses are case-insensitive in practice, and storing
  // `Ada@example.com` alongside `ada@example.com` lets the same person hold two accounts with
  // different permissions — which the unique constraint alone would not prevent.
  email: z.string().email().toLowerCase(),
  name: z.string().trim().min(1).max(200).optional(),
  // Deliberately excludes `owner`. Ownership is transferred from an existing owner, never granted
  // by invitation — see the last-owner guard in routes/users.ts.
  role: z.enum(ROLES.filter((role) => role !== 'owner') as [Role, ...Role[]]).default('editor'),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable().optional(),
    role: userRoleSchema.optional(),
    status: userStatusSchema.optional(),
  })
  // An empty PATCH is almost always a client bug — a form that serialised nothing — and silently
  // answering 200 hides it until someone notices their edits never saved.
  .refine((body) => Object.keys(body).length > 0, { message: 'No fields to update.' });

export const userIdParamSchema = z.object({ id: z.string().min(1) });
