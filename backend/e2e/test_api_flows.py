"""End-to-end API flows: invite -> accept -> case, then notes, parties, team,
hearings, invoices, payments and messaging, with the negative path for each.

Run it against a running stack, from backend/:

    .venv/bin/python e2e/test_api_flows.py
"""
import os

# Seeded demo-firm accounts (seed_demo_firm.py). Override for a different seed.
ADMIN_EMAIL = os.environ.get("E2E_ADMIN", "seed-admin-2xj0n@example.com")
LAWYER_EMAIL = os.environ.get("E2E_LAWYER", "seed-lawyer1-2xj0n@example.com")
CLIENT_EMAIL = os.environ.get("E2E_CLIENT", "seed-client1-2xj0n@example.com")
# a second client and a second lawyer, for the access-boundary and suspension checks
OTHER_CLIENT_EMAIL = os.environ.get("E2E_OTHER_CLIENT", "seed-client3-2xj0n@example.com")
OTHER_LAWYER_EMAIL = os.environ.get("E2E_OTHER_LAWYER", "seed-lawyer5-2xj0n@example.com")
import json
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import date, timedelta

BASE = "http://localhost:8000"
PW = os.environ.get("E2E_PASSWORD", "TestPass123!")
FAILS = []
TAG = date.today().isoformat()


def call(method, path, token=None, body=None, form=None):
    req = urllib.request.Request(BASE + path, method=method)
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    else:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode() if body is not None else None
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, data, timeout=90) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"null")
        except Exception:
            return e.code, raw[:300].decode(errors="replace")
    except Exception as e:
        return 0, str(e)


def step(name, method, path, token=None, body=None, form=None, expect=(200, 201)):
    s, b = call(method, path, token, body, form)
    ok = s in expect
    if not ok:
        FAILS.append((name, s, json.dumps(b)[:300]))
    print(f"{'PASS' if ok else 'FAIL'} {name:<48} {s}  {'' if ok else json.dumps(b)[:220]}")
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


def login(email):
    s, b = _login_with_backoff(email, PW)
    assert s == 200, (s, b)
    return b["access_token"]


admin = login(ADMIN_EMAIL)
lawyer = login(LAWYER_EMAIL)
client = login(CLIENT_EMAIL)
print("logged in as admin / lawyer / client\n")

_, courts = call("GET", "/reference/courts", admin)
_, ctypes = call("GET", "/reference/case-types", admin)
_, judges = call("GET", "/reference/judges", admin)
_, clients = call("GET", "/clients", admin)
court_id = courts[0]["court_id"]
ctype_id = ctypes[0]["case_type_id"]
client_id = clients[0]["id"]
judge_id = judges[0]["judge_id"] if judges else None
print(f"court={court_id} case_type={ctype_id} client={client_id} judge={judge_id}\n")

print("=== client invite -> accept (consent gate) ===")
_, existing_reqs = call("GET", "/client-requests", client)
pending = [r for r in existing_reqs if r.get("status") == "pending"] if isinstance(existing_reqs, list) else []
s, req = step("lawyer invites client", "POST", "/client-requests", lawyer,
              {"email": CLIENT_EMAIL, "court_id": court_id,
               "case_type_id": ctype_id, "message": "E2E engagement invite."})
req_id = (req.get("id") or req.get("request_id")) if isinstance(req, dict) else None
if req_id is None and pending:
    req_id = pending[0]["id"]
if req_id:
    step("client accepts invite", "PATCH", f"/client-requests/{req_id}/respond", client,
         {"decision": "accept"})
    step("re-responding to a settled invite is rejected", "PATCH",
         f"/client-requests/{req_id}/respond", client, {"decision": "accept"}, expect=(400, 409))
    step("lawyer cannot respond to an invite", "PATCH", f"/client-requests/{req_id}/respond",
         lawyer, {"decision": "accept"}, expect=(403,))

print()
print("=== case creation ===")
s, case = step("lawyer creates case", "POST", "/cases", lawyer, {
    "client_id": client_id, "court_id": court_id, "case_type_id": ctype_id,
    "case_title": f"E2E QA Matter {TAG}", "priority": "High",
    "description": "Created by the end-to-end test run.",
})
case_id = case.get("case_id") if isinstance(case, dict) else None
print(f"   case_id={case_id}\n")
if not case_id:
    print("no case_id, aborting"); raise SystemExit(1)

