---
to: app/config.py
---
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated environment configuration.

    The Python counterpart of the Zod schema the Node runtime uses, and it exists for the same
    reason: a missing or malformed variable should stop the process at boot with the key named,
    rather than surfacing as a ``None`` inside one request handler on the one code path that
    reads it.

    ``extra="ignore"`` because the process environment in a container is full of variables that
    belong to Kubernetes rather than to this service — ``KUBERNETES_SERVICE_HOST``,
    ``PATH``, every ``*_PORT_*`` the Service injects. Forbidding extras would make the pod refuse
    to start for reasons that have nothing to do with its own configuration.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    PORT: int = <%= runtime.port %>
    LOG_LEVEL: Literal["critical", "error", "warning", "info", "debug"] = "info"
    # >>> idp:env-schema
    # <<< idp:env-schema


@lru_cache
def get_settings() -> Settings:
    """Parsed once, then cached.

    ``lru_cache`` rather than a module-level instance so tests can clear it
    (``get_settings.cache_clear()``) and re-read a patched environment. A module-level instance is
    parsed at import time, which no test can undo.
    """
    return Settings()


settings = get_settings()
