"""Controllers for case parties (the non-client names on a case -- opposing party, co-party)
and the org-wide conflict-of-interest check that searches against them.

The search is deliberately NOT scoped to the caller's own cases the way every other list
endpoint in this app is -- catching a conflict against a colleague's client is the entire
point, and normal RBAC scoping would hide exactly the matches that matter. It is scoped to
the caller's own organization for ADMIN/LAWYER; SUPER_ADMIN keeps a platform-wide search."""

from fastapi import Depends, HTTPException
from app.controllers.case_history import add_timeline_event
from app.db.supabase_client import supabase
from app.middleware.auth import ADMIN, SUPER_ADMIN, LAWYER, ensure_case_access, get_current_profile, require_roles
from app.models.conflict_check import PartyCreate

CASE_PARTIES_SELECT = "party_id,case_id,name,role,created_at"
CONFLICT_SEARCH_HISTORY_SELECT = "search_id,name,case_number,result_count,created_at,users(full_name)"
MAX_SEARCH_HISTORY = 50


def _to_party_summary(row: dict) -> dict:
    """Shape a raw `case_parties` row into the PartySummary dict."""
    return {"id": row["party_id"], "case_id": row["case_id"], "name": row["name"], "role": row["role"], "created_at": row["created_at"]}


def _active_lawyer_name(case_lawyers: list[dict]) -> str | None:
    """The active lawyer's name off a `case_lawyers(is_active,lawyers(users(full_name)))`
    join, or None -- same shape `cases._active_case_lawyer()` reads, just returning the name
    directly since that's all a conflict-check result needs."""
    for cl in case_lawyers or []:
        if cl.get("is_active") and cl.get("lawyers"):
            return cl["lawyers"]["users"]["full_name"]
    return None


def list_case_parties(case_id: int, profile: dict = Depends(get_current_profile)):
    """List the non-client parties on a case the caller has access to. Calls:
    `ensure_case_access()`, `_to_party_summary()`."""
    ensure_case_access(case_id, profile)
    rows = supabase.table("case_parties").select(CASE_PARTIES_SELECT).eq("case_id", case_id).order("party_id").execute().data
    return [_to_party_summary(r) for r in rows]


def add_case_party(case_id: int, data: PartyCreate, profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER))):
    """Add a party (opposing party, co-party, etc.) to a case the caller has access to --
    this is what future conflict checks by other lawyers search against. Calls:
    `ensure_case_access()`, `add_timeline_event()`, `_to_party_summary()`."""
    ensure_case_access(case_id, profile)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Enter a name.")
    row = supabase.table("case_parties").insert({
        "case_id": case_id,
        "name": name,
        "role": data.role.strip() or "Opposing Party",
    }).execute().data[0]
    add_timeline_event(case_id, "party_added", f"Added {row['role']}: {row['name']}", None, profile["user_id"])
    return _to_party_summary(row)


def _log_conflict_search(profile: dict, name: str | None, case_number: str | None, result_count: int) -> None:
    """Record a conflict search for the compliance audit trail. Best-effort: a logging
    failure shouldn't break the search itself, so this swallows errors rather than raising."""
    try:
        supabase.table("conflict_searches").insert({
            "org_id": profile.get("org_id"),
            "searched_by": profile["user_id"],
            "name": name,
            "case_number": case_number,
            "result_count": result_count,
        }).execute()
    except Exception:
        pass


def search_conflicts(
    name: str | None = None,
    client_id: int | None = None,
    case_number: str | None = None,
    profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER)),
):
    """Search every client and case party across the caller's own organization for a name
    match (platform-wide for the super-admin) -- run before opening a new case, to catch
    representing someone your firm already opposes (or once opposed). `client_id` searches
    by that client's own name instead of typing it; `case_number` narrows matches to one
    matter, with or without a name. Matching is a plain case-insensitive substring check in
    Python, not a fuzzy/phonetic search -- fine at a small firm's scale; a real search index
    (pg_trgm, similarity()) is the upgrade path if this starts missing real matches or a
    firm's data grows large enough that fetching every case/party per search gets slow.
    Every search is logged via `_log_conflict_search()` for the compliance audit trail."""
    org_scoped = profile["role_id"] != SUPER_ADMIN
    query = (name or "").strip().lower()
    if client_id is not None:
        # A client_id belonging to another org must not resolve a name -- otherwise any
        # ADMIN/LAWYER could probe arbitrary client_ids platform-wide and learn whose name
        # is behind one, the exact cross-tenant leak org scoping exists to prevent.
        in_scope = not org_scoped or supabase.table("cases").select("case_id") \
            .eq("org_id", profile["org_id"]).eq("client_id", client_id).limit(1).execute().data
        if in_scope:
            client_rows = supabase.table("clients").select("users(full_name)").eq("client_id", client_id).execute().data
            if client_rows and client_rows[0].get("users"):
                query = client_rows[0]["users"]["full_name"].strip().lower()
    case_filter = (case_number or "").strip().lower()
    if not query and not case_filter:
        return []

    matches = []

    cases_query = supabase.table("cases").select(
        "case_id,case_number,clients(users(full_name)),case_lawyers(is_active,lawyers(users(full_name)))"
    )
    if org_scoped:
        cases_query = cases_query.eq("org_id", profile["org_id"])
    case_rows = cases_query.execute().data
    for row in case_rows:
        if case_filter and case_filter not in row["case_number"].lower():
            continue
        client = row.get("clients")
        client_name = client["users"]["full_name"] if client and client.get("users") else None
        if client_name and (not query or query in client_name.lower()):
            matches.append({
                "source": "client", "name": client_name, "case_id": row["case_id"],
                "case_number": row["case_number"], "lawyer": _active_lawyer_name(row.get("case_lawyers")), "role": None,
            })

    parties_query = supabase.table("case_parties").select(
        "party_id,case_id,name,role,cases(case_number,org_id,case_lawyers(is_active,lawyers(users(full_name))))"
    )
    party_rows = parties_query.execute().data
    for row in party_rows:
        case = row.get("cases") or {}
        if org_scoped and case.get("org_id") != profile["org_id"]:
            continue
        if case_filter and case_filter not in (case.get("case_number") or "").lower():
            continue
        if query and query not in row["name"].lower():
            continue
        matches.append({
            "source": "party", "name": row["name"], "case_id": row["case_id"],
            "case_number": case.get("case_number", ""), "lawyer": _active_lawyer_name(case.get("case_lawyers")), "role": row["role"],
        })

    _log_conflict_search(profile, name, case_number, len(matches))
    return matches


def _to_history_entry(row: dict) -> dict:
    """Shape a raw `conflict_searches` row into the ConflictSearchHistoryEntry dict."""
    return {
        "search_id": row["search_id"],
        "name": row["name"],
        "case_number": row["case_number"],
        "result_count": row["result_count"],
        "created_at": row["created_at"],
        "searched_by": row["users"]["full_name"] if row.get("users") else None,
    }


def list_conflict_search_history(profile: dict = Depends(require_roles(ADMIN, SUPER_ADMIN, LAWYER))):
    """List past conflict searches, newest first -- the compliance audit trail. Same
    visibility as search_conflicts() itself: org-scoped for ADMIN/LAWYER, platform-wide for
    the super-admin. Calls: `_to_history_entry()`."""
    query = supabase.table("conflict_searches").select(CONFLICT_SEARCH_HISTORY_SELECT).order("created_at", desc=True).limit(MAX_SEARCH_HISTORY)
    if profile["role_id"] != SUPER_ADMIN:
        query = query.eq("org_id", profile["org_id"])
    rows = query.execute().data
    return [_to_history_entry(r) for r in rows]
