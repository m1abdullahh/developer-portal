/**
 * The environment contract.
 *
 * Every recipe that needs configuration contributes to three places at once: the Zod schema in
 * `config/env.ts`, the `.env.example` a developer copies, and the code that reads the value.
 * Nothing in the type system connects them — the recipe that adds a marker to one file has no
 * obligation to touch the other two.
 *
 * That gap is not hypothetical. The CORS recipe shipped reading `env.CORS_ORIGINS` and
 * documenting it in `.env.example` while never adding it to the schema, so every generated API
 * with CORS enabled crashed at boot on a key the schema had never heard of. The failure was
 * invisible to typechecking, to lint, and to the verifier.
 *
 * These tests close that hole for every combination, not just the one that broke.
 */

import { describe, expect, it } from 'vitest';
import { apiOnlyPythonSpec, spineSpec, uiOnlyVercelSpec, type ProjectSpec } from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import type { VirtualFile } from './types.js';

/**
 * Files that legitimately read `process.env` directly.
 *
 * These run before the application — and therefore before the schema — exists: Prisma's config
 * is loaded by the Prisma CLI, and Next's by the Next build. They cannot import a module that
 * throws on invalid configuration without breaking `prisma generate` on a fresh clone.
 */
const PRE_BOOT_FILES = [/(^|\/)prisma\.config\.ts$/, /(^|\/)next\.config\.(mjs|js|ts)$/];

/** Env var names are SCREAMING_SNAKE by convention; this also skips `env.js` import specifiers. */
const ENV_KEY = '[A-Z][A-Z0-9_]*';

interface EnvLayer {
  /** e.g. 'apps/api/' or '' for a flat single-layer project. */
  prefix: string;
  schemaKeys: Map<string, { hasDefault: boolean }>;
  exampleKeys: Map<string, string>;
}

function text(file: VirtualFile): string {
  return typeof file.content === 'string' ? file.content : '';
}

/** Strips import statements so `from './config/env.js'` is not read as a usage of `env.js`. */
function stripImports(source: string): string {
  return source.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];?$/gm, '');
}

/** Reads the keys declared inside the `z.object({ ... })` of a generated env schema. */
function parseSchema(source: string): Map<string, { hasDefault: boolean }> {
  const body = source.slice(source.indexOf('z.object({'), source.indexOf('});'));
  const keys = new Map<string, { hasDefault: boolean }>();

  for (const line of body.split('\n')) {
    const match = new RegExp(`^\\s*(${ENV_KEY}):\\s*(.+)$`).exec(line);
    if (match?.[1] && match[2]) {
      keys.set(match[1], { hasDefault: match[2].includes('.default(') });
    }
  }
  return keys;
}

function parseExample(source: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const line of source.split('\n')) {
    const match = new RegExp(`^(${ENV_KEY})=(.*)$`).exec(line);
    if (match?.[1] !== undefined) keys.set(match[1], (match[2] ?? '').trim());
  }
  return keys;
}

/** Pairs each generated env schema with the `.env.example` a developer copies beside it. */
function envLayers(files: readonly VirtualFile[]): EnvLayer[] {
  return files
    .filter((f) => /(^|\/)src\/config\/env\.ts$/.test(f.path))
    .map((schemaFile) => {
      const prefix = schemaFile.path.replace(/src\/config\/env\.ts$/, '');
      const example = files.find((f) => f.path === `${prefix}.env.example`);

      return {
        prefix,
        schemaKeys: parseSchema(text(schemaFile)),
        exampleKeys: example ? parseExample(text(example)) : new Map<string, string>(),
      };
    });
}

/** Every `env.KEY` and `process.env.KEY` read by code in a layer, with the file that reads it. */
function envUsages(
  files: readonly VirtualFile[],
  prefix: string,
): Array<{ key: string; file: string; direct: boolean }> {
  const usages: Array<{ key: string; file: string; direct: boolean }> = [];

  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    if (!/\.(ts|tsx|mts|mjs)$/.test(file.path)) continue;

    const source = stripImports(text(file));
    for (const match of source.matchAll(new RegExp(`(process\\.)?\\benv\\.(${ENV_KEY})\\b`, 'g'))) {
      const key = match[2];
      if (key) usages.push({ key, file: file.path, direct: match[1] !== undefined });
    }
  }
  return usages;
}

