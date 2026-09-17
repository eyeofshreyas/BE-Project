"""End-to-end API flows for documents, conveyancing matters, signup, admin user
suspension and login rate limiting.

Run it against a running stack, from backend/:

    .venv/bin/python e2e/test_documents_and_admin.py
"""
import os

# Seeded demo-firm accounts (seed_demo_firm.py). Override for a different seed.
ADMIN_EMAIL = os.environ.get("E2E_ADMIN", "seed-admin-2xj0n@example.com")
LAWYER_EMAIL = os.environ.get("E2E_LAWYER", "seed-lawyer1-2xj0n@example.com")
CLIENT_EMAIL = os.environ.get("E2E_CLIENT", "seed-client1-2xj0n@example.com")
# a second client and a second lawyer, for the access-boundary and suspension checks
OTHER_CLIENT_EMAIL = os.environ.get("E2E_OTHER_CLIENT", "seed-client3-2xj0n@example.com")
OTHER_LAWYER_EMAIL = os.environ.get("E2E_OTHER_LAWYER", "seed-lawyer5-2xj0n@example.com")
import io
import json
import time
import mimetypes
import urllib.request
import urllib.error
import uuid
from datetime import date, timedelta

BASE = "http://localhost:8000"
PW = os.environ.get("E2E_PASSWORD", "TestPass123!")
FAILS = []


def call(method, path, token=None, body=None, multipart=None):
    req = urllib.request.Request(BASE + path, method=method)
    if multipart is not None:
        boundary = "----e2e" + uuid.uuid4().hex
        buf = io.BytesIO()
        for k, v in multipart.items():
            buf.write(f"--{boundary}\r\n".encode())
            if isinstance(v, tuple):
                fname, content, ctype = v
                buf.write(f'Content-Disposition: form-data; name="{k}"; filename="{fname}"\r\n'.encode())
                buf.write(f"Content-Type: {ctype}\r\n\r\n".encode())
                buf.write(content)
            else:
                buf.write(f'Content-Disposition: form-data; name="{k}"\r\n\r\n{v}'.encode())
            buf.write(b"\r\n")
        buf.write(f"--{boundary}--\r\n".encode())
        data = buf.getvalue()
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    else:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode() if body is not None else None
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, data, timeout=120) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw or b"null")
            except Exception:
                return r.status, f"<{len(raw)} bytes>"
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"null")
        except Exception:
            return e.code, raw[:200].decode(errors="replace")
    except Exception as e:
        return 0, str(e)


def step(name, method, path, token=None, body=None, multipart=None, expect=(200, 201)):
    s, b = call(method, path, token, body, multipart)
    ok = s in expect
    if not ok:
        FAILS.append((name, s, json.dumps(b)[:250]))
    print(f"{'PASS' if ok else 'FAIL'} {name:<50} {s}  {'' if ok else json.dumps(b)[:200]}")
    return s, b


# /login is rate limited to 10 per minute per IP (app/main.py). That is correct
# behaviour, but it also means running these scripts back to back trips it, so wait
# the window out rather than reporting a phantom auth failure.
def _login_once(email, pw):
    return call("POST", "/login", body={"email": email, "password": pw})


def _login_with_backoff(email, pw):
    status, body = _login_once(email, pw)
    if status == 429:
        print(f"   (login rate limit hit; waiting 62s to retry {email})")
        time.sleep(62)
        status, body = _login_once(email, pw)
    return status, body


def login(email, pw=PW):
    s, b = _login_with_backoff(email, pw)
    return (b.get("access_token"), s) if isinstance(b, dict) else (None, s)


admin, _ = login(ADMIN_EMAIL)
lawyer, _ = login(LAWYER_EMAIL)
client, _ = login(CLIENT_EMAIL)
# a client of the same firm with no connection to case 41 -- the real "stranger" check
outsider, _ = login(OTHER_CLIENT_EMAIL)

_, cases = call("GET", "/cases", lawyer)
case_id = cases[0]["case_id"]
_, dtypes = call("GET", "/reference/document-types", lawyer)
dtype = dtypes[0]["document_type_id"]
_, clients = call("GET", "/clients", lawyer)
client_id = clients[0]["id"]
print(f"case={case_id} doc_type={dtype} client={client_id}\n")

print("=== documents ===")
pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
s, doc = step("upload a PDF", "POST", f"/cases/{case_id}/documents", lawyer,
              multipart={"document_type_id": str(dtype), "file": ("e2e-test.pdf", pdf, "application/pdf")})
doc_id = (doc.get("id") or doc.get("document_id")) if isinstance(doc, dict) else None
print(f"   document_id={doc_id}")
step("reject an executable upload", "POST", f"/cases/{case_id}/documents", lawyer,
     multipart={"document_type_id": str(dtype), "file": ("evil.exe", b"MZ\x90\x00", "application/x-msdownload")},
     expect=(400, 415, 422))
step("reject an empty file", "POST", f"/cases/{case_id}/documents", lawyer,
     multipart={"document_type_id": str(dtype), "file": ("empty.pdf", b"", "application/pdf")},
     expect=(400, 422))
step("list documents", "GET", "/documents", lawyer)
if doc_id:
    step("download the document", "GET", f"/documents/{doc_id}/download", lawyer)
    step("an unrelated client cannot download it", "GET", f"/documents/{doc_id}/download", outsider, expect=(403, 404))
    step("the case's own client can download it", "GET", f"/documents/{doc_id}/download", client)
    step("delete the document", "DELETE", f"/documents/{doc_id}", lawyer, expect=(200, 204))
    step("a deleted document is gone", "GET", f"/documents/{doc_id}/download", lawyer, expect=(404, 410))

