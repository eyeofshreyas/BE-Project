"""Tests for `new_auth_client()` -- issue #25: the httpx.Client it builds for an auth call
must be closed when the call is done, on both the success and the exception path."""
from unittest.mock import patch

import httpx

from app.db.supabase_client import new_auth_client


def test_new_auth_client_closes_its_httpx_client_on_success():
    real_http_client = httpx.Client(http2=False)
    with patch("app.db.supabase_client.httpx.Client", return_value=real_http_client):
        with new_auth_client() as client:
            assert client is not None
            assert not real_http_client.is_closed
    assert real_http_client.is_closed


def test_new_auth_client_closes_its_httpx_client_on_exception():
    real_http_client = httpx.Client(http2=False)
    with patch("app.db.supabase_client.httpx.Client", return_value=real_http_client):
        try:
            with new_auth_client():
                raise RuntimeError("boom")
        except RuntimeError:
            pass
    assert real_http_client.is_closed
