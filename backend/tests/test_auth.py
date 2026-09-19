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


def test_super_admin_is_unrestricted():
    """Verifies a super-admin profile (org_id None) gets unrestricted case scope (None). Exercises: `auth.get_scoped_case_ids()`."""
    assert auth.get_scoped_case_ids({"role_id": auth.SUPER_ADMIN, "user_id": 1, "org_id": None}) is None


def test_org_admin_sees_only_their_org_cases():
    """Verifies an org admin's scope resolves to the case_ids belonging to their own org_id, via a mocked `cases` table. Exercises: `auth.get_scoped_case_ids()`."""
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{"case_id": 30}, {"case_id": 31}]
    with patch("app.middleware.auth.supabase", fake):
        result = auth.get_scoped_case_ids({"role_id": auth.ADMIN, "user_id": 1, "org_id": 7})
    assert result == {30, 31}
    fake.table.return_value.select.return_value.eq.assert_called_with("org_id", 7)


def test_client_with_no_profile_row_sees_nothing():
    """Verifies a client with no matching `clients` row gets an empty scope, via a mocked supabase table. Exercises: `auth.get_scoped_case_ids()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({"clients": [], "cases": []})):
        assert auth.get_scoped_case_ids({"role_id": auth.CLIENT, "user_id": 1}) == set()


def test_client_sees_only_their_own_cases():
    """Verifies a client's scope resolves to the case_ids tied to their client_id, via mocked `clients`/`cases` tables. Exercises: `auth.get_scoped_case_ids()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({"clients": [{"client_id": 7}], "cases": [{"case_id": 10, "org_id": 1}, {"case_id": 11, "org_id": 1}], "org_clients": []})):
        assert auth.get_scoped_case_ids({"role_id": auth.CLIENT, "user_id": 1}) == {10, 11}


def test_client_does_not_see_cases_from_a_firm_that_suspended_them():
    """Verifies a client's scope excludes cases whose org_id has an org_clients row with
    is_active=False for them, while cases from other (non-suspended) orgs still show.
    Exercises: `auth.get_scoped_case_ids()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({
        "clients": [{"client_id": 7}],
        "cases": [{"case_id": 10, "org_id": 1}, {"case_id": 11, "org_id": 2}],
        "org_clients": [{"org_id": 1}],
    })):
        assert auth.get_scoped_case_ids({"role_id": auth.CLIENT, "user_id": 1}) == {11}


def test_client_with_no_org_clients_row_sees_everything():
    """Verifies a client with no org_clients rows at all (the common case -- never suspended
    by anyone) is unaffected: proves the default-active/no-backfill design holds. Exercises:
    `auth.get_scoped_case_ids()`."""
    with patch("app.middleware.auth.supabase", _fake_supabase({
        "clients": [{"client_id": 7}],
        "cases": [{"case_id": 10, "org_id": 1}, {"case_id": 11, "org_id": 2}],
        "org_clients": [],
    })):
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


def test_ensure_case_access_allows_super_admin_for_any_case():
    """Verifies a super-admin passes the per-record case check for any case_id, with no lookup needed. Exercises: `auth.ensure_case_access()`."""
    auth.ensure_case_access(999, {"role_id": auth.SUPER_ADMIN, "user_id": 1, "org_id": None})


def test_ensure_case_access_rejects_org_admin_outside_their_org():
    """Verifies an org admin fails the per-record case check for a case belonging to a different org, raising 403. Exercises: `auth.ensure_case_access()`."""
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{"case_id": 30}]
    with patch("app.middleware.auth.supabase", fake):
        try:
            auth.ensure_case_access(99, {"role_id": auth.ADMIN, "user_id": 1, "org_id": 7})
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


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
    with patch("app.main.supabase", fake), patch("app.main.new_auth_client", return_value=fake):
        try:
            login(LoginRequest(email="x@example.com", password="whatever"))
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403
            assert "confirm" in e.detail.lower()


def _fake_signup_supabase(lawyer_invite_rows=None, rpc_side_effect=None, rpc_return_value=None):
    """A fake supabase client for signup(): auth.sign_up() succeeds, lawyer_invites (the
    pre-check) returns lawyer_invite_rows, and rpc("complete_signup", ...) either raises
    rpc_side_effect or returns rpc_return_value. Since the whole profile-creation sequence
    is now one RPC call (see migrate_signup_transaction.sql), that's the only thing left to
    mock here -- there's no per-table insert/rollback sequence in Python anymore."""
    fake = MagicMock()
    fake.auth.sign_up.return_value = None
    fake.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = lawyer_invite_rows or []
    if rpc_side_effect is not None:
        fake.rpc.return_value.execute.side_effect = rpc_side_effect
    else:
        fake.rpc.return_value.execute.return_value = MagicMock(data=rpc_return_value)
    return fake


