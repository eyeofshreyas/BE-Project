# ponytail self-check: /ai/summarize used to demand pasted text, so the Summary button
# could only ever show whatever was already stored -- the model never saw the real file.
"""Tests that a stored document's own text is what reaches the summarizer."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.controllers.documents import extract_document_text
from seed_storage import placeholder_pdf


def _fake_storage(content):
    fake = MagicMock()
    fake.storage.from_.return_value.download.return_value = content
    return fake


def test_pdf_text_layer_is_extracted():
    """Verifies a real PDF's text comes back, so `POST /ai/summarize` with only a document_id has
    something to summarize. Exercises: `documents.extract_document_text()` via `ml.summarize()`."""
    with patch("app.controllers.documents.supabase", _fake_storage(placeholder_pdf("agreement.pdf"))):
        assert "agreement.pdf" in extract_document_text("case-1/a.pdf", "application/pdf")


def test_text_file_is_decoded_as_is():
    """Verifies text/* uploads skip the PDF reader. Exercises: `documents.extract_document_text()`."""
    with patch("app.controllers.documents.supabase", _fake_storage(b"  Notice of demand.  ")):
        assert extract_document_text("case-1/a.txt", "text/plain") == "Notice of demand."


def test_scanned_pdf_yields_no_text():
    """Verifies an image-only PDF returns "" rather than nonsense -- summarize_text() turns that
    into the "paste its text instead" 400. Exercises: `documents.extract_document_text()`."""
    image_only = placeholder_pdf("x").replace(b"BT /F1 11 Tf", b"%          ", 1)
    with patch("app.controllers.documents.supabase", _fake_storage(image_only)):
        assert extract_document_text("case-1/scan.pdf", "application/pdf") == ""


def test_unsupported_type_is_rejected_not_guessed_at():
    """Verifies a .docx/image upload is refused with a 400 telling the user to paste, instead of
    feeding the model binary garbage. Exercises: `documents.extract_document_text()`."""
    with patch("app.controllers.documents.supabase", _fake_storage(b"PK\x03\x04")):
        with pytest.raises(HTTPException) as err:
            extract_document_text("case-1/a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert err.value.status_code == 400
