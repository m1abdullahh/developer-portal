/**
 * Recipe registry and ordering.
 *
 * This is the piece that turns ~660,000 possible option combinations into ~22 authored
 * recipes (doc 05 §2). Recipes declare when they apply; the registry selects and orders them.
 *
 * Ordering must be *total and deterministic*. Golden-file tests compare whole trees, so any
 * run-to-run variation in recipe order shows up as a spurious diff — and worse, a genuine
 * ordering bug would be indistinguishable from noise.
 */

import type { ProjectSpec } from '@idp/core';
import type { Recipe, RecipePhase } from './types.js';

/** Execution order of the phases. Recipes never cross a phase boundary. */
export const PHASE_ORDER: readonly RecipePhase[] = [
  'base',
  'feature',
  'integration',
  'finalize',
] as const;

export class RecipeConflictError extends Error {
  constructor(readonly recipeIds: [string, string]) {
    super(
      `Recipes "${recipeIds[0]}" and "${recipeIds[1]}" declare a mutual conflict but both ` +
        `apply to this spec. One of them has an incorrect appliesTo().`,
    );
    this.name = 'RecipeConflictError';
  }
}

export class MissingRequirementError extends Error {
  constructor(
    readonly recipeId: string,
    readonly missing: string,
  ) {
    super(
      `Recipe "${recipeId}" requires "${missing}", which is not registered or does not apply ` +
        `to this spec. Either relax appliesTo() or drop the requirement.`,
    );
    this.name = 'MissingRequirementError';
  }
}

export class CircularDependencyError extends Error {
  constructor(readonly cycle: string[]) {
    super(`Circular recipe dependency: ${cycle.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

export class RecipeRegistry {
  readonly #recipes = new Map<string, Recipe>();

  register(recipe: Recipe): this {
    if (this.#recipes.has(recipe.id)) {
      throw new Error(`Recipe "${recipe.id}" is already registered.`);
    }
    if (!PHASE_ORDER.includes(recipe.phase)) {
      throw new Error(`Recipe "${recipe.id}" declares unknown phase "${recipe.phase}".`);
    }
    this.#recipes.set(recipe.id, recipe);
    return this;
  }

  registerAll(recipes: readonly Recipe[]): this {
    for (const recipe of recipes) this.register(recipe);
    return this;
  }

  has(id: string): boolean {
    return this.#recipes.has(id);
  }

  get(id: string): Recipe | undefined {
    return this.#recipes.get(id);
  }

  /** Every registered recipe, id-sorted. Used by the CLI's `list-recipes`. */
  all(): Recipe[] {
    return [...this.#recipes.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Selects the recipes that apply to a spec and returns them in execution order.
   *
   * Ordering rules, applied in this priority:
   *   1. phase       — base before feature before integration before finalize
   *   2. requires    — topological, within a phase
   *   3. id          — lexicographic tie-break, so the order is *total*, not merely valid
   *
   * Rule 3 is what makes the result reproducible. A topological sort alone admits many valid
   * orderings, and which one you get would depend on Map iteration order.
   */
  plan(spec: ProjectSpec): Recipe[] {
    const applicable = this.all().filter((r) => r.appliesTo(spec));
    const applicableIds = new Set(applicable.map((r) => r.id));

    // Resolved once, here, and threaded through the checks and the sort. `requires` may be a
    // function of the spec, and calling it repeatedly would let one recipe report different
    // requirements to the validator than to the sort.
    const requirements = new Map<string, readonly string[]>(
      applicable.map((recipe) => [recipe.id, requirementsOf(recipe, spec)]),
    );

    this.#assertNoConflicts(applicable, applicableIds);
    this.#assertRequirementsPresent(applicable, applicableIds, requirements);

    const ordered: Recipe[] = [];
    for (const phase of PHASE_ORDER) {
      const inPhase = applicable.filter((r) => r.phase === phase);
      ordered.push(...topoSort(inPhase, applicableIds, requirements));
    }
    return ordered;
  }

  #assertNoConflicts(applicable: readonly Recipe[], applicableIds: ReadonlySet<string>): void {
    for (const recipe of applicable) {
      for (const conflictId of recipe.conflicts ?? []) {
        if (applicableIds.has(conflictId)) {
          // Sorted so the message is identical whichever side is visited first.
          const pair: [string, string] =
            recipe.id < conflictId ? [recipe.id, conflictId] : [conflictId, recipe.id];
          throw new RecipeConflictError(pair);
        }
      }
    }
  }

  #assertRequirementsPresent(
    applicable: readonly Recipe[],
    applicableIds: ReadonlySet<string>,
    requirements: ReadonlyMap<string, readonly string[]>,
  ): void {
    for (const recipe of applicable) {
      for (const requiredId of requirements.get(recipe.id) ?? []) {
        if (!applicableIds.has(requiredId)) {
          throw new MissingRequirementError(recipe.id, requiredId);
        }
      }
    }
  }
}

/**
 * A recipe's requirements for one spec.
 *
 * Exported because both the validator and the sort need the same answer, and because a recipe
 * whose `requires` is a function must not be asked twice — see the comment in `plan()`.
 */
export function requirementsOf(recipe: Recipe, spec: ProjectSpec): readonly string[] {
  return typeof recipe.requires === 'function' ? recipe.requires(spec) : (recipe.requires ?? []);
}

/**
 * Kahn's algorithm with a lexicographic tie-break.
 *
 * Only requirements *within the same phase* constrain order here; cross-phase requirements are
 * already satisfied by phase sequencing, so they are ignored rather than treated as missing.
 */
export function topoSort(
  recipes: readonly Recipe[],
  applicableIds: ReadonlySet<string>,
  /**
   * Pre-resolved requirements. Optional so existing callers and tests that pass static
   * `requires` arrays keep working; `plan()` always supplies it.
   */
  requirements?: ReadonlyMap<string, readonly string[]>,
): Recipe[] {
  const inPhase = new Map(recipes.map((r) => [r.id, r]));
  const requiredIdsFor = (recipe: Recipe): readonly string[] =>
    requirements?.get(recipe.id) ??
    (typeof recipe.requires === 'function' ? [] : (recipe.requires ?? []));

  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const recipe of recipes) {
    dependencies.set(recipe.id, new Set());
    dependents.set(recipe.id, new Set());
  }

  for (const recipe of recipes) {
    for (const requiredId of requiredIdsFor(recipe)) {
      // Satisfied by an earlier phase, or by a recipe that legitimately does not apply.
      if (!inPhase.has(requiredId)) continue;
      if (!applicableIds.has(requiredId)) continue;
      dependencies.get(recipe.id)!.add(requiredId);
      dependents.get(requiredId)!.add(recipe.id);
    }
  }

  // Ready set kept sorted so ties resolve identically on every run.
  const ready = recipes
    .filter((r) => dependencies.get(r.id)!.size === 0)
    .map((r) => r.id)
    .sort((a, b) => a.localeCompare(b));

  const result: Recipe[] = [];

  while (ready.length > 0) {
    const id = ready.shift()!;
    result.push(inPhase.get(id)!);

    for (const dependentId of [...dependents.get(id)!].sort((a, b) => a.localeCompare(b))) {
      const deps = dependencies.get(dependentId)!;
      deps.delete(id);
      if (deps.size === 0) {
        ready.push(dependentId);
        ready.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  if (result.length !== recipes.length) {
    const unresolved = recipes.filter((r) => !result.includes(r)).map((r) => r.id);
    throw new CircularDependencyError([...unresolved.sort(), unresolved[0] ?? '?']);
  }

  return result;
}
