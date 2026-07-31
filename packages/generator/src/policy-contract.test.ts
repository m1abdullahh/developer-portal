/**
 * One policy definition, enforced in two places.
 *
 * Doc 02 §4.4 asks for a `permissions.ts` consumed by both the UI's guards and the API's
 * middleware — "one definition, two enforcement points, so they cannot drift". The generator has
 * no shared workspace to put it in: `apps/web` and `apps/api` are independently installable, each
 * with its own `package.json`, so the file is emitted into both from a single template.
 *
 * Two copies *can* drift, which is what this file exists to prevent. It asserts they are
 * byte-identical, and that nothing else in the tree declares a competing list of roles.
 *
 * That second assertion is not hypothetical. The policy used to live inside the JWT middleware
 * recipe, so anything not using JWT could not reach it — and `userManagement`, whose gate asks for
 * a database and an API but says nothing about auth, declared its own. A spine project shipped:
 *
 *     src/lib/permissions.ts   ROLES    = ['viewer', 'editor', 'admin']
 *     prisma/schema.prisma     UserRole = OWNER | ADMIN | MEMBER | VIEWER
 *     src/schemas/user.ts      USER_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']
 *
 * Three definitions, no failure of any kind. `hasPermission()` simply could not be called with a
 * `User.role`, and bridging them with `.toLowerCase()` would have mapped `owner` and `member` onto
 * nothing at all — which denies or permits depending on the call site.
 */

import { describe, expect, it } from 'vitest';
import { spineSpec, type ProjectSpec } from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import type { VirtualFile } from './types.js';

const registry = createRegistry();

const cache = new Map<ProjectSpec, Promise<readonly VirtualFile[]>>();

function generate(spec: ProjectSpec): Promise<readonly VirtualFile[]> {
  const hit = cache.get(spec);
  if (hit) return hit;
  const run = runPipeline(spec, { registry }).then((r) => r.files);
  cache.set(spec, run);
  return run;
}

const find = (files: readonly VirtualFile[], suffix: string): VirtualFile[] =>
  files.filter((f) => f.path.endsWith(suffix));

/** Both halves on, under each framework — the layouts differ, the policy must not. */
const CASES = [
  { name: 'Next', spec: spineSpec({ meta: { slug: 'policy-next' } }) },
  {
    name: 'Vite',
    spec: spineSpec({ meta: { slug: 'policy-vite' }, ui: { framework: 'vite-react' } }),
  },
] as const;

describe.each(CASES)('$name', ({ spec }) => {
  it('emits the policy into both the API and the browser app', async () => {
    const copies = find(await generate(spec), 'lib/permissions.ts');

    expect(
      copies.map((f) => f.path).sort(),
      'the policy must reach every layer that enforces it',
    ).toHaveLength(2);
  });

  it('emits byte-identical copies', async () => {
    const copies = find(await generate(spec), 'lib/permissions.ts');
    const [first, ...rest] = copies.map((f) => String(f.content));

    for (const other of rest) {
      // Rendered from one template, so any difference means a recipe passed different context —
      // which is exactly the drift the shared definition exists to prevent.
      expect(other).toBe(first);
    }
  });

  it('declares roles in exactly one place', async () => {
    const files = await generate(spec);

    // Any other file inventing a role list is the failure this suite is named for.
    const declarations = files
      .filter((f) => /\.tsx?$/.test(f.path))
      .filter((f) => /^\s*export const ROLES\s*=/m.test(String(f.content)))
      .map((f) => f.path);

    expect(declarations.every((p) => p.endsWith('lib/permissions.ts'))).toBe(true);
  });

  it('the Prisma enum uses the policy’s strings verbatim', async () => {
    const files = await generate(spec);

    const policy = String(find(files, 'lib/permissions.ts')[0]?.content);
    const roles = [
      ...(/export const ROLES = \[(.*?)\]/s.exec(policy)?.[1] ?? '').matchAll(/'([^']+)'/g),
    ]
      .map((m) => m[1]!)
      .sort();

    const schema = String(files.find((f) => f.path.endsWith('schema.prisma'))?.content);
    const body = /enum UserRole \{(.*?)\}/s.exec(schema)?.[1] ?? '';

    // Comments are stripped rather than matched: `///` doc lines inside the enum are content, not
    // members, and counting them was the same false-positive class as the CORS comment.
    const members = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//'))
      .sort();

    // No mapping layer, by design. `ADMIN` in the database against `admin` in the policy is a seam
    // where an unmapped value silently becomes "no permissions".
    expect(members).toEqual(roles);
  });
});

describe('applicability', () => {
  it('is emitted for userManagement even with auth off', async () => {
    // The precise hole that caused the divergence: this module's gate never mentions auth, so it
    // used to generate against a policy file that was not there.
    const spec = spineSpec({
      meta: { slug: 'policy-no-auth' },
      api: { middleware: { auth: 'none' } },
      ui: { modules: { authLayouts: false, userManagement: true, settingsRbac: false } },
    });

    expect(find(await generate(spec), 'lib/permissions.ts')).toHaveLength(2);
  });

  it('is absent from a project that enforces nothing', async () => {
    const spec = spineSpec({
      meta: { slug: 'policy-none' },
      api: { middleware: { auth: 'none' } },
      ui: {
        modules: {
          authLayouts: false,
          userManagement: false,
          stripeBilling: false,
          settingsRbac: false,
        },
      },
    });

    // A policy nobody reads is dead code, and dead code in a scaffold is worse than absent — it
    // reads as a feature someone forgot to wire up.
    expect(find(await generate(spec), 'lib/permissions.ts')).toHaveLength(0);
  });
});
