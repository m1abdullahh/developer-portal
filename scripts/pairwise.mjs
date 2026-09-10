#!/usr/bin/env node
/**
 * T2 — the nightly matrix (doc 08 §3), in two halves.
 *
 * ── UI: pairwise ─────────────────────────────────────────────────────────────
 * The P2 gate asks that "every framework × styling × state combination installs, builds and
 * boots". Exhaustive is 36 runs of a Next or Nuxt install; a pairwise selection — the smallest
 * list of combinations in which every framework/styling, framework/state and styling/state pair
 * appears at least once — is 12, and it catches the class of bug composition actually produces:
 * a styling recipe assuming a framework's file layout, a state recipe assuming a provider tree.
 * Two-way interactions. Doc 08 §4 states the trade directly.
 *
 * The selection is computed, not hand-picked, and the script prints the coverage proof and fails
 * if a pair is missed — so the reduction cannot silently become a gap.
 *
 * ── API: every valid combination ─────────────────────────────────────────────
 * The P3 gate asks that "every valid runtime × paradigm × ORM combination passes T2". That space
 * is small — three runtimes, the paradigms the compatibility matrix allows each, and the ORMs
 * with a recipe behind them — nineteen API-only projects, so it is enumerated in full rather than
 * sampled. Each runs with the paradigm's own probes: a GraphQL or tRPC service whose only working
 * route is /health is indistinguishable from REST by the default ones.
 *
 * Usage:
 *   node scripts/pairwise.mjs            # print both matrices with the coverage proof, generate each
 *   node scripts/pairwise.mjs --smoke    # …then install, build and boot each one (what nightly runs)
 *   node scripts/pairwise.mjs --ui       # one half only; combine with --smoke
 *   node scripts/pairwise.mjs --api
 *   node scripts/pairwise.mjs --list     # print the selections and stop
 *
 * Requires `npm run build` first — it imports the built packages.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';

// ── UI half ──────────────────────────────────────────────────────────────────

const DIMENSIONS = {
  framework: ['nextjs-app', 'vite-react', 'nuxt'],
  styling: ['tailwind-shadcn', 'css-modules', 'mui'],
  state: ['zustand', 'redux-toolkit', 'react-query', 'context'],
};

const NAMES = Object.keys(DIMENSIONS);

/** Every unordered pair of (dimension, value) drawn from two different dimensions. */
function allPairs() {
  const pairs = new Set();

  for (let i = 0; i < NAMES.length; i++) {
    for (let j = i + 1; j < NAMES.length; j++) {
      for (const a of DIMENSIONS[NAMES[i]]) {
        for (const b of DIMENSIONS[NAMES[j]]) {
          pairs.add(`${NAMES[i]}=${a}|${NAMES[j]}=${b}`);
        }
      }
    }
  }
  return pairs;
}

function pairsOf(combo) {
  const out = [];
  for (let i = 0; i < NAMES.length; i++) {
    for (let j = i + 1; j < NAMES.length; j++) {
      out.push(`${NAMES[i]}=${combo[NAMES[i]]}|${NAMES[j]}=${combo[NAMES[j]]}`);
    }
  }
  return out;
}

/**
 * Greedy set cover: repeatedly take the combination that covers the most still-uncovered pairs.
 * Not guaranteed minimal, but the proof printed afterwards is what matters — every pair covered.
 */
function selectPairwise() {
  const remaining = allPairs();
  const candidates = [];

  for (const framework of DIMENSIONS.framework) {
    for (const styling of DIMENSIONS.styling) {
      for (const state of DIMENSIONS.state) {
        candidates.push({ framework, styling, state });
      }
    }
  }

  const chosen = [];
  while (remaining.size > 0) {
    let best = null;
    let bestGain = 0;

    for (const candidate of candidates) {
      const gain = pairsOf(candidate).filter((pair) => remaining.has(pair)).length;
      if (gain > bestGain) {
        best = candidate;
        bestGain = gain;
      }
    }

    if (!best)
      throw new Error(`${remaining.size} pair(s) unreachable: ${[...remaining].join(', ')}`);

    for (const pair of pairsOf(best)) remaining.delete(pair);
    chosen.push(best);
  }
  return chosen;
}

function uiSlug(combo, index) {
  return `t2-${String(index + 1).padStart(2, '0')}-${combo.framework}-${combo.styling}`.slice(
    0,
    40,
  );
}

// ── API half ─────────────────────────────────────────────────────────────────

/**
 * ORMs with a recipe behind them, per runtime. Mirrors the ledger in
 * packages/generator/src/coverage.test.ts: `sqlc` and the three Mongo ODMs are offered by the
 * compatibility matrix but disabled in the wizard with a stated reason, and a matrix that tried
 * to generate them would only prove the gate the wizard already enforces.
 */
const IMPLEMENTED_ORMS = {
  'node-ts': ['prisma', 'drizzle', 'none'],
  'python-fastapi': ['sqlmodel', 'sqlalchemy', 'none'],
  'go-gin': ['gorm', 'none'],
};

