#!/usr/bin/env node
/**
 * Smoke harness — does a generated project actually work?
 *
 * Everything else we run is static. The unit suite proves the generator produces the files we
 * intended; the verifier proves those files are well-formed; the env contract proves the keys
 * line up. None of that catches a version pin that no longer resolves, a Next build that trips
 * over generated types, a Fastify plugin registered in the wrong order, or a Prisma client that
 * was never generated. Only running the output catches those.
 *
 * So this generates real projects, installs them, builds them, boots them, and makes an HTTP
 * request. It is slow by nature — npm install on a Next app is not fast — which is why it runs
 * as its own CI job rather than inside `npm test`.
 *
 * Usage:
 *   node scripts/smoke.mjs                  # every case
 *   node scripts/smoke.mjs --case spine     # one case
 *   node scripts/smoke.mjs --keep           # leave the workspace on disk to inspect
 *   node scripts/smoke.mjs --list
 *
 * Requires `npm run build` first — it imports the built packages.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';

// ── cases ────────────────────────────────────────────────────────────────────

/**
 * Deliberately not the whole matrix. Each case costs minutes, and these three cover the
 * structural axes that actually change what gets built: two layers vs one, a flat layout vs an
 * apps/ prefix, and Prisma present vs absent.
 */
const CASES = {
  spine: {
    description: 'Next.js + Fastify + Prisma, all middleware — the Phase 1 gate combination',
    fixture: 'spineSpec',
    override: {},
  },
  'ui-only': {
    description: 'Next.js alone, flat layout, deployed to Vercel',
    fixture: 'uiOnlyVercelSpec',
    override: {},
  },
  'api-no-db': {
    description: 'Fastify with no database — proves the Prisma-free path still builds and boots',
    fixture: 'spineSpec',
    override: {
      ui: null,
      api: { database: 'none', orm: 'none' },
      ops: { k8s: { enabled: false }, gitops: { enabled: false } },
      meta: { slug: 'smoke-api-no-db', deploymentTarget: 'cloudflare-vercel' },
    },
  },

  /*
   * One case per state library (P2.1).
   *
   * These are UI-only on purpose: the API half is identical across all four and installing
   * Fastify and Prisma three more times would triple the runtime to re-prove what the `spine`
   * case already covers. What differs — the provider wiring, the store, the dependency set — is
   * entirely in the web layer.
   */
  'state-redux': {
    description: 'Redux Toolkit store and typed hooks',
    fixture: 'uiOnlyVercelSpec',
    override: { ui: { state: 'redux-toolkit' }, meta: { slug: 'smoke-state-redux' } },
  },
  'state-query': {
    description: 'TanStack Query plus its companion context store',
    fixture: 'uiOnlyVercelSpec',
    override: { ui: { state: 'react-query' }, meta: { slug: 'smoke-state-query' } },
  },
  'state-context': {
    description: 'React Context with useReducer — no state dependency at all',
    fixture: 'uiOnlyVercelSpec',
    override: { ui: { state: 'context' }, meta: { slug: 'smoke-state-context' } },
  },

  // The second styling system (P2.3). Zero dependencies, so a failure here is an API-design
  // problem rather than a library-integration one.
  'styling-css-modules': {
    description: 'CSS Modules — the primitive API under a second styling system',
    fixture: 'uiOnlyVercelSpec',
    override: { ui: { styling: 'css-modules' }, meta: { slug: 'smoke-css-modules' } },
  },

  // The third styling system (P2.3c). The one that stresses the primitive contract: MUI has its
  // own opinions about every prop, so a badly designed API shows up as an unwrappable component.
  'styling-mui': {
    description: 'MUI — the primitive API wrapping a third-party component library',
    fixture: 'uiOnlyVercelSpec',
    override: { ui: { styling: 'mui' }, meta: { slug: 'smoke-mui' } },
  },

  // The second framework (P2.2). Proves the framework contract holds in practice: every state
  // and styling recipe applies here unchanged, against a completely different file layout.
  'vite-react': {
    description: 'Vite + React SPA — a second framework, no server rendering',
    fixture: 'uiOnlyVercelSpec',
    override: { ui: { framework: 'vite-react' }, meta: { slug: 'smoke-vite-react' } },
  },
};

