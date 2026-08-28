import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase_client import supabase

router = APIRouter(prefix="/ai", tags=["ai"])

REPO_ROOT = Path(__file__).resolve().parents[2]
TRANSLATE_VENV_PYTHON = REPO_ROOT / "finetune-summarizer" / "translation" / ".venv" / "bin" / "python"
TRANSLATE_DIR = REPO_ROOT / "finetune-summarizer" / "translation"
TRANSLATE_RUNNER = Path(__file__).resolve().parent / "runners" / "translate_runner.py"

# FLORES-200 codes for the languages IndicTrans2 supports well; callers can
# also pass a raw FLORES code directly (e.g. "pan_Guru") if their language
# isn't in this list.
LANGUAGE_CODES = {
    "hindi": "hin_Deva",
    "marathi": "mar_Deva",
    "tamil": "tam_Taml",
    "telugu": "tel_Telu",
    "bengali": "ben_Beng",
    "gujarati": "guj_Gujr",
}


class TranslateRequest(BaseModel):
    text: str
    target_language: str
    document_id: int | None = None


class TranslateResponse(BaseModel):
    translated_text: str


@router.post("/translate", response_model=TranslateResponse)
def translate_text(data: TranslateRequest):
    target_lang = LANGUAGE_CODES.get(data.target_language.lower(), data.target_language)

    # ponytail: reloads the IndicTrans2 model on every call, same tradeoff
    # as /ai/summarize. A long-lived worker is the upgrade path.
    proc = subprocess.run(
        [str(TRANSLATE_VENV_PYTHON), str(TRANSLATE_RUNNER)],
        input=json.dumps({"text": data.text, "target_lang": target_lang}),
        capture_output=True,
        text=True,
        cwd=str(TRANSLATE_DIR),
        timeout=300,
    )
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=proc.stderr[-2000:])

    last_line = proc.stdout.strip().splitlines()[-1]
    result = json.loads(last_line)

    if data.document_id is not None:
        supabase.table("ai_summaries").upsert({
            "document_id": data.document_id,
            "translated_text": result["translated_text"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="document_id").execute()

    return result
