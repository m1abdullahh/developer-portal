---
to: src/lib/env.ts
---
import { z } from 'zod';

/**
 * Validated environment access.
 *
 * Parsed once at module load so a missing or malformed variable fails at startup with a message
 * naming the key, rather than surfacing as `undefined` deep inside a component.
 *
 * ── Why this differs from the Next equivalent ────────────────────────────────
 * It reads `import.meta.env`, not `process.env`. There is no `process` in a browser: Vite replaces
 * `import.meta.env.VITE_*` at build time with literal values, and a `process.env` read would throw
 * `ReferenceError: process is not defined` on the first render.
 *
 * Only keys prefixed `VITE_` are exposed. That prefix is a safety boundary, not a naming
 * convention — everything without it stays on the build machine. Anything you do put behind
 * `VITE_` is compiled into the bundle and is readable by anyone who opens devtools, so it must
 * never hold a secret. There is no server here to keep one on.
 */
const schema = z.object({
  // Vite's own, always present: 'development' under `vite dev`, 'production' after `vite build`.
  MODE: z.enum(['development', 'test', 'production']).default('development'),
  // >>> idp:env-schema
  // <<< idp:env-schema
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
