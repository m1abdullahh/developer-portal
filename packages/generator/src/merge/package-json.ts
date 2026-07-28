/**
 * package.json composition.
 *
 * The busiest merge in the system: a Next.js + Tailwind + Zustand + auth-layouts +
 * user-management project has five recipes all contributing dependencies and scripts to one
 * file. See docs/plan/05-generator-engine.md §3.
 *
 * Two conflict classes, treated very differently:
 *
 *   Dependency version conflict — resolvable. Highest semver wins, and the decision is recorded
 *   in the MergeReport. Both recipes still get a working package, just possibly a newer one
 *   than one of them asked for.
 *
 *   Script key conflict — NOT resolvable. If two recipes both define `"build"`, there is no
 *   defensible way to pick; either choice silently breaks one of them. That is a recipe design
 *   bug and it fails the build with both recipe ids named.
 */

import semver from 'semver';
import type { PackageDelta } from '../types.js';
import type { MergeReportBuilder } from './report.js';

export class ScriptConflictError extends Error {
  constructor(
    readonly script: string,
    readonly recipeIds: [string, string],
    readonly commands: [string, string],
  ) {
    super(
      `Recipes "${recipeIds[0]}" and "${recipeIds[1]}" both define the "${script}" script ` +
        `(${JSON.stringify(commands[0])} vs ${JSON.stringify(commands[1])}). ` +
        `There is no safe way to choose — one recipe must own the script and the other should ` +
        `contribute a differently-named one, or the shared command belongs in a base recipe.`,
    );
    this.name = 'ScriptConflictError';
  }
}

interface Contribution {
  recipeId: string;
  delta: PackageDelta;
}

type DepField = 'dependencies' | 'devDependencies';

/**
 * Compares two dependency specifiers, returning the one that wins.
 *
 * Exact pins are the norm here (versions come from the pinned manifest in @idp/core, never
 * inlined in templates), so this is usually a straight semver comparison. Ranges are handled by
 * comparing their minimum satisfying version, which is the conservative reading — a caret range
 * is a promise about what the recipe *needs*, not what it wants.
 */
function comparableVersion(spec: string): string | null {
  const exact = semver.valid(spec);
  if (exact !== null) return exact;

  // semver.minVersion THROWS on an unparseable range rather than returning null, so a
  // `github:acme/pkg#main` or `file:../local` dependency would take down the whole
  // generation instead of producing a warning.
  try {
    return semver.minVersion(spec)?.version ?? null;
  } catch {
    return null;
  }
}

function pickHigher(a: string, b: string): string | null {
  const minA = comparableVersion(a);
  const minB = comparableVersion(b);

  // Unparseable on either side (a git url, `workspace:*`, `file:`): caller must decide.
  if (minA === null || minB === null) return null;

  return semver.gte(minA, minB) ? a : b;
}

export class PackageJsonBuilder {
  readonly #contributions: Contribution[] = [];

  add(recipeId: string, delta: PackageDelta): void {
    this.#contributions.push({ recipeId, delta });
  }

  /**
   * Folds every contribution into one package.json object.
   *
   * `base` is the framework recipe's package.json (name, version, type, engines...). Feature
   * recipes only ever add to it.
   */
  build(base: Record<string, unknown>, report: MergeReportBuilder): Record<string, unknown> {
    const result: Record<string, unknown> = { ...base };

    const deps = this.#mergeDependencies('dependencies', report);
    const devDeps = this.#mergeDependencies('devDependencies', report);
    const scripts = this.#mergeScripts(base);

    // Anything a recipe sets that is not a dependency map or scripts (e.g. `browserslist`).
    for (const { delta } of this.#contributions) {
      for (const [key, value] of Object.entries(delta)) {
        if (key === 'dependencies' || key === 'devDependencies' || key === 'scripts') continue;
        result[key] = value;
      }
    }

    // Key-sorted so the emitted file is byte-identical across runs regardless of recipe order.
    if (Object.keys(deps).length > 0) result['dependencies'] = sortKeys(deps);
    if (Object.keys(devDeps).length > 0) result['devDependencies'] = sortKeys(devDeps);
    if (Object.keys(scripts).length > 0) result['scripts'] = sortKeys(scripts);

    return result;
  }

  #mergeDependencies(field: DepField, report: MergeReportBuilder): Record<string, string> {
    const claims = new Map<string, Array<{ version: string; recipeId: string }>>();

    for (const { recipeId, delta } of this.#contributions) {
      for (const [name, version] of Object.entries(delta[field] ?? {})) {
        const list = claims.get(name) ?? [];
        list.push({ version, recipeId });
        claims.set(name, list);
      }
    }

    const merged: Record<string, string> = {};

    for (const [name, candidates] of claims) {
      const distinct = [...new Set(candidates.map((c) => c.version))];

      if (distinct.length === 1) {
        merged[name] = distinct[0]!;
        continue;
      }

      let winner = candidates[0]!.version;
      let unresolvable = false;

      for (const candidate of candidates.slice(1)) {
        const higher = pickHigher(winner, candidate.version);
        if (higher === null) {
          unresolvable = true;
          break;
        }
        winner = higher;
      }

      if (unresolvable) {
        // Not silently guessed: a non-semver specifier (git url, file:, workspace:) cannot be
        // ordered, so we keep the first and say so loudly.
        report.warn(
          'dependency-unresolvable',
          `Cannot order versions of "${name}" (${distinct.join(', ')}) — they are not all ` +
            `semver. Keeping "${winner}". Reconcile this in the contributing recipes.`,
        );
      }

      merged[name] = winner;
      report.recordDependencyResolution(name, winner, candidates);
    }

    return merged;
  }

  #mergeScripts(base: Record<string, unknown>): Record<string, string> {
    const baseScripts = (base['scripts'] ?? {}) as Record<string, string>;
    const merged: Record<string, string> = { ...baseScripts };
    const owner = new Map<string, string>(Object.keys(baseScripts).map((k) => [k, '<base>']));

    for (const { recipeId, delta } of this.#contributions) {
      for (const [name, command] of Object.entries(delta.scripts ?? {})) {
        const existingOwner = owner.get(name);

        if (existingOwner !== undefined && merged[name] !== command) {
          const pair: [string, string] =
            existingOwner < recipeId ? [existingOwner, recipeId] : [recipeId, existingOwner];
          const cmds: [string, string] =
            existingOwner < recipeId ? [merged[name]!, command] : [command, merged[name]!];
          throw new ScriptConflictError(name, pair, cmds);
        }

        merged[name] = command;
        owner.set(name, recipeId);
      }
    }

    return merged;
  }
}

function sortKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

export { pickHigher as _pickHigherForTests };
