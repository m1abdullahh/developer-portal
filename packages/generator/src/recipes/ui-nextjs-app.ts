/**
 * Next.js App Router — the P1 spine's UI base recipe.
 *
 * Owns the root files (package.json, tsconfig, next.config, app/layout.tsx). Every other UI
 * recipe adds to those via merge contributions or codemods rather than rewriting them, which
 * is what keeps this recipe ignorant of which features are selected.
 *
 * Note it does NOT emit app/globals.css even though layout.tsx imports it — the styling recipe
 * owns that file. Styling is a required field on the spec, so exactly one styling recipe always
 * applies and the import always resolves.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { registerFrameworkContract } from '../framework-contract.js';
import type { Recipe } from '../types.js';

export const NEXTJS_APP_RECIPE_ID = 'ui.framework.nextjs-app';

/**
 * Declares where recipes layered on top of this one should apply themselves.
 *
 * Registered at module load, beside the recipe it describes, so this framework's file layout stays
 * knowledge this module owns rather than something every state and styling recipe has to know.
 *
 * The root layout satisfies the `{children}`-exactly-once requirement naturally, so it serves as
 * both the provider root and the stylesheet host.
 */
registerFrameworkContract('nextjs-app', {
  recipeId: NEXTJS_APP_RECIPE_ID,
  providerRoot: 'app/layout.tsx',
  stylesheetHost: 'app/layout.tsx',
  stylesheetPath: 'app/globals.css',
  // App Router keeps components/ and lib/ at the repository root.
  sourceRoot: '',
});

export const nextjsAppRecipe: Recipe = {
  id: NEXTJS_APP_RECIPE_ID,
  phase: 'base',
  layer: 'ui',

  appliesTo: (spec: ProjectSpec) => spec.ui?.framework === 'nextjs-app',

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'framework', 'nextjs-app'), ctx, NEXTJS_APP_RECIPE_ID),

  packageJson: () => ({
    dependencies: dependencyMap(['next', 'react', 'react-dom', 'zod']),
    devDependencies: dependencyMap([
      'typescript',
      '@types/node',
      '@types/react',
      '@types/react-dom',
      'eslint',
      // Required by the generated eslint.config.mjs. ESLint alone cannot lint TypeScript, and a
      // flat config that imports a package the project does not declare fails at load.
      '@eslint/js',
      'typescript-eslint',
      'prettier',
      'vitest',
    ]),
  }),

  gitignore: () => [
    '.next/',
    'out/',
    'next-env.d.ts',
    '*.tsbuildinfo',
    '.vercel',
    'coverage/',
    '.turbo/',
  ],

  readme: (ctx) => ({
    order: README_ORDER.gettingStarted,
    heading: 'Getting Started',
    body: [
      '```bash',
      'npm install',
      'cp .env.example .env',
      'npm run dev',
      '```',
      '',
      `The app runs at http://localhost:3000.`,
      '',
      `Built with Next.js (App Router). Routes live in \`app/\`; \`app/api/health\` backs the`,
      `Kubernetes liveness probe, so keep that path stable.`,
      ...(ctx.spec.ops.container.strategy !== 'none'
        ? [
            '',
            "`next.config.ts` sets `output: 'standalone'` because the container image copies",
            '`.next/standalone` and runs without `node_modules`. Removing it breaks the image',
            'build rather than the dev server, so the failure appears far from the cause.',
          ]
        : []),
    ].join('\n'),
  }),

  postInstall: () => ['npm install', 'npm run dev'],
};
