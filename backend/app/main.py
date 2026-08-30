import logging
from typing import Literal

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from app.core.config import CORS_ORIGINS, LOG_LEVEL
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import rate_limit

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

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

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

ROLE_IDS = {"lawyer": 2, "client": 3}

# --- Schemas ---
class SignupRequest(BaseModel):
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
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

# --- Routes ---
@app.get("/")
def read_root():
    return {"message": "LexFlow backend running"}

@app.post("/signup", dependencies=[Depends(rate_limit(5, 60))])
def signup(data: SignupRequest):
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
    except Exception:
        # ponytail: auth account now exists without a profile row if this
        # fails partway; a reconciliation job is the ceiling, not built yet.
        logger.exception("Profile setup failed after auth signup for %s", data.email)
        raise HTTPException(status_code=500, detail="Account created but profile setup failed. Contact support.")

    return {"message": "Signup successful. Check your email to verify your account."}

@app.post("/login", dependencies=[Depends(rate_limit(10, 60))])
def login(data: LoginRequest):
    try:
        result = supabase.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password
        })
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
    try:
        supabase.auth.reset_password_for_email(data.email)
        return {"message": "Password reset email sent. Check your inbox."}
    except Exception:
        logger.exception("Forgot-password failed for %s", data.email)
        raise HTTPException(status_code=400, detail="Could not process password reset. Check the email address and try again.")

# --- Protected route example ---
@app.get("/protected")
def protected_route(current_user=Depends(get_current_user)):
    return {"message": f"Hello {current_user.email}, you're authenticated!"}