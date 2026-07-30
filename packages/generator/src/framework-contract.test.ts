/**
 * The framework contract is what lets one state recipe serve every framework.
 *
 * Its failure mode is quiet: a wrong `providerRoot` produces a codemod that edits nothing, and the
 * generated project then crashes at runtime with "must be used within a Provider" — far from the
 * cause. So the invariants are asserted directly rather than inferred from a passing build.
 */

import { describe, expect, it } from 'vitest';
import { UI_FRAMEWORKS, spineSpec, uiOnlyVercelSpec, type ProjectSpec } from '@idp/core';
import {
  UnknownFrameworkError,
  frameworkContract,
  registeredFrameworks,
  requiresFramework,
} from './framework-contract.js';
// Importing the registry is what registers every contract — they are declared at module load,
// beside the recipe each one describes.
import { createRegistry } from './recipes/index.js';
import { requirementsOf } from './registry.js';
import { runPipeline } from './pipeline.js';

const registry = createRegistry();

describe('registration', () => {
  it('registers a contract for every framework that has a recipe', () => {
    const withRecipes = UI_FRAMEWORKS.filter((framework) =>
      registry.all().some((recipe) => recipe.id === `ui.framework.${framework}`),
    );

    expect(registeredFrameworks()).toEqual([...withRecipes].sort());
  });

  // Failing loudly is the point: a default provider root would silently target a file that does
  // not exist in the chosen framework.
  it('throws for a framework with no recipe yet', () => {
    const spec = { ...spineSpec(), ui: { ...spineSpec().ui!, framework: 'nuxt' as const } };
    expect(() => frameworkContract(spec)).toThrow(UnknownFrameworkError);
  });

  it('refuses to answer for an API-only project', () => {
    const spec: ProjectSpec = { ...spineSpec(), ui: null };
    expect(() => frameworkContract(spec)).toThrow(/no UI layer/);
  });
});

describe('the provider root really does host {children}', () => {
  /**
   * The one invariant every framework must uphold. Asserted against generated output rather than
   * the template, because a codemod could have replaced the expression it needed.
   */
  it.each(registeredFrameworks())(
    '%s renders {children} exactly once before codemods',
    async (framework) => {
      const spec = spineSpec({ ui: { framework } });
      const { files } = await runPipeline(spec, { registry });

      const contract = frameworkContract(spec);
      const root = files.find((f) => f.path.endsWith(contract.providerRoot));

      expect(root, `${contract.providerRoot} was not generated`).toBeDefined();

      // Comments are stripped first. A doc comment mentioning `{children}` — which the Vite
      // Root component's own comment does — is prose, not a second anchor the codemod could
      // have chosen. Counting it caught this test out rather than the code.
      const code = String(root?.content)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

      // After codemods the literal sits inside the provider stack, so it still appears exactly
      // once — more than once would mean an ambiguous anchor.
      expect(code.match(/\{children\}/g) ?? []).toHaveLength(1);
    },
  );
});

describe('requires resolves per spec', () => {
  it('names the framework recipe the spec actually chose', () => {
    expect(requiresFramework(spineSpec())).toEqual(['ui.framework.nextjs-app']);
  });

  /**
   * The reason `requires` had to become a function. Listing every framework id statically would
   * fail validation, since exactly one framework applies to any spec — so a state recipe could
   * not express "the framework, whichever it is" at all.
   */
  it('resolves a function-valued requires through requirementsOf', () => {
    const zustand = registry.all().find((r) => r.id === 'ui.state.zustand')!;

    expect(typeof zustand.requires).toBe('function');
    expect(requirementsOf(zustand, spineSpec())).toEqual(['ui.framework.nextjs-app']);
  });

  it('still resolves a static requires array unchanged', () => {
    const staticRecipe = { id: 'x', phase: 'feature', appliesTo: () => true, requires: ['a', 'b'] };
    expect(requirementsOf(staticRecipe as never, spineSpec())).toEqual(['a', 'b']);
  });

  it('treats an absent requires as no requirements', () => {
    const bare = { id: 'x', phase: 'feature', appliesTo: () => true };
    expect(requirementsOf(bare as never, spineSpec())).toEqual([]);
  });
});

describe('planning still succeeds for every shape', () => {
  // A regression guard for the refactor: resolving requirements per spec must not break the
  // validator for specs where the framework recipe is present but a layer is absent.
  it.each([
    ['two layers', spineSpec()],
    ['UI only', uiOnlyVercelSpec()],
    ['API only', { ...spineSpec(), ui: null } as ProjectSpec],
  ])('%s', (_name, spec) => {
    expect(() => registry.plan(spec)).not.toThrow();
  });
});
