/**
 * Auth layouts for Vue — the first page module ported across the family boundary.
 *
 * ── Why this is a separate recipe and not a branch ──────────────────────────
 * The React module branches on `framework.routing` to serve both Next and Vite from one set of
 * `.tsx` files, because those two frameworks differ only in *where* a page is registered. Vue
 * differs in what a page *is*: a single-file component with a `<template>`, a `<slot>`-based
 * primitive API and `v-model` instead of `value`/`onChange`. There is no expression that turns
 * one into the other, so this is a second implementation rather than a third branch.
 *
 * What does carry across is everything that matters: the routes, the field names, the autocomplete
 * hints, and the behaviour worth preserving — see the account-enumeration note in
 * `forgot-password.vue`, which is the same decision the React version documents.
 *
 * ── No routing codemod ──────────────────────────────────────────────────────
 * Nuxt is `file-based`, so dropping a page under `app/pages/` is the whole registration. The React
 * module needs a codemod for Vite's declared route table; there is nothing equivalent here.
 */

import { templatePath } from '@idp/templates';
import { isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import type { Recipe } from '../types.js';

export const AUTH_LAYOUTS_VUE_RECIPE_ID = 'ui.module.auth-layouts-vue';

export const authLayoutsVueRecipe: Recipe = {
  id: AUTH_LAYOUTS_VUE_RECIPE_ID,
  // 'integration', like its React counterpart: the styling recipe must have emitted the primitives
  // these pages render before this runs, and phase ordering is what guarantees that.
  phase: 'integration',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.modules.authLayouts === true && isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'modules', 'auth-layouts-vue'),
      ctx,
      AUTH_LAYOUTS_VUE_RECIPE_ID,
      { framework: frameworkContract(ctx.spec) },
    ),

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Authentication pages',
    body: [
      'Sign-in, registration and password reset at `/sign-in`, `/sign-up` and `/forgot-password`.',
      'They are files under `app/pages/`, so Nuxt routes them with nothing to register.',
      '',
      '**The submit handlers are stubs.** Authentication belongs to your API, and guessing at its',
      'shape would have produced code that looks finished and does nothing. Each one marks the',
      'place to call yours.',
      '',
      'The pages use only the `Ui*` primitives, never Vuetify or a stylesheet directly — that is',
      'what lets them render under all three Vue styling systems unchanged. Their own `<style',
      'scoped>` blocks carry layout only, no colour.',
      '',
      '**One behaviour to keep:** the reset form reports success even for an unknown address.',
      'Distinguishing the two turns it into an account-enumeration oracle, letting anyone discover',
      'which emails are registered.',
    ].join('\n'),
  }),
};
