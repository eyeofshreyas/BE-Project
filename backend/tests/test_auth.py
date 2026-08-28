# ponytail self-check for auth.py -- every router's RBAC and read scoping
# depends on these functions, so they're the thing worth asserting on.
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth


def _fake_supabase(rows_by_table):
    fake = MagicMock()

    def table(name):
        m = MagicMock()
        data = rows_by_table.get(name, [])
        # each router's real .eq()/.eq().eq() chains all bottom out at .execute().data
        m.select.return_value.eq.return_value.execute.return_value.data = data
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = data
        return m

    fake.table.side_effect = table
    return fake


def test_admin_is_unrestricted():
    assert auth.get_scoped_case_ids({"role_id": auth.ADMIN, "user_id": 1}) is None


def test_client_with_no_profile_row_sees_nothing():
    with patch("app.middleware.auth.supabase", _fake_supabase({"clients": [], "cases": []})):
        assert auth.get_scoped_case_ids({"role_id": auth.CLIENT, "user_id": 1}) == set()


def test_client_sees_only_their_own_cases():
    with patch("app.middleware.auth.supabase", _fake_supabase({"clients": [{"client_id": 7}], "cases": [{"case_id": 10}, {"case_id": 11}]})):
        assert auth.get_scoped_case_ids({"role_id": auth.CLIENT, "user_id": 1}) == {10, 11}


def test_lawyer_with_no_profile_row_sees_nothing():
    with patch("app.middleware.auth.supabase", _fake_supabase({"lawyers": [], "case_lawyers": []})):
        assert auth.get_scoped_case_ids({"role_id": auth.LAWYER, "user_id": 1}) == set()


def test_lawyer_sees_only_actively_assigned_cases():
    with patch("app.middleware.auth.supabase", _fake_supabase({"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 20}]})):
        assert auth.get_scoped_case_ids({"role_id": auth.LAWYER, "user_id": 1}) == {20}


def test_require_roles_allows_matching_role():
    dependency = auth.require_roles(auth.ADMIN, auth.LAWYER)
    profile = {"role_id": auth.LAWYER}
    assert dependency(profile) is profile


def test_require_roles_rejects_other_role():
    dependency = auth.require_roles(auth.ADMIN)
    try:
        dependency({"role_id": auth.CLIENT})
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 403


def test_get_current_profile_rejects_suspended_account():
    users = [{"user_id": 1, "role_id": auth.CLIENT, "is_active": False}]
    with patch("app.middleware.auth.supabase", _fake_supabase({"users": users})):
        try:
            auth.get_current_profile(current_user=MagicMock(email="x@example.com"))
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_get_current_profile_returns_active_profile():
    users = [{"user_id": 1, "role_id": auth.CLIENT, "is_active": True}]
    with patch("app.middleware.auth.supabase", _fake_supabase({"users": users})):
        assert auth.get_current_profile(current_user=MagicMock(email="x@example.com")) == users[0]


def test_ensure_case_access_allows_admin_for_any_case():
    auth.ensure_case_access(999, {"role_id": auth.ADMIN, "user_id": 1})


def test_ensure_case_access_allows_lawyer_in_scope():
    with patch("app.middleware.auth.supabase", _fake_supabase({"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 20}]})):
        auth.ensure_case_access(20, {"role_id": auth.LAWYER, "user_id": 1})


def test_ensure_case_access_rejects_lawyer_out_of_scope():
    with patch("app.middleware.auth.supabase", _fake_supabase({"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 20}]})):
        try:
            auth.ensure_case_access(99, {"role_id": auth.LAWYER, "user_id": 1})
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


if __name__ == "__main__":
    test_admin_is_unrestricted()
    test_client_with_no_profile_row_sees_nothing()
    test_client_sees_only_their_own_cases()
    test_lawyer_with_no_profile_row_sees_nothing()
    test_lawyer_sees_only_actively_assigned_cases()
    test_require_roles_allows_matching_role()
    test_require_roles_rejects_other_role()
    test_get_current_profile_rejects_suspended_account()
    test_get_current_profile_returns_active_profile()
    test_ensure_case_access_allows_admin_for_any_case()
    test_ensure_case_access_allows_lawyer_in_scope()
    test_ensure_case_access_rejects_lawyer_out_of_scope()
    print("ok")
