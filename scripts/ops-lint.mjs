#!/usr/bin/env node
/**
 * Ops-artifact linting — are the Dockerfiles, charts and workflows we ship actually valid?
 *
 * The smoke harness proves generated *code* runs. Nothing until now proved the generated *ops*
 * artifacts are correct, because none of them execute during a build: a Helm chart that renders
 * invalid YAML, a Dockerfile with a caching mistake, a workflow with a misspelled `runs-on` — all
 * three pass every check we had, and all three fail only once a real cluster or a real Actions
 * runner rejects them. That is the worst place to find out, since by then a repository has been
 * provisioned and handed to a team.
 *
 * So this renders the ops artifacts for a spread of specs and runs the four tools that do
 * understand them:
 *
 *   hadolint     Dockerfiles      — build correctness, caching, root users
 *   actionlint   GitHub workflows — expression syntax, action inputs, shell bugs
 *   kubeconform  Kubernetes YAML  — schema validity against a real API version
 *   conftest     Kubernetes YAML  — our own security policy (policy/*.rego)
 *
 * It also lints *this* repository's own workflows, since a broken `pr.yml` is the one failure
 * that stops every other check from running at all.
 *
 * None of these four are npm packages, so they are absent on a plain developer machine. Missing
 * tools are skipped with a note and the run still passes — the alternative is a script nobody can
 * run locally. CI passes `--require-all`, which turns a missing tool into a failure, so a broken
 * install surfaces as red rather than as a silently shrinking set of checks.
 *
 * Usage:
 *   node scripts/ops-lint.mjs                 # every case, skipping absent tools
 *   node scripts/ops-lint.mjs --require-all   # absent tool is a failure (CI)
 *   node scripts/ops-lint.mjs --case spine
 *   node scripts/ops-lint.mjs --keep          # leave the rendered artifacts on disk
 *   node scripts/ops-lint.mjs --list
 *
 * Requires `npm run build` first — it imports the built packages.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';

// ── cases ────────────────────────────────────────────────────────────────────

/**
 * Chosen for artifact coverage, not feature coverage.
 *
 * Every case here must contribute an ops file the others do not. `spine` brings the Next and
 * node-api Dockerfiles plus the full chart; `spa` brings the nginx image and its different
 * probe path; `no-k8s` proves the Vercel path emits no chart at all, which is a real assertion —
 * a chart generated for a target that has no cluster would be dead weight nobody notices.
 */
const CASES = {
  spine: {
    description: 'Next + Fastify + Prisma, K8s + GitOps — every ops artifact we produce',
    fixture: 'spineSpec',
    override: {},
    expect: {
      dockerfiles: ['apps/web/Dockerfile', 'apps/api/Dockerfile'],
      chart: 'deploy',
      gitops: true,
    },
  },
  spa: {
    description: 'Vite SPA on K8s — the nginx image and a chart with no Node runtime',
    fixture: 'uiOnlyVercelSpec',
    override: {
      ui: { framework: 'vite-react' },
      meta: { slug: 'ops-spa', deploymentTarget: 'aws-eks' },
      ops: { k8s: { enabled: true }, gitops: { enabled: true } },
    },
    expect: { dockerfiles: ['Dockerfile'], chart: 'deploy', gitops: true },
  },
  'no-k8s': {
    description: 'Vercel target — asserts we emit no chart and no Argo manifests',
    fixture: 'uiOnlyVercelSpec',
    override: { meta: { slug: 'ops-no-k8s' } },
    // The Dockerfile stays. Container strategy is its own choice, not a consequence of the
    // deployment target — a team on Vercel still builds an image for local parity and for the
    // day they move off it. Only the cluster-shaped artifacts disappear.
    expect: { dockerfiles: ['Dockerfile'], chart: null, gitops: false },
  },
};

// ── tools ────────────────────────────────────────────────────────────────────

/**
 * Every tool, with the arguments that make it print its version and exit 0.
 *
 * `helm` is here even though it lints nothing itself: the chart has to be rendered before
 * kubeconform or conftest can look at it, so its absence disables both. Recording it means the
 * summary says "helm unavailable" once rather than reporting two mystery skips.
 *
 * The arguments are spelled out per tool because they genuinely disagree, and assuming
 * `--version` for all five was wrong for two of them: Helm's is a subcommand (`helm version`, not
 * a flag at all), and kubeconform's Go flag is the single-letter `-v`, so `--version` is an
 * unrecognised flag and exits non-zero.
 *
 * That produced the worst kind of red: CI installed all five correctly, this reported
 * "missing: helm, kubeconform", and `--require-all` failed the job. Nothing was wrong with the
 * runner — the probe was.
 */
