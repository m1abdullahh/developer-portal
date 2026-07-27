/**
 * Enforces the dependency rules from docs/plan/00-architecture.md §2:
 *
 *   packages/core       depends on nothing internal
 *   packages/generator  depends only on core + templates
 *   apps/*              may depend on anything
 *   no cycles, anywhere
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make build order undefined and break incremental builds.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-leaf',
      severity: 'error',
      comment:
        'packages/core is the shared contract layer (ProjectSpec). It must not depend on any ' +
        'other internal package, or the contract becomes coupled to an implementation.',
      from: { path: '^packages/core/' },
      to: { path: '^(packages/(?!core/)|apps/)' },
    },
    {
      name: 'generator-scope',
      severity: 'error',
      comment:
        'packages/generator may only reach for core and templates. Depending on vcs or queue ' +
        'would make generation untestable without external services.',
      from: { path: '^packages/generator/' },
      to: { path: '^packages/(?!core/|templates/|generator/)' },
    },
    {
      name: 'no-packages-to-apps',
      severity: 'error',
      comment: 'Packages must never depend on apps — that inverts the dependency direction.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Unreachable module — likely dead code left behind.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          // Config files are loaded by their tool, never imported.
          '\\.config\\.(js|cjs|mjs|ts)$',
          // Next.js App Router conventions are entry points the framework resolves by
          // filename — nothing imports them, and that is correct.
          'apps/portal/app/.*\\/?(page|layout|route|loading|error|not-found|template|default)\\.tsx?$',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Production code must not import a devDependency — it will be absent at runtime.',
      from: {
        path: '^(packages|apps)/',
        pathNot: [
          '\\.(test|spec)\\.tsx?$',
          // Build-time config runs under the CLI that owns it, so importing that CLI's
          // types from devDependencies is correct (e.g. prisma.config.ts -> prisma/config).
          '\\.config\\.(js|cjs|mjs|ts)$',
        ],
      },
      to: { dependencyTypes: ['npm-dev'], pathNot: '^node_modules/@types/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // `generated/` holds the Prisma client, which we do not author and which is internally
    // circular by design. Cruising it produces only noise we cannot act on.
    exclude: { path: '(^|/)(dist|\\.next|\\.turbo|coverage|generated)/' },
    tsPreCompilationDeps: true,
    // Maps @idp/* to source rather than dist/, so cross-package edges are actually visible
    // to the architectural rules above. See the comment in that file.
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
