/**
 * The built-in recipe registry.
 *
 * Empty in P1.1 — the engine is complete but no templates are authored yet. The spine recipes
 * (Next.js, Tailwind/shadcn, Zustand, Fastify/REST, Prisma, Docker/Helm/ArgoCD) land in
 * P1.2/P1.3, and the remaining breadth in P2/P3.
 *
 * A contract test in P1.2 asserts that every enum value the wizard offers has a recipe
 * registered here, so an option can never reach the UI without an implementation behind it
 * (doc 08 §5).
 */

import { RecipeRegistry } from './registry.js';
import type { Recipe } from './types.js';

export const BUILT_IN_RECIPES: readonly Recipe[] = [];

export function createRegistry(extra: readonly Recipe[] = []): RecipeRegistry {
  return new RecipeRegistry().registerAll([...BUILT_IN_RECIPES, ...extra]);
}
