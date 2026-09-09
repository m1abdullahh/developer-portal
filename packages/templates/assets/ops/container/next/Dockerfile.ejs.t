---
to: Dockerfile
---
# syntax=docker/dockerfile:1.7
#
# Multi-stage, distroless, non-root. Relies on `output: 'standalone'` in next.config.ts —
# without it the runner stage has no server.js and the container exits immediately.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` needs a lockfile, and a freshly scaffolded repository has none until your first
# `npm install`. The glob above copies one only if it exists, so this falls back to `npm install`
# on the scaffold commit and upgrades itself to a reproducible `npm ci` build the moment you
# commit a lockfile. Committing one is worth doing early.
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts; fi

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
<% if (publicEnv.length > 0) { -%>
# Browser-visible configuration is compiled into the bundle by the build, so it has to exist
# here, at image build time — a value set on the running container arrives too late to matter.
# Each key defaults to the value documented in .env.example. Override per environment with
# `--build-arg KEY=value`; cd.yml passes repository variables of the same names. An empty
# override counts as "not provided" and falls back to the default, so an unset variable cannot
# fail the build's own validation.
<% for (const v of publicEnv) { -%>
ARG <%= v.key %>="<%= v.example %>"
<% } -%>
RUN <% for (const v of publicEnv) { %>[ -n "$<%= v.key %>" ] || export <%= v.key %>="<%= v.example %>"; <% } %>\
    npm run build
<% } else { -%>
RUN npm run build
<% } -%>

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone bundles only the modules actually reached, so node_modules is NOT copied.
# `static` and `public` are separate because standalone deliberately excludes them — miss
# either and the app serves with no CSS or images while returning 200 for every page.
COPY --from=builder --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=builder --chown=nonroot:nonroot /app/public ./public

USER 65532:65532

EXPOSE 3000

CMD ["server.js"]
