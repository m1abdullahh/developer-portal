---
to: Dockerfile
---
# syntax=docker/dockerfile:1.7
#
# Static SPA served by nginx.
#
# A Vite build produces plain files, so there is no Node process in the final image at all. That
# makes the runtime smaller and its attack surface narrower than the Next equivalent — but it also
# means every route has to be served by one HTML file, which is what the nginx config handles.

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
# Typechecks first — see the build script. Vite alone would strip types without checking them.
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runner

# The unprivileged image runs as UID 101 and listens on 8080 rather than 80, because binding a
# port below 1024 needs a capability this container deliberately does not have. Rewriting the
# stock nginx image to run rootless is possible but fiddly; using the image built for it is not.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

# No HEALTHCHECK: Kubernetes probes the endpoint itself (see the Helm chart), and a container-level
# check would duplicate that while doing nothing in a plain `docker run`.
