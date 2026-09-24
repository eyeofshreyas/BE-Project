"""
Downloads a slice of two AWS open-data judgment datasets (public S3, no AWS
account needed) and extracts judgment PDF text into a combined plain-text
JSONL corpus for domain-adaptive pretraining (see finetune/domain_pretrain.py)
-- run BEFORE the IN-Abs supervised fine-tune, not instead of it: neither AWS
dataset has summary labels, only raw judgment text.

Sources:
  - Indian Supreme Court Judgments: https://registry.opendata.aws/indian-supreme-court-judgments/
  - Indian High Court Judgments:    https://registry.opendata.aws/indian-high-court-judgments/
  (both CC-BY-4.0; bucket layouts: https://github.com/vanga/indian-supreme-court-judgments
   and https://github.com/vanga/indian-high-court-judgments)

Usage:
    python prepare_aws_judgments.py
Outputs:
    ./data/dapt_corpus.jsonl   (one {"text": "..."} per judgment, both sources combined)
"""
import json
import tarfile
from pathlib import Path

import requests
from pypdf import PdfReader
from tqdm import tqdm

YEARS = [2023, 2024]  # a couple of recent years -- full datasets are far more than a 1B DAPT run needs
MAX_DOCS_PER_YEAR = 1000  # per source, per year -- bounds pypdf extraction time and final corpus size
MAX_CHARS = 4000  # matches IN-Abs's truncation so DAPT text length matches what the later SFT stage trains on

# (label, tar URL template with {year}) -- High Court is scoped to one bench (Delhi, per
# high_courts.csv court=7_26/bench=dhcdb) rather than all 25 courts/45 benches, per this
# project's own "1-2 courts x recent years" recommendation for the similar-case corpus.
SOURCES = [
    ("scj", "https://indian-supreme-court-judgments.s3.amazonaws.com/data/tar/year={year}/english/english.tar"),
    ("hc_delhi", "https://indian-high-court-judgments.s3.amazonaws.com/data/tar/year={year}/court=7_26/bench=dhcdb/data.tar"),
]

HERE = Path(__file__).parent
RAW_DIR = HERE / "raw" / "aws_judgments"
OUT_DIR = HERE / "data"


def download_tar(label: str, url: str) -> Path:
    """Streams a source's tar for one year from the public S3 bucket, unless already downloaded."""
    tar_path = RAW_DIR / f"{label}.tar"
    if tar_path.exists():
        print(f"{tar_path} already downloaded, skipping.")
        return tar_path
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))
    with open(tar_path, "wb") as f, tqdm(total=total, unit="B", unit_scale=True, desc=label) as bar:
        for chunk in resp.iter_content(chunk_size=1 << 20):
            f.write(chunk)
            bar.update(len(chunk))
    return tar_path


def extract_texts(tar_path: Path, limit: int) -> list[str]:
    """Reads up to `limit` PDFs straight out of the tar (no full extraction to disk) and returns their text,
    truncated to MAX_CHARS. Skips individual malformed PDFs rather than failing the whole run."""
    texts = []
    skipped = 0
    with tarfile.open(tar_path) as tf:
        members = [m for m in tf.getmembers() if m.name.lower().endswith(".pdf")][:limit]
        for member in tqdm(members, desc=f"extracting {tar_path.name}"):
            f = tf.extractfile(member)
            if f is None:
                continue
            try:
                reader = PdfReader(f)
                text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
            except Exception:
                skipped += 1
                continue
            if text:
                texts.append(text[:MAX_CHARS])
    if skipped:
        print(f"{tar_path.name}: skipped {skipped} malformed PDFs")
    return texts


def main() -> None:
    """Downloads each (source, year) tar, extracts judgment text, and writes the combined
    data/dapt_corpus.jsonl. Calls: `download_tar()`, `extract_texts()`."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_texts = []
    counts = {}
    for label, url_template in SOURCES:
        source_count = 0
        for year in YEARS:
            url = url_template.format(year=year)
            tar_path = download_tar(f"{label}_{year}", url)
            texts = extract_texts(tar_path, MAX_DOCS_PER_YEAR)
            all_texts.extend(texts)
            source_count += len(texts)
        counts[label] = source_count

    with open(OUT_DIR / "dapt_corpus.jsonl", "w") as f:
        for text in all_texts:
            f.write(json.dumps({"text": text}) + "\n")

    print(f"DAPT corpus: {len(all_texts)} judgments ({counts})")

    # self-check: fail loudly rather than silently shipping an empty/broken corpus,
    # and confirm both sources actually contributed (not one silently failing).
    assert len(all_texts) > 100, f"expected several hundred+ judgments, got {len(all_texts)}"
    assert all(c > 0 for c in counts.values()), f"a source contributed zero judgments: {counts}"


if __name__ == "__main__":
    main()
