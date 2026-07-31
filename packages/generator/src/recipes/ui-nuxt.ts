/**
 * Nuxt 4 — the third framework, and the first that is not React (doc 02, doc 00 §5.1–5.2).
 *
 * ── What this recipe is, and what it is not ─────────────────────────────────
 * It is the base: a Nuxt application that installs, lints, typechecks, builds and boots. It is
 * NOT yet a complete option — Vuetify, Pinia, vue-query and the four page modules in Vue all
 * remain, and every React styling, state and page-module recipe declines for a Vue framework via
 * `isVueFramework`. A project generated with Nuxt today gets a working shell and nothing layered
 * on it, which is why `nuxt` stays out of the coverage ledger until those land.
 *
 * Shipping the base alone is deliberate. It proves the framework contract stretches to a
 * non-React framework before anything is built against that assumption, and the answer was that
 * it did not: `providerRoot` and the `wrapJsxChildren` codemod are meaningless here, so the
 * contract gained `providerInstall` to say so rather than every future recipe guessing.
 *
 * ── The three things that differ most from the React frameworks ─────────────
 * Source lives under `app/`, not the repository root — Nuxt 4 moved it, and `sourceRoot` reports
 * it so shared templates need no branch.
 *
 * Providers are not wrapped. Pinia is a Nuxt module and vue-query is a plugin file; both install
 * by naming themselves in `nuxt.config.ts` or dropping a file in `app/plugins/`. There is nothing
 * for a JSX codemod to wrap, and a `.vue` file is not TypeScript, so ts-morph could not act on it
 * even if there were.
 *
 * Public configuration is `runtimeConfig.public`, read at request time, rather than a build-time
 * `NEXT_PUBLIC_` substitution. `NUXT_PUBLIC_*` environment variables override it, so one built
 * image runs in every environment — which the other two frameworks cannot do.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { registerFrameworkContract } from '../framework-contract.js';
import { README_ORDER } from '../merge/readme.js';
import type { Recipe } from '../types.js';

export const NUXT_RECIPE_ID = 'ui.framework.nuxt';

registerFrameworkContract('nuxt', {
  recipeId: NUXT_RECIPE_ID,
  // Nothing wraps the app; recipes register a Nuxt module or plugin instead.
  providerInstall: 'nuxt-plugin',
  // Recorded for completeness and read by nothing: `providerInstall` is what recipes branch on.
  providerRoot: 'app/app.vue',
  // The stylesheet is named in nuxt.config.ts's `css` array rather than imported by a component.
  stylesheetHost: 'nuxt.config.ts',
  stylesheetPath: 'app/assets/css/globals.css',
  // Nuxt 4 moved the application source under app/.
  sourceRoot: 'app/',
  // Anything under app/pages/ becomes a route with no registration step.
  routing: 'file-based',
  routesDir: 'pages',
  // No server components, and no directive of any kind — a Vue SFC decides on the server or the
  // client through Nuxt's own conventions.
  clientDirective: false,
  publicEnvPrefix: 'NUXT_PUBLIC_',
});

export const nuxtRecipe: Recipe = {
  id: NUXT_RECIPE_ID,
  phase: 'base',
  layer: 'ui',

  appliesTo: (spec: ProjectSpec) => spec.ui?.framework === 'nuxt',

  files: (ctx) => loadTemplateDir(templatePath('ui', 'framework', 'nuxt'), ctx, NUXT_RECIPE_ID),

  packageJson: () => ({
    dependencies: dependencyMap(['nuxt', 'vue']),
    devDependencies: dependencyMap([
      'typescript',
      'vue-tsc',
      'eslint',
      '@eslint/js',
      'typescript-eslint',
      'eslint-plugin-vue',
      'vue-eslint-parser',
      'vitest',
      '@types/node',
    ]),
  }),

  // `.nuxt` and `.output` are generated on every install and build. Committing either is a large,
  // constantly-conflicting diff of machine output.
  gitignore: () => ['.nuxt/', '.output/', '.data/', 'dist/', 'coverage/'],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Web (Nuxt)',
    body: [
      '```bash',
      'npm run dev      # http://localhost:3000',
      'npm run build    # Nitro server into .output/',
      'npm start        # node .output/server/index.mjs',
      '```',
      '',
      'Source lives under `app/` — Nuxt 4 moved it there. `app/pages/` **is** the route table:',
      'adding `app/pages/about.vue` adds `/about` with nothing to register.',
      '',
      '**Worth knowing:**',
      '',
      '`postinstall` runs `nuxt prepare`, which writes `.nuxt/tsconfig.json` and the types for',
      'every auto-import. That directory is gitignored, so without it a fresh clone fails to',
      'typecheck and your editor reports `useRuntimeConfig` as undefined.',
      '',
      '`npm run typecheck` runs `nuxt typecheck`, which uses vue-tsc. Plain `tsc` cannot read a',
      'single-file component and would skip every template expression in the project while',
      'reporting success.',
      '',
      'Public configuration goes in `runtimeConfig.public` and is overridden at runtime by',
      '`NUXT_PUBLIC_*` variables — so one built image runs in every environment. It is serialised',
      'into the page and readable by anyone, so it must never hold a secret.',
      '',
      '**Not yet generated for Nuxt:** the design system, the state library and the page modules.',
      'Those recipes exist for React only so far; a Nuxt project scaffolds as a working shell.',
    ].join('\n'),
  }),
};
