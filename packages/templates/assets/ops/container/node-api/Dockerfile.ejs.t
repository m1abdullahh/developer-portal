---
to: Dockerfile
---
# syntax=docker/dockerfile:1.7
#
# Multi-stage, distroless, non-root. Build context is this directory: each app is
# self-contained with its own package.json, so no workspace hoisting to account for.

# ── deps ─────────────────────────────────────────────────────────────────────
# Separated from the build so dependency layers cache on source-only changes. Copying the
# whole tree first would invalidate node_modules on every edit and make each build a full
# reinstall.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` needs a lockfile, and a freshly scaffolded repository has none until your first
# `npm install`. This falls back to `npm install` on the scaffold commit and upgrades itself to a
# reproducible `npm ci` build the moment you commit a lockfile. Worth doing early.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --ignore-scripts; else npm install --omit=dev --ignore-scripts; fi

# ── builder ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# Same lockfile fallback as the deps stage above.
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts; fi
COPY . .
<% if (spec.api.orm === 'prisma') { -%>
# Prisma's client is generated code, not a published package — without this the image
# contains imports that resolve to nothing and the container crashes on first query.
RUN npx prisma generate
<% } -%>
RUN npm run build

# ── runner ───────────────────────────────────────────────────────────────────
# Distroless: no shell, no package manager, no coreutils. A compromised process has almost
# nothing to pivot with, and the image is a fraction of the size.
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps    --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/package.json ./package.json
<% if (spec.api.orm === 'prisma') { -%>
COPY --from=builder --chown=nonroot:nonroot /app/src/generated ./src/generated
COPY --from=builder --chown=nonroot:nonroot /app/prisma ./prisma
<% } -%>

# 65532 is distroless's `nonroot`. Declared numerically so Kubernetes can enforce
# runAsNonRoot, which cannot verify a username.
USER 65532:65532

EXPOSE 3001

# No HEALTHCHECK: distroless has no shell to run one, and Kubernetes probes the endpoints
# directly anyway (see deploy/templates/deployment.yaml).
CMD ["dist/index.js"]
