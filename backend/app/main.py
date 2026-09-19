"""FastAPI app entrypoint: builds the app, adds CORS, mounts every domain's APIRouter
(app.routes.*, plus the ML routers under app.ml.*), and defines auth routes
(signup/login/forgot-password) and the /protected demo route directly. See
docs/BACKEND_ARCHITECTURE.md for the request lifecycle."""

import logging
from typing import Literal

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from supabase_auth.errors import AuthApiError
from postgrest.exceptions import APIError as PostgrestAPIError
from app.core.config import CORS_ORIGINS, LOG_LEVEL
from app.db.supabase_client import supabase, new_auth_client
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import rate_limit

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

from app.ml.case_search import router as case_search_router
from app.ml.similar_cases import router as similar_cases_router
from app.ml.summarize import router as summarize_router
from app.ml.translate import router as translate_router
from app.routes.cases import router as cases_router
from app.routes.conveyancing import router as conveyancing_router
from app.routes.documents import router as documents_router
from app.routes.billing import router as billing_router
from app.routes.meetings import router as meetings_router
from app.routes.hearings import router as hearings_router
from app.routes.reference import router as reference_router
from app.routes.case_history import router as case_history_router
from app.routes.users import router as users_router
from app.routes.notifications import router as notifications_router
from app.routes.client_requests import router as client_requests_router
from app.routes.clients import router as clients_router
from app.routes.judgements import router as judgements_router
from app.routes.messages import router as messages_router
from app.routes.admin import router as admin_router
from app.routes.esign import router as esign_router
from app.routes.conflict_check import router as conflict_check_router
from app.routes.trust import router as trust_router, invoice_trust_router

app = FastAPI()


@app.middleware("http")
async def unhandled_errors_as_json(request, call_next):
    """Turn an unhandled exception into a JSON 500 instead of letting Starlette re-raise it.
    Re-raising kills the response before CORSMiddleware can touch it, so the browser only ever
    saw "Failed to fetch" -- no status, no message -- for every unexpected backend error.
    Registered before CORSMiddleware so it runs *inside* it and the 500 keeps its CORS headers."""
    try:
        return await call_next(request)
    except PostgrestAPIError as e:
        # A unique-constraint violation is the caller re-sending something that already
        # exists (an invoice number, a bar council number), not a server fault -- answer
        # 409 rather than burying it in a generic 500.
        if e.code == "23505":
            logger.info("Duplicate rejected on %s %s: %s", request.method, request.url.path, e.details)
            return JSONResponse(status_code=409, content={"detail": "That record already exists."})
        logger.exception("Unhandled database error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again."})
    except Exception:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again."})


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(case_search_router)
app.include_router(similar_cases_router)
app.include_router(summarize_router)
app.include_router(translate_router)
app.include_router(cases_router)
app.include_router(conveyancing_router)
app.include_router(documents_router)
app.include_router(billing_router)
app.include_router(meetings_router)
app.include_router(hearings_router)
app.include_router(reference_router)
app.include_router(case_history_router)
app.include_router(users_router)
app.include_router(notifications_router)
app.include_router(client_requests_router)
app.include_router(clients_router)
app.include_router(judgements_router)
app.include_router(messages_router)
app.include_router(admin_router)
app.include_router(esign_router)
app.include_router(conflict_check_router)
app.include_router(trust_router)
app.include_router(invoice_trust_router)

# --- Schemas ---
class SignupRequest(BaseModel):
    """Request body for /signup: account credentials plus role-specific profile fields."""
    email: EmailStr
    password: str
    full_name: str
    phone: str
    role: Literal["lawyer", "client", "admin"]
    org_name: str | None = None
    bar_council_number: str | None = None
    specialization: str | None = None
    experience_years: int | None = None
    address: str | None = None
    preferred_language: str | None = None

class LoginRequest(BaseModel):
    """Request body for /login."""
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    """Request body for /forgot-password."""
    email: EmailStr

# --- Routes ---
@app.get("/")
def read_root():
    """Health-check root endpoint."""
    return {"message": "LexFlow backend running"}

