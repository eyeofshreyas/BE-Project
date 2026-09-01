# ponytail self-check for run_ml_subprocess -- the stdin/stdout JSON contract
# every ML router (summarize/translate/similar_cases) relies on, including
# the "banners before the JSON" case unsloth-backed runners hit in practice.
"""Tests for the ML subprocess chokepoint: its stdout-JSON parsing and timeout/error mapping."""
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.ml.subprocess_utils import run_ml_subprocess


def _fake_completed(returncode, stdout="", stderr=""):
    proc = MagicMock()
    proc.returncode = returncode
    proc.stdout = stdout
    proc.stderr = stderr
    return proc


def test_parses_bare_json_stdout():
    """Verifies a single JSON line on stdout is parsed and returned as a dict. Exercises: `subprocess_utils.run_ml_subprocess()`."""
    with patch("app.ml.subprocess_utils.subprocess.run", return_value=_fake_completed(0, stdout='{"summary": "ok"}\n')):
        assert run_ml_subprocess(["python"], {"text": "x"}, timeout=1) == {"summary": "ok"}


def test_takes_last_line_after_startup_banner():
    """Verifies only the last stdout line is parsed as JSON, ignoring preceding banner/log lines. Exercises: `subprocess_utils.run_ml_subprocess()`."""
    stdout = "Loading model...\nSome banner noise\n{\"translated_text\": \"hola\"}\n"
    with patch("app.ml.subprocess_utils.subprocess.run", return_value=_fake_completed(0, stdout=stdout)):
        assert run_ml_subprocess(["python"], {"text": "x"}, timeout=1) == {"translated_text": "hola"}


def test_nonzero_exit_raises_500_without_leaking_stderr():
    # stderr (which may contain internal tracebacks) must be logged, not
    # returned to the caller -- see main.py's error-sanitization pass.
    """Verifies a non-zero subprocess exit code raises 500 without including stderr text in the response detail. Exercises: `subprocess_utils.run_ml_subprocess()`."""
    with patch("app.ml.subprocess_utils.subprocess.run", return_value=_fake_completed(1, stderr="traceback here")):
        try:
            run_ml_subprocess(["python"], {"text": "x"}, timeout=1)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 500
            assert "traceback here" not in e.detail


def test_timeout_raises_504():
    """Verifies a subprocess.TimeoutExpired is translated into a 504. Exercises: `subprocess_utils.run_ml_subprocess()`."""
    import subprocess as subprocess_module
    with patch("app.ml.subprocess_utils.subprocess.run", side_effect=subprocess_module.TimeoutExpired(cmd=["python"], timeout=1)):
        try:
            run_ml_subprocess(["python"], {"text": "x"}, timeout=1)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 504


if __name__ == "__main__":
    test_parses_bare_json_stdout()
    test_takes_last_line_after_startup_banner()
    test_nonzero_exit_raises_500_without_leaking_stderr()
    test_timeout_raises_504()
    print("ok")
