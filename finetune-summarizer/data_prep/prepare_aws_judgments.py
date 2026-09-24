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
   and https://github.com/vanga/indian-high-court-judgments -- court/bench codes from that
   repo's opendata/docs/high_courts.csv)

Download is ~33GB total across all (source, year) tars combined (checked via HTTP
HEAD against the real bucket) -- budget real time and disk for this on a laptop.
Tars are kept on disk after extraction (not deleted), so a re-run skips already-
downloaded sources and the raw PDFs stay inspectable -- budget the full ~33GB of
disk for raw/aws_judgments/ on top of the extracted dapt_corpus.jsonl. A dropped
connection mid-tar (wifi blip, laptop sleep) retries with an HTTP Range request
from the partial file already on disk, up to 5 attempts, instead of restarting
that tar from byte 0.

Usage:
    python prepare_aws_judgments.py
Outputs:
    ./data/dapt_corpus.jsonl   (one {"text": "..."} per judgment, all sources combined --
                                written incrementally as each (source, year) tar finishes,
                                not all at once at the end, so `wc -l` / `tail` against it
                                mid-run shows real progress)
"""
import json
import tarfile
from pathlib import Path

import requests
from pypdf import PdfReader
from tqdm import tqdm

YEARS = [2023, 2024]
# ponytail: Madras HC alone has 108,621 judgments for 2023 (checked its data.index.json) --
# "no cap" would mean days of pypdf extraction on one bench. Capped per (source, year) instead;
# 5 sources x 2 years x 5000 lands around the ~50k-judgment target. Raise if you have GPU/CPU
# time to spare, or add more (source, year) pairs below instead of raising this further.
MAX_DOCS_PER_YEAR = 5000
MAX_CHARS = 4000  # matches IN-Abs's truncation so DAPT text length matches what the later SFT stage trains on

# (label, tar URL template with {year}) -- 4 High Courts + Supreme Court, not all 25 courts/45
# benches, per this project's own "1-2 courts x recent years" recommendation for the similar-case
# corpus, widened here to a handful for DAPT's larger appetite for raw text.
SOURCES = [
    ("scj", "https://indian-supreme-court-judgments.s3.amazonaws.com/data/tar/year={year}/english/english.tar"),
    ("hc_delhi", "https://indian-high-court-judgments.s3.amazonaws.com/data/tar/year={year}/court=7_26/bench=dhcdb/data.tar"),
    ("hc_bombay", "https://indian-high-court-judgments.s3.amazonaws.com/data/tar/year={year}/court=27_1/bench=newos/data.tar"),
    ("hc_madras", "https://indian-high-court-judgments.s3.amazonaws.com/data/tar/year={year}/court=33_10/bench=hc_cis_mas/data.tar"),
    ("hc_karnataka", "https://indian-high-court-judgments.s3.amazonaws.com/data/tar/year={year}/court=29_3/bench=karnataka_bng_old/data.tar"),
]

HERE = Path(__file__).parent
RAW_DIR = HERE / "raw" / "aws_judgments"
OUT_DIR = HERE / "data"


def download_tar(label: str, url: str) -> Path:
    """Streams a source's tar for one year from the public S3 bucket, unless a complete copy is
    already on disk -- checked against the server's Content-Length, not just file existence, so a
    tar truncated by an interrupted run gets re-downloaded instead of silently used as-is.
    Retries on connection drops (a multi-hour 33GB download over laptop wifi/sleep will hit these)
    using an HTTP Range request to resume from the partial file already on disk, instead of
    restarting that source's whole multi-GB tar from byte 0."""
    tar_path = RAW_DIR / f"{label}.tar"
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    expected_size = int(requests.head(url, timeout=30).headers.get("content-length", 0))
    if tar_path.exists() and tar_path.stat().st_size == expected_size:
        print(f"{tar_path} already downloaded, skipping.")
        return tar_path

    for attempt in range(1, 6):
        resume_at = tar_path.stat().st_size if tar_path.exists() else 0
        headers = {"Range": f"bytes={resume_at}-"} if resume_at else {}
        try:
            resp = requests.get(url, stream=True, headers=headers, timeout=(30, 60))
            resp.raise_for_status()
            mode = "ab" if resume_at else "wb"
            with open(tar_path, mode) as f, tqdm(
                total=expected_size, initial=resume_at, unit="B", unit_scale=True, desc=label
            ) as bar:
                for chunk in resp.iter_content(chunk_size=1 << 20):
                    f.write(chunk)
                    bar.update(len(chunk))
            return tar_path
        except requests.exceptions.RequestException as exc:
            print(f"{label}: attempt {attempt}/5 failed ({exc}); will resume from "
                  f"{tar_path.stat().st_size if tar_path.exists() else 0} bytes")
    raise RuntimeError(f"{label}: download failed after 5 attempts")


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
    """Downloads each (source, year) tar, extracts judgment text, and appends it to
    data/dapt_corpus.jsonl immediately (flushed after every tar, not batched to the end) so
    the file's growth reflects real progress. Calls: `download_tar()`, `extract_texts()`."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    counts = {}
    total = 0
    with open(OUT_DIR / "dapt_corpus.jsonl", "w") as out:
        for label, url_template in SOURCES:
            source_count = 0
            for year in YEARS:
                url = url_template.format(year=year)
                tar_path = download_tar(f"{label}_{year}", url)
                texts = extract_texts(tar_path, MAX_DOCS_PER_YEAR)
                for text in texts:
                    out.write(json.dumps({"text": text}) + "\n")
                out.flush()
                source_count += len(texts)
            counts[label] = source_count
            total += source_count

    print(f"DAPT corpus: {total} judgments ({counts})")

    # self-check: fail loudly rather than silently shipping an empty/broken corpus,
    # and confirm every source actually contributed (not one silently failing).
    assert total > 100, f"expected several hundred+ judgments, got {total}"
    assert all(c > 0 for c in counts.values()), f"a source contributed zero judgments: {counts}"


if __name__ == "__main__":
    main()
