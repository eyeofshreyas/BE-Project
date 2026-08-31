from fastapi import Depends
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, LAWYER, require_roles

CLIENTS_SELECT = "client_id,address,preferred_language,users(full_name,email,phone)"
CLOSED_STATUSES = {"Completed", "Closed"}
ACTIVE_STATUSES = {"Open", "In Progress"}


def _to_client_summary(row: dict, active_cases: int, status: str, pending_amount: float) -> dict:
    user = row["users"]
    return {
        "id": row["client_id"],
        "full_name": user["full_name"],
        "email": user["email"],
        "phone": user["phone"],
        "address": row["address"],
        "preferred_language": row["preferred_language"],
        "active_cases": active_cases,
        "status": status,
        "pending_amount": pending_amount,
    }


def list_clients(profile: dict = Depends(require_roles(ADMIN, LAWYER))):
    if profile["role_id"] == ADMIN:
        client_rows = supabase.table("clients").select(CLIENTS_SELECT).execute().data
    else:
        lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
        if not lawyer_rows:
            return []
        case_lawyer_rows = (
            supabase.table("case_lawyers")
            .select("case_id")
            .eq("lawyer_id", lawyer_rows[0]["lawyer_id"])
            .eq("is_active", True)
            .execute()
            .data
        )
        case_ids = [r["case_id"] for r in case_lawyer_rows]
        if not case_ids:
            return []
        case_rows = supabase.table("cases").select("client_id").in_("case_id", case_ids).execute().data
        client_ids = list({r["client_id"] for r in case_rows if r["client_id"]})
        if not client_ids:
            return []
        client_rows = supabase.table("clients").select(CLIENTS_SELECT).in_("client_id", client_ids).execute().data

    # ponytail: active-case counts and pending amounts computed in Python from
    # a couple extra queries, fine at this app's scale -- move to a DB
    # view/aggregate if the client list grows large enough for this to matter.
    all_ids = [row["client_id"] for row in client_rows]
    case_rows = supabase.table("cases").select("case_id,client_id,status").in_("client_id", all_ids).execute().data
    counts: dict[int, int] = {}
    statuses_by_client: dict[int, set[str]] = {}
    case_to_client: dict[int, int] = {}
    for row in case_rows:
        client_id = row["client_id"]
        case_to_client[row["case_id"]] = client_id
        statuses_by_client.setdefault(client_id, set()).add(row["status"])
        if row["status"] not in CLOSED_STATUSES:
            counts[client_id] = counts.get(client_id, 0) + 1

    pending: dict[int, float] = {}
    if case_to_client:
        invoice_rows = supabase.table("invoices").select("case_id,total_amount,payment_status").in_("case_id", list(case_to_client)).execute().data
        for inv in invoice_rows:
            if inv["payment_status"] == "Paid":
                continue
            client_id = case_to_client.get(inv["case_id"])
            if client_id is not None:
                pending[client_id] = pending.get(client_id, 0) + inv["total_amount"]

    def status_for(client_id: int) -> str:
        statuses = statuses_by_client.get(client_id, set())
        if statuses & ACTIVE_STATUSES:
            return "Active"
        if "Pending" in statuses:
            return "Pending"
        if statuses:
            return "Closed"
        return "Pending"

    return [
        _to_client_summary(row, counts.get(row["client_id"], 0), status_for(row["client_id"]), pending.get(row["client_id"], 0))
        for row in client_rows
    ]
