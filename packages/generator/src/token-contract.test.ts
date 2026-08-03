/**
 * Every design token a component references must actually be declared.
 *
 * This is the cheapest possible check and it caught a bug that had shipped since P1. The Tailwind
 * recipe — the default styling of the default framework — referenced four custom properties its
 * `globals.css` never declared:
 *
 *     --card       Dialog's background
 *     --accent     Badge's `accent` tone
 *     --success    Badge's `success` tone, Toast's success border
 *     --warning    Badge's `warning` tone
 *
 * An undefined custom property makes `hsl(var(--card))` an *invalid value*, and CSS discards the
 * whole declaration rather than falling back. So the Dialog rendered transparent over its own
 * backdrop and three badge tones lost their fill.
 *
 * Nothing else could have found it. The build succeeds, TypeScript is satisfied, the smoke harness
 * boots the page and gets a 200. It needs a human looking at the rendered output — and even then a
 * colourless badge reads as a design choice rather than a defect.
 *
 * The check runs per styling system rather than globally, because each declares its own token set;
 * what matters is that a system's components and its stylesheet agree with each other.
 */

import { describe, expect, it } from 'vitest';
import { spineSpec, type ProjectSpec } from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import { familyOf, registeredStylings } from './styling-contract.js';
import type { VirtualFile } from './types.js';

const registry = createRegistry();

/** Every (family, styling) pair with a recipe — the same spread the styling contract covers. */
const CASES = [
  ...registeredStylings('react').map((styling) => ({
    name: `react/${styling}`,
    spec: spineSpec({ meta: { slug: `tokens-react-${styling}` }, ui: { styling } }),
  })),
  ...registeredStylings('vue').map((styling) => ({
    name: `vue/${styling}`,
    spec: spineSpec({
      meta: { slug: `tokens-vue-${styling}` },
      ui: { framework: 'nuxt' as const, styling },
    }),
  })),
];

/** Files that can reference a token: components, stylesheets, and Vue single-file components. */
const STYLED = /^apps\/web\/.*\.(tsx|ts|vue|css)$/;

function declared(files: readonly VirtualFile[]): Set<string> {
  const tokens = new Set<string>();

  for (const file of files.filter((f) => f.path.endsWith('.css'))) {
    /*
     * The trailing colon is what distinguishes declaring a token from reading one: a declaration
     * is `--name:`, a reference is `var(--name)` and has a `)` there instead.
     *
     * Deliberately NOT anchored to the start of a line. It was, and the self-check below caught
     * it — `:root { --a: 1; }` on one line declares `--a` and the anchored form saw nothing, so
     * a minified stylesheet would have made this whole suite pass vacuously.
     */
    for (const match of String(file.content).matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      tokens.add(match[1]!);
    }
  }
  return tokens;
}

function referenced(files: readonly VirtualFile[]): Map<string, string[]> {
  const uses = new Map<string, string[]>();

  for (const file of files.filter((f) => STYLED.test(f.path))) {
    for (const match of String(file.content).matchAll(/var\((--[a-z0-9-]+)\)/g)) {
      const token = match[1]!;
      uses.set(token, [...(uses.get(token) ?? []), file.path]);
    }
  }
  return uses;
}

describe.each(CASES)('$name', ({ spec }: { spec: ProjectSpec }) => {
  it('declares every token its components reference', async () => {
    const { files } = await runPipeline(spec, { registry });

    const have = declared(files);
    const undeclared = [...referenced(files).entries()]
      .filter(([token]) => !have.has(token))
      .map(([token, where]) => `${token} — used by ${[...new Set(where)].join(', ')}`);

    expect(undeclared).toEqual([]);
  });
});

/*
 * Deliberately NOT a rule: "every styling system must reference design tokens".
 *
 * It was one, and both MUI and Vuetify failed it — correctly. A component library carries its
 * palette in a theme object rather than in CSS custom properties, which is the documented cost of
 * choosing one: the tokens are restated in `theme.ts` and `plugins/vuetify.ts` instead. Keeping
 * the rule would have meant carving an exception for exactly the cases that failed it, which is
 * not a rule at all.
 */

describe('the dark theme', () => {
  // A token re-pointed for dark mode must exist in light mode too, or the light theme falls back
  // to nothing while dark looks correct — the inverse of the bug above, and just as quiet.
  it.each(CASES)('$name declares every dark-mode token in the default theme', async ({ spec }) => {
    const { files } = await runPipeline(spec, { registry });

    const css = files
      .filter((f) => f.path.endsWith('.css'))
      .map((f) => String(f.content))
      .join('\n');

    const root = new Set(
      [...(/:root\s*\{([^}]*)\}/s.exec(css)?.[1] ?? '').matchAll(/(--[a-z0-9-]+)\s*:/g)].map(
        (m) => m[1]!,
      ),
    );
    const dark = [
      ...(/\.dark\s*\{([^}]*)\}/s.exec(css)?.[1] ?? '').matchAll(/(--[a-z0-9-]+)\s*:/g),
    ].map((m) => m[1]!);

    // Vuetify carries its palette in the plugin rather than in CSS, so there is no `.dark` block
    // to compare — an empty list passes, which is correct rather than a gap.
    expect(dark.filter((token) => !root.has(token))).toEqual([]);
  });
});

describe('the check itself', () => {
  it('recognises a declaration and a reference as different things', () => {
    const files = [
      { path: 'apps/web/x.css', content: ':root { --a: 1; }', producedBy: 't' },
      { path: 'apps/web/y.tsx', content: 'var(--a) var(--b)', producedBy: 't' },
    ] as unknown as VirtualFile[];

    // Without this distinction the regex would treat `var(--b)` as declaring `--b` and the whole
    // suite would pass vacuously.
    expect([...declared(files)]).toEqual(['--a']);
    expect([...referenced(files).keys()].sort()).toEqual(['--a', '--b']);
  });

  it('covers every registered styling system', () => {
    expect(CASES.length).toBe(
      registeredStylings('react').length + registeredStylings('vue').length,
    );
  });

  it('the family helper agrees with the specs used above', () => {
    for (const { name, spec } of CASES) {
      expect(familyOf(spec)).toBe(name.startsWith('vue/') ? 'vue' : 'react');
    }
  });
});
