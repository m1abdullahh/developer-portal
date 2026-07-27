/**
 * Conventional Commits, enforced by the commit-msg hook.
 *
 * Scopes match the workspace layout so `git log --grep "(core)"` is a useful query, and so a
 * future changelog can be grouped by the package a change actually touched.
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // workspaces
        'core',
        'db',
        'generator',
        'templates',
        'vcs',
        'queue',
        'portal',
        'worker',
        // cross-cutting
        'wizard',
        'catalog',
        'ci',
        'deps',
        'docs',
        'repo',
      ],
    ],
    // Scope is encouraged but not required — repo-wide changes legitimately have none.
    'scope-empty': [0],
    // 100 to match Prettier's printWidth, rather than the default 72.
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 100],
  },
};
