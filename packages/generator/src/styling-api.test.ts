/**
 * The three styling systems must expose *identical* primitive APIs.
 *
 * That identity is the entire premise of the styling contract: one page module, written against
 * `@/components/ui/*`, renders under Tailwind, CSS Modules or MUI with no per-system copy. If the
 * props diverge, the premise is false and the divergence is silent — the module compiles under
 * whichever system the author happened to generate while writing it.
 *
 * It was false when this file was written. The Button had:
 *
 *   • `size` under Tailwind, and nowhere else.
 *   • `variant: 'default' | ...` under Tailwind against `'primary' | ...` under the other two.
 *
 * Neither was caught by anything. `coverage.test.ts` proves each styling system generates its
 * eight files; `scaffold-contract.test.ts` proves the files land in the right places. Nothing
 * compared what was *inside* them, so the first page module to pass `variant` or `size` — this
 * suite's own `userManagement` — failed to typecheck under two systems out of three.
 *
 * The smoke harness would catch it too, but only for the one combination it runs, and only after
 * four minutes of `npm install`. This runs in seconds and covers every primitive.
 */

import { describe, expect, it } from 'vitest';
import { spineSpec, type UiStyling } from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import { PRIMITIVES } from './styling-contract.js';
import type { VirtualFile } from './types.js';

/*
 * Three full pipeline runs back the whole file: whichever assertion awaits first pays for all
 * three. That exceeds vitest's 5s default, which is why this package sets its own — see
 * `vitest.config.ts`, and note that this file was not the only suite it was failing.
 */
const STYLINGS: readonly UiStyling[] = ['tailwind-shadcn', 'css-modules', 'mui'];

const registry = createRegistry();

/** One pipeline run per styling system, shared by every assertion below. */
const generated = new Map<UiStyling, Promise<readonly VirtualFile[]>>(
  STYLINGS.map((styling) => [
    styling,
    runPipeline(spineSpec({ meta: { slug: `styling-${styling}` }, ui: { styling } }), {
      registry,
    }).then((result) => result.files),
  ]),
);

async function primitiveSource(styling: UiStyling, primitive: string): Promise<string> {
  const files = await generated.get(styling)!;
  const file = files.find((f) => f.path === `apps/web/components/ui/${primitive}.tsx`);
  if (!file) throw new Error(`${styling} generated no ${primitive}.tsx`);
  return String(file.content);
}

/**
 * The props a primitive declares itself, and the literal union behind each.
 *
 * Inherited props (`extends ButtonHTMLAttributes<...>`) are deliberately excluded: MUI has to
 * `Omit` `color` because its own Button claims that name, and demanding identical inheritance
 * would fail on a difference that no page module can observe.
 */
function declaredProps(source: string, interfaceName: string): Map<string, string> {
  const start = source.indexOf(`export interface ${interfaceName}`);
  if (start === -1) return new Map();

  // These interfaces are flat, so the first line that is exactly `}` closes it.
  const body = source.slice(start).split('\n');
  const end = body.findIndex((line, i) => i > 0 && line === '}');
  const lines = body.slice(1, end === -1 ? undefined : end);

  const aliases = localUnions(source);
  const props = new Map<string, string>();

  for (const line of lines) {
    const match = /^\s*(\w+)\??:\s*(.+?);\s*$/.exec(line);
    if (!match) continue;
    const [, name, type] = match;
    // Resolved through the alias table so `ButtonVariant` and an inline union compare equal —
    // what a caller can pass is the thing that matters, not what the type is called.
    props.set(name!, aliases.get(type!.trim()) ?? normaliseUnion(type!));
  }
  return props;
}

