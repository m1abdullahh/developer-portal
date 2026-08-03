---
to: app/logging_config.py
---
import json
import logging
import sys
from typing import Any

from app.config import settings

# Attributes the stdlib puts on every LogRecord. Anything NOT in this set was passed by the caller
# via `extra=`, which is how structured fields reach the output without a second logging library.
_RESERVED = frozenset(
    logging.LogRecord("", 0, "", 0, "", None, None).__dict__.keys()
    | {"asctime", "message", "taskName"}
)

_REDACTED = frozenset({"authorization", "cookie", "password", "token", "secret", "api_key"})


class JsonFormatter(logging.Formatter):
    """One JSON object per line, which is what every log aggregator expects.

    Redaction is applied here rather than at each call site, because the call site that leaks a
    token is by definition the one that did not think about it. Logging a request header block
    without this writes a live bearer token into log storage, where it is retained and indexed.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname.lower(),
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "logger": record.name,
            "msg": record.getMessage(),
        }

        for key, value in record.__dict__.items():
            if key in _RESERVED:
                continue
            payload[key] = "[redacted]" if key.lower() in _REDACTED else value

        if record.exc_info:
            payload["err"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging() -> None:
    """Replaces uvicorn's handlers rather than adding to them.

    uvicorn installs its own formatters at import. Leaving them in place means every request is
    logged twice — once as JSON and once as coloured text — and the plain-text copy is the one
    that breaks a log parser.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.LOG_LEVEL.upper())

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers = []
        logger.propagate = True
