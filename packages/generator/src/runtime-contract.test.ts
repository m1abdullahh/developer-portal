/**
 * Two runtimes, one observable service.
 *
 * A spec that selects `node-ts` and one that selects `python-fastapi` should produce services that
 * behave the same from the outside: the same configuration keys, the same error envelope, the same
 * probe paths, the same effective middleware order. Nothing in the type system forces that — the
 * two recipe sets share no code, only intent — so this file checks the parts a caller can observe.
 *
 * The failure this guards against is not a crash. It is a Helm chart that sets `CORS_ORIGINS` for a
 * service reading `CORS_ALLOWED_ORIGINS`, which boots, serves, passes every probe, and rejects every
 * cross-origin request in production only.
 */

import { describe, expect, it } from 'vitest';
import { spineSpec, type ApiRuntime, type ProjectSpec } from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import { MIDDLEWARE_ENV, registeredRuntimes, runtimeContract } from './runtime-contract.js';
import type { VirtualFile } from './types.js';

const registry = createRegistry();

/** Every middleware on, so each runtime declares its full set of variables. */
const specFor = (runtime: ApiRuntime): ProjectSpec =>
  spineSpec({
    meta: { slug: `runtime-${runtime}` },
    ui: null,
    api:
      runtime === 'node-ts'
        ? { runtime, paradigm: 'rest', database: 'postgres', orm: 'prisma' }
        : { runtime, paradigm: 'rest', database: 'postgres', orm: 'sqlmodel' },
  });

const RUNTIMES: readonly ApiRuntime[] = ['node-ts', 'python-fastapi'];

const cache = new Map<ApiRuntime, Promise<readonly VirtualFile[]>>();

function generate(runtime: ApiRuntime): Promise<readonly VirtualFile[]> {
  const hit = cache.get(runtime);
  if (hit) return hit;
  const run = runPipeline(specFor(runtime), { registry }).then((r) => r.files);
  cache.set(runtime, run);
  return run;
}

const read = (files: readonly VirtualFile[], path: string): string =>
  String(files.find((f) => f.path === path)?.content ?? '');

describe('the registry', () => {
  it('has a contract for every runtime that ships', () => {
    // `go-gin` is absent on purpose — it has no recipe yet, and `runtimeContract` throwing for it
    // is what stops a Go spec from silently generating a repository with no source code in it.
    expect(registeredRuntimes()).toEqual(['node-ts', 'python-fastapi']);
  });

  it.each(RUNTIMES)('%s declares a server file that exists in its output', async (runtime) => {
    const contract = runtimeContract(specFor(runtime));
    const files = await generate(runtime);

    expect(
      files.some((f) => f.path === contract.serverFile),
      `${contract.serverFile} is where every middleware recipe injects; it must be generated`,
    ).toBe(true);

    expect(files.some((f) => f.path === contract.envFile)).toBe(true);
    expect(files.some((f) => f.path === contract.manifestFile)).toBe(true);
  });
});

describe('configuration keys are identical across runtimes', () => {
  /** `.env.example` is what the Helm chart, compose file and CI all key off. */
  const keysIn = (envExample: string): string[] =>
    [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!).sort();

  it.each(RUNTIMES)('%s declares every middleware variable by its shared name', async (runtime) => {
    const declared = keysIn(read(await generate(runtime), '.env.example'));

    for (const group of Object.values(MIDDLEWARE_ENV)) {
      for (const variable of group) {
        expect(
          declared,
          `${runtime} must declare ${variable.key} — the chart and compose file both set it`,
        ).toContain(variable.key);
      }
    }
  });

  it('the two runtimes agree on the whole middleware set, not just its members', async () => {
    const [node, python] = await Promise.all(RUNTIMES.map(generate));

    const middlewareKeys = new Set(
      Object.values(MIDDLEWARE_ENV).flatMap((group) => group.map((v) => v.key)),
    );
    const filter = (files: readonly VirtualFile[]): string[] =>
      keysIn(read(files, '.env.example')).filter((key) => middlewareKeys.has(key));

    // Set equality, so a runtime inventing an *extra* middleware variable fails too. A key only
    // one service reads is a key the chart will not set for it.
    expect(filter(python!)).toEqual(filter(node!));
  });
});

describe('the error envelope is the same shape everywhere', () => {
  it.each(RUNTIMES)('%s returns error, message and statusCode', async (runtime) => {
    const contract = runtimeContract(specFor(runtime));
    const server = read(await generate(runtime), contract.serverFile);

    // Asserted against the handler source rather than a live response, because booting two
    // runtimes here would need both toolchains installed. The smoke harness probes the real thing.
    for (const key of ['error', 'message', 'statusCode']) {
      expect(server, `${contract.serverFile} never mentions "${key}"`).toContain(key);
    }
  });
});

describe('middleware runs in the same order regardless of language', () => {
  /*
   * The one place the two genuinely differ, and the reason it is worth a test.
   *
   * Fastify's `register` is first-registered-first-run. Starlette's `add_middleware` is the
   * opposite — the last one added is the outermost. So the Python recipes emit their calls in
   * reverse priority, and the *file* reads backwards while the request path reads the same.
   *
   * Getting this wrong is invisible: every middleware still runs, the service still works, and the
   * logger simply never sees a request the rate limiter rejected.
   */
  it('Node registers logging first', async () => {
    const server = read(await generate('node-ts'), 'src/server.ts');
    const order = ['registerRequestContext', 'registerCors', 'registerRateLimit'];
    const positions = order.map((name) => server.indexOf(`${name}(app)`));

    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('Python adds logging last, which makes it outermost', async () => {
    const server = read(await generate('python-fastapi'), 'app/main.py');
    const positions = ['install_rate_limit', 'install_cors', 'install_request_context'].map(
      (name) => server.indexOf(`${name}(app)`),
    );

    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(
      [...positions].sort((a, b) => a - b),
      'rate limit → cors → logging in the file means logging → cors → rate limit at runtime',
    ).toEqual(positions);
  });
});