// ── process helpers ──────────────────────────────────────────────────────────

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      // npm is a .cmd shim on Windows and is not directly executable.
      shell: IS_WINDOWS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));

    const timer = setTimeout(() => {
      kill(child);
      resolve({ code: 124, output: `${output}\n[timed out after ${options.timeout}ms]` });
    }, options.timeout ?? 900_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, output: `${output}\n${err.message}` });
    });
  });
}

/**
 * Kills a process and everything it spawned.
 *
 * `next start` and `tsx` both fork children; killing only the parent leaves those holding the
 * port, and the next case then fails to bind for reasons that look nothing like the real cause.
 */
function kill(child) {
  if (!child.pid || child.killed) return;
  try {
    if (IS_WINDOWS) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

/** An OS-assigned free port, so parallel or repeated runs never collide. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function fetchWithRetry(url, { attempts = 60, delayMs = 1000, onFail } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return response;
    } catch (err) {
      // The connection error is kept as `cause`: ECONNREFUSED and a TLS failure look identical
      // once flattened to "never responded", and they are not the same problem.
      if (attempt === attempts) {
        throw new Error(`${url} never responded: ${err.message}`, { cause: err });
      }
      if (onFail?.()) {
        throw new Error(`${url} never responded — the process exited first.`, { cause: err });
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ── reporting ────────────────────────────────────────────────────────────────

const results = [];
let currentCase = null;

function startCase(name) {
  currentCase = { name, steps: [], failed: false };
  results.push(currentCase);
  console.log(`\n\x1b[1m▸ ${name}\x1b[0m — ${CASES[name].description}`);
}

async function step(label, fn) {
  if (currentCase.failed) return null;

  process.stdout.write(`  ${label} … `);
  const started = Date.now();
  try {
    const value = await fn();
    const ms = Date.now() - started;
    currentCase.steps.push({ label, ms, ok: true });
    console.log(`\x1b[32mok\x1b[0m (${(ms / 1000).toFixed(1)}s)`);
    return value;
  } catch (err) {
    const ms = Date.now() - started;
    currentCase.steps.push({ label, ms, ok: false, error: err.message });
    currentCase.failed = true;
    console.log(`\x1b[31mFAILED\x1b[0m (${(ms / 1000).toFixed(1)}s)`);
    console.log(indent(err.message));
    return null;
  }
}

function indent(text) {
  return String(text)
    .split('\n')
    .slice(-40)
    .map((line) => `      ${line}`)
    .join('\n');
}

// ── the harness ──────────────────────────────────────────────────────────────

/** Layers to install and build, in the order they appear in the generated repo. */
function layersOf(files) {
  const manifests = files.filter((f) => /(^|^apps\/[^/]+\/)package\.json$/.test(f.path));
  return manifests.map((f) => {
    const manifest = JSON.parse(f.content);
    const deps = { ...manifest.dependencies, ...manifest.devDependencies };

    return {
      dir: f.path.replace(/package\.json$/, ''),
      scripts: manifest.scripts ?? {},
      // Keyed on the frameworks that produce a browser app, not on `next` alone. Checking only
      // for `next` classified the Vite SPA as an API layer, so the harness tried to boot it and
      // poll /health — a probe a static site has no way to answer.
      kind: deps.next || deps.vite || deps.nuxt ? 'web' : 'api',
    };
  });
}

/**
 * Environment for a generated API.
 *
 * Read from the generated `.env.example` rather than hardcoded, so a recipe that adds a required
 * key gets it filled in here automatically — and a key it forgot to document fails loudly at
 * boot, which is exactly the signal we want.
 */
function apiEnv(exampleContent, port) {
  const env = { PORT: String(port), NODE_ENV: 'production', LOG_LEVEL: 'warn' };

  for (const line of (exampleContent ?? '').split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (env[key] !== undefined) continue;
    env[key] = value.trim() || placeholderFor(key);
  }
  return env;
}

function placeholderFor(key) {
  if (key === 'DATABASE_URL') {
    // Deliberately a real-looking URL pointing nowhere. The API must still boot and serve
    // /health; it is /ready that is allowed to report the database is down.
    return process.env.SMOKE_DATABASE_URL ?? 'postgresql://smoke:smoke@127.0.0.1:5432/smoke';
  }
  if (/SECRET|PRIVATE_KEY/.test(key)) return 'smoke-test-secret-value-at-least-32-characters';
  if (/TOKEN|PASSWORD/.test(key)) return 'smoke-test-placeholder';
  return 'smoke';
}

async function bootApi(dir, layer, workspace) {
  const port = await freePort();
  const example = await readFile(path.join(workspace, layer.dir, '.env.example'), 'utf8').catch(
    () => '',
  );

  const child = spawn('npm', ['start'], {
    cwd: dir,
    env: { ...process.env, ...apiEnv(example, port) },
    shell: IS_WINDOWS,
    detached: !IS_WINDOWS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  let exited = false;
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  child.on('close', () => (exited = true));

  try {
    const health = await fetchWithRetry(`http://127.0.0.1:${port}/health`, {
      onFail: () => exited,
    });
    if (health.status !== 200) {
      throw new Error(`GET /health returned ${health.status}, expected 200\n${output}`);
    }

    // /ready is allowed to fail — it checks the database, and the smoke run has none unless
    // SMOKE_DATABASE_URL points at a real one. What matters is that it answers rather than
    // hanging, and that it disagrees with /health when the database is down.
    const ready = await fetch(`http://127.0.0.1:${port}/ready`).catch(() => null);
    const expected = process.env.SMOKE_DATABASE_URL ? [200] : [503, 200];
    if (!ready || !expected.includes(ready.status)) {
      throw new Error(
        `GET /ready returned ${ready?.status ?? 'nothing'}, expected one of ${expected.join('/')}\n${output}`,
      );
    }

    return { port, readyStatus: ready.status };
  } finally {
    kill(child);
  }
}

async function bootWeb(dir) {
  const port = await freePort();
  const child = spawn('npm', ['start', '--', '--port', String(port)], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    shell: IS_WINDOWS,
    detached: !IS_WINDOWS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  let exited = false;
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  child.on('close', () => (exited = true));

  try {
    const response = await fetchWithRetry(`http://127.0.0.1:${port}/`, { onFail: () => exited });
    if (response.status !== 200) {
      throw new Error(`GET / returned ${response.status}, expected 200\n${output}`);
    }

    const html = await response.text();
    // A 200 that renders Next's error page is still a failure.
    if (/application error|__NEXT_ERROR/i.test(html)) {
      throw new Error(`The page rendered an error:\n${html.slice(0, 500)}`);
    }
    return { port, bytes: html.length };
  } finally {
    kill(child);
  }
}

async function smokeCase(name, workspaceRoot) {
  startCase(name);
  const { spineSpec, uiOnlyVercelSpec } = await import('@idp/core');
  const { createRegistry, runPipeline, emitTree } = await import('@idp/generator');

  const fixtures = { spineSpec, uiOnlyVercelSpec };
  const { fixture, override } = CASES[name];
  const spec = fixtures[fixture](override);

  const workspace = path.join(workspaceRoot, name);

  const generated = await step('generate', async () => {
    const result = await runPipeline(spec, { registry: createRegistry() });
    await emitTree(result.files, workspace);
    return result;
  });
  if (!generated) return;

  for (const layer of layersOf(generated.files)) {
    const dir = path.join(workspace, layer.dir);
    const label = layer.dir === '' ? layer.kind : layer.dir.replace(/\/$/, '');

    // `npm install`, not `npm ci` — a generated project has no lockfile yet, and producing one
    // is the developer's first act after cloning.
    const installed = await step(`${label}: install`, async () => {
      const { code, output } = await run('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: dir,
        timeout: 900_000,
      });
      if (code !== 0) throw new Error(output);
    });
    if (installed === null && currentCase.failed) return;

    if (layer.scripts['db:generate']) {
      await step(`${label}: prisma generate`, async () => {
        const { code, output } = await run('npm', ['run', 'db:generate'], {
          cwd: dir,
          timeout: 300_000,
          // Prisma 7 refuses to load a config without this, even for `generate`.
          env: { DATABASE_URL: placeholderFor('DATABASE_URL') },
        });
        if (code !== 0) throw new Error(output);
      });
    }

    /*
     * Lint and test run here because the generated CI runs them.
     *
     * Their absence was a real hole: the harness proved the code compiled and booted while the
     * generated projects shipped no `eslint.config.mjs` at all, so every provisioned repository's
     * CI failed on `eslint .` before reaching a single line of source. The harness must exercise
     * the same commands CI does, or it only proves the parts CI does not check.
     */
    for (const script of ['lint', 'typecheck', 'test']) {
      if (!layer.scripts[script]) continue;

      await step(`${label}: ${script}`, async () => {
        const { code, output } = await run('npm', ['run', script], {
          cwd: dir,
          timeout: 300_000,
          env: { DATABASE_URL: placeholderFor('DATABASE_URL') },
        });
        if (code !== 0) throw new Error(output);
      });
    }

    await step(`${label}: build`, async () => {
      const { code, output } = await run('npm', ['run', 'build'], {
        cwd: dir,
        timeout: 600_000,
        env: { DATABASE_URL: placeholderFor('DATABASE_URL') },
      });
      if (code !== 0) throw new Error(output);
    });

    await step(`${label}: boot`, async () =>
      layer.kind === 'web' ? bootWeb(dir) : bootApi(dir, layer, workspace),
    );

    if (currentCase.failed) return;
  }
}

// ── entry point ──────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--list')) {
    for (const [name, c] of Object.entries(CASES))
      console.log(`${name.padEnd(12)} ${c.description}`);
    return 0;
  }

  const only = argv.includes('--case') ? argv[argv.indexOf('--case') + 1] : null;
  if (only && !CASES[only]) {
    console.error(`Unknown case "${only}". Known: ${Object.keys(CASES).join(', ')}`);
    return 2;
  }
  const keep = argv.includes('--keep');
  const names = only ? [only] : Object.keys(CASES);

  try {
    await access(path.join(ROOT, 'packages/generator/dist/index.js'));
  } catch {
    console.error('The packages are not built. Run `npm run build` first.');
    return 2;
  }

  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'idp-smoke-'));
  console.log(`Workspace: ${workspaceRoot}`);
  const started = Date.now();

  try {
    for (const name of names) await smokeCase(name, workspaceRoot);
  } finally {
    if (keep) console.log(`\nWorkspace kept at ${workspaceRoot}`);
    else await rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  }

  // ── summary ────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.failed);
  console.log(`\n${'─'.repeat(70)}`);
  for (const result of results) {
    const total = result.steps.reduce((sum, s) => sum + s.ms, 0);
    const mark = result.failed ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
    console.log(`${mark} ${result.name.padEnd(12)} ${(total / 1000).toFixed(0)}s`);
    for (const s of result.steps.filter((s) => !s.ok)) console.log(`    failed at: ${s.label}`);
  }
  console.log(
    `${results.length - failed.length}/${results.length} cases passed in ` +
      `${((Date.now() - started) / 1000 / 60).toFixed(1)} min`,
  );

  return failed.length > 0 ? 1 : 0;
}

process.exitCode = await main();
