"""
Downloads a slice of the AWS Indian Supreme Court Judgments open dataset
(public S3 bucket, no AWS account needed) and extracts judgment PDF text into
a plain-text JSONL corpus for domain-adaptive pretraining (see
finetune/domain_pretrain.py) -- run BEFORE the IN-Abs supervised fine-tune,
not instead of it: this dataset has no summary labels, only raw judgment text.

Source: https://registry.opendata.aws/indian-supreme-court-judgments/ (CC-BY-4.0)
Bucket layout: https://github.com/vanga/indian-supreme-court-judgments

Usage:
    python prepare_aws_scj.py
Outputs:
    ./data/dapt_corpus.jsonl   (one {"text": "..."} per judgment)
"""
import json
import tarfile
from pathlib import Path

import requests
from pypdf import PdfReader
from tqdm import tqdm

BUCKET = "https://indian-supreme-court-judgments.s3.amazonaws.com"
YEARS = [2023, 2024]  # a couple of recent years -- full corpus is 52GB/35k judgments, far more than a 1B DAPT run needs
MAX_DOCS_PER_YEAR = 1000  # bounds pypdf extraction time and final corpus size
MAX_CHARS = 4000  # matches IN-Abs's truncation so DAPT text length matches what the later SFT stage trains on

HERE = Path(__file__).parent
RAW_DIR = HERE / "raw" / "aws_scj"
OUT_DIR = HERE / "data"


def download_tar(year: int) -> Path:
    """Streams that year's bundled English judgment tar from the public S3 bucket, unless already downloaded."""
    tar_path = RAW_DIR / f"{year}_english.tar"
    if tar_path.exists():
        print(f"{tar_path} already downloaded, skipping.")
        return tar_path
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    url = f"{BUCKET}/data/tar/year={year}/english/english.tar"
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))
    with open(tar_path, "wb") as f, tqdm(total=total, unit="B", unit_scale=True, desc=f"{year} english.tar") as bar:
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
    """Downloads each configured year's tar, extracts judgment text, and writes data/dapt_corpus.jsonl.
    Calls: `download_tar()`, `extract_texts()`."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_texts = []
    for year in YEARS:
        tar_path = download_tar(year)
        all_texts.extend(extract_texts(tar_path, MAX_DOCS_PER_YEAR))

    with open(OUT_DIR / "dapt_corpus.jsonl", "w") as f:
        for text in all_texts:
            f.write(json.dumps({"text": text}) + "\n")

    print(f"DAPT corpus: {len(all_texts)} judgments")

    # self-check: fail loudly rather than silently shipping an empty/broken corpus
    assert len(all_texts) > 100, f"expected several hundred+ judgments, got {len(all_texts)}"


if __name__ == "__main__":
    main()
