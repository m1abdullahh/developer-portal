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
};

export default nextConfig;
