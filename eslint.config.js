import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.d.ts',
      // Template assets are rendered, not linted — they are intentionally invalid TS
      // until EJS interpolation runs. The generated output is linted instead (doc 08 §4).
      'packages/templates/assets/**',
      'tests/golden/__snapshots__/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
    },
  },

  // Test files may use `any` and console freely.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Console programs. Printing to stdout is these files' entire job, not a stray debug
  // statement — `scripts/` holds the smoke harness and the version checker, both of which
  // exist to report to a terminal.
  {
    files: ['packages/*/src/cli/**/*.ts', 'apps/worker/src/**/*.ts', 'scripts/**/*.{mjs,js,ts}'],
    rules: { 'no-console': 'off' },
  },

  prettier,
);
