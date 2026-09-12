"""
Runs inside finetune-summarizer/translation/.venv (Python 3.11, transformers
4.38.0) -- incompatible with the backend's own venv and with the
finetune/eval venv (see translate.py's module docstring). Invoked as a
subprocess by ml/translate.py.

Reads {"text": str, "target_lang": str} as JSON on stdin, prints
{"translated_text": str} as the last line of stdout.
"""
import json
import sys
from pathlib import Path

TRANSLATION_DIR = Path(__file__).resolve().parents[4] / "finetune-summarizer" / "translation"
sys.path.insert(0, str(TRANSLATION_DIR))

from translate import load_model, translate  # noqa: E402


def main():
    """Read the text+target_lang payload from stdin. Calls: `load_model()`, `translate()`;
    prints {"translated_text": ...} to stdout."""
    payload = json.loads(sys.stdin.read())
    model, tokenizer, ip = load_model()
    result = translate(payload["text"], payload["target_lang"], model, tokenizer, ip)
    print(json.dumps({"translated_text": result}))


if __name__ == "__main__":
    main()
