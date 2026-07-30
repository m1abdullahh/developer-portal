/**
 * What every UI framework recipe promises to the recipes layered on top of it.
 *
 * Until now the state and styling recipes named `ui.framework.nextjs-app` directly and wrote
 * codemods against `app/layout.tsx`. That works for exactly one framework. Vite has no
 * `app/layout.tsx` and Nuxt has no `.tsx` at all, so a second framework would have meant either
 * duplicating every state recipe per framework — the combinatorial explosion recipe composition
 * exists to avoid — or teaching each one about every framework's file layout.
 *
 * Instead each framework declares three things, and everything above it asks rather than assumes.
 *
 * ── The `{children}` requirement ─────────────────────────────────────────────
 * `providerRoot` must render `{children}` exactly once: that is the anchor the `wrapProvider`
 * codemod replaces. Next's root layout does this naturally. Vite's `main.tsx` renders `<App />`
 * instead, so the Vite recipe generates a dedicated shell component that main.tsx wraps around
 * the app. Pushing that requirement onto the framework recipe keeps the codemod itself
 * framework-agnostic.
 */

import { type ProjectSpec, type UiFramework } from '@idp/core';

export interface FrameworkContract {
  /** The framework recipe's id, for `requires` — it must run before anything layered on it. */
  recipeId: string;
  /** File rendering `{children}` exactly once. Provider codemods wrap that expression. */
  providerRoot: string;
  /** File that imports the global stylesheet, for styling recipes that emit one. */
  stylesheetHost: string;
  /**
   * Where a styling recipe should write its global stylesheet.
   *
   * Separate from `stylesheetHost` — Next imports `app/globals.css` from the same file that hosts
   * the providers, while Vite keeps `src/globals.css` beside an entry point that hosts nothing.
   * Conflating the two would work for Next and silently misplace the file everywhere else.
   */
  stylesheetPath: string;
  /**
   * Prefix for shared source files — components, stores, lib.
   *
   * `''` under Next, whose App Router convention puts `components/` and `lib/` at the repository
   * root, and `src/` under Vite. Templates shared between frameworks write
   * `to: <%= framework.sourceRoot %>components/…` so one template serves both. Note the trailing
   * slash is part of the value: concatenation, not a join, keeps the empty case clean.
   */
  sourceRoot: '' | `${string}/`;
  /**
   * How a page module adds a route.
   *
   * `file-based` — dropping a file into the routes directory is enough; the framework discovers
   * it. Next and Nuxt work this way.
   *
   * `declared` — the route must be registered in a routes table. A Vite SPA has no routing at
   * all without a router, so a module that only emitted a component would produce a page nobody
   * could navigate to.
   *
   * Page modules branch on this rather than on the framework name, so a third framework declares
   * its answer instead of forcing every module to learn about it.
   */
  routing: 'file-based' | 'declared';
  /**
   * Where a page module writes its pages, relative to `sourceRoot`.
   *
   * For `file-based` frameworks this directory *is* the route table. For `declared` ones it is
   * merely where the components live, and `routes.tsx` is what makes them reachable.
   */
  routesDir: string;
  /**
   * Whether generated components need a `'use client'` directive.
   *
   * Meaningful only where the framework renders on the server by default. Next needs it on any
   * component using hooks or browser APIs; a Vite SPA has no server components at all, so the
   * directive is a bare string literal at the top of a module — inert, and something Rollup
   * warns about when it bundles.
   *
   * Emitting it unconditionally was the previous behaviour, which meant shared templates carried
   * a Next-specific instruction into every framework.
   */
  clientDirective: boolean;
}

/**
 * Registered by each framework recipe rather than hardcoded here.
 *
 * A plain object would put every framework's paths in this file, which is the coupling being
 * removed. Registration keeps each framework's knowledge inside its own recipe module, and means
 * a framework with no recipe yet is absent rather than silently wrong.
 */
const contracts = new Map<UiFramework, FrameworkContract>();

export function registerFrameworkContract(
  framework: UiFramework,
  contract: FrameworkContract,
): void {
  contracts.set(framework, contract);
}

export class UnknownFrameworkError extends Error {
  constructor(framework: string) {
    super(
      `No framework contract is registered for "${framework}". A UI framework recipe must call ` +
        `registerFrameworkContract() at module load, or recipes layered on top of it cannot know ` +
        `where to apply their codemods.`,
    );
    this.name = 'UnknownFrameworkError';
  }
}

/**
 * The contract for a spec's chosen framework.
 *
 * Throws rather than returning a default. A wrong guess at the provider root produces a codemod
 * that silently finds no `{children}` — or worse, edits the wrong file — and the failure surfaces
 * as a runtime "must be used within a Provider" crash in the generated project.
 */
export function frameworkContract(spec: ProjectSpec): FrameworkContract {
  if (!spec.ui) {
    throw new Error(
      'frameworkContract() was called for a spec with no UI layer. Guard on `spec.ui` first — ' +
        'an API-only project has no framework to describe.',
    );
  }

  const contract = contracts.get(spec.ui.framework);
  if (!contract) throw new UnknownFrameworkError(spec.ui.framework);
  return contract;
}

/** Convenience for `requires`, which is the most common reason to reach for the contract. */
export function requiresFramework(spec: ProjectSpec): readonly string[] {
  return [frameworkContract(spec).recipeId];
}

/** Test affordance: the frameworks that have registered a contract. */
export function registeredFrameworks(): UiFramework[] {
  return [...contracts.keys()].sort();
}
