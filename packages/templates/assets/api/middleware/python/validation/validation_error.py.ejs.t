---
to: app/lib/validation_error.py
---
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def install_validation_errors(app: FastAPI) -> None:
    """Replaces FastAPI's default 422 body with the one every runtime in this portal returns.

    FastAPI already validates — that is Pydantic's job and it needs no help. What it does not do is
    agree with the Node and Go services next to it: its default body is
    ``{"detail": [{"loc": ["body", "email"], "msg": "..."}]}``, where ``loc`` is a path array whose
    first element is the request part. A client mapping errors back to form fields has to know that
    convention, and it is a different convention per language.

    So the envelope below is contractual: ``error``, ``message``, ``statusCode``, ``details``, with
    ``details[].field`` a dotted path a form can look up directly.

    422 rather than 400 throughout — the request was well-formed and semantically invalid, which is
    a distinction a client can act on.
    """

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = []
        for error in exc.errors():
            # Drop the first element: it names the request part ("body", "query", "path"), not the
            # field. Keeping it would produce "body.email" where the caller sent "email".
            location = [str(part) for part in error["loc"][1:]]
            if not location:
                location = [str(part) for part in error["loc"]]
            details.append({"field": ".".join(location), "message": error["msg"]})

        return JSONResponse(
            status_code=422,
            content={
                "error": "Unprocessable Entity",
                "message": "Request validation failed.",
                "statusCode": 422,
                "details": details,
            },
        )
