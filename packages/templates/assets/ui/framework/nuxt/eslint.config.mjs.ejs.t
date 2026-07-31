---
to: eslint.config.mjs
---
/**
 * ESLint flat config for a Nuxt project.
 *
 * ESLint 9 removed `.eslintrc` support entirely — without a flat config present, `eslint .` exits
 * 2 with "couldn't find an eslint.config file" rather than linting nothing, so CI fails before it
 * reaches your code.
 *
 * ── Why the parser arrangement looks like this ──────────────────────────────
 * A `.vue` file is not JavaScript. `vue-eslint-parser` reads the whole single-file component and
 * hands the `<script>` block to whatever `parserOptions.parser` names — here, the TypeScript
 * parser. Naming the TypeScript parser directly instead would fail on the first `<template>`, and
 * omitting the plugin entirely means `eslint .` skips every `.vue` file without saying so.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  {
    ignores: ['node_modules/**', '.nuxt/**', '.output/**', 'dist/**', 'coverage/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 2023,
        sourceType: 'module',
      },
    },
  },

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // TypeScript already proves every identifier resolves, and `no-undef` cannot see browser
      // globals or Nuxt's auto-imports — leaving it on reports `useRuntimeConfig` and `document`
      // as undefined in correct code.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Nuxt's own convention: `app.vue`, `error.vue` and every file under `pages/` are routes,
      // and a route named `index` or `settings` is correct. The rule exists to stop component
      // names colliding with HTML elements, which route files never do.
      'vue/multi-word-component-names': 'off',
    },
  },
);
