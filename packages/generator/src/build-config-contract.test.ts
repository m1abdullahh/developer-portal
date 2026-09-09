/**
 * The build-configuration contract.
 *
 * A browser-visible environment variable (`NEXT_PUBLIC_*`, `VITE_*`) is not configuration in the
 * usual sense: the build compiles its value into the bundle, so it has to exist wherever the UI is
 * *built* — the image build and the CI build — and a value on the running container arrives too
 * late to matter.
 *
 * Found while preparing the Phase 1 gate. The settings and users pages read `env.NEXT_PUBLIC_API_URL`
 * through a schema that throws at import, Next prerenders those pages during `next build`, and
 * neither the Dockerfile nor the generated CI supplied a value. The build passed on a developer's
 * machine, where `.env` did, and failed inside `docker build` and on the very first CI run of every
 * provisioned repository — for any spec selecting `userManagement` or `settingsRbac`.
 *
 * The contract: every browser-visible key of the UI layer appears as a Dockerfile build argument
 * defaulting to its documented example, as the same default on the CI web job, and as a
 * repository-variable override in cd.yml. And when there are none, none of that scaffolding appears.
 */

import { describe, expect, it } from 'vitest';
import { apiOnlyPythonSpec, spineSpec, uiOnlyVercelSpec, type ProjectSpec } from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import { frameworkContract } from './framework-contract.js';
import { computeLayout, prefixFor } from './layout.js';
import type { VirtualFile } from './types.js';

function text(file: VirtualFile | undefined): string {
  return file && typeof file.content === 'string' ? file.content : '';
}

function find(files: readonly VirtualFile[], path: string): VirtualFile | undefined {
  return files.find((f) => f.path === path);
}

/** Browser-visible keys of the UI layer, with their documented defaults, read from .env.example. */
function publicKeys(files: readonly VirtualFile[], spec: ProjectSpec): Map<string, string> {
  const keys = new Map<string, string>();
  if (!spec.ui) return keys;

  const prefix = frameworkContract(spec).publicEnvPrefix;
  const example = text(find(files, `${prefixFor(computeLayout(spec), 'ui')}.env.example`));
  for (const line of example.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match?.[1]?.startsWith(prefix)) keys.set(match[1], (match[2] ?? '').trim());
  }
  return keys;
}

const cache = new Map<ProjectSpec, ReturnType<typeof runPipeline>>();

async function generate(spec: ProjectSpec) {
  let result = cache.get(spec);
  if (!result) {
    result = runPipeline(spec, { registry: createRegistry() });
    cache.set(spec, result);
  }
  return result;
}

const CASES: Array<{ name: string; spec: ProjectSpec }> = [
  // The spine selects settingsRbac and userManagement, so it carries NEXT_PUBLIC_API_URL.
  { name: 'spine (Next, page modules)', spec: spineSpec() },
  {
    name: 'Vite + user management',
    spec: spineSpec({
      meta: { slug: 'build-config-vite' },
      ui: { framework: 'vite-react', modules: { userManagement: true } },
    }),
  },
  // Nuxt also reads NUXT_PUBLIC_* at start-up through runtime config; the build argument is its
  // default. Same contract, so it is an ordinary case here rather than an exception.
  {
    name: 'Nuxt (runtime config)',
    spec: spineSpec({ meta: { slug: 'build-config-nuxt' }, ui: { framework: 'nuxt' } }),
  },
  { name: 'UI only, no modules', spec: uiOnlyVercelSpec() },
  { name: 'API only', spec: apiOnlyPythonSpec() },
];

describe.each(CASES)('build configuration — $name', ({ spec }) => {
  it('declares every browser-visible key as a Dockerfile build argument with its documented default', async () => {
    const { files } = await generate(spec);
    if (!spec.ui) return;

    const dockerfile = text(find(files, `${prefixFor(computeLayout(spec), 'ui')}Dockerfile`));
    expect(dockerfile, 'the UI layer has a Dockerfile').not.toBe('');

    const keys = publicKeys(files, spec);
    for (const [key, example] of keys) {
      expect(dockerfile).toContain(`ARG ${key}="${example}"`);
      // An empty --build-arg must fall back to the default rather than fail validation.
      expect(dockerfile).toContain(`[ -n "$${key}" ] || export ${key}="${example}"`);
    }

    const declared = [...dockerfile.matchAll(/^ARG ([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...keys.keys()].sort());
  });

  it('gives the CI web build the same defaults', async () => {
    const { files } = await generate(spec);
    const ci = text(find(files, '.github/workflows/ci.yml'));
    const keys = publicKeys(files, spec);

    for (const [key, example] of keys) {
      expect(ci).toContain(`${key}: '${example}'`);
    }
    if (keys.size === 0) {
      expect(ci).not.toContain('Browser-visible configuration');
    }
  });

  it('lets cd.yml override each key from a repository variable of the same name', async () => {
    const { files } = await generate(spec);
    const cd = text(find(files, '.github/workflows/cd.yml'));
    const keys = publicKeys(files, spec);

    for (const key of keys.keys()) {
      expect(cd).toContain(`${key}=\${{ vars.${key} }}`);
    }
    if (keys.size === 0) {
      expect(cd).not.toContain('build-args:');
    }
  });
});

describe('the contract test itself', () => {
  // If the page modules stop declaring a public key, every assertion above passes vacuously.
  it('finds at least one browser-visible key in the spine', async () => {
    const { files } = await generate(spineSpec());
    expect([...publicKeys(files, spineSpec()).keys()]).toEqual(['NEXT_PUBLIC_API_URL']);
  });

  it('finds the framework-prefixed key for Vite and Nuxt too', async () => {
    const vite = CASES[1]!.spec;
    const nuxt = CASES[2]!.spec;
    expect([...publicKeys((await generate(vite)).files, vite).keys()]).toEqual(['VITE_API_URL']);
    expect([...publicKeys((await generate(nuxt)).files, nuxt).keys()]).toEqual([
      'NUXT_PUBLIC_API_URL',
    ]);
  });
});
