---
to: package.json
---
{
  "name": "<%= spec.meta.slug %>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": <%- h.json(spec.meta.description ?? spec.meta.projectName) %>,
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
<%# `nuxt prepare` writes .nuxt/tsconfig.json and the generated types for auto-imports. Without it
    a fresh clone fails to typecheck and every editor reports `useRuntimeConfig` as undefined —
    the files it produces are gitignored, so they exist only after this has run. -%>
    "postinstall": "nuxt prepare",
<%# The built output is a Nitro server, not static files: `node .output/server/index.mjs`, reading
    PORT from the environment. `nuxt preview` would also work but adds a wrapper process, and the
    container runs the server directly. -%>
    "start": "node .output/server/index.mjs",
    "lint": "eslint .",
<%# vue-tsc, not tsc. `tsc` cannot read a single-file component at all, so it would typecheck the
    .ts files and silently skip every template expression in the project. -%>
    "typecheck": "nuxt typecheck",
    "test": "vitest run --passWithNoTests"
  }
}