const TOOLS = {
  hadolint: ['--version'],
  actionlint: ['--version'],
  // Not `--version`. Helm 3 has no such flag; `helm version` is a subcommand.
  helm: ['version', '--short'],
  // Not `--version`. kubeconform's flag is the single-letter `-v`.
  kubeconform: ['-v'],
  conftest: ['--version'],
};

const TOOL_NAMES = Object.keys(TOOLS);

const available = new Set();

/**
 * Probes by execution rather than by `which`.
 *
 * A binary on PATH that cannot actually run — wrong architecture, missing shared library — is not
 * a usable tool, and `which` would report it as present.
 */
async function detectTools() {
  const failures = [];

  for (const [tool, args] of Object.entries(TOOLS)) {
    const { code, stdout, stderr, notFound } = await run(tool, args, { timeout: 30_000 });

    if (code === 0) {
      available.add(tool);
      continue;
    }

    /*
     * The binary ran and disliked the arguments — so it IS installed, and the probe above is
     * wrong. Treat it as available and say so loudly rather than failing the build.
     *
     * This distinction is the lesson from getting two of these flags wrong at once. A probe I
     * typed badly should cost a warning; only a tool that genuinely is not there should cost a
     * red build.
     */
    if (!notFound) {
      available.add(tool);
      console.log(
        `  \x1b[33mnote\x1b[0m ${tool} is installed but \`${tool} ${args.join(' ')}\` exited ` +
          `${code}. Assuming it works; fix the probe in TOOLS.`,
      );
      continue;
    }

    // Genuinely absent. Kept with its probe and output, because "missing: helm" sent me looking
    // at the install step when the cause was one line of stderr from the probe itself.
    failures.push({ tool, probe: `${tool} ${args.join(' ')}`, detail: (stderr || stdout).trim() });
  }
  return failures;
}

// ── process helpers ──────────────────────────────────────────────────────────

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, ...options.env },
      shell: IS_WINDOWS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Kept apart because `helm template` writes the manifests to stdout and its warnings to
    // stderr. Merging them, as the smoke harness does, would feed those warnings to kubeconform
    // as if they were YAML.
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: 124, stdout, stderr: `${stderr}\n[timed out]` });
    }, options.timeout ?? 300_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, notFound: looksNotFound(stderr) });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      // ENOENT here is the normal "tool not installed" path, not an exceptional one.
      resolve({ code: 127, stdout, stderr: `${stderr}${err.message}`, notFound: true });
    });
  });
}

/**
 * "The binary does not exist", distinguished from "the binary rejected these arguments".
 *
 * The exit code alone cannot tell them apart. Commands run through a shell on Windows, and
 * `cmd.exe` answers 1 for an unrecognised command — the same code a tool uses for an unknown
 * flag — so keying on 127 works on Linux and silently misreports every absent tool on Windows as
 * present. Matching what the shell actually says is the only signal available on both.
 */
function looksNotFound(stderr) {
  return /is not recognized as an internal or external command|command not found|: not found/i.test(
    stderr,
  );
}

// ── reporting ────────────────────────────────────────────────────────────────

const results = [];
let currentCase = null;

function startCase(name, description) {
  currentCase = { name, checks: [], failed: false };
  results.push(currentCase);
  console.log(`\n\x1b[1m▸ ${name}\x1b[0m — ${description}`);
}

/**
 * One check, one line.
 *
 * Unlike the smoke harness this does *not* stop a case at the first failure. Ops findings are
 * independent — a hadolint warning tells you nothing about whether the chart renders — and
 * fixing them one CI run at a time would take four runs to learn what one can report.
 */
async function check(label, tool, fn) {
  if (tool && !available.has(tool)) {
    currentCase.checks.push({ label, skipped: tool });
    console.log(`  ${label} … \x1b[90mskipped (${tool} not installed)\x1b[0m`);
    return null;
  }

  process.stdout.write(`  ${label} … `);
  try {
    const value = await fn();
    currentCase.checks.push({ label, ok: true });
    console.log(`\x1b[32mok\x1b[0m`);
    return value;
  } catch (err) {
    currentCase.checks.push({ label, ok: false, error: err.message });
    currentCase.failed = true;
    console.log(`\x1b[31mFAILED\x1b[0m`);
    console.log(indent(err.message));
    return null;
  }
}

function indent(text) {
  return String(text)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(0, 40)
    .map((line) => `      ${line}`)
    .join('\n');
}

