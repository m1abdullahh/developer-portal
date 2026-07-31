/**
 * Verifies every exactly-pinned dependency still resolves on the npm registry.
 *
 * Determinism depends on exact pins (doc 05 §6). A pin that has been unpublished or yanked
 * would fail at `npm ci` time in a generated project — long after the PR that introduced it.
 * This runs nightly so the failure surfaces here instead.
 *
 * Only exact pins are checked; workspace links ("*") and ranges ("^x") are skipped by design.
 *
 * ── Two manifests, not one ──────────────────────────────────────────────────
 * This repository's own package.json files are the lesser half. The half that matters is
 * `GENERATED_VERSIONS` in packages/core/src/versions.ts — the versions written INTO every
 * generated project. A yanked pin there breaks `npm install` for every team who scaffolds a
 * service afterwards, and nothing else in CI would notice.
 *
 * That manifest went unchecked for a long time while this script reported "all pinned versions
 * resolve", which was true and misleading in equal measure.
 *
 * It is read with a regex rather than imported, deliberately: the `versions` CI job runs this on
 * a bare checkout with no `npm ci` and no build, so there is nothing to import. Parsing the
 * source keeps the job free of a dependency graph it exists to police.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function manifestPaths() {
  const out = [path.join(ROOT, 'package.json')];
  for (const group of ['packages', 'apps']) {
    const dir = path.join(ROOT, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name, 'package.json');
      if (existsSync(file)) out.push(file);
    }
  }
  return out;
}

/** name -> { version, sources[] } for every exact pin in the workspace. */
function collectPins() {
  const pins = new Map();
  for (const file of manifestPaths()) {
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file);
    for (const field of ['dependencies', 'devDependencies']) {
      for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
        if (!EXACT.test(spec)) continue;
        const key = `${name}@${spec}`;
        const entry = pins.get(key) ?? { name, version: spec, sources: [] };
        entry.sources.push(rel);
        pins.set(key, entry);
      }
    }
  }
  return [...pins.values()];
}

/**
 * The versions emitted into generated projects.
 *
 * Matches `name: '1.2.3',` and `'@scope/name': '1.2.3',` inside the GENERATED_VERSIONS literal.
 * Comment lines cannot match — they have no colon-quote-version shape — so the explanatory prose
 * around each entry is skipped without needing to be stripped.
 */
function collectGeneratedPins() {
  const file = path.join(ROOT, 'packages', 'core', 'src', 'versions.ts');
  if (!existsSync(file)) return [];

  const source = readFileSync(file, 'utf8');
  const body = source.slice(source.indexOf('GENERATED_VERSIONS'), source.indexOf('} as const'));

  const pins = [];
  for (const match of body.matchAll(/^\s+'?([@a-z0-9/.-]+)'?:\s*'([^']+)',/gm)) {
    const [, name, version] = match;
    if (!EXACT.test(version)) continue;
    pins.push({ name, version, sources: ['packages/core/src/versions.ts'] });
  }

  if (pins.length === 0) {
    // A regex that silently matches nothing would turn this whole check into a no-op reporting
    // success — the exact failure mode the check was added to remove.
    throw new Error(
      'Parsed no versions out of packages/core/src/versions.ts. The manifest format changed and ' +
        'this parser needs updating — failing rather than reporting a vacuous pass.',
    );
  }
  return pins;
}

function resolves(name, version) {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

const ownPins = collectPins();
const generatedPins = collectGeneratedPins();
const pins = [...ownPins, ...generatedPins];

console.log(
  `Checking ${pins.length} exactly-pinned dependencies ` +
    `(${ownPins.length} in this repository, ${generatedPins.length} emitted into projects)...\n`,
);

const failures = [];
for (const pin of pins) {
  if (resolves(pin.name, pin.version)) {
    console.log(`  ok    ${pin.name}@${pin.version}`);
  } else {
    console.log(`  FAIL  ${pin.name}@${pin.version}  (${pin.sources.join(', ')})`);
    failures.push(pin);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} pinned version(s) no longer resolve:`);
  for (const f of failures) {
    console.error(`  ${f.name}@${f.version} — referenced by ${f.sources.join(', ')}`);
  }
  console.error('\nUpdate the pin and docs/VERSIONS.md together.');
  process.exit(1);
}

console.log(`\nAll ${pins.length} pinned versions resolve.`);
