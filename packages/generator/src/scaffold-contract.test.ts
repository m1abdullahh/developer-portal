/**
 * The scaffold commit must stand on its own.
 *
 * A generated repository's very first CI run happens before any human has touched it. Anything
 * the generated CI, Dockerfiles or scripts reference must therefore either be in the tree we
 * push, or be created by the step that uses it.
 *
 * This exists because that assumption broke in the most expensive possible way: the generator
 * never emits a `package-lock.json` — it cannot, since a lockfile is the result of resolving
 * against the registry — yet the generated CI ran `npm ci`, pointed setup-node's cache at
 * `apps/api/package-lock.json`, and both Dockerfiles ran `npm ci`. All four checks failed on the
 * first real provision.
 *
 * The unit suite passed. The verifier passed. The smoke harness passed — because it runs
 * `npm install`, which is correct for a lockfile-less project and therefore never exercised the
 * path CI actually takes. Only a real push to GitHub revealed it, which is exactly the kind of
 * feedback loop worth replacing with a test.
 */

import { describe, expect, it } from 'vitest';
import { apiOnlyGoSpec, spineSpec, uiOnlyVercelSpec, type ProjectSpec } from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import type { VirtualFile } from './types.js';

const cache = new Map<ProjectSpec, ReturnType<typeof runPipeline>>();

async function generate(spec: ProjectSpec) {
  let result = cache.get(spec);
  if (!result) {
    result = runPipeline(spec, { registry: createRegistry() });
    cache.set(spec, result);
  }
  return result;
}

const MATRIX: Array<{ name: string; spec: ProjectSpec }> = [
  { name: 'full spine', spec: spineSpec() },
  { name: 'UI only', spec: uiOnlyVercelSpec() },
  { name: 'API only (Go)', spec: apiOnlyGoSpec() },
  {
    name: 'no k8s',
    spec: spineSpec({
      meta: { deploymentTarget: 'cloudflare-vercel' },
      ops: { k8s: { enabled: false }, gitops: { enabled: false } },
    }),
  },
];

function text(file: VirtualFile): string {
  return typeof file.content === 'string' ? file.content : '';
}

/** Files the tooling reads directly, where a missing reference is a hard failure. */
function toolingFiles(files: readonly VirtualFile[]): VirtualFile[] {
  return files.filter(
    (f) => /(^|\/)Dockerfile$/.test(f.path) || /^\.github\/workflows\/.+\.ya?ml$/.test(f.path),
  );
}

