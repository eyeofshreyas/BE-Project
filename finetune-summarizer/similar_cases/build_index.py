"""
Builds a FAISS similarity index over the IN-Abs judgment corpus for the
Similar Case Discovery feature. No training -- InLegalBert is a pretrained
legal-domain BERT (via sentence-transformers' auto mean-pooling wrapper);
this just embeds documents and indexes them.

Chunked (not one vector per whole document): a single vector for a
multi-thousand-word judgment loses too much detail for good retrieval,
so each document is split into ~200-word chunks and each chunk gets its
own vector. Search ranks documents by their single best-matching chunk.

Usage:
    python3 build_index.py
Outputs:
    index.faiss      -- FAISS IndexFlatIP over L2-normalized chunk embeddings
    metadata.json     -- parallel list of {doc_id, chunk_text} per vector
"""
import json
from pathlib import Path

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

HERE = Path(__file__).parent
CORPUS_DIRS = [
    HERE / "../data_prep/raw/dataset/IN-Abs/train-data/judgement",
    HERE / "../data_prep/raw/dataset/IN-Abs/test-data/judgement",
]
MODEL_NAME = "law-ai/InLegalBert"
CHUNK_WORDS = 200


def chunk_words(text, chunk_size=CHUNK_WORDS):
    """Splits text into a list of whitespace-joined chunks of chunk_size words each."""
    words = text.split()
    return [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]


def load_corpus():
    """Reads every judgment file under CORPUS_DIRS (train + test IN-Abs judgments) and splits each into
    word chunks. Calls: `chunk_words()`. Returns a flat list of (doc_id, chunk_text) tuples."""
    docs = []  # list of (doc_id, chunk_text)
    for corpus_dir in CORPUS_DIRS:
        for path in sorted(corpus_dir.glob("*")):
            text = path.read_text(errors="ignore").strip()
            if not text:
                continue
            for chunk in chunk_words(text):
                docs.append((path.name, chunk))
    return docs


def main() -> None:
    """Loads and chunks the corpus, embeds every chunk with InLegalBert, builds a cosine-similarity
    (L2-normalized inner-product) FAISS index, and writes index.faiss + metadata.json for
    `similar_cases.search` to query. Calls: `load_corpus()`."""
    docs = load_corpus()
    print(f"Loaded {len(docs)} chunks from {len(set(d for d, _ in docs))} documents")

    model = SentenceTransformer(MODEL_NAME)
    embeddings = model.encode(
        [chunk for _, chunk in docs], show_progress_bar=True, batch_size=64, convert_to_numpy=True,
    ).astype("float32")
    faiss.normalize_L2(embeddings)  # so inner product == cosine similarity

    index = faiss.IndexFlatIP(embeddings.shape[1])
    index.add(embeddings)
    faiss.write_index(index, str(HERE / "index.faiss"))

    metadata = [{"doc_id": doc_id, "chunk_text": chunk} for doc_id, chunk in docs]
    with open(HERE / "metadata.json", "w") as f:
        json.dump(metadata, f)

    print(f"Index built: {index.ntotal} vectors, saved to {HERE / 'index.faiss'}")

    assert index.ntotal == len(metadata) == len(docs)


if __name__ == "__main__":
    main()
