---
to: pyproject.toml
---
[project]
name = "<%= spec.meta.slug %>"
version = "0.1.0"
description = "<%= spec.meta.description || spec.meta.slug %>"
# 3.11 rather than the newest release, and this is a deployment constraint rather than a
# preference: the runtime image is gcr.io/distroless/python3-debian12, whose interpreter is 3.11.
# A virtualenv built against a different minor version copies in fine and then fails to import any
# package with a compiled extension, because the ABI tag in the .so filename no longer matches.
requires-python = ">=3.11"

dependencies = [
<% deps.forEach(function (dep) { -%>
  "<%= dep %>",
<% }); -%>
  # >>> idp:dependencies
  # <<< idp:dependencies
]

# PEP 735, which uv reads natively. Kept out of `dependencies` so the runtime image never installs
# a linter or a test runner — every package in the final layer is attack surface.
[dependency-groups]
dev = [
<% devDeps.forEach(function (dep) { -%>
  "<%= dep %>",
<% }); -%>
  # >>> idp:dev-dependencies
  # <<< idp:dev-dependencies
]

[tool.ruff]
line-length = 100
target-version = "py311"
# Python only. ruff also formats Python code blocks inside markdown, and it wants PEP 8's two
# blank lines before each top-level def — but the README is assembled by a merger that collapses
# consecutive blank lines, so the two tools would disagree forever. The format gate is for code.
exclude = ["*.md"]

[tool.ruff.lint]
# E,F = pyflakes/pycodestyle; I = import sorting (so there is no separate isort); B = bugbear;
# UP = pyupgrade; ASYNC = the async-specific checks, which matter more here than anywhere else —
# a blocking call inside an async def stalls the whole event loop and looks like a slow database.
select = ["E", "F", "I", "B", "UP", "ASYNC"]

[tool.pytest.ini_options]
# Without this, `from app.main import create_app` in a test fails to resolve unless the package is
# installed, which makes `pytest` behave differently from `uv run pytest`.
pythonpath = ["."]
testpaths = ["tests"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["app"]
