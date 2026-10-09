# ponytail self-check for rate_limit.py -- the sliding-window logic every
# auth route (signup/login/forgot-password) depends on to block brute force.
"""Tests for the rate-limiting middleware's sliding-window dependency factory."""
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.middleware.rate_limit import rate_limit, _hits


def _fake_request(path="/login", ip="1.2.3.4"):
    request = MagicMock()
    request.url.path = path
    request.client.host = ip
    return request


def test_allows_requests_under_the_limit():
    """Verifies requests within the configured limit pass through without raising. Exercises: `rate_limit.rate_limit()`."""
    _hits.clear()
    dependency = rate_limit(3, 60)
    for _ in range(3):
        dependency(_fake_request())


def test_blocks_requests_over_the_limit():
    """Verifies a request beyond the configured limit for the same IP+path raises 429. Exercises: `rate_limit.rate_limit()`."""
    _hits.clear()
    dependency = rate_limit(3, 60)
    for _ in range(3):
        dependency(_fake_request())
    try:
        dependency(_fake_request())
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 429


def test_tracks_ips_and_routes_independently():
    """Verifies hit counts are tracked per IP+path combination, so distinct IPs or paths don't share a limit. Exercises: `rate_limit.rate_limit()`."""
    _hits.clear()
    dependency = rate_limit(1, 60)
    dependency(_fake_request(ip="1.1.1.1"))
    dependency(_fake_request(ip="2.2.2.2"))
    dependency(_fake_request(path="/signup", ip="1.1.1.1"))


def test_the_store_does_not_grow_once_per_visiting_ip_forever():
    """Verifies entries whose hits have aged out are swept once the store grows past its
    threshold. Every IP that touched an auth route used to keep a key for the life of the
    process: a key's timestamps are pruned only on that key's next request, so a one-off
    visitor was never revisited and never removed. Exercises: `rate_limit.rate_limit()`."""
    import app.middleware.rate_limit as rl

    _hits.clear()
    rl._last_sweep = float("-inf")
    dependency = rate_limit(10, 60)
    for i in range(rl._SWEEP_OVER_KEYS + 1):
        dependency(_fake_request(ip=f"10.{i // 65536}.{i // 256 % 256}.{i % 256}"))
    assert len(_hits) > rl._SWEEP_OVER_KEYS

    # Roll past the window so every one of those hits is stale, then make one more
    # request -- which should trigger the sweep and collect the lot.
    real_monotonic = rl.time.monotonic
    rl.time.monotonic = lambda: real_monotonic() + 3600
    try:
        dependency(_fake_request(ip="9.9.9.9"))
    finally:
        rl.time.monotonic = real_monotonic
    assert len(_hits) == 1, f"expected the stale keys swept, {len(_hits)} left"


def test_the_sweep_never_clears_someone_still_inside_their_window():
    """Verifies a sweep triggered by a short-window route leaves a long-window route's live
    entries alone -- collecting those would reset a caller's count and hand them a second
    allowance, turning a memory fix into a way past the limit.
    Exercises: `rate_limit.rate_limit()`."""
    import app.middleware.rate_limit as rl

    _hits.clear()
    rl._last_sweep = float("-inf")
    slow = rate_limit(1, 3600)      # long window: one request an hour
    fast = rate_limit(10, 1)        # short window, and what triggers the sweep

    slow(_fake_request(path="/slow", ip="1.1.1.1"))   # uses up the hourly allowance

    # Fill the store past the threshold so the next call sweeps.
    for i in range(rl._SWEEP_OVER_KEYS + 1):
        fast(_fake_request(path="/fast", ip=f"10.{i // 65536}.{i // 256 % 256}.{i % 256}"))

    try:
        slow(_fake_request(path="/slow", ip="1.1.1.1"))
        assert False, "expected HTTPException -- the hourly allowance was already spent"
    except HTTPException as e:
        assert e.status_code == 429


def test_the_sweep_does_not_rescan_on_every_request():
    """Verifies the full scan is rate-limited by a clock, not just by the store's size.
    The trigger is a size, so without one the scan repeats on every single request for as
    long as the store stays large -- and the store is large precisely when a flood from
    many IPs is in progress, so the limiter does its most expensive work, under a global
    lock, at its worst moment, reclaiming nothing because live keys aren't collectable.
    Exercises: `rate_limit.rate_limit()`."""
    import app.middleware.rate_limit as rl

    _hits.clear()
    rl._last_sweep = float("-inf")
    dependency = rate_limit(5, 3600)        # long window, so nothing ever goes stale
    for i in range(rl._SWEEP_OVER_KEYS + 100):
        dependency(_fake_request(ip=f"10.{i // 65536}.{i // 256 % 256}.{i % 256}"))

    assert len(_hits) > rl._SWEEP_OVER_KEYS, "live keys are not collectable, nothing should be reclaimed"
    swept_at = rl._last_sweep
    assert swept_at > 0, "expected one sweep once the store passed the threshold"

    for i in range(200):
        j = rl._SWEEP_OVER_KEYS + 1_000 + i
        dependency(_fake_request(ip=f"20.{j // 65536}.{j // 256 % 256}.{j % 256}"))
    assert rl._last_sweep == swept_at, "the sweep re-ran while the store was still large"


if __name__ == "__main__":
    test_allows_requests_under_the_limit()
    test_blocks_requests_over_the_limit()
    test_tracks_ips_and_routes_independently()
    test_the_store_does_not_grow_once_per_visiting_ip_forever()
    test_the_sweep_never_clears_someone_still_inside_their_window()
    test_the_sweep_does_not_rescan_on_every_request()
    print("ok")
