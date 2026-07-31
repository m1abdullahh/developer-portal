---
to: Dockerfile
---
# syntax=docker/dockerfile:1.7
#
# Multi-stage, distroless, non-root.
#
# Nuxt builds to a Nitro server under `.output/`, and Nitro bundles every dependency it actually
# reaches into that directory. So unlike the Next and Fastify images there is no `node_modules` to
# carry into the runner — copying `.output` is the whole runtime.

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` needs a lockfile, and a freshly scaffolded repository has none until your first
# `npm install`. This falls back on the scaffold commit and upgrades itself to a reproducible
# `npm ci` build the moment you commit a lockfile.
#
# `--ignore-scripts` is deliberately ABSENT here, unlike the other images: Nuxt's `postinstall`
# runs `nuxt prepare`, which writes the generated types the build needs. Skipping it fails the
# build with missing `#imports` rather than anything that names the cause.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

# ── runner ───────────────────────────────────────────────────────────────────
# Distroless: no shell, no package manager, no coreutils. A compromised process has almost
# nothing to pivot with, and the image is a fraction of the size.
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

COPY --from=builder --chown=nonroot:nonroot /app/.output ./

# 65532 is distroless's `nonroot`. Declared numerically so Kubernetes can enforce
# runAsNonRoot, which cannot verify a username.
USER 65532:65532

EXPOSE 3000

# No HEALTHCHECK: distroless has no shell to run one, and Kubernetes probes /api/health
# directly anyway (see deploy/templates/deployment.yaml).
CMD ["server/index.mjs"]
