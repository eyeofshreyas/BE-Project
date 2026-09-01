"""Per-route, per-client-IP sliding-window rate limiting dependency."""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request

_hits: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def rate_limit(max_requests: int, window_seconds: float):
    """Per-client-IP sliding-window limiter for a single route.

    ponytail: in-memory, per-process -- fine for a single instance; move to
    Redis (or similar shared store) if this ever runs behind more than one
    worker/replica.
    """
    def dependency(request: Request) -> None:
        """Reject with 429 if this path+client-IP has hit max_requests within window_seconds."""
        key = f"{request.url.path}:{request.client.host if request.client else 'unknown'}"
        now = time.monotonic()
        with _lock:
            hits = [t for t in _hits[key] if now - t < window_seconds]
            if len(hits) >= max_requests:
                raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
            hits.append(now)
            _hits[key] = hits
    return dependency
