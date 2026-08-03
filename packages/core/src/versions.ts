/**
 * Versions emitted INTO generated projects.
 *
 * Deliberately separate from this monorepo's own dependencies (see docs/VERSIONS.md): a
 * generated Fastify service should not be forced to move because the portal upgraded.
 *
 * This manifest is the reason generation is deterministic. Resolving "latest" at generation
 * time would make two runs of the same spec produce different lockfiles, which would break
 * every golden-file test (doc 05 §6). Renovate bumps this file via PR — and the resulting
 * golden diff *is* the review.
 *
 * All values verified against the npm registry on 2026-07-28.
 */

export const GENERATED_VERSIONS = {
  // ── Shared ────────────────────────────────────────────────────────────────
  typescript: '6.0.3',
  zod: '4.4.3',
  vitest: '4.1.10',
  eslint: '10.8.0',
  // ESLint 9 removed .eslintrc, so a generated project needs a flat config — and a flat config
  // needs these two to say anything useful about TypeScript. Same versions this monorepo runs.
  '@eslint/js': '10.0.1',
  'typescript-eslint': '8.65.0',
  prettier: '3.9.6',
  '@types/node': '22.20.1',

  // ── UI: Next.js (P1 spine) ────────────────────────────────────────────────
  next: '16.2.12',
  react: '19.2.8',
  'react-dom': '19.2.8',
  '@types/react': '19.2.17',
  '@types/react-dom': '19.2.3',

  // ── UI: Vite + React (P2) ─────────────────────────────────────────────────
  vite: '8.1.5',
  '@vitejs/plugin-react': '6.0.4',
  // A Vite SPA has no routing of its own, so page modules would have nowhere to register a route.
  // v8 peers react >=19.2.7, satisfied by the pinned 19.2.8. Verified on 2026-07-30.
  'react-router': '8.3.0',

  // ── UI: Nuxt (P2.4) ───────────────────────────────────────────────────────
  // Nuxt 4 moved the application source under `app/`, which is why the framework contract's
  // sourceRoot differs from Next's. Verified on 2026-07-31.
  nuxt: '4.5.1',
  vue: '3.5.40',
  // `nuxt typecheck` shells out to vue-tsc — tsc alone cannot read a `.vue` single-file
  // component, so the generated typecheck script would pass while ignoring every template.
  'vue-tsc': '3.3.9',
  // ESLint cannot parse `.vue` either; the parser and plugin are what make `eslint .` see
  // template expressions rather than skipping the files.
  'eslint-plugin-vue': '10.10.0',
  'vue-eslint-parser': '10.4.1',

  // ── UI: Vuetify (P2.4, the MUI substitute for Vue) ────────────────────────
  vuetify: '4.1.7',
  // The Vite plugin, not vuetify-nuxt-module: that module's only release supporting Vuetify 4 is
  // a release candidate, and an RC has no place in a scaffold teams take to production. This is
  // the stable path Vuetify's own Nuxt guide documents — it handles component tree-shaking and
  // style resolution, which a plain plugin file cannot. Verified on 2026-08-01.
  'vite-plugin-vuetify': '2.1.3',

  // ── UI: styling ───────────────────────────────────────────────────────────
  tailwindcss: '4.3.3',
  // Tailwind 4 dropped its PostCSS-only setup: Next uses '@tailwindcss/postcss', and anything on
  // Vite — including Nuxt — uses this. Same version as the compiler itself, which Tailwind ships
  // in lockstep. Verified on 2026-08-01.
  '@tailwindcss/vite': '4.3.3',
  // MUI 9 peers React ^19 and both emotion packages, which are its default style engine.
  // `@mui/material-pigment-css` is also listed as a peer but is optional — it is the alternative
  // zero-runtime engine, and installing both would ship two styling systems in one project.
  // Verified against the registry on 2026-07-30.
  '@mui/material': '9.2.0',
  '@emotion/react': '11.14.0',
  '@emotion/styled': '11.14.1',

  // ── UI: state ─────────────────────────────────────────────────────────────
  zustand: '5.0.14',
  '@tanstack/react-query': '5.101.4',
  // Redux Toolkit peers react-redux ^9, and react-redux 9 peers React ^18||^19 — both satisfied
  // by the pinned React 19.2.8. Verified against the registry on 2026-07-30.
  '@reduxjs/toolkit': '2.12.0',
  'react-redux': '9.3.0',

  // ── UI: forms ─────────────────────────────────────────────────────────────
  'react-hook-form': '7.83.0',
  '@hookform/resolvers': '5.5.7',

  // ── API: Node runtime (P1 spine) ──────────────────────────────────────────
  fastify: '5.10.0',
  '@fastify/swagger': '9.8.1',
  '@scalar/fastify-api-reference': '1.63.0',
  'fastify-type-provider-zod': '7.0.0',
  'zod-to-json-schema': '3.25.2',
  pino: '10.3.1',
  'pino-pretty': '13.1.3',
  tsx: '4.23.1',
  '@fastify/cors': '11.3.0',
  '@fastify/rate-limit': '11.1.0',
  '@fastify/jwt': '10.2.1',

  // ── API: data ─────────────────────────────────────────────────────────────
  prisma: '7.9.1',
  '@prisma/client': '7.9.1',
  '@prisma/adapter-pg': '7.9.1',
  pg: '8.22.0',
  '@types/pg': '8.20.0',

  // ── API: billing (P2 stripeBilling) ───────────────────────────────────────
  // The SDK is not optional for this module: verifying a webhook signature means recomputing an
  // HMAC over the raw body against a tolerance window, and `stripe.webhooks.constructEvent` is
  // the implementation everyone should be using rather than a hand-rolled one.
  // Verified on 2026-07-31.
  stripe: '22.4.0',
} as const satisfies Record<string, string>;

export type GeneratedPackage = keyof typeof GENERATED_VERSIONS;

/**
 * Looks up a pinned version, failing loudly if the package is unknown.
 *
 * Templates must never inline a version literal — an unpinned dependency silently
 * reintroduces non-determinism, and the golden tests would only catch it much later.
 */
export function version(pkg: GeneratedPackage): string {
  const v = GENERATED_VERSIONS[pkg];
  if (!v) {
    throw new Error(
      `No pinned version for "${pkg}". Add it to packages/core/src/versions.ts and docs/VERSIONS.md ` +
        `rather than inlining a version in a template.`,
    );
  }
  return v;
}

/** Builds a dependency map for a package.json, resolving every name through the manifest. */
export function dependencyMap(packages: readonly GeneratedPackage[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pkg of packages) {
    out[pkg] = version(pkg);
  }
  return out;
}
