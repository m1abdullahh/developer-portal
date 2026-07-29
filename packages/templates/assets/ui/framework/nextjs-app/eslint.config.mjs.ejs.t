---
to: eslint.config.mjs
---
/**
 * ESLint flat config.
 *
 * `.mjs` rather than `.js` deliberately: this file uses ESM `import`, and a Next.js project's
 * package.json has no `"type": "module"`, so a plain `.js` config would be parsed as CommonJS
 * and fail at the first import.
 *
 * ESLint 9 removed `.eslintrc` support entirely — without a flat config present, `eslint .`
 * exits 2 with "couldn't find an eslint.config file" rather than linting nothing, so CI fails
 * before it reaches your code.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', '.next/**', 'dist/**', 'coverage/**', 'next-env.d.ts'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // TypeScript already proves every identifier resolves, and `no-undef` cannot see browser
      // or Node globals without a `globals` package. Leaving it on reports `document` and
      // `process` as undefined in correct code.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
