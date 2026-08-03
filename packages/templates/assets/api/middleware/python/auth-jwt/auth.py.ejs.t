---
to: app/middleware/auth.py
---
from collections.abc import Callable, Coroutine
from typing import Any

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import settings
from app.lib.permissions import Permission, Role, has_permission, is_role

# auto_error=False so a missing header reaches our own handler rather than HTTPBearer's, whose
# 403 would contradict the 401 this API returns everywhere else for "not authenticated".
_bearer = HTTPBearer(auto_error=False)


class AuthenticatedUser(BaseModel):
    id: str
    email: str | None = None
    role: Role


def _unauthorized() -> HTTPException:
    """One generic 401 for every verification failure.

    Deliberately not "token expired" versus "bad signature" versus "malformed". Distinguishing
    them hands an attacker a free oracle: a signature error means the token structure was right
    and only the key was wrong, which is precisely the feedback a forging attempt needs.

    The WWW-Authenticate header is still correct to send — it names the scheme, not the fault.
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthenticatedUser:
    if credentials is None or not credentials.credentials:
        raise _unauthorized()

    try:
        claims = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET,
            # A list, and never including "none". PyJWT requires this argument precisely because
            # accepting the algorithm named in the token's own header is the classic JWT forgery:
            # an attacker sets alg to "none" and supplies no signature at all.
            algorithms=["HS256"],
        )
    except jwt.PyJWTError as error:
        raise _unauthorized() from error

    role = str(claims.get("role", ""))
    if not is_role(role):
        # A token signed by us carrying a role we do not recognise is a policy change that has not
        # finished rolling out. Refusing is the safe direction — the alternative grants whatever
        # the empty permission set happens to allow.
        raise _unauthorized()

    subject = claims.get("sub")
    if not subject:
        raise _unauthorized()

    return AuthenticatedUser(id=str(subject), email=claims.get("email"), role=role)  # type: ignore[arg-type]


def require_permission(
    permission: Permission,
) -> Callable[[AuthenticatedUser], Coroutine[Any, Any, AuthenticatedUser]]:
    """Route guard factory, used as a dependency:

        @router.delete("/thing/{id}", dependencies=[Depends(require_permission("delete"))])

    A dependency rather than global middleware, and that is the load-bearing choice: a global
    authentication middleware would also intercept ``/health``, ``/ready`` and ``/docs``. The
    probes would return 401 and Kubernetes would restart a perfectly healthy pod.
    """

    async def guard(user: AuthenticatedUser = Depends(current_user)) -> AuthenticatedUser:
        if not has_permission(user.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires the '{permission}' permission.",
            )
        return user

    return guard


def install_auth(app: FastAPI) -> None:
    """Verifies the signing key is usable before the first request rather than during one.

    An API that boots with a 4-character JWT_SECRET and rejects every token at runtime is far
    harder to diagnose than one that refuses to start and says why.
    """
    if len(settings.JWT_SECRET) < 32:
        raise ValueError("JWT_SECRET must be at least 32 characters.")

    # Nothing is registered on the app itself: the guards above are per-route dependencies. This
    # function exists so the plugins region reads uniformly across every middleware, and so this
    # check runs at startup.
    _ = app
