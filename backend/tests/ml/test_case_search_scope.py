# ponytail self-check for /ai/case-search. Unlike /ai/similar-cases, which searches a public
# judgment corpus, this one searches the firm's own cases -- so the corpus handed to the
# ranking subprocess IS the access-control boundary. A lawyer assigned only to case 10 must
# never have case 20's text embedded on their behalf.
"""Tests that /ai/case-search only ever searches cases the caller is scoped to."""
from unittest.mock import MagicMock, patch

from app.middleware import auth
from app.ml.case_search import case_search, CaseSearchRequest


def _fake_supabase(rows_by_table, in_calls=None):
    """Fake supabase covering the three call shapes this path uses: select().eq().execute(),
    select().eq().eq().execute() (get_scoped_case_ids) and select().in_().execute()."""
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        data = rows_by_table.get(name, [])
        m.select.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = data

        def in_(column, values):
            if in_calls is not None:
                in_calls.append((name, column, list(values)))
            result = MagicMock()
            result.execute.return_value.data = [r for r in data if r["case_id"] in set(values)]
            return result

        m.select.return_value.in_.side_effect = in_
        return m

    fake.table.side_effect = table
    return fake


def _rows():
    return {
        "lawyers": [{"lawyer_id": 5}],
        "case_lawyers": [{"case_id": 10}],  # assigned to 10 only
        "cases": [
            {"case_id": 10, "case_number": "C010", "case_title": "Boundary dispute", "description": "encroachment"},
            {"case_id": 20, "case_number": "C020", "case_title": "Someone else's matter", "description": "secret"},
        ],
        "case_ai_summaries": [],
    }


def test_case_search_only_embeds_cases_in_scope():
    """A lawyer assigned to case 10 must not get case 20's text sent to the ranking subprocess.
    Exercises: `POST /ai/case-search` (`case_search.case_search()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    in_calls = []
    fake = _fake_supabase(_rows(), in_calls)
    with patch("app.middleware.auth.supabase", fake), patch("app.ml.case_search.supabase", fake), \
         patch("app.ml.case_search.run_ml_subprocess") as run_ml_subprocess:
        run_ml_subprocess.return_value = [{"case_id": 10, "score": 0.9}]
        results = case_search(CaseSearchRequest(query="boundary encroachment"), profile)

    payload = run_ml_subprocess.call_args[0][1]
    sent_ids = {doc["case_id"] for doc in payload["docs"]}
    assert sent_ids == {10}, f"out-of-scope case leaked into the corpus: {sent_ids}"
    assert "secret" not in str(payload), "out-of-scope case text leaked into the corpus"
    assert ("cases", "case_id", [10]) in in_calls, f"cases query was not scoped: {in_calls}"
    assert [r["case_id"] for r in results] == [10]
    assert results[0]["case_number"] == "C010"


def test_case_search_returns_empty_without_running_the_subprocess():
    """A lawyer assigned to no cases gets [] and the expensive subprocess never starts.
    Exercises: `POST /ai/case-search` (`case_search.case_search()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    rows = _rows()
    rows["case_lawyers"] = []
    fake = _fake_supabase(rows)
    with patch("app.middleware.auth.supabase", fake), patch("app.ml.case_search.supabase", fake), \
         patch("app.ml.case_search.run_ml_subprocess") as run_ml_subprocess:
        assert case_search(CaseSearchRequest(query="anything"), profile) == []
        run_ml_subprocess.assert_not_called()


def test_client_searches_only_their_own_cases():
    """A client is scoped through clients/cases, not case_lawyers, and must see only their own.
    Exercises: `POST /ai/case-search` (`case_search.case_search()`)."""
    profile = {"role_id": auth.CLIENT, "user_id": 2}
    rows = _rows()
    rows["clients"] = [{"client_id": 7}]
    rows["cases"] = [{"case_id": 20, "case_number": "C020", "case_title": "Own matter", "description": "mine"}]
    fake = _fake_supabase(rows)
    with patch("app.middleware.auth.supabase", fake), patch("app.ml.case_search.supabase", fake), \
         patch("app.ml.case_search.run_ml_subprocess") as run_ml_subprocess:
        run_ml_subprocess.return_value = [{"case_id": 20, "score": 0.5}]
        results = case_search(CaseSearchRequest(query="x"), profile)

    sent_ids = {doc["case_id"] for doc in run_ml_subprocess.call_args[0][1]["docs"]}
    assert sent_ids == {20}
    assert [r["case_id"] for r in results] == [20]


if __name__ == "__main__":
    test_case_search_only_embeds_cases_in_scope()
    test_case_search_returns_empty_without_running_the_subprocess()
    test_client_searches_only_their_own_cases()
    print("ok")
