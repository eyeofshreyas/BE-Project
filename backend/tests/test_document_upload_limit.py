# ponytail self-check for the upload size cap -- the guard has to fire before the
# bytes reach storage, and it must not read the whole oversized file to decide.
"""Tests for the document upload size/empty guard shared by case and matter uploads."""
import io

import pytest
from fastapi import HTTPException, UploadFile

from app.controllers.documents import MAX_DOCUMENT_BYTES, read_upload


def _upload(data: bytes) -> UploadFile:
    return UploadFile(filename="f.pdf", file=io.BytesIO(data))


def test_a_normal_file_is_read_back_whole():
    assert read_upload(_upload(b"hello")) == b"hello"


def test_a_file_exactly_on_the_limit_is_allowed():
    assert len(read_upload(_upload(b"x" * MAX_DOCUMENT_BYTES))) == MAX_DOCUMENT_BYTES


def test_one_byte_over_the_limit_is_rejected():
    with pytest.raises(HTTPException) as exc:
        read_upload(_upload(b"x" * (MAX_DOCUMENT_BYTES + 1)))
    assert exc.value.status_code == 400
    assert "25 MB" in exc.value.detail


def test_an_empty_file_is_rejected():
    with pytest.raises(HTTPException) as exc:
        read_upload(_upload(b""))
    assert exc.value.status_code == 400
    assert "empty" in exc.value.detail.lower()


def test_an_oversized_file_is_not_fully_buffered():
    """The point of the cap: reject without pulling the whole file into memory."""
    class _CountingFile(io.BytesIO):
        def __init__(self, data):
            super().__init__(data)
            self.max_read = 0

        def read(self, size=-1):
            self.max_read = max(self.max_read, size if size is not None else -1)
            return super().read(size)

    backing = _CountingFile(b"x" * (MAX_DOCUMENT_BYTES * 3))
    with pytest.raises(HTTPException):
        read_upload(UploadFile(filename="big.mp4", file=backing))
    assert backing.max_read == MAX_DOCUMENT_BYTES + 1
