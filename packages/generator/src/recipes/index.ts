/**
 * The built-in recipe set.
 *
 * P1.2 ships the UI half of the spine (Next.js + Tailwind/shadcn + Zustand). The API half
 * (Fastify, REST/OpenAPI, Prisma, middleware) lands in P1.3, and DevOps in P1.4.
 *
 * A contract test asserts every wizard enum value maps to a registered recipe, so an option
 * cannot reach the UI without an implementation behind it (doc 08 §5). Options still awaiting
 * a recipe are listed explicitly there rather than silently passing.
 */

import { RecipeRegistry } from '../registry.js';
import type { Recipe } from '../types.js';
import { nextjsAppRecipe } from './ui-nextjs-app.js';
import { tailwindShadcnRecipe } from './ui-tailwind-shadcn.js';
import { zustandRecipe } from './ui-zustand.js';
import { nodeTsRecipe } from './api-node-ts.js';
import { restRecipe } from './api-rest.js';
import { prismaRecipe } from './api-prisma.js';
import { MIDDLEWARE_RECIPES } from './api-middleware.js';
import { containerNextRecipe, containerNodeApiRecipe } from './ops-container.js';
import { helmRecipe } from './ops-helm.js';

export * from './ui-nextjs-app.js';
export * from './ui-tailwind-shadcn.js';
export * from './ui-zustand.js';
export * from './api-node-ts.js';
export * from './api-rest.js';
export * from './api-prisma.js';
export * from './api-middleware.js';
export * from './ops-container.js';
export * from './ops-helm.js';

export const BUILT_IN_RECIPES: readonly Recipe[] = [
  nextjsAppRecipe,
  tailwindShadcnRecipe,
  zustandRecipe,
  nodeTsRecipe,
  restRecipe,
  prismaRecipe,
  ...MIDDLEWARE_RECIPES,
  containerNextRecipe,
  containerNodeApiRecipe,
  helmRecipe,
];

export function createRegistry(extra: readonly Recipe[] = []): RecipeRegistry {
  return new RecipeRegistry().registerAll([...BUILT_IN_RECIPES, ...extra]);
}
