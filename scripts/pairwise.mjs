#!/usr/bin/env node
/**
 * The T2 pairwise matrix (doc 08 §4, and the P2 gate).
 *
 * The gate asks that "every framework × styling × state combination installs, builds and boots".
 * Taken literally that is 3 × 3 × 4 = 36 full `npm install` + build + boot cycles, several hours
 * of runner time for a result that is almost entirely redundant — the interesting failures are
 * *interactions between two options*, and a third option rarely changes whether the first two
 * work together.
 *
 * So this computes a pairwise (all-pairs) set instead: the smallest list of combinations in which
 * every pair of values from different dimensions appears at least once. For these dimensions that
 * is 12 runs rather than 36, and it still covers every framework/styling pair, every
 * framework/state pair and every styling/state pair.
 *
 * Doc 08 §4 states the trade directly: pairwise catches essentially all two-way interaction bugs
 * at a fraction of the cost. Composition bugs — a styling recipe assuming a framework's file
 * layout, a state recipe assuming a provider tree — are exactly two-way interactions.
 *
 * Usage:
 *   node scripts/pairwise.mjs --list     # print the selected combinations and the coverage proof
 *   node scripts/pairwise.mjs            # generate every combination (fast, no install)
 *   node scripts/pairwise.mjs --smoke    # hand each to the smoke harness (slow; this is nightly)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';

/**
 * The dimensions the P2 gate names.
 *
 * Modules are deliberately absent. They are not a dimension of this matrix — a page module is
 * either generated or not, and `module-nuxt` and `module-users` already exercise every one of them
 * against both families. Adding them here would multiply the run count for coverage that exists.
 */
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
 * Greedy all-pairs selection.
 *
 * Each round picks the combination covering the most pairs nobody has covered yet, and stops when
 * none are left. Greedy is not guaranteed to find the theoretical minimum — that is NP-hard — but
 * it lands within one or two runs of it, and a deterministic, readable selection matters more
 * here than saving a single `npm install`.
 *
 * Deterministic on purpose: the cross-product is enumerated in a fixed order and ties break on the
 * first candidate, so this file returns the same list on every machine. A matrix that shuffled
 * would make a nightly failure impossible to reproduce.
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

    // Cannot happen while `remaining` is non-empty — every pair belongs to some candidate — but a
    // silent infinite loop would be a miserable way to find that out.
    if (!best)
      throw new Error(`${remaining.size} pair(s) unreachable: ${[...remaining].join(', ')}`);

    for (const pair of pairsOf(best)) remaining.delete(pair);
    chosen.push(best);
  }
  return chosen;
}

function slugFor(combo, index) {
  return `t2-${String(index + 1).padStart(2, '0')}-${combo.framework}-${combo.styling}`.slice(
    0,
    40,
  );
}

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

async function main() {
  const argv = process.argv.slice(2);
  const combos = selectPairwise();

  const total = Object.values(DIMENSIONS).reduce((n, values) => n * values.length, 1);
  console.log(
    `\x1b[1mT2 pairwise\x1b[0m — ${combos.length} of ${total} combinations ` +
      `(${Math.round((combos.length / total) * 100)}% of exhaustive)\n`,
  );

  for (const [i, combo] of combos.entries()) {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${combo.framework.padEnd(12)} ${combo.styling.padEnd(16)} ${combo.state}`,
    );
  }

  // The coverage proof, printed rather than assumed. A selection that quietly missed a pair would
  // look exactly like a correct one.
  const covered = new Set(combos.flatMap(pairsOf));
  const missing = [...allPairs()].filter((pair) => !covered.has(pair));
  console.log(
    `\n  every pair covered: ${missing.length === 0 ? 'yes' : `NO — ${missing.join(', ')}`}`,
  );
  if (missing.length > 0) return 1;

  if (argv.includes('--list')) return 0;

  const { spineSpec } = await import('@idp/core');
  const { createRegistry, runPipeline } = await import('@idp/generator');
  const registry = createRegistry();

  let failures = 0;

  for (const [i, combo] of combos.entries()) {
    const label = `${combo.framework}/${combo.styling}/${combo.state}`;
    process.stdout.write(`\n  generating ${label} … `);

    try {
      const spec = spineSpec({
        meta: { slug: slugFor(combo, i) },
        ui: { framework: combo.framework, styling: combo.styling, state: combo.state },
      });
      const { files, diagnostics } = await runPipeline(spec, { registry });

      const errors = diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0) throw new Error(errors.map((d) => d.message).join('; '));

      console.log(`\x1b[32mok\x1b[0m (${files.length} files)`);
    } catch (error) {
      console.log(`\x1b[31mFAILED\x1b[0m\n      ${error.message}`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n\x1b[31m${failures} combination(s) failed to generate\x1b[0m`);
    return 1;
  }

  console.log(`\n${combos.length} combination(s) generate cleanly.`);

  if (!argv.includes('--smoke')) {
    console.log('Pass --smoke to install, build and boot each one (this is what nightly runs).');
    return 0;
  }

  /*
   * The expensive half, delegated to the smoke harness rather than reimplemented.
   *
   * Generating cleanly proves the recipes compose; only installing and building proves the output
   * works. Keeping the two behind separate flags means a developer can check composition in
   * seconds and let nightly pay for the rest.
   */
  console.log('\nHanding each combination to the smoke harness…\n');
  for (const [i, combo] of combos.entries()) {
    const code = await run('node', [
      'scripts/smoke.mjs',
      '--matrix-case',
      JSON.stringify({ ...combo, slug: slugFor(combo, i) }),
    ]);
    if (code !== 0) failures++;
  }

  return failures === 0 ? 0 : 1;
}

process.exitCode = await main();
