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

    def table(name):
        t = MagicMock()
        if name == "lawyer_invites":
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"invite_id": 1, "org_id": 1}]
        else:
            t.insert.return_value.execute.side_effect = PostgrestAPIError({
                "message": "duplicate key value violates unique constraint \"users_email_key\"",
                "code": "23505", "hint": None, "details": None,
            })
        return t

    fake.table.side_effect = table
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

    def table(name):
        t = MagicMock()
        if name == "lawyer_invites":
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"invite_id": 1, "org_id": 1}]
        else:
            t.insert.return_value.execute.side_effect = RuntimeError("db unreachable")
        return t

    fake.table.side_effect = table
    payload = SignupRequest(email="new@example.com", password="whatever123", full_name="New User", phone="9000000000", role="lawyer")
    with patch("app.main.supabase", fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 500
            assert "contact support" in e.detail.lower()


def test_signup_deletes_the_users_row_when_the_profile_insert_fails():
    """Verifies a failed lawyers-row insert removes the just-created users row, so the account
    can't log in with no profile (the "No lawyer profile for this account" 400). Exercises:
    `POST /signup` (`main.signup()`)."""
    fake = MagicMock()
    fake.auth.sign_up.return_value = None

    def table(name):
        t = MagicMock()
        if name == "lawyer_invites":
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"invite_id": 1, "org_id": 1}]
        elif name == "users":
            t.insert.return_value.execute.return_value.data = [{"user_id": 77}]
        else:
            t.insert.return_value.execute.side_effect = PostgrestAPIError({
                "message": "duplicate key value violates unique constraint \"lawyers_bar_council_number_key\"",
                "code": "23505", "hint": None, "details": None,
            })
        return t

    tables = {}
    fake.table.side_effect = lambda name: tables.setdefault(name, table(name))
    payload = SignupRequest(email="new@example.com", password="whatever123", full_name="New User", phone="9000000000", role="lawyer", bar_council_number="MH/1/2020")
    with patch("app.main.supabase", fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 409
            assert "bar council" in e.detail.lower()
    tables["users"].delete.return_value.eq.assert_called_once_with("user_id", 77)


def test_signup_admin_creates_organization_and_admin_user():
    """Verifies role="admin" signup creates an organizations row, a platform_settings row for it, and a users row with role_id=ADMIN and that org_id. Exercises: `POST /signup` (`main.signup()`)."""
    fake = MagicMock()
    fake.auth.sign_up.return_value = None
    inserted = {}

    def table(name):
        t = MagicMock()
        if name == "organizations":
            t.insert.return_value.execute.return_value.data = [{"org_id": 42, "name": "Acme Law"}]
        elif name == "platform_settings":
            t.insert.return_value.execute.return_value = MagicMock()
        elif name == "users":
            def insert(payload):
                inserted.update(payload)
                return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"user_id": 5, **payload}])))
            t.insert.side_effect = insert
        return t

    fake.table.side_effect = table
    payload = SignupRequest(
        email="owner@acme.example", password="whatever123", full_name="Org Owner",
        phone="9000000000", role="admin", org_name="Acme Law",
    )
    with patch("app.main.supabase", fake):
        result = signup(payload)
    assert result["message"].startswith("Signup successful")
    assert inserted["role_id"] == 1  # ADMIN
    assert inserted["org_id"] == 42


