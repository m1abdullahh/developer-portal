---
to: <%= policyPath %>
---
"""Role and permission policy — the SINGLE definition of who may do what.

The Python expression of the same policy the TypeScript layers enforce. The roles, the
permissions and the matrix mapping one to the other are identical by contract, not by
convention: ``policy-contract.test.ts`` parses both files and fails if they disagree.

That matters because a project can have a FastAPI backend and a Next.js frontend, and in that
shape the browser app's route guards read the TypeScript copy while this file decides what the
API actually permits. A UI that hides a button the API still allows is a security bug waiting to
be found; the reverse is a support ticket nobody can reproduce.

── Why the role names look like this ───────────────────────────────────────
These strings are used verbatim as the database's role values, so there is no mapping layer
between what is stored and what this policy checks. A translation table between ``ADMIN`` and
``admin`` is exactly the kind of seam where an unmapped value silently becomes "no permissions" —
failing open or closed depending on the call site, and neither is something to discover in
production.
"""

from collections.abc import Callable
from typing import Literal, get_args

Role = Literal["viewer", "editor", "admin", "owner"]
ROLES: tuple[Role, ...] = get_args(Role)

Permission = Literal["read", "write", "delete", "manage:users", "manage:settings"]
PERMISSIONS: tuple[Permission, ...] = get_args(Permission)

# `owner` holds exactly what `admin` holds.
#
# The difference between them is structural, not permissive: an organisation must always have at
# least one active owner, and the API refuses any change that would remove the last one. Granting
# owners an extra permission would suggest the distinction is about capability, which it is not.
ROLE_PERMISSIONS: dict[Role, tuple[Permission, ...]] = {
    "viewer": ("read",),
    "editor": ("read", "write", "delete"),
    "admin": ("read", "write", "delete", "manage:users", "manage:settings"),
    "owner": ("read", "write", "delete", "manage:users", "manage:settings"),
}

# Consulted before the defaults, when something has installed one.
#
# The settings module makes the matrix editable and stores the differences in the database. Rather
# than teach the auth dependency about that table — coupling authentication to a feature that may
# not be installed — the store registers itself here, and every existing caller keeps working
# unchanged. With nothing installed, the defaults above are the whole policy.
#
# Returning ``None`` means "no opinion, use the default", which is different from returning
# ``False``. Conflating the two would make every unlisted pair a denial the moment any override
# existed.
PermissionResolver = Callable[[Role, Permission], bool | None]

_resolver: PermissionResolver | None = None


def set_permission_resolver(resolver: PermissionResolver | None) -> None:
    global _resolver
    _resolver = resolver


def has_permission(role: Role, permission: Permission) -> bool:
    if _resolver is not None:
        override = _resolver(role, permission)
        if override is not None:
            return override

    return permission in ROLE_PERMISSIONS.get(role, ())


def default_permissions_for(role: Role) -> tuple[Permission, ...]:
    """The compiled-in defaults, ignoring any resolver. The matrix editor renders against these."""
    return ROLE_PERMISSIONS.get(role, ())


def permissions_for(role: Role) -> tuple[Permission, ...]:
    return ROLE_PERMISSIONS.get(role, ())


def is_role(value: str) -> bool:
    """Narrows an untrusted string — a JWT claim, a query parameter — to a role."""
    return value in ROLES
