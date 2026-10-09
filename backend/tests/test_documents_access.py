# ponytail self-check for document access control. Case files are the confidential
# part of this app: every read path (download URL, AI summary) and write path
# (upload, soft-delete) has to refuse a case the caller isn't scoped to, and say
# 404 vs 403 without leaking whether a document exists.
"""Tests for document access control: download URLs, summaries, upload and delete scoping."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from storage3.exceptions import StorageApiError

from app.middleware import auth
from app.controllers.documents import (
    delete_document,
    get_document_download_url,
    get_document_summary,
    upload_document,
)

LAWYER_PROFILE = {"role_id": auth.LAWYER, "user_id": 1}
# Auth-side rows: this lawyer is actively assigned to case 10 only.
LAWYER_SCOPED_TO_CASE_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}


def _auth_supabase(rows_by_table):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        data = rows_by_table.get(name, [])
        m.select.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = data
        return m

    fake.table.side_effect = table
    return fake


def _docs_supabase(document_rows, summary_rows=(), signed_url=None, storage_error=False, updated_sink=None):
    """Fake supabase for the documents module: a documents lookup, an ai_summaries lookup,
    and a storage client that either signs a URL or raises StorageApiError."""
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        if name == "documents":
            m.select.return_value.eq.return_value.execute.return_value.data = list(document_rows)
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = list(document_rows)

            def update(payload):
                if updated_sink is not None:
                    updated_sink.update(payload)
                return MagicMock(eq=MagicMock(return_value=MagicMock(execute=MagicMock())))
            m.update.side_effect = update
        elif name == "ai_summaries":
            chain = m.select.return_value.eq.return_value.order.return_value.limit.return_value
            chain.execute.return_value.data = list(summary_rows)
        return m

    fake.table.side_effect = table

    storage = MagicMock()
    if storage_error:
        storage.create_signed_url.side_effect = StorageApiError("Object not found", "404", 404)
    else:
        storage.create_signed_url.return_value = {"signedURL": signed_url or "https://storage/signed"}
    fake.storage.from_.return_value = storage
    return fake


def test_download_url_is_refused_for_a_document_on_another_case():
    """Verifies a lawyer scoped to case 10 cannot obtain a signed URL for a document filed under
    case 20; raises 403 rather than handing back a working link.
    Exercises: `GET /documents/{id}/url` (`documents.get_document_download_url()`)."""
    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase", _docs_supabase([{"case_id": 20, "file_path": "case-20/x.pdf"}])):
        with pytest.raises(HTTPException) as err:
            get_document_download_url(3, False, LAWYER_PROFILE)
    assert err.value.status_code == 403


def test_download_url_is_issued_for_a_document_in_scope():
    """Verifies the in-scope case still gets a signed URL, so the 403 above is a real boundary
    and not a blanket refusal. Exercises: `GET /documents/{id}/url`
    (`documents.get_document_download_url()`)."""
    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase", _docs_supabase([{"case_id": 10, "file_path": "case-10/x.pdf"}])):
        assert get_document_download_url(3, False, LAWYER_PROFILE) == {"url": "https://storage/signed"}


def test_a_missing_document_is_a_404():
    """Verifies a document ID with no row raises 404. Exercises: `GET /documents/{id}/url`
    (`documents.get_document_download_url()`)."""
    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase", _docs_supabase([])):
        with pytest.raises(HTTPException) as err:
            get_document_download_url(999, False, LAWYER_PROFILE)
    assert err.value.status_code == 404


def test_a_row_whose_stored_file_is_gone_reports_404_not_500():
    """Verifies a documents row that outlived its stored object surfaces a 404 with an
    explanation instead of a bare 500 -- every preview and download button routes through here.
    Exercises: `GET /documents/{id}/url` (`documents.get_document_download_url()`)."""
    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase",
               _docs_supabase([{"case_id": 10, "file_path": "case-10/gone.pdf"}], storage_error=True)):
        with pytest.raises(HTTPException) as err:
            get_document_download_url(3, False, LAWYER_PROFILE)
    assert err.value.status_code == 404
    assert "storage" in err.value.detail.lower()


def test_ai_summary_is_refused_for_a_document_on_another_case():
    """Verifies the AI summary of an out-of-scope document raises 403 -- the summary carries the
    document's substance, so scoping it matters as much as the file itself.
    Exercises: `GET /documents/{id}/summary` (`documents.get_document_summary()`)."""
    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase",
               _docs_supabase([{"case_id": 20}], summary_rows=[{"summary_text": "secret"}])):
        with pytest.raises(HTTPException) as err:
            get_document_summary(3, LAWYER_PROFILE)
    assert err.value.status_code == 403


def test_ai_summary_absent_for_an_in_scope_document_is_a_404():
    """Verifies an in-scope document with no summary yet raises 404 rather than an empty 200.
    Exercises: `GET /documents/{id}/summary` (`documents.get_document_summary()`)."""
    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase", _docs_supabase([{"case_id": 10}], summary_rows=[])):
        with pytest.raises(HTTPException) as err:
            get_document_summary(3, LAWYER_PROFILE)
    assert err.value.status_code == 404


def test_delete_is_refused_for_a_document_on_another_case():
    """Verifies a lawyer cannot soft-delete a document filed under a case outside their scope,
    and that nothing is written. Exercises: `DELETE /documents/{id}`
    (`documents.delete_document()`)."""
    updated = {}
    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase", _docs_supabase([{"case_id": 20}], updated_sink=updated)):
        with pytest.raises(HTTPException) as err:
            delete_document(3, LAWYER_PROFILE)
    assert err.value.status_code == 403
    assert not updated, "a refused delete must not mark the row deleted"


def test_delete_in_scope_soft_deletes_and_stamps_deleted_at():
    """Verifies an in-scope delete sets is_deleted and stamps deleted_at (the clock
    reap_storage.py measures its grace period from) rather than removing the row.
    Exercises: `DELETE /documents/{id}` (`documents.delete_document()`)."""
    updated = {}
    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase", _docs_supabase([{"case_id": 10}], updated_sink=updated)):
        assert delete_document(3, LAWYER_PROFILE) == {"message": "Document deleted"}
    assert updated["is_deleted"] is True
    assert updated["deleted_at"]


def test_upload_is_refused_for_a_case_outside_the_callers_scope():
    """Verifies a lawyer cannot upload into a case they aren't assigned to; 403 before the file
    is read or stored. Exercises: `POST /cases/{case_id}/documents`
    (`documents.upload_document()`)."""
    file = MagicMock()
    file.filename = "brief.pdf"
    docs_fake = _docs_supabase([])
    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase", docs_fake):
        with pytest.raises(HTTPException) as err:
            upload_document(20, 1, file, LAWYER_PROFILE)
    assert err.value.status_code == 403
    file.file.read.assert_not_called()
    docs_fake.storage.from_.return_value.upload.assert_not_called()


def test_upload_removes_storage_object_when_document_insert_fails():
    """Verifies a storage upload is undone if the documents row cannot be inserted, so
    a partial write does not leave an orphaned object in the bucket. Exercises:
    `POST /cases/{case_id}/documents` (`documents.upload_document()`)."""
    file = MagicMock()
    file.filename = "brief.pdf"
    file.content_type = "application/pdf"
    file.file.read.return_value = b"%PDF-1.4 test"

    docs_fake = MagicMock()
    docs_fake.table.return_value.insert.return_value.execute.side_effect = RuntimeError("db insert failed")
    storage = docs_fake.storage.from_.return_value

    with patch("app.middleware.auth.supabase", _auth_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.documents.supabase", docs_fake):
        with pytest.raises(RuntimeError):
            upload_document(10, 1, file, LAWYER_PROFILE)

    uploaded_path = storage.upload.call_args.args[0]
    assert uploaded_path.startswith("case-10/")
    storage.remove.assert_called_once_with([uploaded_path])
