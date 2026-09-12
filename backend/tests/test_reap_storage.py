# ponytail self-check for the reaper's selection: it permanently removes files, so the
# query that decides what is eligible is the part that must never be wrong. A row that
# shouldn't be picked here is a file destroyed.
"""Tests for reap_storage.find_reapable: grace period, missing timestamps, missing paths."""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import reap_storage

NOW = datetime(2026, 9, 12, tzinfo=timezone.utc)


class _Query:
    """Records the filters find_reapable applies and returns the rows it was primed with."""

    def __init__(self, rows):
        self.rows = rows
        self.filters = {}
        self.not_ = MagicMock()
        self.not_.is_.side_effect = self._is_not_null

    def _is_not_null(self, col, val):
        self.filters["not_null"] = (col, val)
        return self

    def select(self, cols):
        self.filters["select"] = cols
        return self

    def eq(self, col, val):
        self.filters[col] = val
        return self

    def lt(self, col, val):
        self.filters["lt"] = (col, val)
        return self

    def execute(self):
        return MagicMock(data=self.rows)


def _run(rows, grace_days=30):
    q = _Query(rows)
    fake = MagicMock()
    fake.table.return_value = q
    with patch.object(reap_storage, "supabase", fake):
        return reap_storage.find_reapable(grace_days, now=NOW), q


def _row(doc_id=1, days_ago=100, path="case-1/abc.pdf"):
    return {
        "document_id": doc_id,
        "file_name": "f.pdf",
        "case_id": 1,
        "file_path": path,
        "deleted_at": (NOW - timedelta(days=days_ago)).isoformat(),
    }


def test_it_only_asks_for_soft_deleted_rows():
    _, q = _run([])
    assert q.filters["is_deleted"] is True


def test_the_cutoff_is_the_grace_period_before_now():
    _, q = _run([], grace_days=30)
    col, cutoff = q.filters["lt"]
    assert col == "deleted_at"
    assert cutoff == (NOW - timedelta(days=30)).isoformat()


def test_a_longer_grace_period_moves_the_cutoff_back():
    _, q = _run([], grace_days=90)
    assert q.filters["lt"][1] == (NOW - timedelta(days=90)).isoformat()


def test_rows_with_no_deleted_at_are_excluded_by_the_query():
    """Pre-migration rows have no timestamp; guessing their age would be guessing about
    permanent deletion, so the query refuses them outright."""
    _, q = _run([])
    assert q.filters["not_null"] == ("deleted_at", "null")


def test_a_row_with_no_file_path_is_dropped():
    rows, _ = _run([_row(path=None), _row(doc_id=2)])
    assert [r["document_id"] for r in rows] == [2]


def test_eligible_rows_come_back():
    rows, _ = _run([_row(doc_id=7)])
    assert [r["document_id"] for r in rows] == [7]
