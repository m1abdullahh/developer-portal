---
to: src/config/env.ts
---
import { z } from 'zod';

/**
 * Validated environment configuration.
 *
 * Parsed once at import, so a missing or malformed variable stops the process at boot with a
 * message naming the key. The alternative — reading process.env at the point of use — surfaces
 * as `undefined` inside a request handler, often only under the one code path that needs it.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // >>> idp:env-schema
  // <<< idp:env-schema
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
