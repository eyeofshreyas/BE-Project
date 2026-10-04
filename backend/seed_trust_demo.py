"""One-off script: seeds trust-accounting activity (deposits, a disbursement, a matching
bank statement) for the most recently seeded demo firm, so Admin Console > Trust has real
numbers to look at instead of the empty state. Not part of the app -- run manually, once,
from backend/, after seed_demo_firm.py has created a firm:

    .venv/bin/python seed_trust_demo.py

Targets the latest org named ORG_NAME (see seed_demo_firm.py) unless an org_id is passed:

    .venv/bin/python seed_trust_demo.py <org_id>
"""
import sys
from datetime import date, timedelta

sys.path.insert(0, ".")
from app.db.supabase_client import supabase

ORG_NAME = "Sharma & Associates"


def main():
    if len(sys.argv) > 1:
        org_id = int(sys.argv[1])
    else:
        org = (
            supabase.table("organizations").select("org_id,name")
            .eq("name", ORG_NAME).order("org_id", desc=True).limit(1).execute().data
        )
        if not org:
            sys.exit(f"No org named {ORG_NAME!r} -- run seed_demo_firm.py first, or pass an org_id.")
        org_id = org[0]["org_id"]

    admin = supabase.table("users").select("user_id").eq("org_id", org_id).eq("role_id", 1).limit(1).execute().data
    if not admin:
        sys.exit(f"org_id={org_id} has no admin user to stamp these rows with.")
    created_by = admin[0]["user_id"]

    clients = (
        supabase.table("cases").select("client_id").eq("org_id", org_id).limit(2).execute().data
    )
    if len(clients) < 2:
        sys.exit(f"org_id={org_id} needs at least 2 clients with cases -- run seed_demo_firm.py first.")
    client_a, client_b = clients[0]["client_id"], clients[1]["client_id"]

    as_of = date.today()
    deposit_date = (as_of - timedelta(days=5)).isoformat()
    disbursement_date = (as_of - timedelta(days=2)).isoformat()

    # Inserted straight into trust_transactions (not through create_trust_transaction) so
    # the DB trigger -- the same one the app relies on -- posts the control-account entries
    # and enforces the no-negative-balance rule exactly as it would for a real request.
    rows = [
        {"org_id": org_id, "client_id": client_a, "type": "deposit", "amount": 50000.00,
         "transaction_date": deposit_date, "description": "Advance retainer", "created_by": created_by},
        {"org_id": org_id, "client_id": client_b, "type": "deposit", "amount": 30000.00,
         "transaction_date": deposit_date, "description": "Advance retainer", "created_by": created_by},
        {"org_id": org_id, "client_id": client_a, "type": "disbursement", "amount": 10000.00,
         "transaction_date": disbursement_date, "description": "Court filing fees", "created_by": created_by},
    ]
    for row in rows:
        supabase.table("trust_transactions").insert(row).execute()
        print(f"{row['type']}: client {row['client_id']}, {row['amount']}, {row['transaction_date']}")

    ledger_total = 50000.00 + 30000.00 - 10000.00  # 70000.00 -- matches the rows above

    supabase.table("trust_bank_statements").insert({
        "org_id": org_id, "statement_date": as_of.isoformat(),
        "bank_balance": ledger_total, "notes": "Seeded for reconciliation demo",
        "recorded_by": created_by,
    }).execute()
    print(f"Bank statement: {ledger_total} as of {as_of.isoformat()}")

    print(f"\nDone. In Admin Console > Trust, set 'As of' to {as_of.isoformat()} and Run --"
          f" all three legs should show {ledger_total} and reconcile.")


if __name__ == "__main__":
    main()