// ── checks ───────────────────────────────────────────────────────────────────

/**
 * Every Dockerfile in the generated tree, not just the ones the case expects.
 *
 * The expectation list is asserted separately. Linting whatever is actually there means a
 * Dockerfile that appears from a recipe nobody remembered still gets checked.
 */
async function lintDockerfiles(workspace, expected) {
  const found = await findFiles(workspace, (name) => name === 'Dockerfile');

  await check(`expects ${expected.length} Dockerfile(s)`, null, async () => {
    const relative = found.map((f) => path.relative(workspace, f).replaceAll('\\', '/')).sort();
    const want = [...expected].sort();
    if (JSON.stringify(relative) !== JSON.stringify(want)) {
      throw new Error(`expected ${JSON.stringify(want)}, generated ${JSON.stringify(relative)}`);
    }
  });

  for (const file of found) {
    const label = `hadolint ${path.relative(workspace, file).replaceAll('\\', '/')}`;
    await check(label, 'hadolint', async () => {
      const { code, stdout, stderr } = await run('hadolint', [
        '--config',
        path.join(ROOT, '.hadolint.yaml'),
        file,
      ]);
      if (code !== 0) throw new Error(stdout || stderr);
    });
  }
}

async function lintWorkflows(dir, labelPrefix) {
  const workflowDir = path.join(dir, '.github', 'workflows');
  const entries = await readdir(workflowDir).catch(() => []);
  const files = entries.filter((name) => /\.ya?ml$/.test(name));

  for (const name of files) {
    await check(`${labelPrefix}actionlint ${name}`, 'actionlint', async () => {
      // `-color never` keeps ANSI escapes out of the error text we re-print through indent().
      const { code, stdout, stderr } = await run('actionlint', [
        '-color',
        'never',
        path.join(workflowDir, name),
      ]);
      if (code !== 0) throw new Error(stdout || stderr);
    });
  }
  return files.length;
}

/**
 * The chart declares `image.tag` as `required`, so it refuses to render without one — deliberately,
 * because a chart that defaults to `latest` makes rollbacks guesswork. CI writes the commit SHA;
 * here a fixed stand-in does, which also keeps the rendered output identical between runs.
 */
const IMAGE_TAG = ['--set', 'image.tag=0000000000000000000000000000000000000000'];

/**
 * Renders the chart once per environment and validates each rendering.
 *
 * Per environment, because that is where the differences live: prod turns on autoscaling and the
 * ingress, dev does not. Validating only the default values would leave the HPA and Ingress —
 * the two objects most likely to drift from their API versions — never schema-checked at all.
 */
async function validateChart(workspace, chartDir, outDir) {
  const chart = path.join(workspace, chartDir);

  await check('helm lint', 'helm', async () => {
    const { code, stdout, stderr } = await run('helm', ['lint', chart, ...IMAGE_TAG]);
    if (code !== 0) throw new Error(stdout || stderr);
  });

  for (const env of ['dev', 'staging', 'prod']) {
    const rendered = path.join(outDir, `${env}.yaml`);

    const ok = await check(`helm template (${env})`, 'helm', async () => {
      const { code, stdout, stderr } = await run('helm', [
        'template',
        'release',
        chart,
        '--values',
        path.join(chart, 'values.yaml'),
        '--values',
        path.join(chart, `values-${env}.yaml`),
        ...IMAGE_TAG,
      ]);
      if (code !== 0) throw new Error(stderr || stdout);
      if (stdout.trim() === '') throw new Error('rendered to nothing');
      await writeFile(rendered, stdout, 'utf8');
      return true;
    });
    if (!ok) continue;

    await check(`kubeconform (${env})`, 'kubeconform', async () => {
      const { code, stdout, stderr } = await run('kubeconform', [
        // Rejects fields the schema does not define. Without it a typo like `replias: 3` is
        // simply ignored, which is precisely the class of bug this catches.
        '-strict',
        '-summary',
        '-kubernetes-version',
        KUBERNETES_VERSION,
        rendered,
      ]);
      if (code !== 0) throw new Error(stdout || stderr);
    });

    await check(`conftest (${env})`, 'conftest', async () => {
      const { code, stdout, stderr } = await run('conftest', [
        'test',
        '--policy',
        path.join(ROOT, 'policy'),
        // Every rendered document must be visited. Without this conftest is happy to pass a
        // file whose objects no rule happened to match.
        '--all-namespaces',
        rendered,
      ]);
      if (code !== 0) throw new Error(stdout || stderr);
    });
  }
}

