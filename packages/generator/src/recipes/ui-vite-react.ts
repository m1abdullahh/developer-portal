/**
 * Vite + React — a client-rendered SPA.
 *
 * The second UI framework, and the first real test of the framework contract. Every state and
 * styling recipe works here unchanged: they ask the contract where the provider root and the
 * stylesheet live rather than assuming Next's layout. If any of them had to be touched to support
 * this, the composition model would not be earning its keep.
 *
 * ── Why a separate Root component ────────────────────────────────────────────
 * Next's root layout renders `{children}` naturally, so it doubles as the provider anchor. Vite's
 * `main.tsx` renders `<App />` and has no such expression, so this recipe emits
 * `src/providers/Root.tsx` purely to be one. That keeps the `wrapProvider` codemod
 * framework-agnostic — it always edits a file that renders `{children}` exactly once.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { registerFrameworkContract } from '../framework-contract.js';
import type { Recipe } from '../types.js';

export const VITE_REACT_RECIPE_ID = 'ui.framework.vite-react';

registerFrameworkContract('vite-react', {
  recipeId: VITE_REACT_RECIPE_ID,
  providerInstall: 'jsx-provider',
  // Not main.tsx: the entry point renders <App /> and hosts no {children} for codemods to wrap.
  providerRoot: 'src/providers/Root.tsx',
  stylesheetHost: 'src/main.tsx',
  stylesheetPath: 'src/globals.css',
  sourceRoot: 'src/',
  // A Vite SPA has no routing without a router, so pages must be registered in routes.tsx.
  routing: 'declared',
  routesDir: 'pages',
  // No server components exist in a SPA — the directive would be an inert string literal.
  clientDirective: false,
  publicEnvPrefix: 'VITE_',
});

export const viteReactRecipe: Recipe = {
  id: VITE_REACT_RECIPE_ID,
  phase: 'base',
  layer: 'ui',

  appliesTo: (spec: ProjectSpec) => spec.ui?.framework === 'vite-react',

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'framework', 'vite-react'), ctx, VITE_REACT_RECIPE_ID),

  packageJson: () => ({
    dependencies: dependencyMap(['react', 'react-dom', 'react-router', 'zod']),
    devDependencies: dependencyMap([
      'vite',
      '@vitejs/plugin-react',
      'typescript',
      '@types/node',
      '@types/react',
      '@types/react-dom',
      'vitest',
      'eslint',
      '@eslint/js',
      'typescript-eslint',
    ]),
  }),

  gitignore: () => ['dist', '.vite'],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Getting Started',
    body: [
      '```bash',
      'npm install',
      'npm run dev',
      '```',
      '',
      'The app runs at [http://localhost:3000](http://localhost:3000).',
      '',
      'A single-page app with no server rendering. `npm run build` typechecks and then emits static',
      'assets to `dist/`; the container image serves those with nginx.',
      '',
      '`npm run build` runs `tsc --noEmit` first on purpose — Vite strips types without checking',
      'them, so a build alone would ship code that does not compile.',
      '',
      'Providers are composed in `src/providers/Root.tsx`, not in `main.tsx`. Anything needing to',
      'wrap the whole app belongs there.',
      '',
      'The `@/*` alias is declared twice, in `tsconfig.json` and `vite.config.ts`. Both are',
      'required: TypeScript uses its copy to typecheck and Vite uses its own to resolve at build',
      'time, so removing either produces an error the other cannot explain.',
    ].join('\n'),
  }),

  postInstall: () => ['npm install', 'npm run dev'],
};
