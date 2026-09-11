# ponytail self-check for _build_case_text -- the brief and the precedent search
# are only as good as this blob, so it must carry the whole case file, labelled.
"""Tests for the case-level AI summary: what text the ML runners are fed."""
from unittest.mock import MagicMock, patch

from app.controllers.case_ai_summary import _build_case_text

CASE_ROW = {
    "case_number": "CIV2026001",
    "case_title": "Property Ownership Dispute",
    "status": "Open",
    "priority": "High",
    "filing_date": "2026-08-03",
    "next_hearing_date": "2026-09-15",
    "description": None,
    "clients": {"users": {"full_name": "Amit Kulkarni"}},
    "courts": {"court_name": "City Civil Court"},
    "case_types": {"case_type_name": "Property"},
}


def _fake_supabase(case_rows, hearings, notes, timeline, docs, summaries):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        if name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = case_rows
        elif name == "hearings":
            m.select.return_value.eq.return_value.order.return_value.execute.return_value.data = hearings
        elif name == "case_notes":
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


def _build(**overrides):
    args = dict(
        case_rows=[CASE_ROW],
        hearings=[{
            "hearing_date": "2026-09-15", "hearing_status": "Completed",
            "hearing_outcome": "Adjourned for documents", "notes": "bring the 1998 deed",
            "judges": {"judge_name": "Justice Rao"},
        }],
        notes=[{"note": "client wants possession"}],
        timeline=[{"event_title": "Filed", "event_description": "in the district court"}],
        docs=[{"document_id": 7}, {"document_id": 8}],
        summaries=[{"summary_text": "builder agreement with a penalty clause"}, {"summary_text": None}],
    )
    args.update(overrides)
    fake = _fake_supabase(**args)
    with patch("app.controllers.case_ai_summary.supabase", fake):
        return _build_case_text(1)


def test_case_file_carries_every_source_under_its_own_heading():
    text = _build()
    for heading in ("## Case", "## Hearings", "## Notes", "## Timeline", "## Documents"):
        assert heading in text
    assert "Client: Amit Kulkarni" in text
    assert "Court: City Civil Court" in text
    assert "client wants possession" in text
    assert "Filed: in the district court" in text
    assert "builder agreement with a penalty clause" in text


def test_hearing_outcomes_and_notes_reach_the_model():
    text = _build()
    assert "outcome: Adjourned for documents" in text
    assert "notes: bring the 1998 deed" in text
    assert "before Justice Rao" in text


def test_empty_sections_and_null_fields_are_left_out():
    text = _build(hearings=[], docs=[], summaries=[])
    assert "## Hearings" not in text
    assert "## Documents" not in text
    assert "Description" not in text  # the case row's description is None
    assert "None" not in text


def test_a_case_with_nothing_recorded_builds_empty():
    assert _build(case_rows=[], hearings=[], notes=[], timeline=[], docs=[], summaries=[]) == ""
