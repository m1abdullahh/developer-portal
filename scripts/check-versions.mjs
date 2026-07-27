/**
 * Verifies every exactly-pinned dependency still resolves on the npm registry.
 *
 * Determinism depends on exact pins (doc 05 §6). A pin that has been unpublished or yanked
 * would fail at `npm ci` time in a generated project — long after the PR that introduced it.
 * This runs nightly so the failure surfaces here instead.
 *
 * Only exact pins are checked; workspace links ("*") and ranges ("^x") are skipped by design.
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

const pins = collectPins();
console.log(`Checking ${pins.length} exactly-pinned dependencies...\n`);

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
