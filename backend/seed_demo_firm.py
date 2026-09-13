"""One-off script: seeds a demo law firm (org, admin, 5 lawyers, 4 clients, cases with
multi-lawyer teams, invoices, and a couple of case parties) against the live Supabase
project this backend points at. Not part of the app -- run manually, once, from backend/:

    .venv/bin/python seed_demo_firm.py

All seeded accounts share the password below. Safe to re-run: emails are unique per run
(suffixed with a short random tag) so it never collides with a previous seed.
"""
import random
import string
import sys
from datetime import date, timedelta

sys.path.insert(0, ".")
from app.db.supabase_client import supabase
from app.controllers.cases import _generate_case_number

PASSWORD = "TestPass123!"
ORG_NAME = "Sharma & Associates"
TAG = "".join(random.choices(string.ascii_lowercase + string.digits, k=5))

ADMIN = 1
LAWYER = 2
CLIENT = 3

COURT_ID = 1        # Pune District Court
CASE_TYPE_IDS = [1, 2, 3, 4, 6]  # Civil, Criminal, Family, Property, Corporate


def make_account(email: str, full_name: str, phone: str, role_id: int, org_id: int | None) -> int:
    """Real Supabase Auth signup + a `users` row (correlated by email, not UID --
    see app/middleware/auth.py:get_current_profile). Returns the new user_id."""
    supabase.auth.sign_up({"email": email, "password": PASSWORD})
    row = supabase.table("users").insert({
        "role_id": role_id,
        "full_name": full_name,
        "email": email,
        "password_hash": "managed_by_supabase_auth",
        "phone": phone,
        "org_id": org_id,
    }).execute().data[0]
    return row["user_id"]


