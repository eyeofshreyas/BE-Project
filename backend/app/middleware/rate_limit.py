"""Per-route, per-client-IP sliding-window rate limiting dependency."""

import time
from threading import Lock

from fastapi import HTTPException, Request

_hits: dict[str, list[float]] = {}
_lock = Lock()

# Once the store holds more than this many IP+path keys, drop the ones whose hits
# have all aged out. Without it every IP that ever touches an auth route keeps a
# key for the life of the process -- the timestamps inside a key are pruned on
# that key's next request, but an IP that visits once and never comes back is
# never revisited, so nothing ever removes it.
_SWEEP_OVER_KEYS = 10_000

# ...but only this often. The sweep is a full scan under the global lock, and the
# trigger above is a *size*, so without a clock it re-scans on every single request
# for as long as the store stays large -- which is exactly when the store is large
# because a flood is in progress. Measured at 15k live keys that was ~6x the
# per-request cost, reclaiming nothing, because keys inside their window are not
# collectable. Rate-limiting the sweep makes it O(n) per minute instead of O(n) per
# request; stale keys linger up to a minute longer, which costs nothing.
_SWEEP_EVERY_SECONDS = 60.0
_last_sweep = 0.0

# The longest window any route registered. The sweep has to measure staleness
# against that rather than the window of whichever route happened to trigger it,
# or a short-window route could evict a long-window route's live entries and
# hand someone a fresh allowance.
_max_window = 0.0


def rate_limit(max_requests: int, window_seconds: float):
    """Per-client-IP sliding-window limiter for a single route.

    ponytail: in-memory, per-process -- fine for a single instance; move to
    Redis (or similar shared store) if this ever runs behind more than one
    worker/replica.

    ponytail: the client IP is whoever opened the connection. Behind a load
    balancer that is the balancer, so every caller shares one bucket and the
    auth routes are effectively unprotected -- or, if that IP is exempted,
    unlimited. Reading X-Forwarded-For is the fix, but only trusting it from
    proxies we control, so it waits on knowing the deployment. See issue #14,
    which tracks both of these together.

    ponytail: the store grows with the number of *distinct IPs seen per window*,
    which is inherent -- evicting a live key would reset that caller's count and
    hand them a second allowance. Only keys past their window are collectable.
    """
    global _max_window
    _max_window = max(_max_window, window_seconds)

    def dependency(request: Request) -> None:
        """Reject with 429 if this path+client-IP has hit max_requests within window_seconds."""
        global _last_sweep
        key = f"{request.url.path}:{request.client.host if request.client else 'unknown'}"
        now = time.monotonic()
        with _lock:
            if len(_hits) > _SWEEP_OVER_KEYS and now - _last_sweep >= _SWEEP_EVERY_SECONDS:
                _last_sweep = now
                for stale in [k for k, v in _hits.items() if not v or now - v[-1] >= _max_window]:
                    del _hits[stale]
            hits = [t for t in _hits.get(key, []) if now - t < window_seconds]
            if len(hits) >= max_requests:
                raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
            hits.append(now)
            _hits[key] = hits
    return dependency
