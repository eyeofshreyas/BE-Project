"""FastAPI app entrypoint: builds the app, adds CORS, mounts every domain's APIRouter
(app.routes.*, plus the ML routers under app.ml.*), and defines auth routes
(signup/login/forgot-password) and the /protected demo route directly. See
docs/BACKEND_ARCHITECTURE.md for the request lifecycle."""

import logging
from typing import Literal

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase_auth.errors import AuthApiError
from postgrest.exceptions import APIError as PostgrestAPIError
from app.core.config import CORS_ORIGINS, LOG_LEVEL
from app.db.supabase_client import supabase
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

app = FastAPI()

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

ROLE_IDS = {"lawyer": 2, "client": 3}

# --- Schemas ---
class SignupRequest(BaseModel):
    """Request body for /signup: account credentials plus role-specific profile fields."""
    email: EmailStr
    password: str
    full_name: str
    phone: str
    role: Literal["lawyer", "client"]
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
    (lawyer/client); for a client signup, backfills any pending client_requests invites sent
    to this email before the account existed. Calls: `supabase.auth.sign_up()`."""
    try:
        supabase.auth.sign_up({
            "email": data.email,
            "password": data.password
        })
    except Exception:
        logger.exception("Signup failed for %s", data.email)
        raise HTTPException(status_code=400, detail="Signup failed. Check your details and try again.")

    try:
        user_row = supabase.table("users").insert({
            "role_id": ROLE_IDS[data.role],
            "full_name": data.full_name,
            "email": data.email,
            "password_hash": "managed_by_supabase_auth",
            "phone": data.phone,
        }).execute().data[0]
    except PostgrestAPIError as e:
        if e.code == "23505":
            raise HTTPException(status_code=409, detail="An account with this email already exists. Try logging in instead.")
        logger.exception("User row insert failed after auth signup for %s", data.email)
        raise HTTPException(status_code=500, detail="Account created but profile setup failed. Contact support.")
    except Exception:
        logger.exception("User row insert failed after auth signup for %s", data.email)
        raise HTTPException(status_code=500, detail="Account created but profile setup failed. Contact support.")

    try:
        if data.role == "lawyer":
            supabase.table("lawyers").insert({
                "user_id": user_row["user_id"],
                "bar_council_number": data.bar_council_number,
                "specialization": data.specialization,
                "experience_years": data.experience_years,
            }).execute()
        else:
            client_row = supabase.table("clients").insert({
                "user_id": user_row["user_id"],
                "address": data.address,
                "preferred_language": data.preferred_language,
            }).execute().data[0]
            # A lawyer may have invited this email before the account existed;
            # attach any such pending requests now that a client_id exists.
            backfilled = supabase.table("client_requests").update({"client_id": client_row["client_id"]}) \
                .eq("invite_email", data.email).is_("client_id", "null").eq("status", "pending").execute().data
            if backfilled:
                supabase.table("notifications").insert({
                    "user_id": user_row["user_id"],
                    "case_id": None,
                    "title": "New client request",
                    "message": "You have a pending request from a lawyer on LexFlow.",
                    "notification_type": "client_request",
                    "is_read": False,
                }).execute()
    except Exception as e:
        # A users row without its lawyers/clients row logs in fine but 400s on every
        # role endpoint ("No lawyer profile for this account"), so undo it by hand --
        # there is no transaction across REST calls. The auth account survives; signing
        # up again reuses it.
        supabase.table("users").delete().eq("user_id", user_row["user_id"]).execute()
        logger.exception("Profile setup failed after auth signup for %s", data.email)
        if data.role == "lawyer" and isinstance(e, PostgrestAPIError) and e.code == "23505":
            raise HTTPException(status_code=409, detail="That bar council number is already registered.")
        raise HTTPException(status_code=500, detail="Account created but profile setup failed. Contact support.")

    return {"message": "Signup successful. Check your email to verify your account."}

@app.post("/login", dependencies=[Depends(rate_limit(10, 60))])
def login(data: LoginRequest):
    """Authenticate against Supabase Auth and return tokens plus the LexFlow profile row.
    Calls: `supabase.auth.sign_in_with_password()`."""
    try:
        result = supabase.auth.sign_in_with_password({
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