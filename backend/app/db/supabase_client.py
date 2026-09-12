"""Builds the single shared Supabase client used by every controller directly (no repository/DAO layer)."""

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
