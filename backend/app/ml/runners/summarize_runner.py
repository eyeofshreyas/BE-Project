"""
Runs inside finetune-summarizer/.venv on the GPU (unsloth + the fine-tuned
LoRA adapter), not the backend's own venv. Invoked as a subprocess by
ml/summarize.py, with cwd set to finetune-summarizer/inference so the
script's own relative ADAPTER_DIR resolves correctly.

Reads {"text": str} as JSON on stdin, prints {"summary": str} as the last
line of stdout -- unsloth prints its own startup banner to stdout first,
so the caller must take the last line, not the whole stream.
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
    model, tokenizer = load_model()
    result = summarize(model, tokenizer, payload["text"])
    print(json.dumps({"summary": result}))


if __name__ == "__main__":
    main()
