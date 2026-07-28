---
to: src/schemas/common.ts
---
import { z } from 'zod';

/**
 * Shared response shapes.
 *
 * Defined once so every route reports failures identically. A client that has to handle three
 * different error shapes from one API ends up with three code paths, and the third is always
 * the one that is wrong.
 */
export const errorSchema = z.object({
  error: z.string().describe('Short machine-readable error name'),
  message: z.string().optional().describe('Human-readable detail'),
  statusCode: z.number().int().describe('HTTP status code'),
});

export type ErrorResponse = z.infer<typeof errorSchema>;

/**
 * Cursor pagination rather than offset.
 *
 * Offset pagination silently skips or repeats rows when the underlying set changes between
 * requests, which is the norm for any actively-written table. A cursor is stable.
 */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional().describe('Opaque cursor from the previous page'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable().describe('Pass as `cursor` to fetch the next page'),
  });
}

/** Standard responses attached to routes that can fail in these ways. */
export const commonResponses = {
  400: errorSchema.describe('Validation failed'),
  401: errorSchema.describe('Authentication required'),
  403: errorSchema.describe('Insufficient permissions'),
  404: errorSchema.describe('Resource not found'),
  429: errorSchema.describe('Rate limit exceeded'),
  500: errorSchema.describe('Internal server error'),
} as const;
