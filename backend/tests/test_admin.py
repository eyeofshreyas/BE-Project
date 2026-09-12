# ponytail self-check for the admin analytics aggregation -- the buckets are the only
# real logic in the admin domain (everything else is a count passed straight through),
# and an off-by-one month or week would silently draw the wrong chart.
"""Tests for the admin console's analytics aggregation."""
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from app.controllers.admin import get_analytics


def _fake_supabase(case_rows, summary_rows, summarized_count, live_docs, deleted_count):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        if name == "cases":
            m.select.return_value.execute.return_value.data = case_rows
        elif name == "ai_summaries":
            def select(*args, **kwargs):
                sel = MagicMock()
                if kwargs.get("count") == "exact":
                    sel.execute.return_value.count = summarized_count
                else:
                    sel.gte.return_value.execute.return_value.data = summary_rows
                return sel
            m.select.side_effect = select
        elif name == "documents":
            def select(*args, **kwargs):
                sel = MagicMock()
                if kwargs.get("count") == "exact":
                    sel.eq.return_value.execute.return_value.count = deleted_count
                else:
                    sel.eq.return_value.execute.return_value.data = live_docs
                return sel
            m.select.side_effect = select
        return m

    fake.table.side_effect = table
    return fake


def test_analytics_buckets_cases_by_month_and_summaries_by_week():
    """Verifies cases land in the right month bucket (falling back to created_at when
    filing_date is null) and AI summaries in the right week. Exercises: `GET /admin/analytics`."""
    today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    fake = _fake_supabase(
        case_rows=[
            {"status": "Open", "filing_date": today.isoformat(), "created_at": None},
            {"status": "Open", "filing_date": None, "created_at": f"{today.isoformat()}T10:00:00+00:00"},
            {"status": "Closed", "filing_date": (today - timedelta(days=400)).isoformat(), "created_at": None},
        ],
        summary_rows=[{"generated_at": f"{this_monday.isoformat()}T09:00:00+00:00"}],
        summarized_count=1,
        live_docs=[{"file_size": 1000}, {"file_size": 2500}],
        deleted_count=4,
    )

    with patch("app.controllers.admin.supabase", fake):
        result = get_analytics(profile={})

    assert result["total_cases"] == 3
    assert dict((s["label"], s["count"]) for s in result["case_status"]) == {"Open": 2, "Closed": 1}
    # Both of this month's cases land in the last (current) growth bucket; the 400-day-old
    # one falls outside the 6-month window entirely.
    assert len(result["case_growth"]) == 6
    assert result["case_growth"][-1]["count"] == 2
    assert sum(m["count"] for m in result["case_growth"]) == 2
    assert len(result["ai_usage"]) == 8
    assert result["ai_usage"][-1]["count"] == 1
    assert result["documents"] == {"total": 2, "summarized": 1, "awaiting_summary": 1, "deleted": 4}
    assert result["storage"]["used_bytes"] == 3500


def test_awaiting_summary_never_goes_negative():
    """Verifies more summaries than live documents (summaries outlive a soft-deleted doc)
    clamps to zero instead of showing a negative card. Exercises: `GET /admin/analytics`."""
    fake = _fake_supabase(case_rows=[], summary_rows=[], summarized_count=9, live_docs=[], deleted_count=9)
    with patch("app.controllers.admin.supabase", fake):
        result = get_analytics(profile={})
    assert result["documents"]["awaiting_summary"] == 0
