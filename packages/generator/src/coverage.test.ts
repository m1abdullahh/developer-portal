/**
 * Recipe coverage (doc 08 §5).
 *
 * Every option the wizard can offer must have a recipe behind it, and every option that does have
 * a recipe must actually generate. The two failure modes are opposite and both bad: an option
 * that reaches the UI with nothing behind it produces an empty project, and an option that works
 * but is still labelled "coming in P2" is a working feature nobody can select.
 *
 * `IMPLEMENTED` is the explicit ledger. Adding an option to `@idp/core`'s enums does not quietly
 * pass this suite — the value has to be listed here, which forces the question "does it work?" to
 * be answered rather than assumed.
 */

import { describe, expect, it } from 'vitest';
import {
  API_PARADIGMS,
  API_RUNTIMES,
  DATABASES,
  UI_FRAMEWORKS,
  UI_STATES,
  UI_STYLINGS,
  spineSpec,
  type ProjectSpec,
} from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';

/**
 * What ships today. Anything absent is expected to have no recipe yet.
 *
 * Kept as literal lists rather than derived from the registry: deriving it would make the test
 * agree with whatever the code happens to do, which is the one thing a contract test must not do.
 */
const IMPLEMENTED = {
  frameworks: ['nextjs-app', 'vite-react'],
  stylings: ['tailwind-shadcn', 'css-modules', 'mui'],
  states: ['zustand', 'redux-toolkit', 'react-query', 'context'],
  runtimes: ['node-ts'],
  paradigms: ['rest'],
  databases: ['postgres', 'none'],
} as const;

const registry = createRegistry();

/** Every recipe id the registry knows, for the "no orphan recipes" check. */
const allRecipeIds = registry.all().map((recipe) => recipe.id);

describe('the implemented ledger matches the enums', () => {
  // Guards against a typo in IMPLEMENTED silently exempting a real option from every test below.
  it.each([
    ['frameworks', IMPLEMENTED.frameworks, UI_FRAMEWORKS],
    ['stylings', IMPLEMENTED.stylings, UI_STYLINGS],
    ['states', IMPLEMENTED.states, UI_STATES],
    ['runtimes', IMPLEMENTED.runtimes, API_RUNTIMES],
    ['paradigms', IMPLEMENTED.paradigms, API_PARADIGMS],
    ['databases', IMPLEMENTED.databases, DATABASES],
  ])('every implemented %s value is a real enum value', (_name, implemented, values) => {
    for (const value of implemented) {
      expect(values as readonly string[]).toContain(value);
    }
  });
});

describe('every implemented UI state option generates', () => {
  it.each(IMPLEMENTED.states)('%s produces a store and wraps the layout', async (state) => {
    const spec: ProjectSpec = spineSpec({ ui: { state } });
    const { files } = await runPipeline(spec, { registry });

    // Whatever the library, the contract with the framework recipe is the same: a StoreProvider
    // exists and layout.tsx renders it. That uniformity is what makes the options swappable.
    const provider = files.find(
      (f) => f.path === 'apps/web/components/providers/StoreProvider.tsx',
    );
    expect(provider, `${state} contributed no StoreProvider`).toBeDefined();

    const layout = files.find((f) => f.path === 'apps/web/app/layout.tsx');
    expect(String(layout?.content)).toContain('StoreProvider');
  });

  it.each(IMPLEMENTED.states)('%s declares only the packages it needs', async (state) => {
    const spec: ProjectSpec = spineSpec({ ui: { state } });
    const { files } = await runPipeline(spec, { registry });

    const pkg = JSON.parse(
      String(files.find((f) => f.path === 'apps/web/package.json')?.content),
    ) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});

    // No state library should leak into a project that did not choose it — the most likely
    // symptom of a mis-scoped `appliesTo`.
    const foreign = {
      zustand: ['@reduxjs/toolkit', 'react-redux', '@tanstack/react-query'],
      'redux-toolkit': ['zustand', '@tanstack/react-query'],
      'react-query': ['zustand', '@reduxjs/toolkit'],
      context: ['zustand', '@reduxjs/toolkit', 'react-redux', '@tanstack/react-query'],
    }[state];

    for (const pkgName of foreign) {
      expect(deps, `${state} pulled in ${pkgName}`).not.toContain(pkgName);
    }
  });

  // The zero-dependency claim is the entire reason to pick Context, so it is worth asserting
  // rather than trusting.
  it('context adds no dependency at all', async () => {
    const withContext = await runPipeline(spineSpec({ ui: { state: 'context' } }), { registry });
    const withZustand = await runPipeline(spineSpec({ ui: { state: 'zustand' } }), { registry });

    const deps = (result: typeof withContext) =>
      Object.keys(
        (
          JSON.parse(
            String(result.files.find((f) => f.path === 'apps/web/package.json')?.content),
          ) as { dependencies?: Record<string, string> }
        ).dependencies ?? {},
      );

    expect(deps(withContext).length).toBe(deps(withZustand).length - 1);
  });
});

describe('unimplemented options have no recipe', () => {
  /**
   * The inverse guard. If someone adds a recipe for an option without moving it into
   * `IMPLEMENTED` — and without un-disabling it in the wizard — the option silently does nothing
   * for users while looking done in the codebase.
   */
  it.each([
    ['ui.state', UI_STATES, IMPLEMENTED.states as readonly string[]],
    ['ui.framework', UI_FRAMEWORKS, IMPLEMENTED.frameworks as readonly string[]],
    ['ui.styling', UI_STYLINGS, IMPLEMENTED.stylings as readonly string[]],
    ['api.runtime', API_RUNTIMES, IMPLEMENTED.runtimes as readonly string[]],
    ['api.paradigm', API_PARADIGMS, IMPLEMENTED.paradigms as readonly string[]],
  ])('%s: no recipe exists for a value not in the ledger', (prefix, values, implemented) => {
    const unexpected = values
      .filter((value) => !implemented.includes(value))
      .filter((value) => allRecipeIds.includes(`${prefix}.${value}`));

    expect(unexpected).toEqual([]);
  });
});

describe('the registry itself', () => {
  it('has no duplicate ids', () => {
    expect(new Set(allRecipeIds).size).toBe(allRecipeIds.length);
  });

  it('names every recipe after the option it implements', () => {
    // `<layer>.<slot>.<value>` — the convention the check above depends on.
    for (const id of allRecipeIds) {
      expect(id, `${id} does not follow <layer>.<slot>.<value>`).toMatch(
        /^[a-z]+(\.[a-z0-9-]+){2,}$/,
      );
    }
  });
});
