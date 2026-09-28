"""Builds the single shared Supabase client used by every controller directly (no repository/DAO layer)."""

from contextlib import contextmanager
from typing import Iterator

import httpx
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions
from app.core.config import SUPABASE_URL, SUPABASE_KEY

# supabase-py builds its httpx clients with http2=True, which multiplexes every
# request over a single TCP connection. FastAPI runs these sync controllers in a
# threadpool, so concurrent requests (both dashboards fire ~6 fetches at once)
# contend over that one h2 connection and intermittently fail with
# "httpx.ReadError: [Errno 11] Resource temporarily unavailable" -- surfacing as
# 500s, or 503s when the failing call is the auth check. HTTP/1.1 uses a real
# connection pool instead, which is safe to share across threads.
# Passing http_client also opts out of the library's own timeout defaults, so
# set the timeout here.
_http_client = httpx.Client(http2=False, timeout=httpx.Timeout(30.0))

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_KEY,
    options=SyncClientOptions(httpx_client=_http_client),
)


@contextmanager
def new_auth_client() -> Iterator[Client]:
    """A throwaway client for auth calls that establish a session (sign-up, sign-in) --
    calling those on the shared `supabase` client above would silently switch its
    effective database role from service_role (bypasses RLS) to that signing-in user's
    own role for every later request in this process, since GoTrue mutates session state
    on the client instance itself. Every table but a couple has RLS disabled, so this went
    unnoticed until one that doesn't (org_clients) surfaced it as an inexplicable RLS
    violation on an unrelated later request. Verifying an already-issued token
    (auth.get_current_user's `supabase.auth.get_user()`) does not establish a session and
    is safe on the shared client -- confirmed by testing, not touched here.

    A context manager so the httpx.Client it builds -- and the connection pool and sockets
    that come with it -- gets closed when the call is done, instead of leaking until the
    garbage collector gets to it. Use as `with new_auth_client() as client: ...`."""
    with httpx.Client(http2=False, timeout=httpx.Timeout(30.0)) as http_client:
        yield create_client(
            SUPABASE_URL,
            SUPABASE_KEY,
            options=SyncClientOptions(httpx_client=http_client),
        )
