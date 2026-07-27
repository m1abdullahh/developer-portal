import { describe, expect, it } from 'vitest';
import { spineSpec } from '@idp/core';
import {
  CircularDependencyError,
  MissingRequirementError,
  RecipeConflictError,
  RecipeRegistry,
} from './registry.js';
import type { Recipe, RecipePhase } from './types.js';

function recipe(id: string, phase: RecipePhase, extra: Partial<Recipe> = {}): Recipe {
  return { id, phase, appliesTo: () => true, ...extra };
}

const spec = spineSpec();

describe('phase ordering', () => {
  it('always runs base -> feature -> integration -> finalize', () => {
    const ids = new RecipeRegistry()
      .registerAll([
        recipe('z.finalize', 'finalize'),
        recipe('a.integration', 'integration'),
        recipe('m.feature', 'feature'),
        recipe('q.base', 'base'),
      ])
      .plan(spec)
      .map((r) => r.id);

    expect(ids).toEqual(['q.base', 'm.feature', 'a.integration', 'z.finalize']);
  });

  it('ignores registration order entirely', () => {
    const forward = new RecipeRegistry()
      .registerAll([recipe('a', 'base'), recipe('b', 'feature'), recipe('c', 'finalize')])
      .plan(spec)
      .map((r) => r.id);
    const reverse = new RecipeRegistry()
      .registerAll([recipe('c', 'finalize'), recipe('b', 'feature'), recipe('a', 'base')])
      .plan(spec)
      .map((r) => r.id);

    expect(forward).toEqual(reverse);
  });
});

describe('determinism', () => {
  // Golden-file tests compare whole trees. A topological sort alone admits many valid
  // orderings; the lexicographic tie-break is what makes the result reproducible.
  it('produces an identical order across 50 runs', () => {
    const build = () =>
      new RecipeRegistry()
        .registerAll([
          recipe('feat.d', 'feature'),
          recipe('feat.a', 'feature'),
          recipe('feat.c', 'feature'),
          recipe('feat.b', 'feature'),
        ])
        .plan(spec)
        .map((r) => r.id);

    const first = build();
    for (let i = 0; i < 50; i++) expect(build()).toEqual(first);
    expect(first).toEqual(['feat.a', 'feat.b', 'feat.c', 'feat.d']);
  });

  it('breaks ties lexicographically even when requirements permit either order', () => {
    const ids = new RecipeRegistry()
      .registerAll([
        recipe('feat.zebra', 'feature', { requires: ['feat.base'] }),
        recipe('feat.apple', 'feature', { requires: ['feat.base'] }),
        recipe('feat.base', 'feature'),
      ])
      .plan(spec)
      .map((r) => r.id);

    expect(ids).toEqual(['feat.base', 'feat.apple', 'feat.zebra']);
  });
});

describe('requires', () => {
  it('orders a dependency before its dependent within a phase', () => {
    const ids = new RecipeRegistry()
      .registerAll([
        recipe('styling.primitives', 'feature', { requires: ['styling.tokens'] }),
        recipe('styling.tokens', 'feature'),
      ])
      .plan(spec)
      .map((r) => r.id);

    expect(ids.indexOf('styling.tokens')).toBeLessThan(ids.indexOf('styling.primitives'));
  });

  it('accepts a cross-phase requirement — phase sequencing already satisfies it', () => {
    const ids = new RecipeRegistry()
      .registerAll([
        recipe('feat.styling', 'feature', { requires: ['base.next'] }),
        recipe('base.next', 'base'),
      ])
      .plan(spec)
      .map((r) => r.id);

    expect(ids).toEqual(['base.next', 'feat.styling']);
  });

  it('fails loudly when a requirement does not apply to this spec', () => {
    const registry = new RecipeRegistry().registerAll([
      recipe('feat.a', 'feature', { requires: ['feat.missing'] }),
      recipe('feat.missing', 'feature', { appliesTo: () => false }),
    ]);

    expect(() => registry.plan(spec)).toThrow(MissingRequirementError);
    expect(() => registry.plan(spec)).toThrow(/feat\.missing/);
  });

  it('detects a dependency cycle rather than silently dropping recipes', () => {
    const registry = new RecipeRegistry().registerAll([
      recipe('a', 'feature', { requires: ['b'] }),
      recipe('b', 'feature', { requires: ['a'] }),
    ]);
    expect(() => registry.plan(spec)).toThrow(CircularDependencyError);
  });
});

describe('conflicts', () => {
  it('rejects two conflicting recipes that both apply', () => {
    const registry = new RecipeRegistry().registerAll([
      recipe('state.zustand', 'feature', { conflicts: ['state.redux'] }),
      recipe('state.redux', 'feature'),
    ]);
    expect(() => registry.plan(spec)).toThrow(RecipeConflictError);
  });

  it('allows a declared conflict when only one side applies', () => {
    const ids = new RecipeRegistry()
      .registerAll([
        recipe('state.zustand', 'feature', { conflicts: ['state.redux'] }),
        recipe('state.redux', 'feature', { appliesTo: () => false }),
      ])
      .plan(spec)
      .map((r) => r.id);

    expect(ids).toEqual(['state.zustand']);
  });

  it('reports the conflicting pair identically regardless of visit order', () => {
    const message = (ids: string[]) => {
      const registry = new RecipeRegistry().registerAll([
        recipe(ids[0]!, 'feature', { conflicts: [ids[1]!] }),
        recipe(ids[1]!, 'feature'),
      ]);
      try {
        registry.plan(spec);
        return '';
      } catch (err) {
        return (err as Error).message;
      }
    };

    expect(message(['aaa', 'zzz'])).toBe(message(['zzz', 'aaa']));
  });
});

describe('selection', () => {
  it('includes only recipes whose appliesTo matches', () => {
    const ids = new RecipeRegistry()
      .registerAll([
        recipe('ui.next', 'base', { appliesTo: (s) => s.ui?.framework === 'nextjs-app' }),
        recipe('ui.nuxt', 'base', { appliesTo: (s) => s.ui?.framework === 'nuxt' }),
      ])
      .plan(spec)
      .map((r) => r.id);

    expect(ids).toEqual(['ui.next']);
  });

  it('rejects duplicate registration', () => {
    const registry = new RecipeRegistry().register(recipe('a', 'base'));
    expect(() => registry.register(recipe('a', 'feature'))).toThrow(/already registered/);
  });

  it('rejects an unknown phase', () => {
    const bad = { id: 'x', phase: 'nonsense', appliesTo: () => true } as unknown as Recipe;
    expect(() => new RecipeRegistry().register(bad)).toThrow(/unknown phase/);
  });
});