@app.post("/signup", dependencies=[Depends(rate_limit(5, 60))])
def signup(data: SignupRequest):
    """Create a Supabase Auth account, then a LexFlow `users` row and role-specific profile
    (lawyer/client/admin) in one DB transaction (see migrate_signup_transaction.sql); for a
    client signup, backfills any pending client_requests invites sent to this email before
    the account existed; for a lawyer signup, requires a matching pending lawyer_invites row
    and marks it accepted; for an admin signup, creates the organization itself.
    Calls: `supabase.auth.sign_up()`, `supabase.rpc("complete_signup")`."""
    if data.role == "admin" and not (data.org_name or "").strip():
        raise HTTPException(status_code=400, detail="Enter your organization's name.")

    invite_row = None
    if data.role == "lawyer":
        invites = supabase.table("lawyer_invites").select("invite_id,org_id") \
            .eq("email", data.email).eq("status", "pending").execute().data
        if not invites:
            raise HTTPException(status_code=403, detail="Ask your firm's admin for an invite.")
        invite_row = invites[0]

    try:
        new_auth_client().auth.sign_up({
            "email": data.email,
            "password": data.password
        })
    except Exception:
        logger.exception("Signup failed for %s", data.email)
        raise HTTPException(status_code=400, detail="Signup failed. Check your details and try again.")

    # Everything below is one DB transaction -- if any part fails, all of it rolls back, so
    # there's no half-created org/users/profile row to clean up by hand. The auth account
    # above is a separate system and can't share that transaction; it survives a failure
    # here, and signing up again reuses it.
    try:
        supabase.rpc("complete_signup", {
            "p_role": data.role,
            "p_email": data.email,
            "p_full_name": data.full_name,
            "p_phone": data.phone,
            "p_org_name": data.org_name,
            "p_invite_id": invite_row["invite_id"] if invite_row else None,
            "p_bar_council_number": data.bar_council_number,
            "p_specialization": data.specialization,
            "p_experience_years": data.experience_years,
            "p_address": data.address,
            "p_preferred_language": data.preferred_language,
        }).execute()
    except PostgrestAPIError as e:
        if e.message == "duplicate_email":
            raise HTTPException(status_code=409, detail="An account with this email already exists. Try logging in instead.")
        if e.message == "duplicate_bar_council_number":
            raise HTTPException(status_code=409, detail="That bar council number is already registered.")
        if e.message == "invite_not_pending":
            raise HTTPException(status_code=403, detail="Ask your firm's admin for an invite.")
        logger.exception("Profile setup failed after auth signup for %s", data.email)
        raise HTTPException(status_code=500, detail="Account created but profile setup failed. Contact support.")
    except Exception:
        logger.exception("Profile setup failed after auth signup for %s", data.email)
        raise HTTPException(status_code=500, detail="Account created but profile setup failed. Contact support.")

    return {"message": "Signup successful. Check your email to verify your account."}

@app.post("/login", dependencies=[Depends(rate_limit(10, 60))])
def login(data: LoginRequest):
    """Authenticate against Supabase Auth and return tokens plus the LexFlow profile row.
    Calls: `supabase.auth.sign_in_with_password()`."""
    try:
        result = new_auth_client().auth.sign_in_with_password({
            "email": data.email,
            "password": data.password
        })
    except AuthApiError as e:
        if e.code == "email_not_confirmed":
            raise HTTPException(status_code=403, detail="Please confirm your email before logging in -- check your inbox for the verification link.")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    profile_rows = supabase.table("users").select("*").eq("email", data.email).execute().data
    return {
        "access_token": result.session.access_token,
        "refresh_token": result.session.refresh_token,
        "user_email": result.user.email,
        "profile": profile_rows[0] if profile_rows else None,
    }

@app.post("/forgot-password", dependencies=[Depends(rate_limit(5, 60))])
def forgot_password(data: ForgotPasswordRequest):
    """Trigger a Supabase Auth password-reset email. Calls: `supabase.auth.reset_password_for_email()`."""
    try:
        supabase.auth.reset_password_for_email(data.email)
        return {"message": "Password reset email sent. Check your inbox."}
    except Exception:
        logger.exception("Forgot-password failed for %s", data.email)
        raise HTTPException(status_code=400, detail="Could not process password reset. Check the email address and try again.")

# --- Protected route example ---
# the only route using raw get_current_user -- everything else depends on
# get_current_profile/require_roles (middleware/auth.py) instead, which also
# checks the LexFlow profile row and its is_active flag.
@app.get("/protected")
def protected_route(current_user=Depends(get_current_user)):
    """Demo route proving raw token auth works. Calls: `get_current_user()`."""
    return {"message": f"Hello {current_user.email}, you're authenticated!"}