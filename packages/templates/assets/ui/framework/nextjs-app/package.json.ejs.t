---
to: package.json
---
{
  "name": "<%= spec.meta.slug %>",
  "version": "0.1.0",
  "private": true,
  "description": <%- h.json(spec.meta.description ?? spec.meta.projectName) %>,
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