def test_signup_reports_duplicate_email_distinctly():
    """Verifies a duplicate-email signup raises 409 with an "already exists" message, when
    complete_signup() raises its 'duplicate_email' error. Exercises: `POST /signup`
    (`main.signup()`)."""
    fake = _fake_signup_supabase(rpc_side_effect=PostgrestAPIError({
        "message": "duplicate_email", "code": "P0001", "hint": None, "details": None,
    }))
    payload = SignupRequest(email="dup@example.com", password="whatever123", full_name="Dup User", phone="9000000000", role="client")
    with patch("app.main.supabase", fake), patch("app.main.new_auth_client", return_value=fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 409
            assert "already exists" in e.detail.lower()


def test_signup_reports_generic_profile_failure_for_other_db_errors():
    """Verifies a non-mapped DB error during signup raises a generic 500. Exercises:
    `POST /signup` (`main.signup()`)."""
    fake = _fake_signup_supabase(rpc_side_effect=RuntimeError("db unreachable"))
    payload = SignupRequest(email="new@example.com", password="whatever123", full_name="New User", phone="9000000000", role="client")
    with patch("app.main.supabase", fake), patch("app.main.new_auth_client", return_value=fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 500
            assert "contact support" in e.detail.lower()


def test_signup_reports_duplicate_bar_council_number_distinctly():
    """Verifies a lawyer signup with an already-registered bar council number raises 409,
    when complete_signup() raises its 'duplicate_bar_council_number' error. Exercises:
    `POST /signup` (`main.signup()`)."""
    fake = _fake_signup_supabase(
        lawyer_invite_rows=[{"invite_id": 1, "org_id": 1}],
        rpc_side_effect=PostgrestAPIError({
            "message": "duplicate_bar_council_number", "code": "P0001", "hint": None, "details": None,
        }),
    )
    payload = SignupRequest(email="new@example.com", password="whatever123", full_name="New User", phone="9000000000", role="lawyer", bar_council_number="MH/1/2020")
    with patch("app.main.supabase", fake), patch("app.main.new_auth_client", return_value=fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 409
            assert "bar council" in e.detail.lower()


def test_signup_admin_passes_org_name_and_role_to_the_transaction():
    """Verifies role="admin" signup calls complete_signup() with p_role="admin" and the
    trimmed org name -- the organization/platform_settings/users rows are all created
    inside that one transaction now (see migrate_signup_transaction.sql), not from Python.
    Exercises: `POST /signup` (`main.signup()`)."""
    fake = _fake_signup_supabase(rpc_return_value=5)
    payload = SignupRequest(
        email="owner@acme.example", password="whatever123", full_name="Org Owner",
        phone="9000000000", role="admin", org_name="Acme Law",
    )
    with patch("app.main.supabase", fake), patch("app.main.new_auth_client", return_value=fake):
        result = signup(payload)
    assert result["message"].startswith("Signup successful")
    fake.rpc.assert_called_once()
    rpc_name, rpc_args = fake.rpc.call_args[0]
    assert rpc_name == "complete_signup"
    assert rpc_args["p_role"] == "admin"
    assert rpc_args["p_org_name"] == "Acme Law"
    assert rpc_args["p_invite_id"] is None


def test_signup_admin_requires_org_name():
    """Verifies role="admin" signup without an org_name is rejected before any Supabase call. Exercises: `POST /signup` (`main.signup()`)."""
    payload = SignupRequest(email="x@example.com", password="whatever123", full_name="X", phone="9000000000", role="admin")
    try:
        signup(payload)
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 400


def test_signup_lawyer_rejected_without_pending_invite():
    """Verifies a lawyer signup with no matching pending lawyer_invites row is refused with 403, before creating any auth account. Exercises: `POST /signup` (`main.signup()`)."""
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    payload = SignupRequest(email="new@example.com", password="whatever123", full_name="New Lawyer", phone="9000000000", role="lawyer")
    with patch("app.main.supabase", fake), patch("app.main.new_auth_client", return_value=fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403
    fake.auth.sign_up.assert_not_called()


def test_signup_lawyer_passes_invite_id_to_the_transaction():
    """Verifies a lawyer signup with a pending invite passes that invite's invite_id to
    complete_signup() -- the function itself resolves org_id and marks the invite accepted
    inside its transaction now (see migrate_signup_transaction.sql). Exercises:
    `POST /signup` (`main.signup()`)."""
    fake = _fake_signup_supabase(lawyer_invite_rows=[{"invite_id": 9, "org_id": 42}], rpc_return_value=5)
    payload = SignupRequest(
        email="new@example.com", password="whatever123", full_name="New Lawyer",
        phone="9000000000", role="lawyer", bar_council_number="MH/1/2020",
    )
    with patch("app.main.supabase", fake), patch("app.main.new_auth_client", return_value=fake):
        result = signup(payload)
    assert result["message"].startswith("Signup successful")
    rpc_name, rpc_args = fake.rpc.call_args[0]
    assert rpc_name == "complete_signup"
    assert rpc_args["p_role"] == "lawyer"
    assert rpc_args["p_invite_id"] == 9
    assert rpc_args["p_bar_council_number"] == "MH/1/2020"


def test_signup_reports_invite_consumed_between_check_and_transaction():
    """Verifies that if the pending invite is consumed between signup()'s own pre-check and
    complete_signup()'s re-check (a race -- see the function's 'invite_not_pending' raise),
    signup() still answers with the same 403 as the up-front check. Exercises: `POST /signup`
    (`main.signup()`)."""
    fake = _fake_signup_supabase(
        lawyer_invite_rows=[{"invite_id": 9, "org_id": 42}],
        rpc_side_effect=PostgrestAPIError({
            "message": "invite_not_pending", "code": "P0001", "hint": None, "details": None,
        }),
    )
    payload = SignupRequest(
        email="new@example.com", password="whatever123", full_name="New Lawyer",
        phone="9000000000", role="lawyer", bar_council_number="MH/1/2020",
    )
    with patch("app.main.supabase", fake), patch("app.main.new_auth_client", return_value=fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_login_rejects_actually_wrong_password():
    """Verifies a wrong-password login attempt raises 401 with a generic invalid-credentials message. Exercises: `POST /login` (`main.login()`)."""
    fake = MagicMock()
    fake.auth.sign_in_with_password.side_effect = AuthApiError("Invalid login credentials", 400, "invalid_credentials")
    with patch("app.main.supabase", fake), patch("app.main.new_auth_client", return_value=fake):
        try:
            login(LoginRequest(email="x@example.com", password="wrong"))
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 401
            assert e.detail == "Invalid email or password"


if __name__ == "__main__":
    test_super_admin_is_unrestricted()
    test_org_admin_sees_only_their_org_cases()
    test_client_with_no_profile_row_sees_nothing()
    test_client_sees_only_their_own_cases()
    test_client_does_not_see_cases_from_a_firm_that_suspended_them()
    test_client_with_no_org_clients_row_sees_everything()
    test_lawyer_with_no_profile_row_sees_nothing()
    test_lawyer_sees_only_actively_assigned_cases()
    test_require_roles_allows_matching_role()
    test_require_roles_rejects_other_role()
    test_get_current_profile_rejects_suspended_account()
    test_get_current_profile_returns_active_profile()
    test_ensure_case_access_allows_super_admin_for_any_case()
    test_ensure_case_access_rejects_org_admin_outside_their_org()
    test_ensure_case_access_allows_lawyer_in_scope()
    test_ensure_case_access_rejects_lawyer_out_of_scope()
    test_get_current_user_rejects_actually_invalid_token()
    test_get_current_user_does_not_logout_on_network_error()
    test_login_reports_unconfirmed_email_distinctly()
    test_login_rejects_actually_wrong_password()
    test_signup_reports_duplicate_email_distinctly()
    test_signup_reports_generic_profile_failure_for_other_db_errors()
    test_signup_reports_duplicate_bar_council_number_distinctly()
    test_signup_admin_passes_org_name_and_role_to_the_transaction()
    test_signup_admin_requires_org_name()
    test_signup_lawyer_rejected_without_pending_invite()
    test_signup_lawyer_passes_invite_id_to_the_transaction()
    test_signup_reports_invite_consumed_between_check_and_transaction()
    print("ok")
