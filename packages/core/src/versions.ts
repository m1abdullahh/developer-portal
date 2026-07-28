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

  // ── UI: styling ───────────────────────────────────────────────────────────
  tailwindcss: '4.3.3',

  // ── UI: state ─────────────────────────────────────────────────────────────
  zustand: '5.0.14',
  '@tanstack/react-query': '5.101.4',

  // ── UI: forms ─────────────────────────────────────────────────────────────
  'react-hook-form': '7.83.0',
  '@hookform/resolvers': '5.5.7',

  // ── API: Node runtime (P1 spine) ──────────────────────────────────────────
  fastify: '5.10.0',
  '@fastify/swagger': '9.8.1',
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
