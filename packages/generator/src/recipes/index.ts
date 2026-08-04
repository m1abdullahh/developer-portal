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
import { nuxtRecipe } from './ui-nuxt.js';
import { tailwindShadcnRecipe } from './ui-tailwind-shadcn.js';
import { cssModulesRecipe } from './ui-css-modules.js';
import { cssModulesVueRecipe } from './ui-css-modules-vue.js';
import { tailwindShadcnVueRecipe } from './ui-tailwind-shadcn-vue.js';
import { muiRecipe } from './ui-mui.js';
import { vuetifyRecipe } from './ui-vuetify.js';
import { zustandRecipe } from './ui-zustand.js';
import { reduxToolkitRecipe } from './ui-redux-toolkit.js';
import { reactQueryRecipe } from './ui-react-query.js';
import { contextRecipe } from './ui-context.js';
import { VUE_STATE_RECIPES } from './ui-state-vue.js';
import { authLayoutsRecipe } from './ui-module-auth-layouts.js';
import { authLayoutsVueRecipe } from './ui-module-auth-layouts-vue.js';
import { VUE_PAGE_MODULE_RECIPES } from './ui-modules-vue.js';
import { uiUserManagementRecipe } from './ui-module-user-management.js';
import { uiSettingsRbacRecipe } from './ui-module-settings-rbac.js';
import { uiStripeBillingRecipe } from './ui-module-stripe-billing.js';
import { nodeTsRecipe } from './api-node-ts.js';
import { pythonFastapiRecipe } from './api-python-fastapi.js';
import { goGinRecipe } from './api-go-gin.js';
import { restRecipe, restPythonRecipe, restGoRecipe } from './api-rest.js';
import { prismaRecipe } from './api-prisma.js';
import { sqlmodelRecipe } from './api-sqlmodel.js';
import { gormRecipe } from './api-gorm.js';
import {
  apiPermissionsRecipe,
  goPermissionsRecipe,
  pythonPermissionsRecipe,
  uiPermissionsRecipe,
} from './policy-permissions.js';
import { PYTHON_MIDDLEWARE_RECIPES } from './api-middleware-python.js';
import { GO_MIDDLEWARE_RECIPES } from './api-middleware-go.js';
import { apiUserManagementRecipe } from './api-module-user-management.js';
import { apiSettingsRbacRecipe } from './api-module-settings-rbac.js';
import { apiStripeBillingRecipe } from './api-module-stripe-billing.js';
import { MIDDLEWARE_RECIPES } from './api-middleware.js';
import {
  containerNextRecipe,
  containerNuxtRecipe,
  containerNodeApiRecipe,
  containerPythonApiRecipe,
  containerGoApiRecipe,
  containerSpaNginxRecipe,
} from './ops-container.js';
import { helmRecipe } from './ops-helm.js';
import { argocdRecipe, githubActionsRecipe } from './ops-gitops.js';

export * from './ui-nextjs-app.js';
export * from './ui-vite-react.js';
export * from './ui-nuxt.js';
export * from './ui-tailwind-shadcn.js';
export * from './ui-css-modules.js';
export * from './ui-css-modules-vue.js';
export * from './ui-tailwind-shadcn-vue.js';
export * from './ui-mui.js';
export * from './ui-vuetify.js';
export * from './ui-zustand.js';
export * from './ui-redux-toolkit.js';
export * from './ui-react-query.js';
export * from './ui-context.js';
export * from './ui-state-vue.js';
export * from './ui-module-auth-layouts.js';
export * from './ui-module-auth-layouts-vue.js';
export * from './ui-modules-vue.js';
export * from './ui-module-user-management.js';
export * from './ui-module-settings-rbac.js';
export * from './ui-module-stripe-billing.js';
export * from './api-node-ts.js';
export * from './api-python-fastapi.js';
export * from './api-go-gin.js';
export * from './api-rest.js';
export * from './api-prisma.js';
export * from './api-sqlmodel.js';
export * from './api-gorm.js';
export * from './policy-permissions.js';
export * from './api-module-user-management.js';
export * from './api-module-settings-rbac.js';
export * from './api-module-stripe-billing.js';
export * from './api-middleware.js';
export * from './api-middleware-python.js';
export * from './api-middleware-go.js';
export * from './ops-container.js';
export * from './ops-helm.js';
export * from './ops-gitops.js';

export const BUILT_IN_RECIPES: readonly Recipe[] = [
  nextjsAppRecipe,
  viteReactRecipe,
  nuxtRecipe,
  tailwindShadcnRecipe,
  cssModulesRecipe,
  // The same UiStyling value in the Vue family — see the styling contract's registry key.
  cssModulesVueRecipe,
  tailwindShadcnVueRecipe,
  muiRecipe,
  // What the `mui` option means for a Vue framework (doc 00 §5.2).
  vuetifyRecipe,
  zustandRecipe,
  // Exactly one of these four applies to any given spec — `appliesTo` keys on `ui.state` — so
  // they never collide despite all four contributing the same StoreProvider path.
  reduxToolkitRecipe,
  reactQueryRecipe,
  contextRecipe,
  // The Vue side of the same four options — four collapse onto three (doc 00 §5.1).
  ...VUE_STATE_RECIPES,
  authLayoutsRecipe,
  authLayoutsVueRecipe,
  ...VUE_PAGE_MODULE_RECIPES,
  // The two halves of userManagement. Listed apart because they belong to different layers;
  // resolution order comes from `requires` and the phase, not from this array.
  uiUserManagementRecipe,
  uiSettingsRbacRecipe,
  uiStripeBillingRecipe,
  nodeTsRecipe,
  // The second and third runtimes. Exactly one of these applies to any spec — `appliesTo` keys on
  // `api.runtime` — so they never collide despite each owning the server file for its language.
  pythonFastapiRecipe,
  goGinRecipe,
  restRecipe,
  restPythonRecipe,
  restGoRecipe,
  prismaRecipe,
  sqlmodelRecipe,
  gormRecipe,
  // The role and permission policy, emitted into whichever layers enforce it.
  apiPermissionsRecipe,
  pythonPermissionsRecipe,
  goPermissionsRecipe,
  uiPermissionsRecipe,
  apiUserManagementRecipe,
  apiSettingsRbacRecipe,
  apiStripeBillingRecipe,
  ...MIDDLEWARE_RECIPES,
  // The same five options for FastAPI. Separate recipes rather than a branch, because only the
  // option names and the resulting behaviour are shared — see the note in that module about
  // Starlette applying middleware in the reverse of the order it is added.
  ...PYTHON_MIDDLEWARE_RECIPES,
  // And for Gin, where Use() runs first-added-first — no inversion, unlike Starlette.
  ...GO_MIDDLEWARE_RECIPES,
  containerNextRecipe,
  containerNuxtRecipe,
  containerSpaNginxRecipe,
  containerNodeApiRecipe,
  containerPythonApiRecipe,
  containerGoApiRecipe,
  helmRecipe,
  argocdRecipe,
  githubActionsRecipe,
];

export function createRegistry(extra: readonly Recipe[] = []): RecipeRegistry {
  return new RecipeRegistry().registerAll([...BUILT_IN_RECIPES, ...extra]);
}
