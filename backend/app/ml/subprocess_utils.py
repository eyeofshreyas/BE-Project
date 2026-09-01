import json
import logging
import subprocess

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def run_ml_subprocess(cmd: list[str], payload: dict, *, cwd: str | None = None, timeout: int):
    """Run an ML runner script, feeding it `payload` as JSON on stdin and
    parsing the last line of stdout as JSON -- runners that print startup
    banners (e.g. unsloth) put those before the result, not after."""
    try:
        proc = subprocess.run(cmd, input=json.dumps(payload), capture_output=True, text=True, cwd=cwd, timeout=timeout)
    except subprocess.TimeoutExpired:
        logger.error("ML subprocess timed out after %ss (cmd=%s)", timeout, cmd)
        raise HTTPException(status_code=504, detail="ML processing timed out. Please try again.")

    lines = proc.stdout.strip().splitlines()
    if proc.returncode != 0 or not lines:
        logger.error("ML subprocess failed (cmd=%s): %s", cmd, proc.stderr[-2000:])
        raise HTTPException(status_code=500, detail="ML processing failed. Please try again or contact support.")
    return json.loads(lines[-1])
