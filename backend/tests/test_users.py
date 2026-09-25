# ponytail self-check for delete_user -- the deletion itself is irreversible, so the two
# refusals in front of it (your own account, the last admin) are the only thing standing
# between a mis-click and an unadministrable platform.
"""Tests for the admin user-delete guardrails and its storage cleanup."""
import inspect
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from storage3.exceptions import StorageApiError

from app.controllers.users import delete_user, list_users, set_client_firm_status, set_user_status, update_user
from app.middleware import auth
from app.models.users import ClientFirmStatusUpdate, ProfileUpdate, StatusUpdate

ADMIN_PROFILE = {"role_id": auth.ADMIN, "user_id": 1, "org_id": 7}


def _fake_supabase(target_role: int, admin_count: int, target_org_id: int = 7, trust_rows: list | None = None):
    """`trust_rows` stands in for the target's trust ledger -- empty by default, so the
    held-money check in `_assert_deletable()` passes and the other rules get exercised."""
    fake = MagicMock()
    m = MagicMock()
    m.select.return_value.eq.return_value.execute.return_value.data = [{"role_id": target_role, "org_id": target_org_id}]
    m.select.return_value.eq.return_value.eq.return_value.execute.return_value.count = admin_count

    trust = MagicMock()
    trust.select.return_value.eq.return_value.execute.return_value.data = trust_rows or []
    clients = MagicMock()
    clients.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 4}]

    fake.table.side_effect = lambda name: {"trust_transactions": trust, "clients": clients}.get(name, m)
    fake.table.return_value = m
    fake.rpc.return_value.execute.return_value.data = {"user_id": 2, "storage_paths": ["case-1/a.pdf"]}
    return fake


ORG_ADMIN_PROFILE = {"role_id": auth.ADMIN, "user_id": 1, "org_id": 7}


def test_org_admin_only_lists_their_own_org_users():
    """Verifies an org admin's user list is filtered to their own org_id. Exercises: `GET /users` (`users.list_users()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            m.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
        elif name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = []
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.users.supabase", fake):
        list_users(profile=ORG_ADMIN_PROFILE)
    fake.table("users").select.return_value.eq.assert_called_once_with("org_id", 7)
    fake.table("cases").select.return_value.eq.assert_called_once_with("org_id", 7)


def test_org_admin_sees_clients_with_a_case_in_their_org():
    """Verifies clients (global, users.org_id is always NULL) still show up for an org admin
    when they have a case in that org. Exercises: `GET /users` (`users.list_users()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}
    client_user_row = {"user_id": 9, "full_name": "A Client", "email": "c@example.com", "phone": "1",
                        "is_active": True, "created_at": "2026-01-01", "roles": {"role_name": "Client"}}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            def select(*args, **kwargs):
                sel = MagicMock()
                sel.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
                sel.in_.return_value.execute.return_value.data = [client_user_row]
                return sel
            m.select.side_effect = select
        elif name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 3}]
        elif name == "clients":
            m.select.return_value.in_.return_value.execute.return_value.data = [{"user_id": 9, "client_id": 3}]
        elif name == "org_clients":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.users.supabase", fake):
        result = list_users(profile=ORG_ADMIN_PROFILE)
    assert [r["id"] for r in result] == [9]
    assert result[0]["role"] == "Client"
    assert result[0]["suspended"] is False


def test_org_admin_cannot_change_status_of_user_in_another_org():
    """Verifies an org admin gets a 404 (not a 200 or 403) touching a user outside their own org -- they shouldn't even learn the user exists. Exercises: `PATCH /users/{id}/status` (`users.set_user_status()`)."""
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{"org_id": 99}]
    with patch("app.controllers.users.supabase", fake):
        try:
            set_user_status(2, StatusUpdate(is_active=False), profile=ORG_ADMIN_PROFILE)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 404


def test_org_admin_can_edit_a_client_with_a_case_in_their_org():
    """Verifies the client.org_id-is-always-NULL carve-out in `_assert_same_org_or_404` lets
    an org admin edit a client who has a case with them, mirroring set_client_firm_status()'s
    scoping. Exercises: `PUT /users/{id}` (`users.update_user()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}
    client_row = {"user_id": 9, "full_name": "New Name", "email": "c@example.com", "phone": "1",
                  "is_active": True, "created_at": "2026-01-01", "roles": {"role_name": "Client"}}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            # update_user() issues two different `.select()` queries against "users" -- the
            # org_id-only check in _assert_same_org_or_404, then the full row for the
            # response -- so the stub has to tell them apart by their columns argument.
            def select(cols):
                sel = MagicMock()
                sel.eq.return_value.execute.return_value.data = [{"org_id": None}] if cols == "org_id" else [client_row]
                return sel
            m.select.side_effect = select
            m.update.return_value.eq.return_value.execute.return_value.data = [client_row]
        elif name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "cases":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.users.supabase", fake):
        result = update_user(9, ProfileUpdate(full_name="New Name", phone="1"), profile=ORG_ADMIN_PROFILE)
    assert result["id"] == 9
    assert result["specialization"] is None


