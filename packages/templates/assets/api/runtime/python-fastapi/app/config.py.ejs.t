---
to: app/config.py
---
from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The other two runtimes spell some levels differently — pino says "warn" and "fatal", the stdlib
# says "warning" and "critical" — and LOG_LEVEL is set by the same Helm values file for every
# service. Accepting the aliases here means one chart value works across all three runtimes
# instead of failing exactly one of them at boot.
_LOG_LEVEL_ALIASES = {"warn": "warning", "fatal": "critical", "trace": "debug"}


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

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def _normalize_log_level(cls, value: object) -> object:
        lowered = str(value).lower()
        return _LOG_LEVEL_ALIASES.get(lowered, lowered)


@lru_cache
def get_settings() -> Settings:
    """Parsed once, then cached.

    ``lru_cache`` rather than a module-level instance so tests can clear it
    (``get_settings.cache_clear()``) and re-read a patched environment. A module-level instance is
    parsed at import time, which no test can undo.
    """
    return Settings()


settings = get_settings()