/**
 * ArgoCD's Application and AppProject are CRDs, so their schemas are not in the Kubernetes
 * distribution. The datree catalog carries them; `-schema-location default` has to be repeated
 * because naming any location replaces the built-in list rather than adding to it.
 */
const CRD_SCHEMAS =
  'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json';

const KUBERNETES_VERSION = '1.31.0';

async function validateGitops(workspace) {
  const dir = path.join(workspace, 'gitops');
  const entries = await readdir(dir).catch(() => []);
  const files = entries.filter((name) => /\.ya?ml$/.test(name)).map((name) => path.join(dir, name));

  if (files.length === 0) throw new Error('gitops/ is empty');

  await check(`kubeconform gitops (${files.length} manifests)`, 'kubeconform', async () => {
    const { code, stdout, stderr } = await run('kubeconform', [
      '-strict',
      '-summary',
      '-schema-location',
      'default',
      '-schema-location',
      CRD_SCHEMAS,
      ...files,
    ]);
    if (code !== 0) throw new Error(stdout || stderr);
  });
}

/**
 * Does the chart point at the port and paths the image actually serves?
 *
 * The check no off-the-shelf tool performs, and the reason this script exists in its current
 * shape. hadolint reads the Dockerfile, kubeconform reads the chart, and neither notices that the
 * chart routes to 3000 while the Dockerfile exposes 8080 — each artifact is impeccable on its own
 * and the deployment still never becomes Ready.
 *
 * Three of these mismatches were live when this was written: the SPA chart used the Node port, the
 * Next chart probed `/health` when Next serves `/api/health`, and the SPA pod ran as UID 65532
 * against an image built for 101. All three render, validate and apply cleanly.
 *
 * The deployable contract is now the single source of truth, so this asserts the two directions
 * that matter: the chart agrees with the contract, and the image agrees with the contract.
 */
async function checkArtifactAgreement(workspace, rendered, contract) {
  // Needs a rendering, so it needs helm. The Dockerfile half below does not, which is deliberate:
  // the more common local mistake — changing a port in one file — is still caught on a machine
  // with no cluster tooling at all.
  await check('chart agrees with the image contract', 'helm', async () => {
    const source = await readFile(rendered, 'utf8').catch(() => null);
    if (source === null) throw new Error(`${path.basename(rendered)} was never rendered`);

    const docs = parseAllDocuments(source).map((d) => d.toJS());
    const deployment = docs.find((d) => d?.kind === 'Deployment');
    if (!deployment) throw new Error('the rendering contains no Deployment');

    const container = deployment.spec.template.spec.containers[0];
    const problems = [];

    const port = container.ports?.[0]?.containerPort;
    if (port !== contract.port) problems.push(`containerPort ${port} ≠ contract ${contract.port}`);

    const liveness = container.livenessProbe?.httpGet?.path;
    if (liveness !== contract.livenessPath) {
      problems.push(`livenessProbe ${liveness} ≠ contract ${contract.livenessPath}`);
    }

    const readiness = container.readinessProbe?.httpGet?.path;
    if (readiness !== contract.readinessPath) {
      problems.push(`readinessProbe ${readiness} ≠ contract ${contract.readinessPath}`);
    }

    const uid = deployment.spec.template.spec.securityContext?.runAsUser;
    if (uid !== contract.runAsUser) {
      problems.push(`runAsUser ${uid} ≠ contract ${contract.runAsUser}`);
    }

    // Every path the image needs must be mounted, or the read-only root filesystem turns a write
    // into a runtime error the manifest looks perfectly healthy about.
    const mounted = new Set((container.volumeMounts ?? []).map((m) => m.mountPath));
    for (const needed of contract.writablePaths) {
      if (!mounted.has(needed)) problems.push(`${needed} is not mounted writable`);
    }

    if (problems.length > 0) throw new Error(problems.join('\n'));
  });

  await check('Dockerfile exposes the contract port', null, async () => {
    const dockerfiles = await findFiles(workspace, (name) => name === 'Dockerfile');

    // The deployed image is the one whose EXPOSE matches. In a UI+API project both exist and only
    // the API's is deployed, so this looks for agreement rather than demanding every file match.
    const exposed = [];
    for (const file of dockerfiles) {
      const content = await readFile(file, 'utf8');
      for (const match of content.matchAll(/^EXPOSE\s+(\d+)/gm)) exposed.push(Number(match[1]));
    }

    if (exposed.length === 0) return; // Containers disabled for this spec — nothing to compare.
    if (!exposed.includes(contract.port)) {
      throw new Error(
        `no Dockerfile exposes ${contract.port}; found ${exposed.join(', ') || 'none'}`,
      );
    }
  });
}

