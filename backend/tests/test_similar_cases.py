# ponytail self-check for similar_case_detail -- doc_id comes straight off a
# search hit and is used to build a path, so the traversal guard is the part
# that must not break.
"""Tests for the similar-case detail endpoint: path guard and corpus lookup."""
import pytest
from fastapi import HTTPException

from app.ml.similar_cases import CORPUS_DIRS, similar_case_detail

PROFILE = {"user_id": 1, "role_id": 2}


@pytest.mark.parametrize("doc_id", ["../../../etc/passwd", "../summary/1.txt", "1.txt/../../x", "1.pdf", ""])
def test_rejects_anything_that_is_not_a_corpus_file_name(doc_id):
    with pytest.raises(HTTPException) as exc:
        similar_case_detail(doc_id, PROFILE)
    assert exc.value.status_code in (400, 404)


def test_unknown_doc_id_is_a_404():
    with pytest.raises(HTTPException) as exc:
        similar_case_detail("99999999.txt", PROFILE)
    assert exc.value.status_code == 404


def test_returns_the_judgement_and_its_headnote():
    judgement = CORPUS_DIRS[0] / "judgement" / "4778.txt"
    if not judgement.is_file():
        pytest.skip("IN-Abs corpus not present in this checkout")
    result = similar_case_detail("4778.txt", PROFILE)
    assert result["doc_id"] == "4778.txt"
    assert result["citation"] == judgement.read_text(errors="ignore").strip().splitlines()[0].strip()
    assert result["text"].startswith(result["citation"])
    assert result["summary"]
