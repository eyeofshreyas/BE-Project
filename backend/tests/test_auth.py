# ponytail self-check for auth.py -- every router's RBAC and read scoping
# depends on these functions, so they're the thing worth asserting on.
"""Tests for the auth middleware (RBAC, case-scoping) and the signup/login endpoints in app.main."""
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from supabase_auth.errors import AuthApiError

from postgrest.exceptions import APIError as PostgrestAPIError

from app.middleware import auth
from app.main import login, signup, LoginRequest, SignupRequest


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
    """Verifies an admin profile gets unrestricted case scope (None). Exercises: `auth.get_scoped_case_ids()`."""
    assert auth.get_scoped_case_ids({"role_id": auth.ADMIN, "user_id": 1}) is None


def test_client_with_no_profile_row_sees_nothing():
    """Verifies a client with no matching `clients` row gets an empty scope, via a mocked supabase table. Exercises: `auth.get_scoped_case_ids()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({"clients": [], "cases": []})):
        assert auth.get_scoped_case_ids({"role_id": auth.CLIENT, "user_id": 1}) == set()


def test_client_sees_only_their_own_cases():
    """Verifies a client's scope resolves to the case_ids tied to their client_id, via mocked `clients`/`cases` tables. Exercises: `auth.get_scoped_case_ids()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({"clients": [{"client_id": 7}], "cases": [{"case_id": 10}, {"case_id": 11}]})):
        assert auth.get_scoped_case_ids({"role_id": auth.CLIENT, "user_id": 1}) == {10, 11}


def test_lawyer_with_no_profile_row_sees_nothing():
    """Verifies a lawyer with no matching `lawyers` row gets an empty scope, via a mocked supabase table. Exercises: `auth.get_scoped_case_ids()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({"lawyers": [], "case_lawyers": []})):
        assert auth.get_scoped_case_ids({"role_id": auth.LAWYER, "user_id": 1}) == set()


def test_lawyer_sees_only_actively_assigned_cases():
    """Verifies a lawyer's scope resolves to case_ids from their `case_lawyers` rows, via mocked tables. Exercises: `auth.get_scoped_case_ids()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 20}]})):
        assert auth.get_scoped_case_ids({"role_id": auth.LAWYER, "user_id": 1}) == {20}


def test_require_roles_allows_matching_role():
    """Verifies the require_roles dependency passes through the profile when its role is in the allowed set. Exercises: `auth.require_roles()`."""
    dependency = auth.require_roles(auth.ADMIN, auth.LAWYER)
    profile = {"role_id": auth.LAWYER}
    assert dependency(profile) is profile


def test_require_roles_rejects_other_role():
    """Verifies the require_roles dependency raises 403 for a role outside the allowed set. Exercises: `auth.require_roles()`."""
    dependency = auth.require_roles(auth.ADMIN)
    try:
        dependency({"role_id": auth.CLIENT})
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 403


def test_get_current_profile_rejects_suspended_account():
    """Verifies a `users` row with is_active=False raises 403, via a mocked supabase lookup. Exercises: `auth.get_current_profile()`."""
    users = [{"user_id": 1, "role_id": auth.CLIENT, "is_active": False}]
    with patch("app.middleware.auth.supabase", _fake_supabase({"users": users})):
        try:
            auth.get_current_profile(current_user=MagicMock(email="x@example.com"))
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_get_current_profile_returns_active_profile():
    """Verifies an active `users` row is returned as-is, via a mocked supabase lookup. Exercises: `auth.get_current_profile()`."""
    users = [{"user_id": 1, "role_id": auth.CLIENT, "is_active": True}]
    with patch("app.middleware.auth.supabase", _fake_supabase({"users": users})):
        assert auth.get_current_profile(current_user=MagicMock(email="x@example.com")) == users[0]


def test_ensure_case_access_allows_admin_for_any_case():
    """Verifies an admin passes the per-record case check for any case_id, with no lookup needed. Exercises: `auth.ensure_case_access()`."""
    auth.ensure_case_access(999, {"role_id": auth.ADMIN, "user_id": 1})


