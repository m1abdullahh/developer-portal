---
to: Dockerfile
---
# syntax=docker/dockerfile:1.7
#
# Multi-stage, distroless static, non-root. Build context is this directory: the app is
# self-contained with its own go.mod, so there is no workspace layout to account for.

# ── builder ──────────────────────────────────────────────────────────────────
FROM golang:1.25-bookworm AS builder
WORKDIR /app

ENV CGO_ENABLED=0

# Manifest first, sources second, so the module download layer caches across source-only changes.
COPY go.mod go.sum* ./

# A freshly scaffolded repository has no go.sum until your first `go mod tidy`, and `go build`
# refuses to fetch modules without one. This resolves once on the scaffold commit and becomes a
# fully reproducible download the moment you commit go.sum. Worth doing early.
RUN if [ -f go.sum ]; then go mod download; else go mod tidy; fi

COPY . .

# -trimpath so file paths in panics do not leak the build machine's layout; -s -w strips the
# symbol and DWARF tables the binary never needs in production.
RUN go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ── runner ───────────────────────────────────────────────────────────────────
# static, not base: CGO is off and pgx is pure Go, so the binary needs no libc at all. The image
# holds ca-certificates, tzdata and the binary — no shell, no package manager, nothing to pivot
# with.
FROM gcr.io/distroless/static-debian12:nonroot AS runner
WORKDIR /app

ENV ENVIRONMENT=production

COPY --from=builder --chown=nonroot:nonroot /out/api /app/api

# 65532 is distroless's `nonroot`. Declared numerically so Kubernetes can enforce runAsNonRoot,
# which has no way to resolve a username inside an image.
USER 65532:65532

EXPOSE <%= runtime.port %>

# No HEALTHCHECK: distroless has no shell to run one, and Kubernetes probes the endpoints
# directly anyway (see deploy/templates/deployment.yaml).
ENTRYPOINT ["/app/api"]
