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

/**
 * The PyPI half of the same manifest.
 *
 * Parsed separately from GENERATED_VERSIONS and checked against a different registry, because a
 * Python pin resolved against npm is worse than an unchecked one: `httpx`, `ruff` and `uvicorn`
 * all exist on npm as unrelated packages, so the check would pass while pinning the wrong
 * software. PEP 440 also allows versions semver rejects (`1.0.post1`, `2.0rc1`), hence the
 * separate grammar.
 */
const PEP440 = /^\d+(\.\d+)*((a|b|rc)\d+)?(\.post\d+)?(\.dev\d+)?$/;

function collectPythonPins() {
  const file = path.join(ROOT, 'packages', 'core', 'src', 'versions.ts');
  if (!existsSync(file)) return [];

  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('PYTHON_VERSIONS = {');
  if (start === -1) return [];
  const body = source.slice(start, source.indexOf('} as const', start));

  const pins = [];
  // Uppercase is allowed in the name class because PyPI distribution names are not lowercase by
  // rule — `PyJWT` is the published name. PEP 503 normalisation makes the lookup case-insensitive,
  // but a lowercase-only pattern here would skip the entry entirely and check nothing.
  for (const match of body.matchAll(/^\s+'?([A-Za-z0-9._-]+)'?:\s*'([^']+)',/gm)) {
    const [, name, version] = match;
    if (!PEP440.test(version)) continue;
    pins.push({ name, version, registry: 'pypi', sources: ['packages/core/src/versions.ts'] });
  }

  if (pins.length === 0) {
    throw new Error(
      'Parsed no versions out of PYTHON_VERSIONS. The manifest format changed and this parser ' +
        'needs updating — failing rather than reporting a vacuous pass.',
    );
  }
  return pins;
}

/**
 * Asks PyPI directly rather than shelling out to pip.
 *
 * `pip index versions` requires pip, a Python interpreter and a network resolver on the runner;
 * the JSON API needs none of those, and the `versions` job deliberately runs on a bare checkout.
 */
async function resolvesOnPypi(name, version) {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return false;
    const body = await res.json();
    // Present in `releases` AND not yanked. A yanked release still appears in the index and still
    // installs when pinned exactly, which is precisely the case this check exists to catch.
    const files = body.releases?.[version];
    return Array.isArray(files) && files.length > 0 && !files.every((f) => f.yanked);
  } catch {
    return false;
  }
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
const pythonPins = collectPythonPins();
const pins = [...ownPins, ...generatedPins, ...pythonPins];

console.log(
  `Checking ${pins.length} exactly-pinned dependencies ` +
    `(${ownPins.length} in this repository, ${generatedPins.length} emitted into projects, ` +
    `${pythonPins.length} on PyPI)...\n`,
);

const failures = [];
for (const pin of pins) {
  const ok =
    pin.registry === 'pypi'
      ? await resolvesOnPypi(pin.name, pin.version)
      : resolves(pin.name, pin.version);

  if (ok) {
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