def test_ensure_case_access_allows_lawyer_in_scope():
    """Verifies a lawyer passes the per-record case check for a case they're assigned to, via mocked tables. Exercises: `auth.ensure_case_access()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 20}]})):
        auth.ensure_case_access(20, {"role_id": auth.LAWYER, "user_id": 1})


def test_ensure_case_access_rejects_lawyer_out_of_scope():
    """Verifies a lawyer fails the per-record case check for a case they're not assigned to, raising 403. Exercises: `auth.ensure_case_access()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({"lawyers": [{"lawyer_id": 5}], "case_lawyers": [{"case_id": 20}]})):
        try:
            auth.ensure_case_access(99, {"role_id": auth.LAWYER, "user_id": 1})
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_get_current_user_rejects_actually_invalid_token():
    """Verifies a rejected token from Supabase Auth raises 401, via a mocked auth.get_user() side effect. Exercises: `auth.get_current_user()`."""
    fake = MagicMock()
    fake.auth.get_user.side_effect = AuthApiError("invalid JWT", 401, None)
    with patch("app.middleware.auth.supabase", fake):
        try:
            auth.get_current_user(authorization="Bearer bad-token")
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 401


def test_get_current_user_does_not_logout_on_network_error():
    """Verifies a network error talking to Supabase Auth raises 503 (not 401), via a ConnectionError side effect. Exercises: `auth.get_current_user()`."""
    fake = MagicMock()
    fake.auth.get_user.side_effect = ConnectionError("Resource temporarily unavailable")
    with patch("app.middleware.auth.supabase", fake):
        try:
            auth.get_current_user(authorization="Bearer some-token")
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 503


def test_login_reports_unconfirmed_email_distinctly():
    """Verifies an unconfirmed-email login attempt raises 403 with a confirmation-specific message. Exercises: `POST /login` (`main.login()`)."""
    fake = MagicMock()
    fake.auth.sign_in_with_password.side_effect = AuthApiError("Email not confirmed", 400, "email_not_confirmed")
    with patch("app.main.supabase", fake):
        try:
            login(LoginRequest(email="x@example.com", password="whatever"))
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403
            assert "confirm" in e.detail.lower()


def test_signup_reports_duplicate_email_distinctly():
    """Verifies a duplicate-email signup raises 409 with an "already exists" message, via a mocked unique-constraint Postgrest error. Exercises: `POST /signup` (`main.signup()`)."""
    fake = MagicMock()
    fake.auth.sign_up.return_value = None
    fake.table.return_value.insert.return_value.execute.side_effect = PostgrestAPIError({
        "message": "duplicate key value violates unique constraint \"users_email_key\"",
        "code": "23505", "hint": None, "details": None,
    })
    payload = SignupRequest(email="dup@example.com", password="whatever123", full_name="Dup User", phone="9000000000", role="lawyer")
    with patch("app.main.supabase", fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 409
            assert "already exists" in e.detail.lower()


def test_signup_reports_generic_profile_failure_for_other_db_errors():
    """Verifies a non-duplicate DB error during signup raises a generic 500, via a mocked RuntimeError insert failure. Exercises: `POST /signup` (`main.signup()`)."""
    fake = MagicMock()
    fake.auth.sign_up.return_value = None
    fake.table.return_value.insert.return_value.execute.side_effect = RuntimeError("db unreachable")
    payload = SignupRequest(email="new@example.com", password="whatever123", full_name="New User", phone="9000000000", role="lawyer")
    with patch("app.main.supabase", fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 500
            assert "contact support" in e.detail.lower()


def test_login_rejects_actually_wrong_password():
    """Verifies a wrong-password login attempt raises 401 with a generic invalid-credentials message. Exercises: `POST /login` (`main.login()`)."""
    fake = MagicMock()
    fake.auth.sign_in_with_password.side_effect = AuthApiError("Invalid login credentials", 400, "invalid_credentials")
    with patch("app.main.supabase", fake):
        try:
            login(LoginRequest(email="x@example.com", password="wrong"))
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 401
            assert e.detail == "Invalid email or password"


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
    test_get_current_user_rejects_actually_invalid_token()
    test_get_current_user_does_not_logout_on_network_error()
    test_login_reports_unconfirmed_email_distinctly()
    test_login_rejects_actually_wrong_password()
    test_signup_reports_duplicate_email_distinctly()
    test_signup_reports_generic_profile_failure_for_other_db_errors()
    print("ok")
