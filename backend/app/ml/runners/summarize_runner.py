"""
Runs inside finetune-summarizer/.venv on the GPU (unsloth + the fine-tuned
LoRA adapter), not the backend's own venv. Invoked as a subprocess by
ml/summarize.py, with cwd set to finetune-summarizer/inference so the
script's own relative ADAPTER_DIR resolves correctly.

Reads {"text": str, "mode": "judgment"|"case"} as JSON on stdin, prints
{"summary": str} as the last line of stdout -- unsloth prints its own startup
banner to stdout first, so the caller must take the last line, not the whole
stream. "case" skips the LoRA adapter, which only knows judgments; it defaults
to "judgment" so existing callers are unchanged.
"""
import json
import sys
from pathlib import Path

INFERENCE_DIR = Path(__file__).resolve().parents[4] / "finetune-summarizer" / "inference"
sys.path.insert(0, str(INFERENCE_DIR))

from summarize_long import load_model, summarize  # noqa: E402


def main():
    """Read the text payload from stdin. Calls: `load_model()`, `summarize()`;
    prints {"summary": ...} to stdout."""
    payload = json.loads(sys.stdin.read())
    mode = payload.get("mode", "judgment")
    model, tokenizer = load_model(use_adapter=mode != "case")
    result = summarize(model, tokenizer, payload["text"], mode=mode)
    print(json.dumps({"summary": result}))


if __name__ == "__main__":
    main()
