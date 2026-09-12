# ponytail self-check: count-based numbering handed back a case_number that already
# existed whenever a number in the run was missing (a deleted case, seed data starting
# at 003), and the insert died on cases_case_number_key.
"""Tests that a generated case number clears every number already in use for its prefix."""
from unittest.mock import MagicMock, patch

from app.controllers.cases import _generate_case_number
from app.controllers import client_requests


def _fake_supabase(case_numbers):
    fake = MagicMock()
    fake.table.return_value.select.return_value.like.return_value.execute.return_value.data = [
        {"case_number": n} for n in case_numbers
    ]
    return fake


def test_case_number_skips_a_gap_in_the_sequence():
    """Verifies a prefix whose run has a hole (CON..003, CON..004) gets the next free number, not
    a duplicate. Exercises: `POST /cases` (`cases.create_case()` -> `_generate_case_number()`)."""
    with patch("app.controllers.cases.supabase", _fake_supabase(["CON2026003", "CON2026004"])), \
         patch("app.controllers.cases.datetime") as dt:
        dt.now.return_value.year = 2026
        assert _generate_case_number("Consumer") == "CON2026005"


def test_case_number_starts_at_one_for_an_unused_prefix():
    """Verifies the first case of a type is numbered 001. Exercises: `cases._generate_case_number()`."""
    with patch("app.controllers.cases.supabase", _fake_supabase([])), \
         patch("app.controllers.cases.datetime") as dt:
        dt.now.return_value.year = 2026
        assert _generate_case_number("Civil") == "CIV2026001"


def test_client_request_acceptance_uses_the_same_generator():
    """Verifies accepting an invite numbers its case through the same helper, so the two case-creating
    paths can't hand out the same number. Exercises: `PATCH /client-requests/{id}/respond`."""
    assert client_requests._generate_case_number is _generate_case_number


if __name__ == "__main__":
    test_case_number_skips_a_gap_in_the_sequence()
    test_case_number_starts_at_one_for_an_unused_prefix()
    test_client_request_acceptance_uses_the_same_generator()
    print("ok")
