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
   * The non-Node runtimes (P3). These two ran as zero-layer no-ops until layersOf learned to
   * recognise pyproject.toml and go.mod — the harness generated them, found nothing it knew how
   * to install, and passed. Locally they skip with a loud warning when uv or go is missing; in
   * CI, SMOKE_REQUIRE_TOOLCHAINS turns that skip into a failure.
   */
  'api-python': {
    description: 'FastAPI, full middleware, SQLModel — uv sync, ruff, pytest, boot and probe',
    fixture: 'apiOnlyPythonSpec',
    override: { meta: { slug: 'smoke-api-python' } },
  },
  'api-go': {
    description: 'Gin, full middleware, GORM — go vet, test, build, boot and probe',
    fixture: 'apiOnlyGoSpec',
    override: { meta: { slug: 'smoke-api-go' } },
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

  // The first page module (P2.5). Written once, rendered under both routing shapes and any
  // styling system — the payoff for the primitive API.
  'module-auth-vite': {
    description: 'Auth pages on Vite — declared routing, registered at the marker',
    fixture: 'spineSpec',
    override: {
      ui: { framework: 'vite-react', modules: { authLayouts: true } },
      meta: { slug: 'smoke-auth-vite' },
    },
  },
  'module-auth-mui': {
    description: 'Auth pages on Next with MUI — same module, different primitives',
    fixture: 'spineSpec',
    override: {
      ui: { styling: 'mui', modules: { authLayouts: true } },
      meta: { slug: 'smoke-auth-mui' },
    },
  },

  // The second framework (P2.2). Proves the framework contract holds in practice: every state
  // and styling recipe applies here unchanged, against a completely different file layout.
  'vite-react': {
    description: 'Vite + React SPA — a second framework, no server rendering',
    fixture: 'uiOnlyVercelSpec',
    override: { ui: { framework: 'vite-react' }, meta: { slug: 'smoke-vite-react' } },
  },

  /*
   * Nuxt (P2.4) — the first non-React framework, once per Vue styling system.
   *
   * These two are what prove the framework contract stretched: a framework with no JSX, no
   * provider tree and its source under `app/`. Everything the React cases assume had to be
   * declared rather than assumed to get here.
   *
   * `css-modules` is the cheap one — zero dependencies, so a failure is an API-design problem
   * rather than a library-integration one. It compiles the `.vue` primitives, their
   * `<style module>` blocks and the generic `<script setup>` on the table.
   */
  nuxt: {
    description: 'Nuxt 4 + CSS Modules — eight primitives as single-file components',
    fixture: 'uiOnlyVercelSpec',
    override: {
      ui: { framework: 'nuxt', styling: 'css-modules' },
      meta: { slug: 'smoke-nuxt' },
    },
  },

  /*
   * TanStack Query on Nuxt — the state path with the most that can go wrong.
   *
   * The Pinia path is already covered by the `nuxt` case above, whose default state maps to it.
   * This one is separate because the plugin does real work: a per-request QueryClient, and a
   * dehydrate/hydrate pair across the SSR boundary. Both fail silently — a shared client leaks
   * cache between users, and missing hydration makes every server-fetched page blank and refill
   * on load.
   */
  'nuxt-vue-query': {
    description: 'Nuxt + TanStack Query — per-request client, SSR hydration',
    fixture: 'uiOnlyVercelSpec',
    override: {
      ui: { framework: 'nuxt', styling: 'css-modules', state: 'react-query' },
      meta: { slug: 'smoke-nuxt-vue-query' },
    },
  },

  /*
   * Tailwind completes the set: with this, every styling option the wizard offers has a Vue
   * implementation, which is the bar for offering Nuxt at all. It is also the only case that
   * compiles the @tailwindcss/vite wiring.
   */
  'nuxt-tailwind': {
    description: 'Nuxt + Tailwind — the third Vue styling system, completing the set',
    fixture: 'uiOnlyVercelSpec',
    override: {
      ui: { framework: 'nuxt', styling: 'tailwind-shadcn' },
      meta: { slug: 'smoke-nuxt-tailwind' },
    },
  },

  /*
   * Vuetify is the expensive one, and the counterpart to `styling-mui` in the React family: the
   * only Vue styling system wrapping a third-party component library, so it is where a primitive
   * API that cannot actually be implemented shows up. MUI forced a redesign of `Select` when the
   * React family reached this point.
   *
   * It is also the only case compiling the vite-plugin-vuetify wiring — the import, the
   * `build.transpile` entry and the Vite plugin, each inserted at a different `nuxt.config.ts`
   * marker.
   */
  'nuxt-vuetify': {
    description: 'Nuxt + Vuetify — eight primitives wrapping a real component library',
    fixture: 'uiOnlyVercelSpec',
    override: {
      ui: { framework: 'nuxt', styling: 'mui' },
      meta: { slug: 'smoke-nuxt-vuetify' },
    },
  },

  /*
   * The first page module ported across the family boundary (P2.4).
   *
   * Run under Vuetify rather than CSS Modules on purpose: the pages are written against the
   * primitive API, and Vuetify is the implementation whose props are furthest from the markup a
   * page would write by hand. If a wrapper leaks its library's API, this is where it shows.
   */
  'module-auth-nuxt': {
    description: 'Auth pages on Nuxt with Vuetify — the same module, a different family',
    fixture: 'spineSpec',
    override: {
      ui: {
        framework: 'nuxt',
        styling: 'mui',
        modules: { authLayouts: true, userManagement: false, settingsRbac: false },
      },
      meta: { slug: 'smoke-auth-nuxt' },
    },
  },

  /*
   * userManagement and stripeBilling on Nuxt, together (P2.4).
   *
   * Both at once on purpose: they each contribute the same `apiUrl` key to the runtime-config
   * marker, and a duplicated property in that object literal is a TypeScript error rather than
   * something the generator would notice. Nothing else exercises two page modules competing for
   * one marker.
   */
  'module-nuxt': {
    description: 'all four page modules on Nuxt — runtime config, tables, dialogs',
    fixture: 'spineSpec',
    override: {
      ui: {
        framework: 'nuxt',
        styling: 'css-modules',
        modules: {
          authLayouts: true,
          userManagement: true,
          stripeBilling: true,
          settingsRbac: true,
        },
      },
      meta: { slug: 'smoke-module-nuxt' },
    },
  },

  /*
   * The userManagement page module (P2.5b), on both layers at once.
   *
   * The only case that compiles generated Prisma queries and a page using all eight primitives,
   * so it is the only one that catches a model whose field names the routes disagree with, or a
   * primitive whose props the page cannot actually satisfy. Both are invisible to the generator's
   * own tests, which check that files were produced rather than that they compile.
   *
   * MUI on purpose: it is the styling system whose primitives wrap a third-party library, so it
   * is where a props mismatch surfaces first.
   */
  'module-users': {
    description: 'userManagement across web and api — Prisma model, REST routes, all 8 primitives',
    fixture: 'spineSpec',
    override: {
      ui: { styling: 'mui', modules: { userManagement: true } },
      meta: { slug: 'smoke-module-users' },
    },
  },

  /*
   * settingsRbac (P2.5c) — the module with the most surface behind it.
   *
   * Four Prisma models, eight guarded routes, a permission resolver installed into the shared
   * policy at boot, and four UI panels. The resolver is the part worth running rather than
   * asserting: it is installed by a side effect at startup, so nothing static proves the process
   * still boots with it in place.
   *
   * CSS Modules on purpose — `module-users` covers MUI, and this exercises the third system
   * against the Card sub-components the settings panels use heavily.
   */
  'module-settings': {
    description: 'settingsRbac — permission matrix, audit log, API keys, four-tab shell',
    fixture: 'spineSpec',
    override: {
      ui: { styling: 'css-modules', modules: { settingsRbac: true } },
      meta: { slug: 'smoke-module-settings' },
    },
  },

  /*
   * stripeBilling (P2.5d) — the only module with a third-party SDK behind it.
   *
   * Worth its own case for two reasons nothing static covers. The Stripe client is constructed at
   * module load with a pinned `apiVersion` whose type is a literal union tied to the installed
   * SDK, so a version drift is a compile error only a real `npm install` can surface. And the
   * webhook registers an encapsulated raw-body parser — if that scope leaked, every other route
   * in the service would receive a Buffer instead of a parsed body, which boots fine and fails on
   * the first request.
   */
  'module-billing': {
    description: 'stripeBilling — Checkout, Customer Portal, raw-body webhook with idempotency',
    fixture: 'spineSpec',
    override: {
      ui: { modules: { stripeBilling: true } },
      meta: { slug: 'smoke-module-billing' },
    },
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
  const layers = [];

  for (const f of files) {
    if (/(^|^apps\/[^/]+\/)package\.json$/.test(f.path)) {
      const manifest = JSON.parse(f.content);
      const deps = { ...manifest.dependencies, ...manifest.devDependencies };
      layers.push({
        dir: f.path.replace(/package\.json$/, ''),
        scripts: manifest.scripts ?? {},
        // Keyed on the frameworks that produce a browser app, not on `next` alone. Checking only
        // for `next` classified the Vite SPA as an API layer, so the harness tried to boot it and
        // poll /health — a probe a static site has no way to answer.
        kind: deps.next || deps.vite || deps.nuxt ? 'web' : 'api',
        toolchain: 'node',
      });
      continue;
    }

    /*
     * The other two manifests. This function used to look for package.json ONLY, which made a
     * generated FastAPI project have zero layers: the harness generated it, found nothing it
     * recognised, and reported success having installed, built and booted nothing at all. A
     * smoke harness that silently skips is worse than none — its green check reads as coverage.
     */
    if (/(^|^apps\/[^/]+\/)pyproject\.toml$/.test(f.path)) {
      layers.push({
        dir: f.path.replace(/pyproject\.toml$/, ''),
        scripts: {},
        kind: 'api',
        toolchain: 'python',
      });
      continue;
    }

    if (/(^|^apps\/[^/]+\/)go\.mod$/.test(f.path)) {
      layers.push({
        dir: f.path.replace(/go\.mod$/, ''),
        scripts: {},
        kind: 'api',
        toolchain: 'go',
      });
    }
  }

  return layers;
}

/**
 * Whether a layer's toolchain is installed, probed once per run.
 *
 * A machine without Go must not report the generator broken — locally a missing toolchain skips
 * the layer with a loud warning. In CI that same silence would be the exact hole this harness
 * just had, so the smoke workflow sets SMOKE_REQUIRE_TOOLCHAINS=1 and a missing toolchain FAILS.
 */
const TOOLCHAIN_PROBES = {
  node: ['npm', ['--version']],
  python: ['uv', ['--version']],
  go: ['go', ['version']],
};

const toolchainStatus = new Map();

async function toolchainAvailable(toolchain) {
  if (toolchainStatus.has(toolchain)) return toolchainStatus.get(toolchain);
  const [command, args] = TOOLCHAIN_PROBES[toolchain];
  const { code } = await run(command, args, { timeout: 30_000, quiet: true });
  toolchainStatus.set(toolchain, code === 0);
  return code === 0;
}

/** How a layer's API process starts, per toolchain. */
function startCommand(layer) {
  if (layer.toolchain === 'python') return ['uv', ['run', 'python', '-m', 'app']];
  // `go run` recompiles, but the build cache is warm from the vet/test/build steps, so the boot
  // is near-instant and there is no binary path to thread through.
  if (layer.toolchain === 'go') return ['go', ['run', './cmd/api']];
  return ['npm', ['start']];
}

/**
 * Every key a layer's `.env.example` documents, filled in.
 *
 * Read from the generated file rather than hardcoded, so a recipe that adds a required key gets it
 * supplied here automatically — and a key it forgot to document fails loudly, which is exactly the
 * signal we want.
 *
 * Applied to *every* layer, not only the API. The web layer had no `.env.example` at all until a
 * page module needed an API base URL, so nothing here supplied one — and `next build` prerenders
 * pages, which evaluates the env module and throws on the missing key. A build failure, from a
 * variable the generated `.env.example` documented perfectly well.
 */
function exampleEnv(exampleContent, into = {}) {
  for (const line of (exampleContent ?? '').split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (into[key] !== undefined) continue;
    into[key] = value.trim() || placeholderFor(key);
  }
  return into;
}

/** The same keys, plus what an API needs at boot that no `.env.example` documents. */
function apiEnv(exampleContent, port) {
  return exampleEnv(exampleContent, {
    PORT: String(port),
    // Both spellings, one per runtime family; each service reads its own and ignores the other.
    NODE_ENV: 'production',
    ENVIRONMENT: 'production',
    LOG_LEVEL: 'warn',
  });
}

function placeholderFor(key) {
  if (key === 'DATABASE_URL') {
    // Deliberately a real-looking URL pointing nowhere. The API must still boot and serve
    // /health; it is /ready that is allowed to report the database is down.
    return process.env.SMOKE_DATABASE_URL ?? 'postgresql://smoke:smoke@127.0.0.1:5432/smoke';
  }
  // Anything a schema is likely to validate with `.url()`. A bare 'smoke' fails that check, and
  // the failure reads as a bug in the recipe rather than in this placeholder.
  if (/_URL$|_ORIGIN$/.test(key)) return 'http://127.0.0.1:3001';
  if (/SECRET|PRIVATE_KEY/.test(key)) return 'smoke-test-secret-value-at-least-32-characters';
  if (/TOKEN|PASSWORD/.test(key)) return 'smoke-test-placeholder';
  return 'smoke';
}

async function bootApi(dir, layer, workspace) {
  const port = await freePort();
  const example = await readFile(path.join(workspace, layer.dir, '.env.example'), 'utf8').catch(
    () => '',
  );

  const [startCmd, startArgs] = startCommand(layer);
  const child = spawn(startCmd, startArgs, {
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

async function bootWeb(dir, layerEnv = {}) {
  const port = await freePort();
  const child = spawn('npm', ['start', '--', '--port', String(port)], {
    cwd: dir,
    // The documented environment reaches the server too. `NEXT_PUBLIC_*` is inlined at build so
    // the page would render regardless, but a server component reading the validated `env` module
    // would not — and the difference is not worth relying on.
    env: { ...process.env, ...layerEnv, PORT: String(port), NODE_ENV: 'production' },
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

/**
 * Install, lint, test and boot for the Python and Go layers.
 *
 * The same commands the generated CI runs, deliberately — the harness must exercise what CI
 * checks or it only proves the parts CI does not (see the lint/test note in the node path).
 */
async function smokeNonNodeLayer(layer, dir, label, workspace, layerEnv) {
  const steps =
    layer.toolchain === 'python'
      ? [
          ['sync', 'uv', ['sync', '--all-groups'], 900_000],
          ['ruff check', 'uv', ['run', 'ruff', 'check', '.'], 300_000],
          ['ruff format', 'uv', ['run', 'ruff', 'format', '--check', '.'], 300_000],
          ['pytest', 'uv', ['run', 'pytest'], 300_000],
        ]
      : [
          ['tidy', 'go', ['mod', 'tidy'], 900_000],
          // `gofmt -l` exits 0 regardless; listing a file is the failure. The generated CI runs
          // the same check, so a formatting drift must fail here too or the harness proves less
          // than CI checks.
          ['gofmt', 'gofmt', ['-l', '.'], 120_000, 'empty-output'],
          ['vet', 'go', ['vet', './...'], 600_000],
          ['test', 'go', ['test', './...'], 600_000],
          ['build', 'go', ['build', './...'], 600_000],
        ];

  for (const [stepLabel, command, args, timeout, mode] of steps) {
    await step(`${label}: ${stepLabel}`, async () => {
      // The layer's own documented environment, same as the node path: pytest imports the app,
      // the app parses Settings at import, and Settings requires the variables .env.example
      // documents. A developer who copies .env.example to .env gets exactly this.
      const { code, output } = await run(command, args, { cwd: dir, timeout, env: layerEnv });
      if (code !== 0) throw new Error(output);
      if (mode === 'empty-output' && output.trim() !== '') {
        throw new Error(`gofmt would reformat:\n${output}`);
      }
    });
    if (currentCase.failed) return;
  }

  await step(`${label}: boot`, async () => bootApi(dir, layer, workspace));
}

async function smokeCase(name, workspaceRoot) {
  startCase(name);
  const { spineSpec, uiOnlyVercelSpec, apiOnlyPythonSpec, apiOnlyGoSpec } =
    await import('@idp/core');
  const { createRegistry, runPipeline, emitTree } = await import('@idp/generator');

  const fixtures = { spineSpec, uiOnlyVercelSpec, apiOnlyPythonSpec, apiOnlyGoSpec };
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

    // This layer's own documented environment, supplied to every command below. A developer who
    // copies `.env.example` to `.env` gets exactly this, so anything that fails here would have
    // failed for them on a fresh clone.
    const layerEnv = exampleEnv(
      await readFile(path.join(dir, '.env.example'), 'utf8').catch(() => null),
      { DATABASE_URL: placeholderFor('DATABASE_URL') },
    );

    if (!(await toolchainAvailable(layer.toolchain))) {
      if (process.env.SMOKE_REQUIRE_TOOLCHAINS) {
        await step(`${label}: toolchain`, async () => {
          throw new Error(
            `The ${layer.toolchain} toolchain is not installed and SMOKE_REQUIRE_TOOLCHAINS is ` +
              `set. In CI this layer being skipped is a silent coverage hole, so it fails instead.`,
          );
        });
        return;
      }
      console.log(
        `\n  \x1b[33m⚠ ${label}: the ${layer.toolchain} toolchain is not installed — ` +
          `install/build/boot SKIPPED for this layer.\x1b[0m`,
      );
      continue;
    }

    if (layer.toolchain !== 'node') {
      await smokeNonNodeLayer(layer, dir, label, workspace, layerEnv);
      if (currentCase.failed) return;
      continue;
    }

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
          env: layerEnv,
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
          env: layerEnv,
        });
        if (code !== 0) throw new Error(output);
      });
    }

    await step(`${label}: build`, async () => {
      const { code, output } = await run('npm', ['run', 'build'], {
        cwd: dir,
        timeout: 600_000,
        env: layerEnv,
      });
      if (code !== 0) throw new Error(output);
    });

    await step(`${label}: boot`, async () =>
      layer.kind === 'web' ? bootWeb(dir, layerEnv) : bootApi(dir, layer, workspace),
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

  /*
   * An ad-hoc case supplied by `scripts/pairwise.mjs`, as JSON.
   *
   * The T2 matrix picks its combinations by computing pairwise coverage, so they cannot be
   * enumerated here — and duplicating install/build/boot inside that script to avoid this hook
   * would mean two harnesses drifting apart. It registers one case and runs it like any other.
   */
  const matrixArg = argv.includes('--matrix-case') ? argv[argv.indexOf('--matrix-case') + 1] : null;

  if (matrixArg) {
    const { framework, styling, state, slug } = JSON.parse(matrixArg);
    CASES[slug] = {
      description: `T2 pairwise — ${framework} / ${styling} / ${state}`,
      fixture: 'spineSpec',
      override: { ui: { framework, styling, state }, meta: { slug } },
    };
  }

  const only = matrixArg
    ? Object.keys(CASES).at(-1)
    : argv.includes('--case')
      ? argv[argv.indexOf('--case') + 1]
      : null;

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
