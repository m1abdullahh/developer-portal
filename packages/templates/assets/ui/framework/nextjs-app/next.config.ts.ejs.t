---
to: next.config.ts
---
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
<% if (spec.ops.container.strategy !== 'none') { -%>
  // Required by the distroless container stage: it copies .next/standalone and runs without
  // node_modules present. Removing this breaks the image build, not the dev server, so the
  // failure appears far from the cause.
  output: 'standalone',
<% } -%>
  typedRoutes: true,
};

export default nextConfig;
