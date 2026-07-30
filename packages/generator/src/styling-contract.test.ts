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

  it('throws for a styling system with no recipe yet', () => {
    const spec = { ...spineSpec(), ui: { ...spineSpec().ui!, styling: 'mui' as const } };
    expect(() => stylingContract(spec)).toThrow(UnknownStylingError);
  });
});

describe.each(registeredStylings())('%s', (styling) => {
  const spec = spineSpec({ ui: { styling } });

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
      files.some((f) => f.path.endsWith(`${root}${primitivePath(primitive)}`)),
    );

    expect([...emitted].sort()).toEqual([...contract.provides].sort());
  });

  it('exports a component named after each primitive', async () => {
    const { files } = await runPipeline(spec, { registry });
    const root = frameworkContract(spec).sourceRoot;

    for (const primitive of stylingContract(spec).provides) {
      const file = files.find((f) => f.path.endsWith(`${root}${primitivePath(primitive)}`));
      const expected = primitive.charAt(0).toUpperCase() + primitive.slice(1);

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