/**
 * Generation is the expensive part — roughly a second per spec — and each spec below is checked
 * from six angles. Memoising by spec identity turns 54 pipeline runs into 9, which is the
 * difference between this suite costing seconds and costing most of a minute in CI.
 */
const cache = new Map<ProjectSpec, ReturnType<typeof runPipeline>>();

async function generate(spec: ProjectSpec) {
  let result = cache.get(spec);
  if (!result) {
    result = runPipeline(spec, { registry: createRegistry() });
    cache.set(spec, result);
  }
  return result;
}

/** Every page module off — required whenever auth or the database is turned off. */
const NO_MODULES = {
  authLayouts: false,
  userManagement: false,
  stripeBilling: false,
  settingsRbac: false,
} as const;

/**
 * A spine with one middleware combination.
 *
 * The page modules come off with it: the compatibility matrix rejects `authLayouts` without
 * auth middleware, and that rejection is correct — these fixtures exist to vary the env
 * contract, not to argue with a guard that already has its own tests.
 */
function middlewareSpec(
  middleware: Partial<{
    auth: 'none' | 'jwt';
    cors: boolean;
    rateLimit: boolean;
    validation: boolean;
    logging: boolean;
  }>,
): ProjectSpec {
  return spineSpec({
    api: {
      middleware: {
        auth: 'none',
        cors: false,
        rateLimit: false,
        validation: false,
        logging: false,
        ...middleware,
      },
    },
    ui: { modules: NO_MODULES },
  });
}

/**
 * The matrix. Each entry toggles a different set of env-contributing recipes, because the bug
 * this suite exists for only appeared in the combinations where one middleware was enabled and
 * another was not.
 */
const MATRIX: Array<{ name: string; spec: ProjectSpec }> = [
  { name: 'full spine', spec: spineSpec() },
  { name: 'UI only', spec: uiOnlyVercelSpec() },
  { name: 'API only (Python)', spec: apiOnlyPythonSpec() },
  { name: 'no middleware', spec: middlewareSpec({}) },
  { name: 'CORS only', spec: middlewareSpec({ cors: true }) },
  { name: 'auth only', spec: middlewareSpec({ auth: 'jwt' }) },
  { name: 'rate limit only', spec: middlewareSpec({ rateLimit: true }) },
  { name: 'logging only', spec: middlewareSpec({ logging: true }) },
  {
    name: 'no database',
    spec: spineSpec({ api: { database: 'none', orm: 'none' }, ui: { modules: NO_MODULES } }),
  },

  /*
   * The first UI-layer environment variable the generator has ever produced.
   *
   * Every entry above exercises the API's env contract; the web layer had a schema module and no
   * contributors, so `.env.example` was never even emitted for it. `userManagement` changes that,
   * and the two frameworks disagree about what a browser-visible key may be called —
   * `NEXT_PUBLIC_API_URL` against `VITE_API_URL`. Both are here because a prefix applied to the
   * wrong framework does not fail loudly: the value simply arrives as `undefined`.
   */
  {
    name: 'user management (Next)',
    spec: spineSpec({ meta: { slug: 'env-um-next' }, ui: { modules: { userManagement: true } } }),
  },
  {
    name: 'user management (Vite)',
    spec: spineSpec({
      meta: { slug: 'env-um-vite' },
      ui: { framework: 'vite-react', modules: { userManagement: true } },
    }),
  },
];

