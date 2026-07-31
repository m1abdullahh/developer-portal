/**
 * The primitive API every styling system implements.
 *
 * This is what stops "4 page modules × 3 styling systems" from becoming 12 hand-written copies
 * of each page (doc 02 §2). A page module imports `Button` from `@/components/ui/button` and
 * never learns whether that resolves to Tailwind classes, a CSS Module, or an MUI wrapper.
 *
 * The contract is the *import path and the props*, not the implementation. Each styling recipe
 * emits its own version of every primitive at the same path, with the same public props, so
 * swapping the styling option rewrites the components and leaves every consumer untouched.
 *
 * ── Why this is a contract test and not a type ───────────────────────────────
 * The generated components are files on disk in a project that does not exist yet, so no
 * TypeScript interface in this repo can constrain them. The enforcement has to be a test that
 * generates real output and inspects it — which is also the only check that catches a recipe
 * emitting a primitive at the wrong path.
 */

import { isVueFramework, type ProjectSpec, type UiStyling } from '@idp/core';

/**
 * The eight primitives.
 *
 * Chosen as the smallest set the four P2.5 page modules can be built from — auth layouts, user
 * management, billing and settings need exactly these and nothing more. Adding a ninth later is
 * cheap; discovering a page module needs one that three styling systems have not implemented is
 * not, which is why the list is fixed here rather than grown ad hoc.
 */
export const PRIMITIVES = [
  'button',
  'card',
  'input',
  'select',
  'badge',
  'table',
  'dialog',
  'toast',
] as const;

export type Primitive = (typeof PRIMITIVES)[number];

/**
 * Which component language a styling system emits.
 *
 * The primitive API is shared *within* a family, not across one. A React page module imports
 * `Button` from a `.tsx` file and passes children; a Vue page module renders `<UiButton>` backed by
 * a single-file component and passes a slot. Those cannot be the same file, so "swap the styling
 * option and every consumer is untouched" holds within React and within Vue — never between them.
 *
 * Making that explicit is what stopped `css-modules` for Vue from silently overwriting
 * `css-modules` for React: both are the same `UiStyling` value, and the registry was keyed on
 * that value alone.
 */
export type FrameworkFamily = 'react' | 'vue';

export interface StylingContract {
  /** The styling recipe's id, for `requires`. */
  recipeId: string;
  /** The component language this recipe emits. Half of its registry key. */
  family: FrameworkFamily;
  /**
   * Primitives this system currently emits.
   *
   * Explicit rather than assumed complete: a styling system part-way through implementation is a
   * legitimate state, and the contract test asserts that what is *declared* is what is *emitted*.
   * A recipe cannot quietly ship seven primitives while the wizard offers it as a finished option.
   */
  provides: readonly Primitive[];
}

/** Keyed by family AND styling: one `UiStyling` value has an implementation per family. */
const contracts = new Map<string, StylingContract>();

const key = (family: FrameworkFamily, styling: UiStyling): string => `${family}:${styling}`;

export function registerStylingContract(styling: UiStyling, contract: StylingContract): void {
  contracts.set(key(contract.family, styling), contract);
}

/** The family a spec's framework belongs to. */
export function familyOf(spec: ProjectSpec): FrameworkFamily {
  return spec.ui && isVueFramework(spec.ui.framework) ? 'vue' : 'react';
}

export class UnknownStylingError extends Error {
  constructor(styling: string, family: FrameworkFamily = 'react') {
    super(
      `No styling contract is registered for "${styling}" in the ${family} family. A styling ` +
        `recipe must call registerStylingContract() at module load so page modules know which ` +
        `primitives exist. Every styling option needs one implementation per framework family.`,
    );
    this.name = 'UnknownStylingError';
  }
}

export function stylingContract(spec: ProjectSpec): StylingContract {
  if (!spec.ui) {
    throw new Error(
      'stylingContract() was called for a spec with no UI layer. Guard on `spec.ui` first.',
    );
  }

  const family = familyOf(spec);
  const contract = contracts.get(key(family, spec.ui.styling));
  if (!contract) throw new UnknownStylingError(spec.ui.styling, family);
  return contract;
}

/** Test affordance: the styling systems registered for a family. */
export function registeredStylings(family: FrameworkFamily = 'react'): UiStyling[] {
  // Read back off the key, not derived from the recipe id. `ui.styling.css-modules-vue` is a
  // recipe id whose last segment is not a `UiStyling` value at all — the recipe implements
  // `css-modules` for the Vue family, and the suffix only keeps the id unique.
  return [...contracts.entries()]
    .filter(([, contract]) => contract.family === family)
    .map(([entry]) => entry.slice(entry.indexOf(':') + 1) as UiStyling)
    .sort();
}

/**
 * Where a primitive must be emitted, relative to the framework's source root.
 *
 * The extension follows the family: React emits TSX, Vue emits a single-file component. Hardcoding
 * `.tsx` here was the second thing that assumed every framework was React.
 */
export function primitivePath(primitive: Primitive, family: FrameworkFamily = 'react'): string {
  return `components/ui/${primitive}${family === 'vue' ? '.vue' : '.tsx'}`;
}

/** True when a styling system implements the whole set — the bar for offering it in the wizard. */
export function isComplete(contract: StylingContract): boolean {
  return PRIMITIVES.every((primitive) => contract.provides.includes(primitive));
}
