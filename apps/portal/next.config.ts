import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for the distroless container stage to run without node_modules — the same
  // setting the generated Next.js projects use (doc 04 §1.1). Dogfooding it here means the
  // portal's own Dockerfile exercises the pattern we ship.
  output: 'standalone',

  // Workspace packages ship as compiled dist/, so no transpilation is needed. Listed
  // explicitly so a future ESM/CJS mismatch surfaces here rather than at runtime.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-better-sqlite3'],

  typedRoutes: true,

  // Opt-in, for building beside a running server. `next build` rewrites its output directory in
  // place, and a `next start` serving from that directory starts failing requests halfway
  // through — so a build that must not disturb a live portal goes somewhere else:
  // `NEXT_DIST_DIR=.next-verify next build`. Unset, this is `.next` as always.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