describe.each(MATRIX)('scaffold contract — $name', ({ spec }) => {
  // The premise of every assertion below. If the generator ever starts emitting lockfiles, these
  // tests should be deleted rather than left passing vacuously.
  it('emits no lockfile', async () => {
    const { files } = await generate(spec);
    expect(files.filter((f) => /package-lock\.json$|npm-shrinkwrap\.json$/.test(f.path))).toEqual(
      [],
    );
  });

  /**
   * `npm ci` exits non-zero without a lockfile: "can only install with an existing
   * package-lock.json". It is correct to *prefer* it — a guarded `if [ -f package-lock.json ]`
   * upgrades the build to a reproducible install as soon as one is committed — but it must never
   * be the only path.
   */
  it('never runs npm ci unguarded', async () => {
    const { files } = await generate(spec);

    const offenders: string[] = [];
    for (const file of toolingFiles(files)) {
      for (const [index, line] of text(file).split('\n').entries()) {
        const code = line.trim();
        // Comments explaining the guard are not themselves commands.
        if (code.startsWith('#')) continue;
        if (!/\bnpm ci\b/.test(code)) continue;
        // Guarded either inline (`if [ -f package-lock.json ]`) or by a `RUN if` shell test.
        if (/package-lock\.json/.test(code)) continue;
        offenders.push(`${file.path}:${index + 1} — ${code}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * setup-node fails the whole job — not just the cache — when `cache-dependency-path` matches
   * nothing: "Some specified paths were not resolved, unable to cache dependencies."
   */
  it('never points setup-node at a lockfile that will not exist', async () => {
    const { files } = await generate(spec);

    const offenders = toolingFiles(files)
      .filter((f) => /cache-dependency-path:.*package-lock\.json/.test(text(f)))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  /** Every path a Dockerfile copies has to be in the tree, or the build fails at COPY. */
  it('only COPYs paths that exist in the generated tree', async () => {
    const { files } = await generate(spec);
    const paths = new Set(files.map((f) => f.path));

    const offenders: string[] = [];
    for (const dockerfile of files.filter((f) => /(^|\/)Dockerfile$/.test(f.path))) {
      const dir = dockerfile.path.replace(/Dockerfile$/, '');

      for (const line of text(dockerfile).split('\n')) {
        const match = /^COPY\s+(?!--from)(.+)$/.exec(line.trim());
        if (!match?.[1]) continue;

        const parts = match[1].split(/\s+/);
        for (const source of parts.slice(0, -1)) {
          // `*` globs are deliberately optional (`package-lock.json*` copies nothing when absent),
          // and `.` is the whole context.
          if (source.includes('*') || source === '.' || source.startsWith('--')) continue;
          if (!paths.has(`${dir}${source}`)) offenders.push(`${dockerfile.path}: COPY ${source}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * A linter with no config is not a lenient linter — it is a failed build.
   *
   * ESLint 9 removed `.eslintrc` support, so `eslint .` exits 2 with "couldn't find an
   * eslint.config file" before examining a single line. Every generated project that declares a
   * `lint` script therefore has to ship a flat config beside it.
   */
  it('ships a config for every tool its scripts invoke', async () => {
    const { files } = await generate(spec);
    const paths = new Set(files.map((f) => f.path));

    const offenders: string[] = [];
    for (const manifest of files.filter((f) => /(^|\/)package\.json$/.test(f.path))) {
      const dir = manifest.path.replace(/package\.json$/, '');
      const scripts =
        (JSON.parse(text(manifest)) as { scripts?: Record<string, string> }).scripts ?? {};

      for (const command of Object.values(scripts)) {
        if (/\beslint\b/.test(command)) {
          const found = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs'].some((c) =>
            paths.has(`${dir}${c}`),
          );
          if (!found) offenders.push(`${dir || '.'}: "${command}" with no eslint.config.*`);
        }
        if (/\btsc\b/.test(command) && !paths.has(`${dir}tsconfig.json`)) {
          offenders.push(`${dir || '.'}: "${command}" with no tsconfig.json`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * `vitest run` exits 1 when it finds no test files, and a scaffolded project has none — so the
   * first CI run would fail for the crime of being new.
   */
  it('does not fail its own test script for having no tests yet', async () => {
    const { files } = await generate(spec);

    const offenders: string[] = [];
    for (const manifest of files.filter((f) => /(^|\/)package\.json$/.test(f.path))) {
      const scripts =
        (JSON.parse(text(manifest)) as { scripts?: Record<string, string> }).scripts ?? {};
      const test = scripts.test;
      if (!test || !/\bvitest\b/.test(test)) continue;

      const hasTests = files.some(
        (f) =>
          f.path.startsWith(manifest.path.replace(/package\.json$/, '')) &&
          /\.(test|spec)\.[tj]sx?$/.test(f.path),
      );
      if (!hasTests && !test.includes('--passWithNoTests')) {
        offenders.push(`${manifest.path}: "${test}" but the scaffold ships no tests`);
      }
    }

    expect(offenders).toEqual([]);
  });

  /** A workflow that calls `npm run x` needs `x` in the package.json of that directory. */
  it('only calls npm scripts that the generated package.json defines', async () => {
    const { files } = await generate(spec);

    const scriptsByDir = new Map<string, Set<string>>();
    for (const file of files.filter((f) => /(^|\/)package\.json$/.test(f.path))) {
      const parsed = JSON.parse(text(file)) as { scripts?: Record<string, string> };
      scriptsByDir.set(
        file.path.replace(/package\.json$/, ''),
        new Set(Object.keys(parsed.scripts ?? {})),
      );
    }

    const offenders: string[] = [];
    for (const workflow of files.filter((f) => /^\.github\/workflows\//.test(f.path))) {
      const lines = text(workflow).split('\n');
      let workingDir = '';

      for (const line of lines) {
        const dir = /working-directory:\s*(\S+)/.exec(line);
        if (dir?.[1]) workingDir = dir[1] === '.' ? '' : `${dir[1]}/`;

        const script = /npm run ([a-z:-]+)/.exec(line);
        if (!script?.[1]) continue;
        // `--if-present` is explicitly tolerant of a missing script.
        if (line.includes('--if-present')) continue;

        const known = scriptsByDir.get(workingDir);
        if (known && !known.has(script[1])) {
          offenders.push(`${workflow.path}: npm run ${script[1]} (in "${workingDir || '.'}")`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
