"""
Runs inside finetune-summarizer/.venv (has sentence-transformers), not the
backend's own venv. Invoked as a subprocess by ml/case_search.py.

Reads {"query": str, "top_k": int, "docs": [{"case_id": int, "text": str}]} as
JSON on stdin, prints a JSON list of {"case_id", "score"} on stdout.

Ranking only -- the backend sends just the cases the caller is allowed to see,
so this does no access filtering of its own and must never be given a wider
corpus than the caller's scope.
"""
import json
import sys
from pathlib import Path

from sentence_transformers import SentenceTransformer, util

SIMILAR_CASES_DIR = Path(__file__).resolve().parents[4] / "finetune-summarizer" / "similar_cases"
sys.path.insert(0, str(SIMILAR_CASES_DIR))

from search import MODEL_NAME  # noqa: E402  -- the same InLegalBert the judgment index uses


def main():
    """Read the query + case corpus from stdin, rank the corpus against the query by cosine
    similarity, print the top_k as JSON to stdout."""
    payload = json.loads(sys.stdin.read())
    docs = payload["docs"]
    if not docs:
        print(json.dumps([]))
        return

    model = SentenceTransformer(MODEL_NAME)
    # One vector per case, no chunking: a case's title + description + AI summary is a few
    # hundred words, not a multi-thousand-word judgment like the IN-Abs corpus that
    # similar_cases/build_index.py has to split.
    # ponytail: re-embeds the whole corpus on every call, and there is no persisted index.
    # That keeps it always-fresh with zero invalidation logic, which is the right trade while
    # a firm's case list is small. Cache vectors keyed by a hash of `text` if it stops being.
    corpus = model.encode([d["text"] for d in docs], convert_to_tensor=True, normalize_embeddings=True)
    query = model.encode([payload["query"]], convert_to_tensor=True, normalize_embeddings=True)

    hits = util.semantic_search(query, corpus, top_k=payload.get("top_k", 5))[0]
    print(json.dumps([
        {"case_id": docs[hit["corpus_id"]]["case_id"], "score": float(hit["score"])}
        for hit in hits
    ]))


if __name__ == "__main__":
    main()
