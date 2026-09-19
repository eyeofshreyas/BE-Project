# ponytail safety net for the single-point-of-failure this app accepts on purpose (see
# app/db/supabase_client.py's new_auth_client() docstring: RLS is disabled on all but a
# couple of tables, so every authorization guarantee lives in middleware/auth.py's Python
# checks, not the database). One route mounted without an auth dependency is a full data
# leak with nothing to catch it. This walks every registered route and fails if any of
# them -- other than the explicitly public ones below -- doesn't depend on
# get_current_user, directly or through get_current_profile/require_roles/ensure_case_access.
"""Verifies every FastAPI route depends on auth.get_current_user, except an explicit
public allowlist."""
from app.main import app
from app.middleware.auth import get_current_user

# Routes that intentionally run with no LexFlow auth dependency, and why:
PUBLIC_ROUTES = {
    ("GET", "/"),                        # health check
    ("POST", "/signup"),                 # creates the account that later auth depends on
    ("POST", "/login"),                  # same
    ("POST", "/forgot-password"),        # same -- no session to check yet
    ("POST", "/webhooks/leegality"),     # called by Leegality's server, not a LexFlow user;
                                          # verifies its own HMAC `mac` field instead (see
                                          # controllers/esign.py's handle_esign_webhook)
    ("GET", "/_boom_for_test"),           # test-only route mounted onto the shared `app`
                                          # singleton by test_error_handling.py, not a real endpoint
}


def _flatten_routes(routes):
    """Yield every real APIRoute (the ones with a .dependant) reachable from `routes`.
    fastapi 0.141's app.include_router() wraps each mounted router in an _IncludedRouter
    wrapper instead of splicing its routes into app.routes directly -- naively iterating
    app.routes and skipping anything with no .dependant silently skips every route from
    every domain router (~90 of them), leaving only the handful defined directly on `app`
    checked. Recurse into .original_router.routes (and, in case of further nesting, any
    other .routes attribute) to reach the real ones."""
    for route in routes:
        if hasattr(route, "dependant"):
            yield route
        elif hasattr(route, "original_router"):
            yield from _flatten_routes(route.original_router.routes)
        elif hasattr(route, "routes"):
            yield from _flatten_routes(route.routes)


def _dependency_calls(dependant, seen=None):
    """Every callable in this route's dependency tree, walked recursively -- FastAPI's
    Dependant.dependencies only holds the immediate children."""
    if seen is None:
        seen = set()
    calls = set()
    for sub in dependant.dependencies:
        if id(sub) in seen:
            continue
        seen.add(id(sub))
        if sub.call:
            calls.add(sub.call)
        calls |= _dependency_calls(sub, seen)
    return calls


def test_every_route_requires_auth_unless_explicitly_public():
    """Exercises: every route registered on `app` (`app.main.app`)."""
    unprotected = []
    checked = 0
    for route in _flatten_routes(app.routes):
        if route.path in ("/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"):
            continue
        for method in route.methods - {"HEAD", "OPTIONS"}:
            checked += 1
            if (method, route.path) in PUBLIC_ROUTES:
                continue
            if get_current_user not in _dependency_calls(route.dependant):
                unprotected.append(f"{method} {route.path}")

    # A regression in _flatten_routes (e.g. another fastapi version wrapping routers
    # differently again) would make this pass by checking nothing -- fail loudly instead
    # of silently, the same failure mode this file exists to catch.
    assert checked > 80, f"only checked {checked} routes -- route discovery is broken"
    assert not unprotected, f"routes with no auth dependency: {unprotected}"


if __name__ == "__main__":
    test_every_route_requires_auth_unless_explicitly_public()
    print("ok")
