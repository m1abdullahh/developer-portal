---
to: vite.config.ts
---
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Mirrors the `@/*` path in tsconfig.json. Both are required and neither implies the other:
      // TypeScript uses its own for typechecking, Vite uses this one to resolve at build time, so
      // omitting either produces an error the other cannot explain.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 3000,
    // Binds all interfaces so the dev server is reachable from a container or another device.
    host: true,
  },

  preview: {
    port: 3000,
    host: true,
  },

  build: {
    outDir: 'dist',
    // Fail rather than silently ship an unminified bundle if a sourcemap step goes wrong.
    sourcemap: true,
  },
});