/** `export type X = 'a' | 'b';` → `X` ⇒ sorted members. */
function localUnions(source: string): Map<string, string> {
  const unions = new Map<string, string>();
  for (const match of source.matchAll(/^(?:export )?type (\w+) = ((?:'[^']*'\s*\|?\s*)+);$/gm)) {
    unions.set(match[1]!, normaliseUnion(match[2]!));
  }
  return unions;
}

/** Order is not part of a union's meaning, so it must not be part of the comparison. */
function normaliseUnion(type: string): string {
  if (!type.includes("'")) return type.replace(/\s+/g, ' ').trim();
  return [...type.matchAll(/'([^']*)'/g)]
    .map((m) => m[1])
    .sort()
    .join(' | ');
}

/** The exported interface a primitive's props live in. Only `table` deviates from `<Name>Props`. */
const PROPS_INTERFACE: Record<string, string> = {
  button: 'ButtonProps',
  card: 'CardProps',
  input: 'InputProps',
  select: 'SelectProps',
  badge: 'BadgeProps',
  table: 'TableProps',
  dialog: 'DialogProps',
  toast: 'Toast',
};

/** Every `export function X` / `export const X` / `export type X` a primitive file provides. */
function exportedNames(source: string): string {
  const names = new Set<string>();
  for (const match of source.matchAll(
    /^export (?:async )?(?:function|const|class|interface|type) (\w+)/gm,
  )) {
    names.add(match[1]!);
  }
  return [...names].sort().join(', ');
}

describe.each(PRIMITIVES)('%s exposes the same API under every styling system', (primitive) => {
  const interfaceName = PROPS_INTERFACE[primitive]!;

  /**
   * The check that catches a missing sub-component.
   *
   * `card` shipped six components under Tailwind — Card, CardHeader, CardTitle, CardDescription,
   * CardContent, CardFooter — and exactly one under the other two, with no `CardProps` type at
   * all under Tailwind. So `<CardHeader>` compiled only under Tailwind, and importing `CardProps`
   * compiled only under the other two. Comparing props alone would not have found it: there was
   * nothing to compare.
   */
  it('exports the same names', async () => {
    const perStyling = await Promise.all(
      STYLINGS.map(async (styling) => ({
        styling,
        names: exportedNames(await primitiveSource(styling, primitive)),
      })),
    );

    const reference = perStyling[0]!;
    for (const other of perStyling.slice(1)) {
      expect(
        other.names,
        `${primitive}: ${other.styling} exports [${other.names}] but ` +
          `${reference.styling} exports [${reference.names}]`,
      ).toBe(reference.names);
    }
  });

  it('declares the same set of props', async () => {
    const names = await Promise.all(
      STYLINGS.map(async (styling) => ({
        styling,
        props: [...declaredProps(await primitiveSource(styling, primitive), interfaceName).keys()]
          .sort()
          .join(', '),
      })),
    );

    const reference = names[0]!;
    for (const other of names.slice(1)) {
      expect(
        other.props,
        `${primitive}: ${other.styling} declares [${other.props}] but ` +
          `${reference.styling} declares [${reference.props}]`,
      ).toBe(reference.props);
    }
  });

  it('accepts the same values for every prop', async () => {
    const maps = await Promise.all(
      STYLINGS.map(async (styling) => ({
        styling,
        props: declaredProps(await primitiveSource(styling, primitive), interfaceName),
      })),
    );

    const reference = maps[0]!;
    for (const other of maps.slice(1)) {
      for (const [prop, type] of reference.props) {
        // The failure this catches: `variant` accepting 'default' under one system and 'primary'
        // under another. Both compile; a page module passing either breaks somewhere.
        expect(
          other.props.get(prop),
          `${primitive}.${prop}: ${other.styling} accepts ${other.props.get(prop)}, ` +
            `${reference.styling} accepts ${type}`,
        ).toBe(type);
      }
    }
  });
});

describe('the shared vocabulary', () => {
  // Named types rather than inline unions, so a divergence is visible in one place per system
  // instead of being spread across every prop that uses it.
  it.each(['ButtonVariant', 'ButtonSize'])('%s is exported by all three', async (name) => {
    for (const styling of STYLINGS) {
      const source = await primitiveSource(styling, 'button');
      expect(source, `${styling} does not export ${name}`).toContain(`export type ${name} =`);
    }
  });

  it('the Button variant list is the one page modules were written against', async () => {
    const expected = 'destructive | ghost | outline | primary | secondary';
    for (const styling of STYLINGS) {
      const unions = localUnions(await primitiveSource(styling, 'button'));
      expect(unions.get('ButtonVariant'), `${styling} disagrees`).toBe(expected);
    }
  });
});
