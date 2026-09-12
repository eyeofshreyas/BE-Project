"""Controllers for lawyer-to-client invite requests: send, list (own), and respond
(accept/decline). Accepting is one of only two code paths that grant case_lawyers access
(see cases.create_case for the other) -- see docs/BACKEND_ARCHITECTURE.md."""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from app.core.config import FRONTEND_URL
from app.core.email import send_email
from app.db.supabase_client import supabase
# Same numbering as a lawyer-created case -- one generator so the two paths can't
# drift apart and hand out the same case_number.
from app.controllers.cases import _generate_case_number
from app.middleware.auth import CLIENT, LAWYER, get_current_profile, require_roles
from app.models.client_requests import ClientRequestCreate, ClientRequestDecision

CLIENT_REQUESTS_SELECT = (
    "request_id,invite_email,message,status,created_at,"
    "lawyers(users(full_name)),clients(users(full_name)),"
    "courts(court_name),case_types(case_type_name)"
)


def _to_summary(row: dict) -> dict:
    """Shape a raw `client_requests` row (joined with lawyers/clients/courts/case_types)
    into the ClientRequestSummary dict."""
    lawyer = row.get("lawyers")
    client = row.get("clients")
    court = row.get("courts")
    case_type = row.get("case_types")
    return {
        "id": row["request_id"],
        "lawyer_name": lawyer["users"]["full_name"] if lawyer else None,
        "client_name": client["users"]["full_name"] if client else None,
        "invite_email": row["invite_email"],
        "court_name": court["court_name"] if court else None,
        "case_type_name": case_type["case_type_name"] if case_type else None,
        "message": row["message"],
        "status": row["status"],
        "created_at": row["created_at"],
    }


def send_client_request(data: ClientRequestCreate, profile: dict = Depends(require_roles(LAWYER))):
    """Send an invite to a client by email (existing user or not-yet-registered), notify
    an existing user in-app, and always email a link. Calls: `send_email()`, `_to_summary()`."""
    lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
    if not lawyer_rows:
        raise HTTPException(status_code=400, detail="No lawyer profile for this account")

    insert = {
        "lawyer_id": lawyer_rows[0]["lawyer_id"],
        "court_id": data.court_id,
        "case_type_id": data.case_type_id,
        "message": data.message,
    }

    user_rows = supabase.table("users").select("user_id,role_id").eq("email", data.email).execute().data
    if user_rows:
        if user_rows[0]["role_id"] != CLIENT:
            raise HTTPException(status_code=400, detail="This email doesn't belong to a client account.")
        client_rows = supabase.table("clients").select("client_id").eq("user_id", user_rows[0]["user_id"]).execute().data
        if not client_rows:
            raise HTTPException(status_code=400, detail="This email doesn't belong to a client account.")
        insert["client_id"] = client_rows[0]["client_id"]
    else:
        insert["invite_email"] = data.email

    row = supabase.table("client_requests").insert(insert).execute().data[0]
    result = supabase.table("client_requests").select(CLIENT_REQUESTS_SELECT).eq("request_id", row["request_id"]).execute().data[0]

    if user_rows:
        supabase.table("notifications").insert({
            "user_id": user_rows[0]["user_id"],
            "case_id": None,
            "title": "New client request",
            "message": f"{profile['full_name']} would like to connect with you on LexFlow.",
            "notification_type": "client_request",
            "is_read": False,
        }).execute()

    destination = "/signup" if "invite_email" in insert else "/login"
    send_email(
        data.email,
        f"{profile['full_name']} invited you to LexFlow",
        f"{profile['full_name']} would like to connect with you on LexFlow.\n\n"
        f"Go to {FRONTEND_URL}{destination} to view and respond to this request.",
    )

    return _to_summary(result)