def test_org_admin_cannot_edit_a_client_with_no_case_in_their_org():
    """Verifies the client carve-out doesn't turn into a platform-wide bypass -- a client with
    no case in the caller's org still 404s. Exercises: `PUT /users/{id}` (`users.update_user()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"org_id": None}]
        elif name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "cases":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.users.supabase", fake):
        with pytest.raises(HTTPException) as exc:
            update_user(9, ProfileUpdate(full_name="New Name", phone="1"), profile=ORG_ADMIN_PROFILE)
    assert exc.value.status_code == 404


def test_list_users_includes_lawyer_specialization():
    """Verifies a lawyer's practice area (lawyers.specialization) rides along in the list
    response -- the Users admin page surfaces it as the lawyer's case-type category.
    Exercises: `GET /users` (`users.list_users()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}
    lawyer_row = {"user_id": 4, "full_name": "A Lawyer", "email": "l@example.com", "phone": "1",
                  "is_active": True, "created_at": "2026-01-01", "roles": {"role_name": "Lawyer"}}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            m.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [lawyer_row]
        elif name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = []
        elif name == "lawyers":
            m.select.return_value.in_.return_value.execute.return_value.data = [{"user_id": 4, "specialization": "Family Law"}]
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.users.supabase", fake):
        result = list_users(profile=ORG_ADMIN_PROFILE)
    assert result[0]["specialization"] == "Family Law"


def test_update_user_writes_a_recognized_specialization_to_lawyers():
    """Verifies editing a lawyer's specialization writes to the `lawyers` table (not `users`,
    which has no such column) and only when it's one of reference.LAWYER_SPECIALIZATIONS.
    Exercises: `PUT /users/{id}` (`users.update_user()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}
    lawyer_row = {"user_id": 4, "full_name": "A Lawyer", "email": "l@example.com", "phone": "1",
                  "is_active": True, "created_at": "2026-01-01", "roles": {"role_name": "Lawyer"}}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            def select(cols):
                sel = MagicMock()
                sel.eq.return_value.execute.return_value.data = [{"org_id": 7}] if cols == "org_id" else [lawyer_row]
                return sel
            m.select.side_effect = select
            m.update.return_value.eq.return_value.execute.return_value.data = [lawyer_row]
        elif name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"specialization": "Civil Litigation"}]
            m.update.return_value.eq.return_value.execute.return_value = MagicMock()
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.users.supabase", fake):
        result = update_user(4, ProfileUpdate(full_name="A Lawyer", phone="1", specialization="Tax Law"), profile=ORG_ADMIN_PROFILE)
    tables["lawyers"].update.assert_called_once_with({"specialization": "Tax Law"})
    assert result["specialization"] == "Tax Law"


def test_update_user_rejects_an_unrecognized_specialization():
    """Verifies a specialization outside the fixed reference list is refused with 400, rather
    than being written as free text. Exercises: `PUT /users/{id}` (`users.update_user()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}
    lawyer_row = {"user_id": 4, "full_name": "A Lawyer", "email": "l@example.com", "phone": "1",
                  "is_active": True, "created_at": "2026-01-01", "roles": {"role_name": "Lawyer"}}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            def select(cols):
                sel = MagicMock()
                sel.eq.return_value.execute.return_value.data = [{"org_id": 7}] if cols == "org_id" else [lawyer_row]
                return sel
            m.select.side_effect = select
            m.update.return_value.eq.return_value.execute.return_value.data = [lawyer_row]
        elif name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"specialization": "Civil Litigation"}]
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.users.supabase", fake):
        with pytest.raises(HTTPException) as exc:
            update_user(4, ProfileUpdate(full_name="A Lawyer", phone="1", specialization="Made Up Law"), profile=ORG_ADMIN_PROFILE)
    assert exc.value.status_code == 400
    assert not tables["lawyers"].update.called


def test_last_admin_check_is_scoped_to_the_admins_own_org():
    """Verifies deleting the last admin is blocked per-org for an org admin (not counted platform-wide). Exercises: `DELETE /users/:id`."""
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{"role_id": auth.ADMIN, "org_id": 7}]
    fake.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.count = 1
    with patch("app.controllers.users.supabase", fake):
        try:
            delete_user(2, ORG_ADMIN_PROFILE)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 400
    fake.table.return_value.select.return_value.eq.return_value.eq.assert_called_once_with("org_id", 7)


def test_org_admin_can_delete_a_client_with_a_case_in_their_org():
    """Verifies the client.org_id-is-always-NULL carve-out in `_assert_same_org_or_404` lets
    an org admin delete a client who has a case with them -- before the fix, the raw
    `org_id != profile["org_id"]` compare 404'd every client unconditionally, since a
    client's `users.org_id` is always NULL. Exercises: `DELETE /users/{id}`."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            def select(cols):
                sel = MagicMock()
                sel.eq.return_value.execute.return_value.data = [{"org_id": None}] if cols == "org_id" else [{"role_id": auth.CLIENT, "org_id": None}]
                return sel
            m.select.side_effect = select
        elif name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "cases":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "trust_transactions":
            m.select.return_value.eq.return_value.execute.return_value.data = []
        tables[name] = m
        return m

    fake.table.side_effect = table
    fake.rpc.return_value.execute.return_value.data = {"user_id": 9, "storage_paths": []}
    with patch("app.controllers.users.supabase", fake):
        assert delete_user(9, ORG_ADMIN_PROFILE)["user_id"] == 9