def test_signup_admin_rollback_deletes_settings_before_org_and_preserves_original_error():
    """Verifies that when an admin signup's org+platform_settings are created but the users
    insert then fails with a duplicate-email error, _rollback_org deletes the platform_settings
    row before the organizations row (platform_settings has an FK to organizations with no
    ON DELETE CASCADE, so deleting organizations first would raise its own FK violation and mask
    the real error), and the original 409 duplicate-email response still reaches the caller.
    Exercises: `POST /signup` (`main.signup()`, `main._rollback_org()`)."""
    fake = MagicMock()
    fake.auth.sign_up.return_value = None
    call_order = []

    def table(name):
        t = MagicMock()
        if name == "organizations":
            t.insert.return_value.execute.return_value.data = [{"org_id": 42, "name": "Acme Law"}]
            t.delete.return_value.eq.return_value.execute.side_effect = lambda: call_order.append("organizations")
        elif name == "platform_settings":
            t.insert.return_value.execute.return_value = MagicMock()
            t.delete.return_value.eq.return_value.execute.side_effect = lambda: call_order.append("platform_settings")
        elif name == "users":
            t.insert.return_value.execute.side_effect = PostgrestAPIError({
                "message": "duplicate key value violates unique constraint \"users_email_key\"",
                "code": "23505", "hint": None, "details": None,
            })
        return t

    tables = {}
    fake.table.side_effect = lambda name: tables.setdefault(name, table(name))
    payload = SignupRequest(
        email="owner@acme.example", password="whatever123", full_name="Org Owner",
        phone="9000000000", role="admin", org_name="Acme Law",
    )
    with patch("app.main.supabase", fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 409
            assert "already exists" in e.detail.lower()

    tables["platform_settings"].delete.return_value.eq.assert_called_once_with("org_id", 42)
    tables["organizations"].delete.return_value.eq.assert_called_once_with("org_id", 42)
    assert call_order == ["platform_settings", "organizations"]


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
    with patch("app.main.supabase", fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403
    fake.auth.sign_up.assert_not_called()


def test_signup_lawyer_succeeds_with_pending_invite_and_marks_it_accepted():
    """Verifies a lawyer signup with a pending invite inherits that invite's org_id and marks the invite accepted. Exercises: `POST /signup` (`main.signup()`)."""
    fake = MagicMock()
    fake.auth.sign_up.return_value = None
    inserted_user = {}

    def table(name):
        t = MagicMock()
        if name == "lawyer_invites":
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"invite_id": 9, "org_id": 42}]
            t.update.return_value.eq.return_value.execute.return_value = MagicMock()
        elif name == "users":
            def insert(payload):
                inserted_user.update(payload)
                return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"user_id": 5, **payload}])))
            t.insert.side_effect = insert
        elif name == "lawyers":
            t.insert.return_value.execute.return_value = MagicMock()
        return t

    # ponytail: cache mocks per table name -- signup() calls supabase.table("lawyer_invites")
    # twice (select for the gate, update to accept it), and a bare side_effect=table would hand
    # back a fresh, uncalled MagicMock each time, including to the assertion below. Same pattern
    # as test_signup_deletes_the_users_row_when_the_profile_insert_fails.
    tables = {}
    fake.table.side_effect = lambda name: tables.setdefault(name, table(name))
    payload = SignupRequest(
        email="new@example.com", password="whatever123", full_name="New Lawyer",
        phone="9000000000", role="lawyer", bar_council_number="MH/1/2020",
    )
    with patch("app.main.supabase", fake):
        result = signup(payload)
    assert result["message"].startswith("Signup successful")
    assert inserted_user["org_id"] == 42
    tables["lawyer_invites"].update.assert_called_once_with({"status": "accepted"})


def test_signup_rolls_back_lawyers_row_when_invite_accept_fails():
    """Verifies that when the lawyers insert succeeds but marking the invite accepted then
    throws, signup() deletes both the users row and the just-inserted lawyers row (not just
    users), so no lawyers row is left pointing at a deleted user_id. Exercises: `POST /signup`
    (`main.signup()`)."""
    fake = MagicMock()
    fake.auth.sign_up.return_value = None

    def table(name):
        t = MagicMock()
        if name == "lawyer_invites":
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"invite_id": 9, "org_id": 42}]
            t.update.return_value.eq.return_value.execute.side_effect = RuntimeError("db unreachable")
        elif name == "users":
            t.insert.return_value.execute.return_value.data = [{"user_id": 77}]
        elif name == "lawyers":
            t.insert.return_value.execute.return_value = MagicMock()
        return t

    tables = {}
    fake.table.side_effect = lambda name: tables.setdefault(name, table(name))
    payload = SignupRequest(
        email="new@example.com", password="whatever123", full_name="New Lawyer",
        phone="9000000000", role="lawyer", bar_council_number="MH/1/2020",
    )
    with patch("app.main.supabase", fake):
        try:
            signup(payload)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 500
    tables["users"].delete.return_value.eq.assert_called_once_with("user_id", 77)
    tables["lawyers"].delete.return_value.eq.assert_called_once_with("user_id", 77)


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
    test_super_admin_is_unrestricted()
    test_org_admin_sees_only_their_org_cases()
    test_client_with_no_profile_row_sees_nothing()
    test_client_sees_only_their_own_cases()
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
    test_signup_deletes_the_users_row_when_the_profile_insert_fails()
    test_signup_admin_creates_organization_and_admin_user()
    test_signup_admin_rollback_deletes_settings_before_org_and_preserves_original_error()
    test_signup_admin_requires_org_name()
    test_signup_lawyer_rejected_without_pending_invite()
    test_signup_lawyer_succeeds_with_pending_invite_and_marks_it_accepted()
    test_signup_rolls_back_lawyers_row_when_invite_accept_fails()
    print("ok")
