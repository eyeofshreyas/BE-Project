# ponytail self-check for the case-scoping fix on conveyancing writes -- a
# lawyer scoped to case 10 must not be able to update due-diligence or
# progress on a matter that belongs to case 20.
"""Tests for the conveyancing domain: case-scoping on matter writes (due diligence, progress stages)."""
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.conveyancing import update_due_diligence, complete_progress_stage, update_matter, _next_matter_seq
from app.models.conveyancing import DueDiligenceUpdate, MatterUpdate


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


LAWYER_SCOPED_TO_CASE_10 = {"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 10}]}
MATTER_ON_CASE_20 = {"conveyancing_matters": [{"matter_id": 5, "case_id": 20}]}


def test_update_due_diligence_rejects_matter_on_out_of_scope_case():
    """Verifies updating due diligence on a matter whose case is out of scope raises 403, via a mocked matter lookup. Exercises: `PATCH /conveyancing/matters/{id}/due-diligence` (`conveyancing.update_due_diligence()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.conveyancing.supabase", _fake_supabase(MATTER_ON_CASE_20)):
        try:
            update_due_diligence(5, DueDiligenceUpdate(title_clear=True), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_complete_progress_stage_rejects_matter_on_out_of_scope_case():
    """Verifies completing a progress stage on a matter whose case is out of scope raises 403, via a mocked matter lookup. Exercises: `POST /conveyancing/matters/{id}/stages/{stage_id}/complete` (`conveyancing.complete_progress_stage()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.conveyancing.supabase", _fake_supabase(MATTER_ON_CASE_20)):
        try:
            complete_progress_stage(5, 1, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_update_matter_rejects_matter_on_out_of_scope_case():
    """Verifies editing a matter's registration status/date on an out-of-scope case raises 403, via a mocked matter lookup. Exercises: `PATCH /conveyancing/matters/{id}` (`conveyancing.update_matter()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    with patch("app.middleware.auth.supabase", _fake_supabase(LAWYER_SCOPED_TO_CASE_10)), \
         patch("app.controllers.conveyancing.supabase", _fake_supabase(MATTER_ON_CASE_20)):
        try:
            update_matter(5, MatterUpdate(registration_status="Lodged"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_next_matter_seq_skips_numbers_already_in_use():
    """Verifies the generated matter/case number clears every number already taken -- counting
    rows produced PROP2026010 while that case_number existed, breaking every create. Exercises:
    `POST /conveyancing/matters` (`conveyancing.create_matter()`)."""
    fake = MagicMock()
    fake.table.side_effect = lambda name: MagicMock(**{"select.return_value.execute.return_value.data": {
        "conveyancing_matters": [{"matter_number": "MAT-2026-001"}, {"matter_number": "MAT-2026-106"}],
        "cases": [{"case_number": "PROP2026010"}, {"case_number": "CRL-2026-9"}],
    }[name]})
    with patch("app.controllers.conveyancing.supabase", fake):
        assert _next_matter_seq(2026) == 107


if __name__ == "__main__":
    test_update_due_diligence_rejects_matter_on_out_of_scope_case()
    test_complete_progress_stage_rejects_matter_on_out_of_scope_case()
    test_update_matter_rejects_matter_on_out_of_scope_case()
    test_next_matter_seq_skips_numbers_already_in_use()
    print("ok")


# ponytail self-check for the appointment count -- a client whose only booked
# appointment is the Sub-Registrar slot used to see "0 upcoming appointments",
# because only `meetings` was counted.
class _SummaryStub:
    """Stands in for the supabase client across the several tables conveyancing_summary() reads."""

    def __init__(self, matters, meetings, registrations):
        self.matters, self.meetings, self.registrations = matters, meetings, registrations

    def table(self, name):
        chain = MagicMock()
        if name == "conveyancing_matters":
            chain.select.return_value.order.return_value.execute.return_value.data = self.matters
            chain.select.return_value.in_.return_value.order.return_value.execute.return_value.data = self.matters
        elif name == "meetings":
            chain.select.return_value.in_.return_value.gte.return_value.execute.return_value.data = self.meetings
        elif name == "property_registrations":
            chain.select.return_value.in_.return_value.gte.return_value.not_.in_.return_value.execute.return_value.data = self.registrations
        return chain


def _matter(matter_id=20, case_id=15, status="Drafting"):
    return {
        "matter_id": matter_id, "case_id": case_id, "matter_number": "MAT-2026-104",
        "registration_status": status, "transaction_type": "Purchase", "matter_type": "Off-the-Plan Purchase",
        "properties": None, "conveyancing_parties": [], "cases": None,
    }


def _summary(matters, meetings, registrations):
    from app.controllers.conveyancing import conveyancing_summary
    with patch("app.middleware.auth.supabase", MagicMock()), \
         patch("app.controllers.conveyancing.get_scoped_case_ids", return_value={15}), \
         patch("app.controllers.conveyancing.supabase", _SummaryStub(matters, meetings, registrations)):
        return conveyancing_summary({"role_id": 3, "user_id": 26})


def test_a_booked_registration_slot_counts_as_an_upcoming_appointment():
    result = _summary([_matter()], meetings=[], registrations=[{"registration_id": 6}])
    assert result["stats"]["upcoming_appointments"] == 1


def test_meetings_and_registration_slots_are_counted_together():
    result = _summary([_matter()], meetings=[{"meeting_id": 1}], registrations=[{"registration_id": 6}])
    assert result["stats"]["upcoming_appointments"] == 2


def test_no_meetings_and_no_slots_is_zero():
    assert _summary([_matter()], meetings=[], registrations=[])["stats"]["upcoming_appointments"] == 0


def test_a_client_with_no_matters_queries_nothing():
    assert _summary([], meetings=[], registrations=[])["stats"]["upcoming_appointments"] == 0
