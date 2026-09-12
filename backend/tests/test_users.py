# ponytail self-check for delete_user -- the deletion itself is irreversible, so the two
# refusals in front of it (your own account, the last admin) are the only thing standing
# between a mis-click and an unadministrable platform.
"""Tests for the admin user-delete guardrails and its storage cleanup."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from storage3.exceptions import StorageApiError

from app.controllers.users import delete_user
from app.middleware import auth

ADMIN_PROFILE = {"role_id": auth.ADMIN, "user_id": 1}


def _fake_supabase(target_role: int, admin_count: int):
    fake = MagicMock()
    m = MagicMock()
    m.select.return_value.eq.return_value.execute.return_value.data = [{"role_id": target_role}]
    m.select.return_value.eq.return_value.execute.return_value.count = admin_count
    fake.table.return_value = m
    fake.rpc.return_value.execute.return_value.data = {"user_id": 2, "storage_paths": ["case-1/a.pdf"]}
    return fake


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