describe.each(MATRIX)('env contract — $name', ({ spec }) => {
  // The exact failure that shipped: code reads a key the schema never declares, so the process
  // dies at boot with "Invalid environment configuration" naming a key nobody added.
  it('declares every environment variable the generated code reads', async () => {
    const { files } = await generate(spec);

    for (const layer of envLayers(files)) {
      const undeclared = envUsages(files, layer.prefix)
        .filter((u) => !u.direct && !layer.schemaKeys.has(u.key))
        .map((u) => `${u.file} reads env.${u.key}`);

      expect(undeclared).toEqual([]);
    }
  });

  it('reads process.env directly only in files that run before the schema exists', async () => {
    const { files } = await generate(spec);

    for (const layer of envLayers(files)) {
      const offenders = envUsages(files, layer.prefix)
        .filter((u) => u.direct)
        .filter((u) => !PRE_BOOT_FILES.some((allowed) => allowed.test(u.file)))
        .map((u) => `${u.file} reads process.env.${u.key} instead of the validated env`);

      expect(offenders).toEqual([]);
    }
  });

  // Copying .env.example must produce a bootable app. A required key missing from the example
  // is a first-run failure for every developer who clones the repository.
  it('documents every required variable in .env.example', async () => {
    const { files } = await generate(spec);

    for (const layer of envLayers(files)) {
      if (layer.schemaKeys.size === 0) continue;

      const missing = [...layer.schemaKeys]
        .filter(([key, { hasDefault }]) => !hasDefault && !layer.exampleKeys.has(key))
        .map(([key]) => `${layer.prefix}.env.example is missing required ${key}`);

      expect(missing).toEqual([]);
    }
  });

  it('documents nothing in .env.example that the schema ignores', async () => {
    const { files } = await generate(spec);

    for (const layer of envLayers(files)) {
      if (layer.schemaKeys.size === 0) continue;

      const orphaned = [...layer.exampleKeys.keys()]
        .filter((key) => !layer.schemaKeys.has(key))
        .map((key) => `${layer.prefix}.env.example documents ${key}, which the schema ignores`);

      expect(orphaned).toEqual([]);
    }
  });

  // A committed .env.example with a real-looking secret is how a placeholder becomes the value
  // someone actually deploys with (doc 00 §7).
  it('ships no secret with a value filled in', async () => {
    const { files } = await generate(spec);

    for (const layer of envLayers(files)) {
      const filled = [...layer.exampleKeys]
        .filter(([key]) => /SECRET|PASSWORD|TOKEN|PRIVATE_KEY|DATABASE_URL/.test(key))
        .filter(([, value]) => value !== '')
        .map(([key, value]) => `${layer.prefix}.env.example sets ${key}=${value}`);

      expect(filled).toEqual([]);
    }
  });
});

describe('the contract test itself', () => {
  // A test that silently checks nothing is worse than no test. If the schema path or the marker
  // block ever moves, this fails rather than quietly passing every case above.
  it('actually finds a schema and its usages in the spine', async () => {
    const { files } = await generate(spineSpec());
    const layers = envLayers(files);

    expect(layers).toHaveLength(1);
    expect(layers[0]!.schemaKeys.size).toBeGreaterThan(5);
    expect(layers[0]!.exampleKeys.size).toBeGreaterThan(5);

    const usages = envUsages(files, layers[0]!.prefix);
    expect(usages.filter((u) => !u.direct).length).toBeGreaterThan(5);
    // The import specifier `./config/env.js` must not be mistaken for a usage.
    expect(usages.map((u) => u.key)).not.toContain('js');
  });

  it('catches a key that is read but never declared', async () => {
    const { files } = await generate(spineSpec());
    const layer = envLayers(files)[0]!;

    const tampered = files.map((f) =>
      f.path.endsWith('src/plugins/cors.ts')
        ? { ...f, content: `${text(f)}\nconst x = env.NOT_DECLARED_ANYWHERE;\n` }
        : f,
    );

    const undeclared = envUsages(tampered, layer.prefix).filter(
      (u) => !u.direct && !layer.schemaKeys.has(u.key),
    );
    expect(undeclared.map((u) => u.key)).toEqual(['NOT_DECLARED_ANYWHERE']);
  });
});
