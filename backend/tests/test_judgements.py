# ponytail self-check for list_judgements -- a lawyer must only see
# judgements for cases they're actively assigned to, and the summary
# transform must pull case_number/case_title/filing_date off the join.
"""Tests for the judgements domain: the lawyer-scoped judgement listing and its case-field join."""
from unittest.mock import MagicMock, patch

from app.middleware import auth
from app.controllers.judgements import list_judgements


def _fake_supabase(lawyer_id: int, case_ids: list[int], judgement_rows: list[dict]):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"lawyer_id": lawyer_id}]
        elif name == "case_lawyers":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"case_id": cid} for cid in case_ids]
        elif name == "judgements":
            m.select.return_value.in_.return_value.order.return_value.execute.return_value.data = judgement_rows
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_lawyer_with_no_cases_sees_no_judgements():
    """Verifies a lawyer with no assigned cases gets an empty judgement list. Exercises: `GET /judgements` (`judgements.list_judgements()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    fake = _fake_supabase(5, [], [])
    with patch("app.controllers.judgements.supabase", fake), patch("app.middleware.auth.supabase", fake):
        assert list_judgements(profile) == []


def test_summary_pulls_case_fields_from_join():
    """Verifies the judgement summary copies case_number/case_title/filing_date and relief_amount from the joined `cases` row. Exercises: `GET /judgements` (`judgements.list_judgements()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    row = {
        "judgement_id": 3, "case_id": 10, "citation": "2026 SCC OnLine Bom 412",
        "court": "Bombay High Court", "bench": "Justice A. R. Deshpande",
        "judgement_date": "2026-07-22", "outcome": "Favourable",
        "summary": "Partition decree confirmed.", "relief_text": None,
        "relief_amount": 6200000, "appeal_status": "Closed", "tags": ["Property"],
        "cases": {"case_number": "LX-2024-8821", "case_title": "Sharma vs. Patel Estate", "filing_date": "2025-01-10"},
    }
    fake = _fake_supabase(5, [10], [row])
    with patch("app.controllers.judgements.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = list_judgements(profile)
        assert len(result) == 1
        assert result[0]["case_number"] == "LX-2024-8821"
        assert result[0]["case_title"] == "Sharma vs. Patel Estate"
        assert result[0]["filing_date"] == "2025-01-10"
        assert result[0]["relief_amount"] == 6200000


if __name__ == "__main__":
    test_lawyer_with_no_cases_sees_no_judgements()
    test_summary_pulls_case_fields_from_join()
    print("ok")
