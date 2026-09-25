# ponytail self-check for the case-team guards -- a lawyer must only be able
# to add/remove teammates on cases where they're the Primary, and only from
# their own org; anyone assigned can remove themselves.
"""Tests for the cases domain: case creation's consent gate and case-team management."""
import inspect
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.middleware import auth
from app.controllers.cases import _to_case_summary, add_lawyer_to_case, create_case, list_available_case_lawyers, remove_lawyer_from_case, update_case_claim_value, update_case_filing_details
from app.models.cases import AddLawyerRequest, CaseClaimValueUpdate, CaseCreate, CaseFilingUpdate


def _role_gate(fn):
    """The dependency FastAPI resolves for `fn`'s profile parameter. Calling the controller
    directly skips it, so a role gate has to be exercised through this to be tested at all."""
    return inspect.signature(fn).parameters["profile"].default.dependency


# ponytail self-check for create_case's consent gate -- a lawyer may only
# open a case for a client who accepted their client_requests invite.
def _fake_supabase_for_create(accepted_request_rows: list[dict], case_row: dict):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"lawyer_id": 5}]
        elif name == "client_requests":
            m.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = accepted_request_rows
        elif name == "case_types":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"case_type_name": "Civil"}]
        elif name == "cases":
            m.select.return_value.like.return_value.execute.return_value.data = []
            m.select.return_value.eq.return_value.execute.return_value.data = [case_row]
        tables[name] = m
        return m

    fake.table.side_effect = table
    fake.rpc.return_value.execute.return_value.data = case_row.get("case_id")
    return fake


def _case_create_payload():
    return CaseCreate(case_type_id=1, case_title="Test matter", client_id=99, court_id=1)