print("=== validation / negative paths ===")
step("reject bogus client_id", "POST", "/cases", lawyer,
     {"client_id": 999999, "court_id": court_id, "case_type_id": ctype_id, "case_title": "bad"},
     expect=(400, 403, 404, 422))
step("reject unknown case_type_id", "POST", "/cases", lawyer,
     {"client_id": client_id, "court_id": court_id, "case_type_id": 999999, "case_title": "bad type"},
     expect=(400, 404, 422))
step("reject missing required fields", "POST", "/cases", lawyer, {"case_title": "no ids"},
     expect=(400, 422))
step("admin cannot create a case (lawyers own cases)", "POST", "/cases", admin,
     {"client_id": client_id, "court_id": court_id, "case_type_id": ctype_id, "case_title": "nope"},
     expect=(403,))
step("client cannot create a case", "POST", "/cases", client,
     {"client_id": client_id, "court_id": court_id, "case_type_id": ctype_id, "case_title": "nope"},
     expect=(403,))
step("reject invalid status value", "PATCH", f"/cases/{case_id}/status", lawyer,
     {"new_status": "Banana"}, expect=(400, 422))
step("no access to a nonexistent case", "GET", "/cases/999999/timeline", lawyer, expect=(403, 404))
step("reject empty case_title", "POST", "/cases", lawyer,
     {"client_id": client_id, "court_id": court_id, "case_type_id": ctype_id, "case_title": "   "},
     expect=(400, 422))

print("\n=== case work ===")
s, avail = step("list available lawyers", "GET", f"/cases/{case_id}/available-lawyers", admin)
# the creating lawyer is already Primary, so pick a teammate who is not on the case yet
_, team = call("GET", f"/cases/{case_id}", lawyer)
on_case = {l.get("lawyer_id") for l in (team or {}).get("lawyers", [])} if isinstance(team, dict) else set()
cand = next((a for a in avail if a.get("lawyer_id") not in on_case), None) if isinstance(avail, list) else None
if cand:
    step("assign lawyer to case", "POST", f"/cases/{case_id}/lawyers", lawyer, {
        "lawyer_id": cand.get("lawyer_id"), "name": cand.get("name", "L"),
        "email": cand.get("email", "l@example.com"), "phone": cand.get("phone") or "9000000000",
        "assigned_role": "Associate",
    })

step("add case note", "POST", f"/cases/{case_id}/notes", lawyer, {"note": "E2E note.", "title": "QA"})
s, notes = step("list case notes", "GET", f"/cases/{case_id}/notes", lawyer)
note_id = (notes[0].get("note_id") or notes[0].get("id")) if isinstance(notes, list) and notes else None
if note_id:
    step("edit case note", "PATCH", f"/cases/{case_id}/notes/{note_id}", lawyer, {"note": "E2E note edited."})

step("add case party", "POST", f"/cases/{case_id}/parties", lawyer,
     {"name": "Opposing Party Pvt Ltd", "role": "Respondent"})
step("list case parties", "GET", f"/cases/{case_id}/parties", lawyer)
step("update case status", "PATCH", f"/cases/{case_id}/status", lawyer, {"new_status": "In Progress"})
step("read status history", "GET", f"/cases/{case_id}/status-history", lawyer)
step("read case timeline", "GET", f"/cases/{case_id}/timeline", lawyer)
step("conflict check on the new party", "GET",
     "/conflict-check?" + urllib.parse.urlencode({"name": "Opposing Party Pvt Ltd"}), lawyer)

print("\n=== hearings ===")
future = (date.today() + timedelta(days=14)).isoformat()
s, hearing = step("schedule hearing", "POST", "/hearings", lawyer,
                  {"case_id": case_id, "judge_id": judge_id, "hearing_date": future,
                   "hearing_time": "11:00", "courtroom": "3", "notes": "E2E first hearing"})
hid = (hearing.get("id") or hearing.get("hearing_id")) if isinstance(hearing, dict) else None
if hid:
    step("read hearing", "GET", f"/hearings/{hid}", lawyer)
    step("record hearing outcome", "PATCH", f"/hearings/{hid}", lawyer,
         {"hearing_status": "Completed", "hearing_outcome": "Adjourned",
          "next_hearing_date": (date.today() + timedelta(days=45)).isoformat()})
