# ponytail self-check: /ai/summarize used to demand pasted text, so the Summary button
# could only ever show whatever was already stored -- the model never saw the real file.
"""Tests that a stored document's own text is what reaches the summarizer."""
import io
from unittest.mock import MagicMock, patch

import pytest
import pytesseract
from fastapi import HTTPException
from PIL import Image

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


def test_scanned_pdf_falls_back_to_ocr():
    """Verifies a PDF with no text layer (a scan) is rendered page-by-page and OCR'd, instead of
    returning "" -- this is what makes summarize/translate work on scanned filings.
    Exercises: `documents.extract_document_text()`."""
    image_only = placeholder_pdf("x").replace(b"BT /F1 11 Tf", b"%          ", 1)
    fake_page = Image.new("RGB", (10, 10), "white")
    with patch("app.controllers.documents.supabase", _fake_storage(image_only)), \
         patch("pdf2image.convert_from_bytes", return_value=[fake_page]), \
         patch("pytesseract.image_to_string", return_value="IN THE COURT OF THE DISTRICT JUDGE\n"):
        assert extract_document_text("case-1/scan.pdf", "application/pdf") == "IN THE COURT OF THE DISTRICT JUDGE"


def test_image_document_is_ocred():
    """Verifies an image/* upload (a photographed FIR, say) is OCR'd rather than rejected.
    Exercises: `documents.extract_document_text()`."""
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), "white").save(buf, format="PNG")
    with patch("app.controllers.documents.supabase", _fake_storage(buf.getvalue())), \
         patch("pytesseract.image_to_string", return_value="Notice under Section 138.\n"):
        assert extract_document_text("case-1/scan.png", "image/png") == "Notice under Section 138."


def test_unreadable_image_is_rejected_not_guessed_at():
    """Verifies bytes that aren't a real image 400 instead of reaching Tesseract with garbage.
    Exercises: `documents.extract_document_text()`."""
    with patch("app.controllers.documents.supabase", _fake_storage(b"not an image")):
        with pytest.raises(HTTPException) as err:
            extract_document_text("case-1/a.png", "image/png")
    assert err.value.status_code == 400


def test_missing_tesseract_binary_is_reported_clearly():
    """Verifies a server with no tesseract-ocr installed 500s with a clear message instead of a
    raw traceback reaching the user. Exercises: `documents.extract_document_text()`."""
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), "white").save(buf, format="PNG")
    with patch("app.controllers.documents.supabase", _fake_storage(buf.getvalue())), \
         patch("pytesseract.image_to_string", side_effect=pytesseract.TesseractNotFoundError()):
        with pytest.raises(HTTPException) as err:
            extract_document_text("case-1/scan.png", "image/png")
    assert err.value.status_code == 500


def test_unsupported_type_is_rejected_not_guessed_at():
    """Verifies a .docx upload is refused with a 400 telling the user to paste, instead of
    feeding the model binary garbage. Exercises: `documents.extract_document_text()`."""
    with patch("app.controllers.documents.supabase", _fake_storage(b"PK\x03\x04")):
        with pytest.raises(HTTPException) as err:
            extract_document_text("case-1/a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert err.value.status_code == 400
