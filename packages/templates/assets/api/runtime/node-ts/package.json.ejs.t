---
to: package.json
---
{
  "name": "<%= spec.meta.slug %><%= spec.ui ? '-api' : '' %>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": <%- h.json(`API for ${spec.meta.projectName}`) %>,
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