def test_create_case_denied_without_accepted_request():
    """Verifies a lawyer cannot open a case for a client with no accepted `client_requests` row; raises 403. Exercises: `POST /cases` (`cases.create_case()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1, "full_name": "Test Lawyer"}
    fake = _fake_supabase_for_create(accepted_request_rows=[], case_row={})
    with patch("app.controllers.cases.supabase", fake):
        try:
            create_case(_case_create_payload(), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_create_case_allowed_with_accepted_request():
    """Verifies a lawyer can open a case once the client has an accepted `client_requests` row. Exercises: `POST /cases` (`cases.create_case()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 1, "full_name": "Test Lawyer", "org_id": 7}
    case_row = {
        "case_id": 42, "case_number": "CIV2026001", "case_title": "Test matter", "filing_date": None,
        "created_at": None, "status": "Open", "priority": "Medium", "next_hearing_date": None,
        "client_id": 99, "org_id": 7, "clients": None, "courts": None, "case_types": None, "case_lawyers": [],
    }
    fake = _fake_supabase_for_create(accepted_request_rows=[{"request_id": 1}], case_row=case_row)
    with patch("app.controllers.cases.supabase", fake):
        result = create_case(_case_create_payload(), profile)
        assert result["case_id"] == 42


PRIMARY_LAWYER_PROFILE = {"role_id": auth.LAWYER, "user_id": 1, "org_id": 7}
ASSOCIATE_LAWYER_PROFILE = {"role_id": auth.LAWYER, "user_id": 2, "org_id": 7}

TEAM_CASE_ROW = {
    "case_id": 42, "case_number": "C001", "case_title": "x", "filing_date": None, "created_at": None, "status": "Open",
    "priority": "Medium", "next_hearing_date": None, "client_id": 99, "org_id": 7,
    "clients": None, "courts": None, "case_types": None, "description": None, "cnr_number": None,
    "ecourts_status": None, "ecourts_last_synced_at": None,
    "case_lawyers": [
        {"lawyer_id": 5, "assigned_role": "Primary", "is_active": True, "lawyers": {"users": {"full_name": "Primary Lawyer", "email": "p@example.com", "phone": "1"}}},
    ],
}


def _fake_supabase_for_team(assigned_case_ids: set[int], case_row: dict, target_lawyer_org_id: int, caller_lawyer_id: int):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "lawyers":
            def select(fields):
                sel = MagicMock()
                if "users(org_id)" in fields:
                    sel.eq.return_value.execute.return_value.data = [{"lawyer_id": 6, "users": {"org_id": target_lawyer_org_id}}]
                else:
                    sel.eq.return_value.execute.return_value.data = [{"lawyer_id": caller_lawyer_id}]
                return sel
            m.select.side_effect = select
        elif name == "case_lawyers":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {"case_id": cid} for cid in assigned_case_ids
            ]
            m.insert.return_value.execute.return_value = MagicMock()
            m.update.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
        elif name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = [case_row]
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_primary_lawyer_can_add_a_same_org_teammate():
    """Verifies a case's Primary lawyer can add a teammate from the same org. Exercises: `POST /cases/{id}/lawyers` (`cases.add_lawyer_to_case()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = add_lawyer_to_case(42, AddLawyerRequest(lawyer_id=6, assigned_role="Associate"), PRIMARY_LAWYER_PROFILE)
    assert result["case_id"] == 42
    fake.table("case_lawyers").insert.assert_called_once_with({"case_id": 42, "lawyer_id": 6, "assigned_role": "Associate", "is_active": True})


def test_add_lawyer_rejects_a_different_org_lawyer():
    """Verifies adding a lawyer from a different org is refused with 403. Exercises: `POST /cases/{id}/lawyers` (`cases.add_lawyer_to_case()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=8, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        try:
            add_lawyer_to_case(42, AddLawyerRequest(lawyer_id=6, assigned_role="Associate"), PRIMARY_LAWYER_PROFILE)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_non_primary_lawyer_cannot_add_a_teammate():
    """Verifies a non-Primary lawyer on the case cannot add a teammate. Exercises: `POST /cases/{id}/lawyers` (`cases.add_lawyer_to_case()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=2)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        try:
            add_lawyer_to_case(42, AddLawyerRequest(lawyer_id=6, assigned_role="Associate"), ASSOCIATE_LAWYER_PROFILE)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_add_lawyer_rejects_a_second_primary():
    """Verifies a case's Primary cannot add another lawyer as Primary; raises 409 -- a case may
    have only one Primary, set once at creation. Exercises: `POST /cases/{id}/lawyers`
    (`cases.add_lawyer_to_case()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        try:
            add_lawyer_to_case(42, AddLawyerRequest(lawyer_id=6, assigned_role="Primary"), PRIMARY_LAWYER_PROFILE)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 409


ADMIN_PROFILE = {"role_id": auth.ADMIN, "user_id": 3, "org_id": 7}

NO_PRIMARY_CASE_ROW = {**TEAM_CASE_ROW, "case_lawyers": []}


def test_admin_can_assign_a_new_primary_when_case_has_none():
    """Verifies an org admin can assign a new Primary to a case whose original one self-removed
    (or was removed), so the case isn't permanently stuck with no Primary and no way to get one.
    Exercises: `POST /cases/{id}/lawyers` (`cases.add_lawyer_to_case()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=NO_PRIMARY_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = add_lawyer_to_case(42, AddLawyerRequest(lawyer_id=6, assigned_role="Primary"), ADMIN_PROFILE)
    assert result["case_id"] == 42
    fake.table("case_lawyers").insert.assert_called_once_with({"case_id": 42, "lawyer_id": 6, "assigned_role": "Primary", "is_active": True})


def test_lawyer_cannot_self_promote_to_primary_when_case_has_none():
    """Verifies a lawyer already on a Primary-less case still can't add themselves (or anyone)
    as Primary -- only an admin/super-admin can, since no lawyer is "the Primary" to authorize
    it. Exercises: `POST /cases/{id}/lawyers` (`cases.add_lawyer_to_case()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=NO_PRIMARY_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=2)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        try:
            add_lawyer_to_case(42, AddLawyerRequest(lawyer_id=6, assigned_role="Primary"), ASSOCIATE_LAWYER_PROFILE)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_add_lawyer_reactivates_a_previously_removed_teammate():
    """Verifies re-adding a lawyer who was previously removed from the case reactivates their
    existing case_lawyers row instead of inserting a duplicate -- a fresh insert would violate
    the unique (case_id, lawyer_id) index and 500. Exercises: `POST /cases/{id}/lawyers`
    (`cases.add_lawyer_to_case()`)."""
    case_row = {
        **TEAM_CASE_ROW,
        "case_lawyers": TEAM_CASE_ROW["case_lawyers"] + [
            {"lawyer_id": 6, "assigned_role": "Associate", "is_active": False,
             "lawyers": {"users": {"full_name": "Former Teammate", "email": "f@example.com", "phone": "2"}}},
        ],
    }
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=case_row, target_lawyer_org_id=7, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = add_lawyer_to_case(42, AddLawyerRequest(lawyer_id=6, assigned_role="Associate"), PRIMARY_LAWYER_PROFILE)
    assert result["case_id"] == 42
    fake.table("case_lawyers").insert.assert_not_called()
    fake.table("case_lawyers").update.assert_called_once_with({"assigned_role": "Associate", "is_active": True})


def test_associate_can_remove_themselves():
    """Verifies a non-Primary teammate can remove themselves from a case. Exercises: `DELETE /cases/{id}/lawyers/{lawyer_id}` (`cases.remove_lawyer_from_case()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=2)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = remove_lawyer_from_case(42, 2, ASSOCIATE_LAWYER_PROFILE)
    assert result["case_id"] == 42
    update = fake.table("case_lawyers").update
    assert update.call_args[0][0] == {"is_active": False}
    assert update.return_value.eq.call_args[0] == ("case_id", 42)
    assert update.return_value.eq.return_value.eq.call_args[0] == ("lawyer_id", 2)


def test_associate_cannot_remove_someone_else():
    """Verifies a non-Primary teammate cannot remove a different lawyer from the case. Exercises: `DELETE /cases/{id}/lawyers/{lawyer_id}` (`cases.remove_lawyer_from_case()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=2)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        try:
            remove_lawyer_from_case(42, 5, ASSOCIATE_LAWYER_PROFILE)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_update_case_filing_details_writes_only_provided_fields():
    """Verifies update_case_filing_details writes only the field(s) sent, not the ones left
    out, and returns the refreshed case. Exercises: `PATCH /cases/{id}/filing-details`
    (`cases.update_case_filing_details()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = update_case_filing_details(42, CaseFilingUpdate(registration_number="REG/2026/123"), PRIMARY_LAWYER_PROFILE)
    assert result["case_id"] == 42
    fake.table("cases").update.assert_called_once_with({"registration_number": "REG/2026/123"})


def test_update_case_filing_details_rejects_out_of_scope_case():
    """Verifies a lawyer not scoped to this case can't edit its filing details; raises 403.
    Exercises: `PATCH /cases/{id}/filing-details` (`cases.update_case_filing_details()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={99}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        try:
            update_case_filing_details(42, CaseFilingUpdate(filing_number="F/1"), PRIMARY_LAWYER_PROFILE)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_update_case_claim_value_sets_and_clears():
    """Verifies update_case_claim_value writes the sent value, including an explicit null
    to clear a previously-set value. Exercises: `PATCH /cases/{id}/claim-value`
    (`cases.update_case_claim_value()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={42}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = update_case_claim_value(42, CaseClaimValueUpdate(claim_value=2500000), PRIMARY_LAWYER_PROFILE)
    assert result["case_id"] == 42
    fake.table("cases").update.assert_called_once_with({"claim_value": 2500000})

    fake2 = _fake_supabase_for_team(assigned_case_ids={42}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake2), patch("app.middleware.auth.supabase", fake2):
        update_case_claim_value(42, CaseClaimValueUpdate(claim_value=None), PRIMARY_LAWYER_PROFILE)
    fake2.table("cases").update.assert_called_once_with({"claim_value": None})


def test_claim_value_update_rejects_negative_and_non_finite_values():
    """Verifies CaseClaimValueUpdate refuses a negative, NaN, or infinite claim value --
    a bare float would let ordinary UI use (typing '-5000' into the case-detail card and
    clicking Save, no form-submit validation involved) silently corrupt the Firm Analytics
    exposure total. Exercises: `PATCH /cases/{id}/claim-value` (`models.cases.CaseClaimValueUpdate`)."""
    for bad in (-5000, float("nan"), float("inf"), float("-inf")):
        try:
            CaseClaimValueUpdate(claim_value=bad)
            assert False, f"expected ValidationError for claim_value={bad}"
        except ValidationError:
            pass
    CaseClaimValueUpdate(claim_value=0)
    CaseClaimValueUpdate(claim_value=2500000)
    CaseClaimValueUpdate(claim_value=None)


def test_update_case_claim_value_rejects_out_of_scope_case():
    """Verifies a lawyer not scoped to this case can't set its claim value; raises 403.
    Exercises: `PATCH /cases/{id}/claim-value` (`cases.update_case_claim_value()`)."""
    fake = _fake_supabase_for_team(assigned_case_ids={99}, case_row=TEAM_CASE_ROW, target_lawyer_org_id=7, caller_lawyer_id=5)
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        try:
            update_case_claim_value(42, CaseClaimValueUpdate(claim_value=100), PRIMARY_LAWYER_PROFILE)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_case_summary_lists_every_active_teammate():
    """Verifies CaseSummary.lawyers includes every active case_lawyers row, and the singular lawyer fields still point at the Primary specifically. Exercises: `GET /cases` (`cases._to_case_summary()`)."""
    row = {**TEAM_CASE_ROW, "case_lawyers": [
        {"lawyer_id": 5, "assigned_role": "Primary", "is_active": True, "lawyers": {"users": {"full_name": "Primary Lawyer", "email": "p@example.com", "phone": "1"}}},
        {"lawyer_id": 6, "assigned_role": "Associate", "is_active": True, "lawyers": {"users": {"full_name": "Associate Lawyer", "email": "a@example.com", "phone": "2"}}},
        {"lawyer_id": 9, "assigned_role": "Associate", "is_active": False, "lawyers": {"users": {"full_name": "Former Lawyer", "email": "f@example.com", "phone": "3"}}},
    ]}
    summary = _to_case_summary(row)
    assert summary["lawyer"] == "Primary Lawyer"
    assert {la["lawyer_id"] for la in summary["lawyers"]} == {5, 6}


def _available_lawyers_fake(roster: list[dict]):
    """supabase double for list_available_case_lawyers: one org lawyer (lawyer_id 6, user 20)
    and `roster` as the case's active case_lawyers rows."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"org_id": 7}]
        elif name == "users":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                {"user_id": 20, "full_name": "Org Lawyer", "email": "o@example.com"}
            ]
        elif name == "lawyers":
            m.select.return_value.in_.return_value.execute.return_value.data = [{"lawyer_id": 6, "user_id": 20}]
        elif name == "case_lawyers":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = roster
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_available_case_lawyers_are_scoped_to_the_cases_org():
    """Verifies the add-teammate picker only lists lawyers in the case's own organization. Exercises: `GET /cases/{id}/available-lawyers` (`cases.list_available_case_lawyers()`)."""
    fake = _available_lawyers_fake([{"case_id": 42, "lawyer_id": 99}])
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = list_available_case_lawyers(42, PRIMARY_LAWYER_PROFILE)
    assert result == [{"lawyer_id": 6, "name": "Org Lawyer", "email": "o@example.com"}]


def test_available_case_lawyers_excludes_the_current_team():
    """Verifies a lawyer already on the case isn't offered again -- adding them could only ever
    come back as a 409. Exercises: `GET /cases/{id}/available-lawyers`."""
    fake = _available_lawyers_fake([{"case_id": 42, "lawyer_id": 6}])
    with patch("app.controllers.cases.supabase", fake), patch("app.middleware.auth.supabase", fake):
        result = list_available_case_lawyers(42, PRIMARY_LAWYER_PROFILE)
    assert result == []


def test_client_cannot_list_available_case_lawyers():
    """Verifies a CLIENT profile is rejected by list_available_case_lawyers's role gate; raises
    403 -- this endpoint backs an internal add-teammate picker, not a client-facing view.
    Exercises: `GET /cases/{id}/available-lawyers` (`cases.list_available_case_lawyers()`)."""
    try:
        _role_gate(list_available_case_lawyers)({"role_id": auth.CLIENT, "user_id": 1})
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 403


if __name__ == "__main__":
    test_create_case_denied_without_accepted_request()
    test_create_case_allowed_with_accepted_request()
    test_primary_lawyer_can_add_a_same_org_teammate()
    test_add_lawyer_rejects_a_different_org_lawyer()
    test_non_primary_lawyer_cannot_add_a_teammate()
    test_add_lawyer_rejects_a_second_primary()
    test_add_lawyer_reactivates_a_previously_removed_teammate()
    test_associate_can_remove_themselves()
    test_associate_cannot_remove_someone_else()
    test_case_summary_lists_every_active_teammate()
    test_available_case_lawyers_are_scoped_to_the_cases_org()
    test_client_cannot_list_available_case_lawyers()
    print("ok")
