# ponytail self-check: an unhandled backend error used to reach the browser as a
# bare "Failed to fetch" -- Starlette re-raised it past CORSMiddleware, so the
# response had no status, no body and no CORS headers.
"""Tests that unhandled server errors come back as a CORS-safe JSON 500."""
from fastapi.testclient import TestClient

from app.main import app


@app.get("/_boom_for_test")
def _boom():
    raise RuntimeError("kaboom")


def test_unhandled_error_returns_json_500_with_cors_headers():
    """Verifies an unhandled exception is answered as JSON 500 carrying the CORS origin header, so
    the browser shows a message instead of "Failed to fetch". Exercises: `main.unhandled_errors_as_json()`."""
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/_boom_for_test", headers={"Origin": "http://localhost:5173"})
    assert resp.status_code == 500
    assert "detail" in resp.json()
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


if __name__ == "__main__":
    test_unhandled_error_returns_json_500_with_cors_headers()
    print("ok")
