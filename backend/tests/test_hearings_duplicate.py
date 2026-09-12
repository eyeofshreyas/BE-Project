# ponytail self-check for create_hearing -- a double-submitted form used to
# insert the same hearing twice, and every case summary then read it as two.
"""Tests that a case isn't given the same hearing twice by accident -- and that a
deliberate repeat listing still can be."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.controllers.hearings import create_hearing
from app.models.hearings import HearingCreate

PROFILE = {"user_id": 1, "role_id": 2}
PAYLOAD = HearingCreate(case_id=1, judge_id=1, hearing_date="2026-08-15", hearing_time="11:00:00",
                        courtroom="Court Room 3", notes="Initial hearing")
HEARING = {"id": 42, "hearing_date": "2026-08-15", "hearing_time": "11:00:00",
           "judge_name": "Justice S. Kulkarni", "courtroom": "Court Room 3"}


def _fake_supabase(existing):
    fake = MagicMock()
    table = MagicMock()
    chain = table.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value
    chain.execute.return_value.data = existing
    table.insert.return_value.execute.return_value.data = [{"hearing_id": 42}]
    fake.table.return_value = table
    return fake, table


def test_second_identical_hearing_is_rejected():
    fake, table = _fake_supabase([{"hearing_id": 1}])
    with patch("app.controllers.hearings.supabase", fake), \
         patch("app.controllers.hearings.ensure_case_access"):
        with pytest.raises(HTTPException) as exc:
            create_hearing(PAYLOAD, PROFILE)

    assert exc.value.status_code == 409
    table.insert.assert_not_called()


def test_an_intended_repeat_listing_goes_through():
    """A case can genuinely be listed twice at one slot -- saying so must not be refused."""
    fake, table = _fake_supabase([{"hearing_id": 1}])
    payload = PAYLOAD.model_copy(update={"allow_duplicate": True})
    with patch("app.controllers.hearings.supabase", fake), \
         patch("app.controllers.hearings.ensure_case_access"), \
         patch("app.controllers.hearings._sync_next_hearing_date"), \
         patch("app.controllers.hearings.add_timeline_event"), \
         patch("app.controllers.hearings._get_hearing") as get_hearing:
        get_hearing.return_value = HEARING
        assert create_hearing(payload, PROFILE) == HEARING

    table.insert.assert_called_once()


def test_a_new_slot_still_inserts():
    fake, table = _fake_supabase([])
    with patch("app.controllers.hearings.supabase", fake), \
         patch("app.controllers.hearings.ensure_case_access"), \
         patch("app.controllers.hearings._sync_next_hearing_date"), \
         patch("app.controllers.hearings._get_hearing") as get_hearing, \
         patch("app.controllers.hearings.add_timeline_event") as add_event:
        get_hearing.return_value = HEARING
        assert create_hearing(PAYLOAD, PROFILE) == HEARING

    table.insert.assert_called_once()
    # the case page and the AI summary both read the timeline as the case's history
    case_id, event_type, title, description, _ = add_event.call_args[0]
    assert (case_id, event_type) == (1, "hearing_scheduled")
    assert title == "Hearing scheduled for 2026-08-15 at 11:00"
    assert description == "Listed before Justice S. Kulkarni, Court Room 3."
