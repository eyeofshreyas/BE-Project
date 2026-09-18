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
    """
    global _max_window
    _max_window = max(_max_window, window_seconds)

    def dependency(request: Request) -> None:
        """Reject with 429 if this path+client-IP has hit max_requests within window_seconds."""
        key = f"{request.url.path}:{request.client.host if request.client else 'unknown'}"
        now = time.monotonic()
        with _lock:
            if len(_hits) > _SWEEP_OVER_KEYS:
                for stale in [k for k, v in _hits.items() if not v or now - v[-1] >= _max_window]:
                    del _hits[stale]
            hits = [t for t in _hits.get(key, []) if now - t < window_seconds]
            if not hits:
                _hits.pop(key, None)
            if len(hits) >= max_requests:
                raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
            hits.append(now)
            _hits[key] = hits
    return dependency
