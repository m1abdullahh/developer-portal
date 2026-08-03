---
to: .dockerignore
---
# A local .venv is the single most expensive thing that can land in a build context, and copying
# one in would also shadow the venv the builder stage creates — with packages compiled against
# whatever interpreter happens to be on the developer's machine.
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.ruff_cache/
.git/
.env
.env.*
tests/
Dockerfile
.dockerignore
