# ponytail self-check for the case-scoping fix on /ai/summarize and
# /ai/translate -- a lawyer scoped to case 10 must not be able to write an
# ai_summaries row for a document that belongs to case 20, and the check
# must happen before the (expensive) ML subprocess runs.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.ml.summarize import summarize_text, SummarizeRequest
from app.ml.translate import translate_text, TranslateRequest


def _fake_supabase(rows_by_table):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        data = rows_by_table.get(name, [])
        m.select.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = data
        return m

    fake.table.side_effect = table
    return fake


def _lawyer_scoped_to_case_10_but_document_in_case_20(rows_by_table_extra=None):
    rows_by_table = {
        "lawyers": [{"lawyer_id": 5}],
        "case_lawyers": [{"case_id": 10}],
        "documents": [{"case_id": 20}],
    }
    rows_by_table.update(rows_by_table_extra or {})
    return _fake_supabase(rows_by_table)


def test_summarize_rejects_out_of_scope_document():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    fake = _lawyer_scoped_to_case_10_but_document_in_case_20()
    with patch("app.middleware.auth.supabase", fake), patch("app.ml.summarize.supabase", fake), \
         patch("app.ml.summarize.run_ml_subprocess") as run_ml_subprocess:
        try:
            summarize_text(SummarizeRequest(text="x", document_id=42), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403
        run_ml_subprocess.assert_not_called()


def test_translate_rejects_out_of_scope_document():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    fake = _lawyer_scoped_to_case_10_but_document_in_case_20()
    with patch("app.middleware.auth.supabase", fake), patch("app.ml.translate.supabase", fake), \
         patch("app.ml.translate.run_ml_subprocess") as run_ml_subprocess:
        try:
            translate_text(TranslateRequest(text="x", target_language="hindi", document_id=42), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403
        run_ml_subprocess.assert_not_called()


if __name__ == "__main__":
    test_summarize_rejects_out_of_scope_document()
    test_translate_rejects_out_of_scope_document()
    print("ok")