def test_org_admin_cannot_delete_a_client_with_no_case_in_their_org():
    """Verifies the client carve-out doesn't turn into a platform-wide bypass -- a client with
    no case in the caller's org still 404s. Exercises: `DELETE /users/{id}`."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "users":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"org_id": None}]
        elif name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "cases":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.users.supabase", fake):
        with pytest.raises(HTTPException) as exc:
            delete_user(9, ORG_ADMIN_PROFILE)
    assert exc.value.status_code == 404
    fake.rpc.assert_not_called()


def test_admin_cannot_delete_their_own_account():
    """Verifies deleting yourself is refused before anything is touched. Exercises: `DELETE /users/:id`."""
    with patch("app.controllers.users.supabase", _fake_supabase(auth.CLIENT, 2)) as fake:
        with pytest.raises(HTTPException) as exc:
            delete_user(1, ADMIN_PROFILE)
    assert exc.value.status_code == 400
    fake.rpc.assert_not_called()


def test_last_admin_cannot_be_deleted():
    """Verifies the final admin account is protected, since removing it leaves nobody able
    to administer the platform. Exercises: `DELETE /users/:id`."""
    fake = _fake_supabase(auth.ADMIN, admin_count=1)
    with patch("app.controllers.users.supabase", fake):
        with pytest.raises(HTTPException) as exc:
            delete_user(2, ADMIN_PROFILE)
    assert exc.value.status_code == 400
    fake.rpc.assert_not_called()


def test_client_holding_trust_money_cannot_be_deleted():
    """Verifies a client whose money the firm is still holding is refused -- deleting them
    would destroy the record of funds that aren't the firm's. Exercises: `DELETE /users/:id`."""
    fake = _fake_supabase(auth.CLIENT, 2, trust_rows=[{"type": "deposit", "amount": 5000.00}])
    with patch("app.controllers.users.supabase", fake):
        with pytest.raises(HTTPException) as exc:
            delete_user(2, ADMIN_PROFILE)
    assert exc.value.status_code == 400
    assert "trust account" in exc.value.detail
    fake.rpc.assert_not_called()


def test_client_with_a_drawn_down_trust_balance_can_be_deleted():
    """Verifies a zero balance is no obstacle -- the ledger has entries but the money is gone.
    Exercises: `DELETE /users/:id`."""
    fake = _fake_supabase(auth.CLIENT, 2, trust_rows=[
        {"type": "deposit", "amount": 5000.00},
        {"type": "invoice_payment", "amount": 5000.00},
    ])
    with patch("app.controllers.users.supabase", fake):
        assert delete_user(2, ADMIN_PROFILE)["user_id"] == 2


def test_delete_runs_the_cascade_and_clears_storage():
    """Verifies a permitted delete calls the SQL cascade for real (not a dry run) and removes
    the storage objects it reports orphaning. Exercises: `DELETE /users/:id`."""
    fake = _fake_supabase(auth.CLIENT, 2)
    with patch("app.controllers.users.supabase", fake):
        result = delete_user(2, ADMIN_PROFILE)
    fake.rpc.assert_called_once_with("delete_user_cascade", {"p_user_id": 2, "p_dry_run": False})
    fake.storage.from_.return_value.remove.assert_called_once_with(["case-1/a.pdf"])
    assert result["user_id"] == 2


def test_storage_failure_does_not_undo_the_delete():
    """Verifies a bucket error after the rows are gone is logged, not raised -- the transaction
    already committed, so failing here would report a rollback that never happened.
    Exercises: `DELETE /users/:id`."""
    fake = _fake_supabase(auth.CLIENT, 2)
    fake.storage.from_.return_value.remove.side_effect = StorageApiError("boom", "500", 500)
    with patch("app.controllers.users.supabase", fake):
        assert delete_user(2, ADMIN_PROFILE)["user_id"] == 2


def test_set_client_firm_status_rejects_super_admin():
    """Verifies a super-admin (no org_id to suspend a client from) is refused with 403, the
    same reasoning admin.invite_lawyer() already uses. Calling the controller directly skips
    FastAPI's dependency resolution (a plain `profile` arg overrides the `Depends(...)`
    default), so -- same as test_case_history.py's `_role_gate` helper -- the gate itself is
    pulled off the signature and exercised directly. Exercises: `PATCH /users/{id}/firm-status`
    (`users.set_client_firm_status()`)."""
    role_gate = inspect.signature(set_client_firm_status).parameters["profile"].default.dependency
    profile = {"role_id": auth.SUPER_ADMIN, "user_id": 1, "org_id": None}
    try:
        role_gate(profile)
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 403


def test_set_client_firm_status_upserts_org_clients():
    """Verifies suspending a client resolves their client_id from the given user_id and
    upserts (not duplicate-inserts) the org_clients row for the caller's own org, stamping
    suspended_at. Exercises: `PATCH /users/{id}/firm-status` (`users.set_client_firm_status()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "cases":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "org_clients":
            m.upsert.return_value.execute.return_value = MagicMock()
        elif name == "users":
            m.select.return_value.eq.return_value.execute.return_value.data = [
                {"user_id": 5, "full_name": "A Client", "email": "c@example.com", "phone": "1",
                 "is_active": True, "created_at": "2026-01-01", "roles": {"role_name": "Client"}}
            ]
        tables[name] = m
        return m

    fake.table.side_effect = table
    profile = {"role_id": auth.ADMIN, "user_id": 1, "org_id": 7}
    # Same pattern test_case_numbering.py uses for a datetime.now() call: patch the module's
    # `datetime` name itself so `.now(timezone.utc).isoformat()` resolves to a fixed string.
    with patch("app.controllers.users.supabase", fake), patch("app.controllers.users.datetime") as dt:
        dt.now.return_value.isoformat.return_value = "2026-01-01T00:00:00+00:00"
        result = set_client_firm_status(5, ClientFirmStatusUpdate(is_active=False), profile)
    tables["org_clients"].upsert.assert_called_once_with(
        {"org_id": 7, "client_id": 9, "is_active": False, "suspended_at": "2026-01-01T00:00:00+00:00"},
        on_conflict="org_id,client_id",
    )
    assert result["suspended"] is True


def test_set_client_firm_status_reactivate_clears_suspended_at():
    """Verifies reactivating writes is_active=True and suspended_at=None, without calling
    datetime.now() at all (only a suspend stamps a timestamp). Exercises:
    `PATCH /users/{id}/firm-status` (`users.set_client_firm_status()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "cases":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "org_clients":
            m.upsert.return_value.execute.return_value = MagicMock()
        elif name == "users":
            m.select.return_value.eq.return_value.execute.return_value.data = [
                {"user_id": 5, "full_name": "A Client", "email": "c@example.com", "phone": "1",
                 "is_active": True, "created_at": "2026-01-01", "roles": {"role_name": "Client"}}
            ]
        tables[name] = m
        return m

    fake.table.side_effect = table
    profile = {"role_id": auth.ADMIN, "user_id": 1, "org_id": 7}
    with patch("app.controllers.users.supabase", fake):
        result = set_client_firm_status(5, ClientFirmStatusUpdate(is_active=True), profile)
    tables["org_clients"].upsert.assert_called_once_with(
        {"org_id": 7, "client_id": 9, "is_active": True, "suspended_at": None}, on_conflict="org_id,client_id"
    )
    assert result["suspended"] is False


def test_set_client_firm_status_rejects_client_with_no_case_in_callers_org():
    """Verifies an org admin gets a 404 (not a 200) trying to suspend/reactivate a client who
    has never had a case with their org -- without this check any admin could suspend any
    client platform-wide. Same "don't reveal existence" reasoning as
    `_assert_same_org_or_404`: 404, not 403. Exercises: `PATCH /users/{id}/firm-status`
    (`users.set_client_firm_status()`)."""
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 9}]
        elif name == "cases":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        elif name == "org_clients":
            m.upsert.return_value.execute.return_value = MagicMock()
        tables[name] = m
        return m

    fake.table.side_effect = table
    profile = {"role_id": auth.ADMIN, "user_id": 1, "org_id": 7}
    with patch("app.controllers.users.supabase", fake):
        with pytest.raises(HTTPException) as exc:
            set_client_firm_status(5, ClientFirmStatusUpdate(is_active=False), profile)
    assert exc.value.status_code == 404
    assert "org_clients" not in tables
