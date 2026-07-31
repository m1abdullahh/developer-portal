/**
 * Every styling system must emit the same primitives at the same paths.
 *
 * This is the check that makes page modules portable. A module importing `Button` from
 * `@/components/ui/button` works under any styling option only because all of them put a
 * component with that name at that path — nothing in TypeScript can enforce that, because the
 * files live in a project that does not exist yet.
 */

import { describe, expect, it } from 'vitest';
import { UI_STYLINGS, spineSpec } from '@idp/core';
import {
  PRIMITIVES,
  isComplete,
  primitivePath,
  registeredStylings,
  stylingContract,
  UnknownStylingError,
} from './styling-contract.js';
import { frameworkContract } from './framework-contract.js';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';

const registry = createRegistry();

describe('registration', () => {
  it('registers a contract for every styling system that has a recipe', () => {
    const withRecipes = UI_STYLINGS.filter((styling) =>
      registry.all().some((recipe) => recipe.id === `ui.styling.${styling}`),
    );

    expect(registeredStylings()).toEqual([...withRecipes].sort());
  });

  /**
   * Every real styling option now has a recipe, so the guard is exercised with a value that
   * cannot occur through the schema. Deleting the test instead would leave the failure path —
   * the one that produces a clear error rather than an undefined lookup — unverified.
   */
  it('throws for a styling system with no registered contract', () => {
    const spec = { ...spineSpec(), ui: { ...spineSpec().ui!, styling: 'vuetify' as never } };
    expect(() => stylingContract(spec)).toThrow(UnknownStylingError);
  });
});

/**
 * One entry per (family, styling) pair that has a recipe.
 *
 * Iterating stylings alone would have silently skipped every Vue implementation: they register
 * under the same `UiStyling` values, and `registeredStylings()` answers for one family at a time.
 */
const IMPLEMENTATIONS = [
  ...registeredStylings('react').map((styling) => ({
    name: `react/${styling}`,
    family: 'react' as const,
    spec: spineSpec({ ui: { styling } }),
  })),
  ...registeredStylings('vue').map((styling) => ({
    name: `vue/${styling}`,
    family: 'vue' as const,
    spec: spineSpec({
      meta: { slug: `styling-vue-${styling}` },
      ui: { framework: 'nuxt' as const, styling },
    }),
  })),
];

describe.each(IMPLEMENTATIONS)('$name', ({ family, spec }) => {
  /**
   * Declared and emitted must agree in both directions.
   *
   * A recipe that declares a primitive it does not emit breaks any page module that trusts the
   * declaration. One that emits a primitive it does not declare is harmless today and becomes a
   * silent inconsistency the moment another styling system is asked to match the set.
   */
  it('emits exactly the primitives it declares', async () => {
    const { files } = await runPipeline(spec, { registry });
    const root = frameworkContract(spec).sourceRoot;
    const contract = stylingContract(spec);

    const emitted = PRIMITIVES.filter((primitive) =>
      files.some((f) => f.path.endsWith(`${root}${primitivePath(primitive, family)}`)),
    );

    expect([...emitted].sort()).toEqual([...contract.provides].sort());
  });

  it('exposes a component named after each primitive', async () => {
    const { files } = await runPipeline(spec, { registry });
    const root = frameworkContract(spec).sourceRoot;

    for (const primitive of stylingContract(spec).provides) {
      const file = files.find((f) => f.path.endsWith(`${root}${primitivePath(primitive, family)}`));
      const expected = primitive.charAt(0).toUpperCase() + primitive.slice(1);

      if (family === 'vue') {
        /*
         * A single-file component IS the export — its name comes from the filename, which
         * `primitivePath` has already asserted. What is left to check is that the file renders
         * something: a `.vue` file with no `<template>` compiles to a component that renders
         * nothing at all, silently.
         */
        expect(String(file?.content), `${primitive}.vue has no <template>`).toContain('<template>');
        continue;
      }

      // Named exports, not default: a default export lets each styling system pick its own name,
      // which is exactly the drift the contract exists to prevent.
      expect(String(file?.content), `${primitive} exports no ${expected}`).toMatch(
        new RegExp(`export (function|const) ${expected}\\b`),
      );
    }
  });
});

describe('completeness', () => {
  // The bar for offering a styling option in the wizard. A partial set would let someone pick a
  // system that cannot render half the pages they then enable.
  it('tailwind-shadcn implements the whole set', () => {
    expect(isComplete(stylingContract(spineSpec()))).toBe(true);
  });

  it('reports an incomplete set as incomplete', () => {
    expect(isComplete({ recipeId: 'x', provides: ['button', 'card'] })).toBe(false);
  });

  it('has eight primitives, all lowercase single words', () => {
    expect(PRIMITIVES).toHaveLength(8);
    for (const primitive of PRIMITIVES) expect(primitive).toMatch(/^[a-z]+$/);
  });
});
