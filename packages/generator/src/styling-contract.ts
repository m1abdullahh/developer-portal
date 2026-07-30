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

import { type ProjectSpec, type UiStyling } from '@idp/core';

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

export interface StylingContract {
  /** The styling recipe's id, for `requires`. */
  recipeId: string;
  /**
   * Primitives this system currently emits.
   *
   * Explicit rather than assumed complete: a styling system part-way through implementation is a
   * legitimate state, and the contract test asserts that what is *declared* is what is *emitted*.
   * A recipe cannot quietly ship seven primitives while the wizard offers it as a finished option.
   */
  provides: readonly Primitive[];
}

const contracts = new Map<UiStyling, StylingContract>();

export function registerStylingContract(styling: UiStyling, contract: StylingContract): void {
  contracts.set(styling, contract);
}

export class UnknownStylingError extends Error {
  constructor(styling: string) {
    super(
      `No styling contract is registered for "${styling}". A styling recipe must call ` +
        `registerStylingContract() at module load so page modules know which primitives exist.`,
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

  const contract = contracts.get(spec.ui.styling);
  if (!contract) throw new UnknownStylingError(spec.ui.styling);
  return contract;
}

/** Test affordance: the styling systems that have registered a contract. */
export function registeredStylings(): UiStyling[] {
  return [...contracts.keys()].sort();
}

/** Where a primitive must be emitted, relative to the framework's source root. */
export function primitivePath(primitive: Primitive): string {
  return `components/ui/${primitive}.tsx`;
}

/** True when a styling system implements the whole set — the bar for offering it in the wizard. */
export function isComplete(contract: StylingContract): boolean {
  return PRIMITIVES.every((primitive) => contract.provides.includes(primitive));
}
