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
    "dev": "vite",
<%# Typecheck before building: Vite strips types without checking them, so `vite build` alone
    would happily ship code that does not compile. `tsc --noEmit` rather than `tsc -b` because a
    single-config project needs no build mode, and `-b` would demand project references. -%>
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "start": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  }
}
