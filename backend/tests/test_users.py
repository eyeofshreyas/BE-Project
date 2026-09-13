# ponytail self-check for delete_user -- the deletion itself is irreversible, so the two
# refusals in front of it (your own account, the last admin) are the only thing standing
# between a mis-click and an unadministrable platform.
"""Tests for the admin user-delete guardrails and its storage cleanup."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from storage3.exceptions import StorageApiError

from app.controllers.users import delete_user, list_users, set_user_status
from app.middleware import auth
from app.models.users import StatusUpdate

ADMIN_PROFILE = {"role_id": auth.ADMIN, "user_id": 1, "org_id": 7}


def _fake_supabase(target_role: int, admin_count: int, target_org_id: int = 7):
    fake = MagicMock()
    m = MagicMock()
    m.select.return_value.eq.return_value.execute.return_value.data = [{"role_id": target_role, "org_id": target_org_id}]
    m.select.return_value.eq.return_value.eq.return_value.execute.return_value.count = admin_count
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
                sel.eq.return_value.order.return_value.execute.return_value.data = []
                sel.in_.return_value.execute.return_value.data = [client_user_row]
                return sel
            m.select.side_effect = select
        elif name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 3}]
        elif name == "clients":
            m.select.return_value.in_.return_value.execute.return_value.data = [{"user_id": 9}]
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.users.supabase", fake):
        result = list_users(profile=ORG_ADMIN_PROFILE)
    assert [r["id"] for r in result] == [9]
    assert result[0]["role"] == "Client"


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
