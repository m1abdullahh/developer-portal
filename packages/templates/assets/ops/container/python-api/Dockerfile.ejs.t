---
to: Dockerfile
---
# syntax=docker/dockerfile:1.7
#
# Multi-stage, distroless, non-root. Build context is this directory: each app is
# self-contained with its own pyproject.toml, so there is no workspace layout to account for.

# ── builder ──────────────────────────────────────────────────────────────────
# 3.11-slim-bookworm, matched deliberately to the runtime image. gcr.io/distroless/python3-debian12
# ships CPython 3.11, and a virtualenv built against any other minor version copies across fine and
# then fails to import anything with a compiled extension — the ABI tag in the .so filename no
# longer matches. That failure appears at container start, never at build time.
FROM python:3.11-slim-bookworm AS builder

# uv from its own distroless image rather than `pip install uv`: one COPY, no pip resolution step,
# and the version is pinned by the tag instead of by whatever pip picks today.
COPY --from=ghcr.io/astral-sh/uv:<%= uvVersion %> /uv /usr/local/bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Manifest first, sources second, so the dependency layer caches across source-only changes.
# Copying the whole tree up front would reinstall every dependency on every edit.
COPY pyproject.toml uv.lock* ./

# `--frozen` fails rather than silently re-resolving when uv.lock is out of date with
# pyproject.toml, which is what makes this build reproducible. A freshly scaffolded repository has
# no lockfile until your first `uv sync`, so this falls back to resolving once and upgrades itself
# to a locked build the moment you commit uv.lock. Worth doing early.
#
# `--no-dev` keeps ruff and pytest out of the image entirely — every package in the final layer is
# attack surface.
RUN if [ -f uv.lock ]; then \
      uv sync --frozen --no-dev --no-install-project; \
    else \
      uv sync --no-dev --no-install-project; \
    fi

COPY . .

# ── runner ───────────────────────────────────────────────────────────────────
# Distroless: no shell, no package manager, no pip. A compromised process has almost nothing to
# pivot with.
FROM gcr.io/distroless/python3-debian12:nonroot AS runner
WORKDIR /app

ENV ENVIRONMENT=production \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # There is no shell to `activate` a virtualenv, and no `python` on PATH to honour its
    # pyvenv.cfg. Pointing PYTHONPATH at site-packages directly is how the interpreter in this
    # image finds the dependencies installed in the builder.
    PYTHONPATH=/app/.venv/lib/python3.11/site-packages

COPY --from=builder --chown=nonroot:nonroot /app/.venv /app/.venv
COPY --from=builder --chown=nonroot:nonroot /app/app /app/app

# 65532 is distroless's `nonroot`. Declared numerically so Kubernetes can enforce runAsNonRoot,
# which has no way to resolve a username inside an image.
USER 65532:65532

EXPOSE <%= runtime.port %>

# The base image's ENTRYPOINT is already the interpreter, so this is its argv. Stated explicitly
# rather than relying on that default, because a future base-image change would otherwise turn
# `-m app` into a filename the container tries to execute.
ENTRYPOINT ["/usr/bin/python3.11"]

# No HEALTHCHECK: distroless has no shell to run one, and Kubernetes probes the endpoints directly
# anyway (see deploy/templates/deployment.yaml).
CMD ["-m", "app"]
