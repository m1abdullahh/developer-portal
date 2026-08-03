---
to: app/middleware/__init__.py
---
"""Request-path middleware.

Populated by the middleware recipes selected in the wizard. Each module exposes a single
``install_*(app)`` function, called from the ``idp:plugins`` region in ``app/main.py`` in
MIDDLEWARE_PRIORITY order — the same order the Node and Go runtimes use.
"""
