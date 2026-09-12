"""
Downloads the IN-Abs dataset (7,030 train + 100 test Indian Supreme Court
judgment -> headnote summary pairs) from Zenodo and turns it into
instruction-tuning JSONL for the fine-tune step.

Source: https://zenodo.org/records/7152317 (Law-AI/summarization, AACL-IJCNLP 2022)

Usage:
    python prepare_in_abs.py
Outputs:
    ./data/train.jsonl
    ./data/test.jsonl
"""
import json
import zipfile
from pathlib import Path

import requests
from tqdm import tqdm

ZENODO_URL = "https://zenodo.org/records/7152317/files/dataset.zip?download=1"
HERE = Path(__file__).parent
RAW_DIR = HERE / "raw"
OUT_DIR = HERE / "data"

INSTRUCTION = "Summarize the following Indian Supreme Court judgment in a concise legal headnote."
MAX_INPUT_CHARS = 4000  # ~1000 words, keeps prompt+judgment+summary under the 2048-token window used for local 1B training on a 4GB GPU


def download_and_extract() -> None:
    """Streams the IN-Abs zip from Zenodo into RAW_DIR and extracts it, unless RAW_DIR is already populated."""
    zip_path = RAW_DIR / "dataset.zip"
    if RAW_DIR.exists() and any(RAW_DIR.iterdir()):
        print(f"{RAW_DIR} already populated, skipping download.")
        return
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    resp = requests.get(ZENODO_URL, stream=True, timeout=60)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))
    with open(zip_path, "wb") as f, tqdm(total=total, unit="B", unit_scale=True, desc="dataset.zip") as bar:
        for chunk in resp.iter_content(chunk_size=1 << 20):
            f.write(chunk)
            bar.update(len(chunk))

    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(RAW_DIR)
    zip_path.unlink()


def find_split_dir(root: Path, name_hint: str) -> Path:
    """Recursively finds the first directory under root whose name contains name_hint (case-insensitive)."""
    # ponytail: zip's internal nesting isn't documented precisely, so search for it
    # instead of hardcoding a path that might be one level off.
    matches = [p for p in root.rglob("*") if p.is_dir() and name_hint.lower() in p.name.lower()]
    if not matches:
        raise FileNotFoundError(f"Could not locate a '{name_hint}' folder under {root}")
    return matches[0]


def build_pairs(split_root: Path) -> list[dict]:
    """Pairs each judgment file with its matching summary file under split_root and builds instruction-tuning
    records (truncating judgment text to MAX_INPUT_CHARS). Calls: `find_split_dir()`."""
    judgement_dir = find_split_dir(split_root, "judgement")
    summary_dir = find_split_dir(split_root, "summary")

    pairs = []
    for jfile in sorted(judgement_dir.glob("*")):
        sfile = summary_dir / jfile.name
        if not sfile.exists():
            continue
        judgment_text = jfile.read_text(errors="ignore").strip()[:MAX_INPUT_CHARS]
        summary_text = sfile.read_text(errors="ignore").strip()
        if not judgment_text or not summary_text:
            continue
        pairs.append({"instruction": INSTRUCTION, "input": judgment_text, "output": summary_text})
    return pairs


def main() -> None:
    """Downloads+extracts the dataset, builds train/test instruction pairs restricted to the IN-Abs split, writes
    them to data/{train,test}.jsonl, and sanity-checks the resulting counts.
    Calls: `download_and_extract()`, `find_split_dir()`, `build_pairs()`."""
    download_and_extract()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # the zip also bundles IN-Ext and UK-Abs (UK Supreme Court) -- pin to
    # IN-Abs explicitly so we never silently pick up non-Indian data.
    in_abs_root = find_split_dir(RAW_DIR, "IN-Abs")
    train_root = find_split_dir(in_abs_root, "train-data")
    test_root = find_split_dir(in_abs_root, "test-data")

    train_pairs = build_pairs(train_root)
    test_pairs = build_pairs(test_root)

    with open(OUT_DIR / "train.jsonl", "w") as f:
        for p in train_pairs:
            f.write(json.dumps(p) + "\n")
    with open(OUT_DIR / "test.jsonl", "w") as f:
        for p in test_pairs:
            f.write(json.dumps(p) + "\n")

    print(f"train pairs: {len(train_pairs)}  test pairs: {len(test_pairs)}")

    # self-check: fail loudly rather than silently shipping an empty/broken dataset
    assert len(train_pairs) > 1000, f"expected ~7030 train pairs, got {len(train_pairs)}"
    assert len(test_pairs) > 50, f"expected ~100 test pairs, got {len(test_pairs)}"
    assert all(p["output"] for p in train_pairs[:5]), "sample train summaries are empty"


if __name__ == "__main__":
    main()
