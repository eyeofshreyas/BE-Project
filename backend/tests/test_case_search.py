# ponytail self-check for search_own_cases -- the part that must not break is the
# scoping: the ranking subprocess is handed a corpus and does no access filtering
# of its own, so anything outside the caller's scope that reaches it is a leak.
"""Tests for own-case search: scoping, empty corpora, and result shaping."""
from unittest.mock import patch

from app.ml import case_search

CLIENT = {"user_id": 7, "role_id": 3}

ROWS = [
    {"case_id": 1, "case_number": "PROP1", "case_title": "Off-plan unit", "description": "Flat not yet built."},
    {"case_id": 2, "case_number": "PROP2", "case_title": "Registration", "description": "Transfer of title."},
]


class _Table:
    """Minimal stand-in for the supabase query builder used by search_own_cases()."""
    def __init__(self, data):
        self.data = data
        self.ids = None

    def select(self, _cols):
        return self

    def in_(self, _col, values):
        self.ids = list(values)
        return self

    def execute(self):
        return self


def _run(profile, scoped_ids, rows=ROWS, hits=None, summaries=()):
    tables = {"cases": _Table(rows), "case_ai_summaries": _Table(list(summaries))}
    with patch.object(case_search, "get_scoped_case_ids", return_value=scoped_ids), \
         patch.object(case_search.supabase, "table", side_effect=lambda name: tables[name]), \
         patch.object(case_search, "run_ml_subprocess", return_value=hits or []) as runner:
        result = case_search.search_own_cases(profile, "unbuilt flat")
    return result, tables, runner


def test_a_client_with_no_cases_never_reaches_the_model():
    result, _, runner = _run(CLIENT, scoped_ids=set())
    assert result == []
    runner.assert_not_called()


def test_only_the_scoped_case_ids_are_queried():
    _run(CLIENT, scoped_ids={1})
    # the id filter is what keeps another client's cases out of the ranked corpus
    assert _run(CLIENT, scoped_ids={1})[1]["cases"].ids == [1]


def test_an_admin_is_not_id_filtered():
    _, tables, _ = _run({"user_id": 1, "role_id": 1}, scoped_ids=None)
    assert tables["cases"].ids is None


def test_cases_with_nothing_to_match_on_are_not_sent_to_the_model():
    rows = [{"case_id": 3, "case_number": "P3", "case_title": None, "description": None}]
    result, _, runner = _run(CLIENT, scoped_ids={3}, rows=rows)
    assert result == []
    runner.assert_not_called()


def test_hits_come_back_in_model_order_with_the_case_details_attached():
    hits = [{"case_id": 2, "score": 0.8}, {"case_id": 1, "score": 0.4}]
    result, _, _ = _run(CLIENT, scoped_ids={1, 2}, hits=hits)
    assert [r["case_id"] for r in result] == [2, 1]
    assert result[0]["case_number"] == "PROP2"
    assert result[1]["excerpt"] == "Flat not yet built."


def test_the_excerpt_includes_the_ai_summary_when_there_is_one():
    summaries = [{"case_id": 1, "summary_text": "Buyer seeks possession."}]
    hits = [{"case_id": 1, "score": 0.9}]
    result, _, _ = _run(CLIENT, scoped_ids={1}, hits=hits, summaries=summaries)
    assert "Buyer seeks possession." in result[0]["excerpt"]


def test_exclude_case_id_drops_that_case_from_the_corpus():
    hits = [{"case_id": 2, "score": 0.5}]
    tables = {"cases": _Table(ROWS), "case_ai_summaries": _Table([])}
    with patch.object(case_search, "get_scoped_case_ids", return_value={1, 2}), \
         patch.object(case_search.supabase, "table", side_effect=lambda name: tables[name]), \
         patch.object(case_search, "run_ml_subprocess", return_value=hits) as runner:
        case_search.search_own_cases(CLIENT, "x", exclude_case_id=1)
    sent = [d["case_id"] for d in runner.call_args[0][1]["docs"]]
    assert sent == [2]
