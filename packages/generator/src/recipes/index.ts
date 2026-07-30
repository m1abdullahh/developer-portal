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
import { viteReactRecipe } from './ui-vite-react.js';
import { tailwindShadcnRecipe } from './ui-tailwind-shadcn.js';
import { cssModulesRecipe } from './ui-css-modules.js';
import { zustandRecipe } from './ui-zustand.js';
import { reduxToolkitRecipe } from './ui-redux-toolkit.js';
import { reactQueryRecipe } from './ui-react-query.js';
import { contextRecipe } from './ui-context.js';
import { nodeTsRecipe } from './api-node-ts.js';
import { restRecipe } from './api-rest.js';
import { prismaRecipe } from './api-prisma.js';
import { MIDDLEWARE_RECIPES } from './api-middleware.js';
import {
  containerNextRecipe,
  containerNodeApiRecipe,
  containerSpaNginxRecipe,
} from './ops-container.js';
import { helmRecipe } from './ops-helm.js';
import { argocdRecipe, githubActionsRecipe } from './ops-gitops.js';

export * from './ui-nextjs-app.js';
export * from './ui-vite-react.js';
export * from './ui-tailwind-shadcn.js';
export * from './ui-css-modules.js';
export * from './ui-zustand.js';
export * from './ui-redux-toolkit.js';
export * from './ui-react-query.js';
export * from './ui-context.js';
export * from './api-node-ts.js';
export * from './api-rest.js';
export * from './api-prisma.js';
export * from './api-middleware.js';
export * from './ops-container.js';
export * from './ops-helm.js';
export * from './ops-gitops.js';

export const BUILT_IN_RECIPES: readonly Recipe[] = [
  nextjsAppRecipe,
  viteReactRecipe,
  tailwindShadcnRecipe,
  cssModulesRecipe,
  zustandRecipe,
  // Exactly one of these four applies to any given spec — `appliesTo` keys on `ui.state` — so
  // they never collide despite all four contributing the same StoreProvider path.
  reduxToolkitRecipe,
  reactQueryRecipe,
  contextRecipe,
  nodeTsRecipe,
  restRecipe,
  prismaRecipe,
  ...MIDDLEWARE_RECIPES,
  containerNextRecipe,
  containerSpaNginxRecipe,
  containerNodeApiRecipe,
  helmRecipe,
  argocdRecipe,
  githubActionsRecipe,
];

export function createRegistry(extra: readonly Recipe[] = []): RecipeRegistry {
  return new RecipeRegistry().registerAll([...BUILT_IN_RECIPES, ...extra]);
}