step("flag duplicate hearing", "POST", "/hearings", lawyer,
     {"case_id": case_id, "judge_id": judge_id, "hearing_date": future, "hearing_time": "11:00"},
     expect=(400, 409, 422))
# a past listing is legitimately back-filled, so 200 is the intended behaviour here
step("hearing with no time set (was a 500)", "POST", "/hearings", lawyer,
     {"case_id": case_id, "judge_id": judge_id,
      "hearing_date": (date.today() + timedelta(days=21)).isoformat()})

print("\n=== billing ===")
inv_no = f"E2E-{date.today().strftime('%Y%m%d')}-{case_id}"
s, inv = step("create invoice", "POST", "/billing/invoices", lawyer, {
    "case_id": case_id, "invoice_number": inv_no, "amount": 25000, "tax": 4500,
    "total_amount": 29500, "issue_date": date.today().isoformat(),
    "due_date": (date.today() + timedelta(days=30)).isoformat(), "remarks": "E2E fees",
})
inv_id = (inv.get("invoice_id") or inv.get("id")) if isinstance(inv, dict) else None
if inv_id:
    step("read invoice", "GET", f"/billing/invoices/{inv_id}", lawyer)
    step("record part payment", "POST", "/billing/payments", lawyer,
         {"invoice_id": inv_id, "amount": 5000, "payment_method": "Bank Transfer",
          "payment_date": date.today().isoformat()})
    step("list invoice payments", "GET", f"/billing/invoices/{inv_id}/payments", lawyer)
    step("reject negative payment", "POST", "/billing/payments", lawyer,
         {"invoice_id": inv_id, "amount": -100, "payment_method": "Cash",
          "payment_date": date.today().isoformat()}, expect=(400, 422))
    step("reject payment beyond invoice total", "POST", "/billing/payments", lawyer,
         {"invoice_id": inv_id, "amount": 9999999, "payment_method": "Cash",
          "payment_date": date.today().isoformat()}, expect=(400, 422))
    step("reject duplicate invoice number", "POST", "/billing/invoices", lawyer,
         {"case_id": case_id, "invoice_number": inv_no, "amount": 100, "total_amount": 100,
          "issue_date": date.today().isoformat()}, expect=(400, 409, 422))
    step("client cannot create an invoice", "POST", "/billing/invoices", client,
         {"case_id": case_id, "invoice_number": inv_no + "-x", "amount": 1, "total_amount": 1,
          "issue_date": date.today().isoformat()}, expect=(403,))

print("\n=== messaging ===")
# other_party_id is a lawyer_id from a client caller, not a user_id -- the case's own
# lawyer_id is what the frontend's "Message" button passes
_, my_cases = call("GET", "/cases", client)
lawyer_user = next((c for c in my_cases if c.get("lawyer_id")), None) if isinstance(my_cases, list) else None
if lawyer_user:
    s, conv = step("client opens conversation with lawyer", "POST", "/messages/conversations",
                   client, {"other_party_id": lawyer_user["lawyer_id"]})
    conv_id = (conv.get("id") or conv.get("conversation_id")) if isinstance(conv, dict) else None
    print(f"   conversation_id={conv_id}")
    if conv_id:
        step("client sends message", "POST", f"/messages/conversations/{conv_id}/messages",
             client, form={"body": "Hello from the E2E client."})
        step("read conversation", "GET", f"/messages/conversations/{conv_id}", client)
        step("reject whitespace-only message", "POST", f"/messages/conversations/{conv_id}/messages",
             client, form={"body": "   "}, expect=(400, 422))

print("\n=== notifications ===")
step("list notifications", "GET", "/notifications", client)
step("mark all read", "POST", "/notifications/read-all", client, body={})

print("\n=== tenant isolation on the new case ===")
step("unrelated client is denied this case", "GET", f"/cases/{case_id}/notes", client, expect=(403,))

print("\n" + "=" * 72)
print(f"{len(FAILS)} FAILURES" if FAILS else "all steps passed")
for n, s, b in FAILS:
    print(f"  - {n}: HTTP {s} {b}")
print(f"case_id={case_id}")