// ── the harness ──────────────────────────────────────────────────────────────

async function findFiles(dir, matches, found = []) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await findFiles(full, matches, found);
    else if (matches(entry.name)) found.push(full);
  }
  return found;
}

async function lintCase(name, workspaceRoot) {
  const { description, fixture, override, expect } = CASES[name];
  startCase(name, description);

  const core = await import('@idp/core');
  const { createRegistry, runPipeline, emitTree, deployableContract } =
    await import('@idp/generator');

  const spec = core[fixture](override);
  const workspace = path.join(workspaceRoot, name);
  const rendered = path.join(workspaceRoot, `${name}-rendered`);
  await mkdir(rendered, { recursive: true });

  const generated = await check('generate', null, async () => {
    const result = await runPipeline(spec, { registry: createRegistry() });
    await emitTree(result.files, workspace);
    return result;
  });
  if (!generated) return;

  await lintDockerfiles(workspace, expect.dockerfiles);

  const workflows = await lintWorkflows(workspace, '');
  await check('generates workflows', null, async () => {
    if (workflows === 0) throw new Error('no workflows were generated');
  });

  if (expect.chart) {
    await validateChart(workspace, expect.chart, rendered);

    // One rendering is enough here. Environments differ in replica count, autoscaling and
    // ingress; the port, probes and UID come from the image and are identical across all three.
    const prod = path.join(rendered, 'prod.yaml');
    await checkArtifactAgreement(workspace, prod, deployableContract(spec));
  } else {
    await check('emits no chart', null, async () => {
      const charts = await findFiles(workspace, (n) => n === 'Chart.yaml');
      if (charts.length > 0) throw new Error(`unexpected chart: ${charts.join(', ')}`);
    });
  }

  if (expect.gitops) {
    await validateGitops(workspace);
  } else {
    await check('emits no Argo manifests', null, async () => {
      const entries = await readdir(path.join(workspace, 'gitops')).catch(() => []);
      if (entries.length > 0) throw new Error(`unexpected gitops/: ${entries.join(', ')}`);
    });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const requested = argv.includes('--case') ? argv[argv.indexOf('--case') + 1] : null;
  const keep = argv.includes('--keep');
  const requireAll = argv.includes('--require-all');

  if (argv.includes('--list')) {
    for (const [name, { description }] of Object.entries(CASES)) {
      console.log(`${name.padEnd(10)} ${description}`);
    }
    return 0;
  }

  const names = requested ? [requested] : Object.keys(CASES);
  for (const name of names) {
    if (!CASES[name]) {
      console.error(`Unknown case "${name}". Try --list.`);
      return 1;
    }
  }

  const failures = await detectTools();

  console.log(`\x1b[1mOps lint\x1b[0m — ${available.size}/${TOOL_NAMES.length} tools`);
  if (failures.length > 0) {
    // The probe and its output, not just the name. "missing: helm" sent me looking at the install
    // step; the actual cause was that `helm --version` is not a thing, and one line of stderr
    // would have said so.
    for (const { tool, probe, detail } of failures) {
      console.log(`  unavailable: ${tool} — \`${probe}\` failed`);
      if (detail) console.log(`               ${detail.split('\n')[0]}`);
    }

    if (requireAll) {
      // Deliberately fatal, and deliberately before any work: in CI an unavailable tool means the
      // install step or the probe is broken, and letting the run continue would report a green
      // tick for a suite that checked a fraction of what it claims to.
      console.error(
        `\n\x1b[31mFAILED\x1b[0m — --require-all, but ${failures.length} tool(s) unavailable`,
      );
      return 1;
    }
  }

  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'idp-ops-'));
  try {
    // Our own workflows first. If pr.yml is broken nothing else in CI runs, so it is the most
    // valuable thing here and should fail before six minutes of chart rendering.
    startCase('self', 'this repository’s own workflows');
    await lintWorkflows(ROOT, 'self: ');

    for (const name of names) await lintCase(name, workspaceRoot);
  } finally {
    if (keep) console.log(`\nWorkspace kept at ${workspaceRoot}`);
    else await rm(workspaceRoot, { recursive: true, force: true });
  }

  const failed = results.filter((r) => r.failed);
  const checks = results.flatMap((r) => r.checks);
  const skipped = checks.filter((c) => c.skipped).length;

  console.log(
    `\n${checks.length - skipped} check(s) run, ${skipped} skipped, ${failed.length} case(s) failed`,
  );
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main();
