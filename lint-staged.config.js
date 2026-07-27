/**
 * Runs on staged files only, via the pre-commit hook.
 *
 * Order matters: Prettier writes first, then ESLint --fix. Reversed, ESLint's fixes could land
 * in a shape Prettier then rewrites, leaving the commit with unformatted content that CI's
 * format:check rejects.
 *
 * Generated and template files need no exclusions here — Prettier honours .prettierignore and
 * ESLint honours its own `ignores` for explicitly-passed paths. `--no-warn-ignored` stops ESLint
 * from failing the commit merely because a staged file was one of those ignored paths.
 */

export default {
  '*.{ts,tsx,js,jsx,mjs,cjs}': [
    'prettier --write',
    'eslint --fix --no-warn-ignored --max-warnings=0',
  ],
  '*.{json,md,yml,yaml,css}': ['prettier --write'],
};
