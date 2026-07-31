---
to: src/schemas/user.ts
---
import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

/**
 * The user schemas.
 *
 * One definition per shape, reused for request validation, the OpenAPI document and the handler's
 * TypeScript types. These mirror the Prisma enums in `prisma/schema.prisma` — Prisma generates its
 * own types, but they cannot be used in a Zod schema, so the two lists are kept side by side and
 * must be changed together.
 */
export const USER_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED'] as const;

export const userRoleSchema = z.enum(USER_ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);

export type UserRole = z.infer<typeof userRoleSchema>;

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
  // Deliberately excludes OWNER. Ownership is transferred, never granted by invitation — see the
  // guard in routes/users.ts.
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
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
