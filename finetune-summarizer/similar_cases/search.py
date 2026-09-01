"""
Queries the FAISS index built by build_index.py to find similar cases.
Ranks documents by their single best-matching chunk (a document with one
highly relevant chunk should outrank one with many mediocre chunks).

Usage:
    python3 search.py path/to/query_judgment.txt
"""
import json
import sys
from pathlib import Path

import faiss
from sentence_transformers import SentenceTransformer

HERE = Path(__file__).parent
MODEL_NAME = "law-ai/InLegalBert"
TOP_K_CHUNKS = 20  # cast a wide net over chunks, then collapse to top documents
TOP_K_DOCS = 5


def search(query_text, top_k_docs=TOP_K_DOCS):
    index = faiss.read_index(str(HERE / "index.faiss"))
    metadata = json.load(open(HERE / "metadata.json"))

    model = SentenceTransformer(MODEL_NAME)
    query_vec = model.encode([query_text], convert_to_numpy=True).astype("float32")
    faiss.normalize_L2(query_vec)

    scores, indices = index.search(query_vec, TOP_K_CHUNKS)

    best_per_doc = {}
    for score, idx in zip(scores[0], indices[0]):
        entry = metadata[idx]
        doc_id = entry["doc_id"]
        if doc_id not in best_per_doc or score > best_per_doc[doc_id][0]:
            best_per_doc[doc_id] = (float(score), entry["chunk_text"])

    ranked = sorted(best_per_doc.items(), key=lambda kv: kv[1][0], reverse=True)
    return ranked[:top_k_docs]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 search.py path/to/query_judgment.txt")
        sys.exit(1)

    query_text = open(sys.argv[1]).read()
    results = search(query_text)
    for rank, (doc_id, (score, chunk_text)) in enumerate(results, 1):
        print(f"{rank}. {doc_id}  (similarity={score:.4f})")
        print(f"   matching excerpt: {chunk_text[:200]}...")
        print()