def main():
    org = supabase.table("organizations").insert({"name": ORG_NAME}).execute().data[0]
    org_id = org["org_id"]
    supabase.table("platform_settings").insert({"org_id": org_id}).execute()
    print(f"Org: {ORG_NAME} (org_id={org_id})")

    admin_email = f"seed-admin-{TAG}@example.com"
    make_account(admin_email, "Meera Sharma", "9800000001", ADMIN, org_id)
    print(f"Admin: {admin_email} / {PASSWORD}")

    lawyer_specs = [
        ("Arjun Rao", "Civil Litigation", 12, "MH/1234/2013"),
        ("Divya Nair", "Family Law", 8, "MH/2345/2017"),
        ("Kabir Malhotra", "Corporate Law", 15, "MH/3456/2010"),
        ("Ritu Desai", "Criminal Defense", 6, "MH/4567/2019"),
        ("Sameer Iyer", "Property Law", 10, "MH/5678/2015"),
    ]
    lawyer_ids: list[int] = []
    for i, (name, spec, years, bar_no) in enumerate(lawyer_specs, start=1):
        email = f"seed-lawyer{i}-{TAG}@example.com"
        user_id = make_account(email, name, f"98000000{10 + i}", LAWYER, org_id)
        lawyer_row = supabase.table("lawyers").insert({
            "user_id": user_id, "bar_council_number": bar_no,
            "specialization": spec, "experience_years": years,
        }).execute().data[0]
        lawyer_ids.append(lawyer_row["lawyer_id"])
        print(f"Lawyer: {email} / {PASSWORD} -- {name} ({spec})")

    client_specs = [
        ("Rohit Verma", "Kothrud, Pune", "English"),
        ("Sneha Joshi", "Baner, Pune", "Marathi"),
        ("Vikram Patil", "Aundh, Pune", "Marathi"),
        ("Ananya Singh", "Viman Nagar, Pune", "English"),
    ]
    client_ids: list[int] = []
    for i, (name, address, lang) in enumerate(client_specs, start=1):
        email = f"seed-client{i}-{TAG}@example.com"
        user_id = make_account(email, name, f"97000000{10 + i}", CLIENT, None)
        client_row = supabase.table("clients").insert({
            "user_id": user_id, "address": address, "preferred_language": lang,
        }).execute().data[0]
        client_ids.append(client_row["client_id"])
        print(f"Client: {email} / {PASSWORD} -- {name}")

    # 8 cases: one Primary lawyer each (round-robin), three of them get a second
    # lawyer added as an Associate teammate to demo multi-lawyer case teams.
    case_titles = [
        "Property boundary dispute", "Divorce and custody matter", "Contract breach claim",
        "Criminal defense - Sec 420", "Corporate merger due diligence", "Tenant eviction suit",
        "Trademark infringement claim", "Partnership dissolution",
    ]
    statuses = ["Open", "In Progress", "Open", "Pending", "In Progress", "Closed", "Open", "In Progress"]
    priorities = ["High", "Medium", "Medium", "High", "Low", "Medium", "High", "Low"]
    case_ids: list[int] = []
    for i, title in enumerate(case_titles):
        case_type_id = CASE_TYPE_IDS[i % len(CASE_TYPE_IDS)]
        case_type_name = {1: "Civil", 2: "Criminal", 3: "Family", 4: "Property", 6: "Corporate"}[case_type_id]
        case_number = _generate_case_number(case_type_name)
        primary_lawyer_id = lawyer_ids[i % len(lawyer_ids)]
        client_id = client_ids[i % len(client_ids)]
        case_row = supabase.table("cases").insert({
            "case_number": case_number, "case_title": title, "client_id": client_id,
            "court_id": COURT_ID, "case_type_id": case_type_id, "org_id": org_id,
            "status": statuses[i], "priority": priorities[i],
            "next_hearing_date": (date.today() + timedelta(days=7 * (i + 1))).isoformat(),
        }).execute().data[0]
        case_id = case_row["case_id"]
        case_ids.append(case_id)
        supabase.table("case_lawyers").insert({
            "case_id": case_id, "lawyer_id": primary_lawyer_id,
            "assigned_role": "Primary", "is_active": True,
        }).execute()
        if i % 3 == 0:  # every 3rd case also gets an associate teammate
            associate_lawyer_id = lawyer_ids[(i + 1) % len(lawyer_ids)]
            supabase.table("case_lawyers").insert({
                "case_id": case_id, "lawyer_id": associate_lawyer_id,
                "assigned_role": "Associate", "is_active": True,
            }).execute()
        print(f"Case: {case_number} -- {title} ({statuses[i]}, {priorities[i]})")

    # A couple of case parties, so Conflict Search has something to find. Best-effort:
    # case_parties has hit RLS-re-enabled-itself before (see migrate_conflict_check.sql),
    # so don't let that block the rest of the seed.
    try:
        supabase.table("case_parties").insert([
            {"case_id": case_ids[0], "name": "Deccan Realty Pvt Ltd", "role": "Opposing Party"},
            {"case_id": case_ids[5], "name": "Rohit Verma", "role": "Co-Party"},
        ]).execute()
    except Exception as e:
        print(f"WARNING: case_parties insert failed ({e}) -- re-run "
              "`alter table case_parties disable row level security;` in Supabase, "
              "then re-run just that insert by hand if you want conflict-search demo data.")

    # Invoices for half the cases, a mix of payment statuses for a realistic Billing tab.
    invoice_specs = [
        ("Paid", 15000, 2700), ("Pending", 22000, 3960), ("Partially Paid", 18000, 3240), ("Paid", 9000, 1620),
    ]
    for i, (status, amount, tax) in enumerate(invoice_specs):
        case_id = case_ids[i * 2]
        issue = date.today() - timedelta(days=20 - i * 5)
        supabase.table("invoices").insert({
            "case_id": case_id, "invoice_number": f"INV-{TAG.upper()}-{i + 1:03d}",
            "amount": amount, "tax": tax, "total_amount": amount + tax,
            "issue_date": issue.isoformat(), "due_date": (issue + timedelta(days=30)).isoformat(),
            "payment_status": status, "remarks": "Legal fees",
        }).execute()
        print(f"Invoice: INV-{TAG.upper()}-{i + 1:03d} -- {status}, total {amount + tax}")

    print(f"\nDone. Org '{ORG_NAME}' (org_id={org_id}), tag={TAG}.")
    print(f"Log in as admin: {admin_email} / {PASSWORD}")


if __name__ == "__main__":
    main()
