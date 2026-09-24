"""
Downloads the ILC dataset (Indian legal judgment -> abstractive summary pairs,
Trivedi et al. 2023, Engineered Science 2024) from Hugging Face and turns a
sample of its test split into the same instruction-tuning JSONL shape as
IN-Abs, for use as a second held-out eval set (different source/annotators
than IN-Abs, catches overfitting to one dataset's summary style).

Source: https://huggingface.co/datasets/d0r1h/ILC

Usage:
    python prepare_ilc.py
Outputs:
    ./data/ilc_test.jsonl
"""
import json
import random
from pathlib import Path

from datasets import load_dataset

HERE = Path(__file__).parent
OUT_DIR = HERE / "data"

INSTRUCTION = "Summarize the following Indian Supreme Court judgment in a concise legal headnote."
MAX_INPUT_CHARS = 4000  # same truncation as IN-Abs, keeps prompt+judgment+summary under the 2048-token training window
SAMPLE_SIZE = 100  # matches IN-Abs test size, keeps eval runtime comparable
SEED = 42


def main() -> None:
    """Downloads the ILC test split, samples SAMPLE_SIZE rows, maps Case/Summary to the input/output
    instruction-tuning shape, and writes data/ilc_test.jsonl."""
    ds = load_dataset("d0r1h/ILC", split="test")
    indices = random.Random(SEED).sample(range(len(ds)), min(SAMPLE_SIZE, len(ds)))

    pairs = []
    for i in indices:
        row = ds[i]
        judgment_text = row["Case"].strip()[:MAX_INPUT_CHARS]
        summary_text = row["Summary"].strip()
        if not judgment_text or not summary_text:
            continue
        pairs.append({"instruction": INSTRUCTION, "input": judgment_text, "output": summary_text})

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_DIR / "ilc_test.jsonl", "w") as f:
        for p in pairs:
            f.write(json.dumps(p) + "\n")

    print(f"ILC eval pairs: {len(pairs)}")

    # self-check: fail loudly rather than silently shipping an empty/broken eval set
    assert len(pairs) > 50, f"expected ~{SAMPLE_SIZE} ILC eval pairs, got {len(pairs)}"
    assert all(p["output"] for p in pairs[:5]), "sample ILC summaries are empty"


if __name__ == "__main__":
    main()
