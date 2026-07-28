---
to: lib/env.ts
---
import { z } from 'zod';

/**
 * Validated environment access.
 *
 * Parsed once at module load so a missing or malformed variable fails at boot with a message
 * naming the key — rather than surfacing as `undefined` deep inside a request handler, which is
 * how configuration bugs reach production.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // >>> idp:env-schema
  // <<< idp:env-schema
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