def list_client_requests(profile: dict = Depends(get_current_profile)):
    """List client requests scoped to the caller: sent ones for a lawyer, received ones for
    a client, none for anyone else. Calls: `_to_summary()`."""
    query = supabase.table("client_requests").select(CLIENT_REQUESTS_SELECT)

    if profile["role_id"] == LAWYER:
        lawyer_rows = supabase.table("lawyers").select("lawyer_id").eq("user_id", profile["user_id"]).execute().data
        if not lawyer_rows:
            return []
        query = query.eq("lawyer_id", lawyer_rows[0]["lawyer_id"])
    elif profile["role_id"] == CLIENT:
        client_rows = supabase.table("clients").select("client_id").eq("user_id", profile["user_id"]).execute().data
        if not client_rows:
            return []
        query = query.eq("client_id", client_rows[0]["client_id"])
    else:
        return []

    rows = query.order("created_at", desc=True).execute().data
    return [_to_summary(row) for row in rows]


def respond_client_request(request_id: int, data: ClientRequestDecision, profile: dict = Depends(require_roles(CLIENT))):
    """Accept or decline a pending request addressed to the calling client. On accept, creates
    the case and its case_lawyers grant; either way notifies the lawyer. Calls:
    `_generate_case_number()`, `_to_summary()`."""
    client_rows = supabase.table("clients").select("client_id").eq("user_id", profile["user_id"]).execute().data
    if not client_rows:
        raise HTTPException(status_code=400, detail="No client profile for this account")
    client_id = client_rows[0]["client_id"]

    rows = supabase.table("client_requests").select("*").eq("request_id", request_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Request not found")
    request_row = rows[0]
    if request_row["client_id"] != client_id:
        raise HTTPException(status_code=403, detail="This request isn't addressed to you")
    if request_row["status"] != "pending":
        raise HTTPException(status_code=400, detail="This request has already been responded to")

    now = datetime.now(timezone.utc).isoformat()
    lawyer_user_id = supabase.table("lawyers").select("user_id").eq("lawyer_id", request_row["lawyer_id"]).execute().data[0]["user_id"]

    if data.decision == "decline":
        supabase.table("client_requests").update({"status": "declined", "responded_at": now}).eq("request_id", request_id).execute()
        notif_case_id = None
        notif_title = "Client request declined"
        notif_message = f"{profile['full_name']} declined your client request."
    else:
        # this is the only other place (besides cases.create_case, which
        # requires an accepted row here) that inserts a case_lawyers grant --
        # keep both consent gates in sync if this logic changes.
        case_type_rows = supabase.table("case_types").select("case_type_name").eq("case_type_id", request_row["case_type_id"]).execute().data
        case_type_name = case_type_rows[0]["case_type_name"] if case_type_rows else "General"

        case_row = supabase.table("cases").insert({
            "case_number": _generate_case_number(case_type_name),
            "case_title": f"{case_type_name} matter — {profile['full_name']}",
            "client_id": client_id,
            "court_id": request_row["court_id"],
            "case_type_id": request_row["case_type_id"],
            "status": "Open",
            "priority": "Medium",
        }).execute().data[0]

        supabase.table("case_lawyers").insert({
            "case_id": case_row["case_id"],
            "lawyer_id": request_row["lawyer_id"],
            "assigned_role": "Primary",
            "is_active": True,
        }).execute()

        supabase.table("client_requests").update({"status": "accepted", "responded_at": now}).eq("request_id", request_id).execute()
        notif_case_id = case_row["case_id"]
        notif_title = "Client request accepted"
        notif_message = f"{profile['full_name']} accepted your request. Case {case_row['case_number']} was created."

    supabase.table("notifications").insert({
        "user_id": lawyer_user_id,
        "case_id": notif_case_id,
        "title": notif_title,
        "message": notif_message,
        "notification_type": "client_request",
        "is_read": False,
    }).execute()

    result = supabase.table("client_requests").select(CLIENT_REQUESTS_SELECT).eq("request_id", request_id).execute().data[0]
    return _to_summary(result)