print("\n=== conveyancing ===")
s, matter = step("create a matter", "POST", "/conveyancing/matters", lawyer, {
    "matter_name": "E2E Conveyance", "matter_type": "Purchase", "client_id": client_id,
    "property_address": "12 Test Lane, Pune", "property_type": "Residential",
    "sale_value": 7500000, "target_settlement_date": (date.today() + timedelta(days=60)).isoformat(),
})
matter_id = (matter.get("id") or matter.get("matter_id")) if isinstance(matter, dict) else None
print(f"   matter_id={matter_id}")
if matter_id:
    step("read the matter", "GET", f"/conveyancing/matters/{matter_id}", lawyer)
    step("update due diligence", "PATCH", f"/conveyancing/matters/{matter_id}/due-diligence", lawyer,
         {"title_clear": True, "tax_verified": True, "remarks": "Checked in the E2E run."})
    step("client cannot edit due diligence", "PATCH", f"/conveyancing/matters/{matter_id}/due-diligence",
         client, {"title_clear": False}, expect=(403,))
    step("log a matter expense", "POST", "/billing/expenses", lawyer,
         {"matter_id": matter_id, "expense_type": "Search fee", "amount": 2500,
          "expense_date": date.today().isoformat(), "description": "E2E title search"})
    step("reject a negative expense", "POST", "/billing/expenses", lawyer,
         {"matter_id": matter_id, "expense_type": "Search fee", "amount": -50,
          "expense_date": date.today().isoformat()}, expect=(400, 422))
step("conveyancing summary", "GET", "/conveyancing/summary", lawyer)

print("\n=== signup ===")
new_email = f"e2e-signup-{uuid.uuid4().hex[:8]}@example.com"
step("signup rejects a weak password", "POST", "/signup", body={
    "email": f"weak-{uuid.uuid4().hex[:6]}@example.com", "password": "123", "full_name": "Weak Pass",
    "phone": "9000000001", "role": "client"}, expect=(400, 422))
step("signup rejects a malformed email", "POST", "/signup", body={
    "email": "not-an-email", "password": PW, "full_name": "Bad Email",
    "phone": "9000000002", "role": "client"}, expect=(400, 422))
step("signup rejects an unknown role", "POST", "/signup", body={
    "email": f"role-{uuid.uuid4().hex[:6]}@example.com", "password": PW, "full_name": "Bad Role",
    "phone": "9000000003", "role": "wizard"}, expect=(400, 422))
s, _ = step("client signs up", "POST", "/signup", body={
    "email": new_email, "password": PW, "full_name": "E2E New Client",
    "phone": "9000000004", "role": "client"})
step("the same email cannot sign up twice", "POST", "/signup", body={
    "email": new_email, "password": PW, "full_name": "E2E Duplicate",
    "phone": "9000000005", "role": "client"}, expect=(400, 409, 422))
step("login with a wrong password", "POST", "/login",
     body={"email": new_email, "password": "WrongPass123!"}, expect=(400, 401))
step("login with the new account", "POST", "/login", body={"email": new_email, "password": PW})

print("\n=== admin user management ===")
_, users = call("GET", "/users", admin)
# /users is org-scoped, so the fresh unaffiliated signup isn't in it -- suspend a lawyer of
# the admin's own firm instead, then put them back.
target = next((u for u in users if u.get("email") == OTHER_LAWYER_EMAIL), None) if isinstance(users, list) else None
print(f"   admin sees {len(users) if isinstance(users, list) else users} users in the firm; target={bool(target)}")
if target:
    step("read user impact", "GET", f"/users/{target['id']}/impact", admin)
    step("suspend the lawyer", "PATCH", f"/users/{target['id']}/status", admin, {"is_active": False})
    tok, code = login(OTHER_LAWYER_EMAIL)
    blocked_code = call("GET", "/cases", tok)[0] if tok else code
    ok = blocked_code == 403
    print(f"{'PASS' if ok else 'FAIL'} {'a suspended user loses API access':<50} {blocked_code}")
    if not ok:
        FAILS.append(("a suspended user loses API access", blocked_code, "still had access"))
    step("reactivate the lawyer", "PATCH", f"/users/{target['id']}/status", admin, {"is_active": True})
    tok2, _ = login(OTHER_LAWYER_EMAIL)
    restored = call("GET", "/cases", tok2)[0] if tok2 else 0
    print(f"{'PASS' if restored == 200 else 'FAIL'} {'reactivation restores access':<50} {restored}")
    if restored != 200:
        FAILS.append(("reactivation restores access", restored, ""))
    step("a lawyer cannot suspend a user", "PATCH", f"/users/{target['id']}/status", lawyer,
         {"is_active": False}, expect=(403,))
    step("a client cannot list users", "GET", "/users", client, expect=(403,))

print("\n=== rate limiting on login ===")
codes = [call("POST", "/login", body={"email": "nobody@example.com", "password": "nope"})[0] for _ in range(12)]
limited = 429 in codes
print(f"{'PASS' if limited else 'FAIL'} {'repeated bad logins are rate limited':<50} {codes}")
if not limited:
    FAILS.append(("repeated bad logins are rate limited", 0, str(codes)))

print("\n" + "=" * 72)
print(f"{len(FAILS)} FAILURES" if FAILS else "all steps passed")
for n, s, b in FAILS:
    print(f"  - {n}: HTTP {s} {b}")
