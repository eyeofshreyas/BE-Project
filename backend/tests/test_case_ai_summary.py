# ponytail self-check for _build_case_text -- the precedent search is only as
# good as this blob, so it must carry the whole case, not just the notes.
"""Tests for the case-level AI summary: what text the ML runners are fed."""
from unittest.mock import MagicMock, patch

from app.controllers.case_ai_summary import _build_case_text


def _fake_supabase(notes, timeline, docs, summaries):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        if name == "case_notes":
            m.select.return_value.eq.return_value.execute.return_value.data = notes
        elif name == "case_timeline":
            m.select.return_value.eq.return_value.execute.return_value.data = timeline
        elif name == "documents":
            m.select.return_value.eq.return_value.execute.return_value.data = docs
        elif name == "ai_summaries":
            m.select.return_value.in_.return_value.execute.return_value.data = summaries
        return m

    fake.table.side_effect = table
    return fake


def test_case_text_covers_notes_timeline_and_document_summaries():
    fake = _fake_supabase(
        notes=[{"note": "client wants possession"}],
        timeline=[{"event_title": "Filed", "event_description": "in the district court"}],
        docs=[{"document_id": 7}, {"document_id": 8}],
        summaries=[{"summary_text": "builder agreement with a penalty clause"}, {"summary_text": None}],
    )
    with patch("app.controllers.case_ai_summary.supabase", fake):
        text = _build_case_text(1)

    assert "client wants possession" in text
    assert "Filed: in the district court" in text
    assert "builder agreement with a penalty clause" in text
    assert "None" not in text


def test_case_with_no_documents_still_builds():
    fake = _fake_supabase(notes=[{"note": "only a note"}], timeline=[], docs=[], summaries=[])
    with patch("app.controllers.case_ai_summary.supabase", fake):
        assert _build_case_text(1) == "only a note"
