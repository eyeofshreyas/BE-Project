# ponytail self-check for rate_limit.py -- the sliding-window logic every
# auth route (signup/login/forgot-password) depends on to block brute force.
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.middleware.rate_limit import rate_limit, _hits


def _fake_request(path="/login", ip="1.2.3.4"):
    request = MagicMock()
    request.url.path = path
    request.client.host = ip
    return request


def test_allows_requests_under_the_limit():
    _hits.clear()
    dependency = rate_limit(3, 60)
    for _ in range(3):
        dependency(_fake_request())


def test_blocks_requests_over_the_limit():
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
    _hits.clear()
    dependency = rate_limit(1, 60)
    dependency(_fake_request(ip="1.1.1.1"))
    dependency(_fake_request(ip="2.2.2.2"))
    dependency(_fake_request(path="/signup", ip="1.1.1.1"))


if __name__ == "__main__":
    test_allows_requests_under_the_limit()
    test_blocks_requests_over_the_limit()
    test_tracks_ips_and_routes_independently()
    print("ok")
