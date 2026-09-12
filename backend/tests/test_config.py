# ponytail self-check for config._require -- every other test already
# exercises the happy path implicitly (SUPABASE_URL/KEY load from .env at
# import time); this covers the missing-var branch directly.
"""Tests for app.core.config's required-environment-variable helper."""
import os

from app.core.config import _require


def test_require_returns_value_when_set():
    """Verifies _require returns the value of a set environment variable. Exercises: `config._require()`."""
    os.environ["SOME_TEST_VAR"] = "value"
    try:
        assert _require("SOME_TEST_VAR") == "value"
    finally:
        del os.environ["SOME_TEST_VAR"]


def test_require_raises_when_missing():
    """Verifies _require raises RuntimeError when the environment variable is unset. Exercises: `config._require()`."""
    os.environ.pop("SOME_TEST_VAR", None)
    try:
        _require("SOME_TEST_VAR")
        assert False, "expected RuntimeError"
    except RuntimeError:
        pass


if __name__ == "__main__":
    test_require_returns_value_when_set()
    test_require_raises_when_missing()
    print("ok")