/** Every valid runtime × paradigm × ORM combination, per the compatibility matrix. */
async function selectApi() {
  const { availableParadigms } = await import('@idp/core');
  const combos = [];
  for (const runtime of Object.keys(IMPLEMENTED_ORMS)) {
    for (const paradigm of availableParadigms(runtime)) {
      for (const orm of IMPLEMENTED_ORMS[runtime]) {
        combos.push({ runtime, paradigm, orm });
      }
    }
  }
  return combos;
}

function apiSlug(combo, index) {
  return `t2-api-${String(index + 1).padStart(2, '0')}-${combo.runtime}-${combo.paradigm}-${combo.orm}`.slice(
    0,
    48,
  );
}

// ── shared ───────────────────────────────────────────────────────────────────

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      shell: IS_WINDOWS,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/** Generates each spec in memory and reports diagnostics — cheap, and first for a reason. */
async function generateAll(entries, describe) {
  const { spineSpec } = await import('@idp/core');
  const { createRegistry, runPipeline } = await import('@idp/generator');
  const registry = createRegistry();

  let failures = 0;
  for (const { spec: override, label } of entries.map(describe)) {
    process.stdout.write(`\n  generating ${label} … `);
    try {
      const { files, diagnostics } = await runPipeline(spineSpec(override), { registry });
      const errors = diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0) throw new Error(errors.map((d) => d.message).join('; '));
      console.log(`\x1b[32mok\x1b[0m (${files.length} files)`);
    } catch (error) {
      console.log(`\x1b[31mFAILED\x1b[0m\n      ${error.message}`);
      failures++;
    }
  }
  return failures;
}

async function smokeAll(entries) {
  let failures = 0;
  for (const { matrixCase } of entries) {
    const code = await run('node', [
      'scripts/smoke.mjs',
      '--matrix-case',
      JSON.stringify(matrixCase),
    ]);
    if (code !== 0) failures++;
  }
  return failures;
}

async function main() {
  const argv = process.argv.slice(2);
  const both = !argv.includes('--ui') && !argv.includes('--api');
  const doUi = both || argv.includes('--ui');
  const doApi = both || argv.includes('--api');

  const ui = doUi ? selectPairwise() : [];
  const api = doApi ? await selectApi() : [];

  if (doUi) {
    const total = Object.values(DIMENSIONS).reduce((n, values) => n * values.length, 1);
    console.log(
      `\x1b[1mT2 pairwise (UI)\x1b[0m — ${ui.length} of ${total} combinations ` +
        `(${Math.round((ui.length / total) * 100)}% of exhaustive)\n`,
    );
    for (const [i, combo] of ui.entries()) {
      console.log(
        `  ${String(i + 1).padStart(2)}. ${combo.framework.padEnd(12)} ${combo.styling.padEnd(16)} ${combo.state}`,
      );
    }
    const covered = new Set(ui.flatMap(pairsOf));
    const missing = [...allPairs()].filter((pair) => !covered.has(pair));
    console.log(
      `\n  every pair covered: ${missing.length === 0 ? 'yes' : `NO — ${missing.join(', ')}`}`,
    );
    if (missing.length > 0) return 1;
  }

  if (doApi) {
    console.log(
      `\n\x1b[1mT2 API matrix\x1b[0m — ${api.length} valid runtime × paradigm × ORM combinations, ` +
        `every one (the P3 gate)\n`,
    );
    for (const [i, combo] of api.entries()) {
      console.log(
        `  ${String(i + 1).padStart(2)}. ${combo.runtime.padEnd(15)} ${combo.paradigm.padEnd(8)} ${combo.orm}`,
      );
    }
  }

  if (argv.includes('--list')) return 0;

  const uiEntries = ui.map((combo, i) => ({
    matrixCase: { ...combo, slug: uiSlug(combo, i) },
    label: `${combo.framework}/${combo.styling}/${combo.state}`,
    spec: {
      meta: { slug: uiSlug(combo, i) },
      ui: { framework: combo.framework, styling: combo.styling, state: combo.state },
    },
  }));
  const apiEntries = api.map((combo, i) => ({
    matrixCase: { ...combo, slug: apiSlug(combo, i) },
    label: `${combo.runtime}/${combo.paradigm}/${combo.orm}`,
    spec: {
      meta: { slug: apiSlug(combo, i) },
      ui: null,
      api: {
        runtime: combo.runtime,
        paradigm: combo.paradigm,
        database: combo.orm === 'none' ? 'none' : 'postgres',
        orm: combo.orm,
      },
    },
  }));

  const entries = [...uiEntries, ...apiEntries];
  const generateFailures = await generateAll(entries, (e) => e);
  if (generateFailures > 0) {
    console.error(`\n\x1b[31m${generateFailures} combination(s) failed to generate\x1b[0m`);
    return 1;
  }
  console.log(`\n${entries.length} combination(s) generate cleanly.`);

  if (!argv.includes('--smoke')) {
    console.log('Pass --smoke to install, build and boot each one (this is what nightly runs).');
    return 0;
  }

  console.log('\nHanding each combination to the smoke harness…\n');
  const smokeFailures = await smokeAll(entries);
  return smokeFailures === 0 ? 0 : 1;
}

process.exitCode = await main();
