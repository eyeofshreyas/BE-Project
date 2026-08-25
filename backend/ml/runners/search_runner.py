"""
Runs inside finetune-summarizer/.venv (has faiss + sentence-transformers),
not the backend's own venv. Invoked as a subprocess by ml/similar_cases.py.

Reads {"query": str, "top_k": int} as JSON on stdin, prints a JSON list of
results on stdout.
"""
import json
import sys
from pathlib import Path

SIMILAR_CASES_DIR = Path(__file__).resolve().parents[3] / "finetune-summarizer" / "similar_cases"
sys.path.insert(0, str(SIMILAR_CASES_DIR))

from search import search  # noqa: E402


def main():
    payload = json.loads(sys.stdin.read())
    results = search(payload["query"], top_k_docs=payload.get("top_k", 5))
    print(json.dumps([
        {"doc_id": doc_id, "score": score, "excerpt": chunk_text}
        for doc_id, (score, chunk_text) in results
    ]))


if __name__ == "__main__":
    main()
