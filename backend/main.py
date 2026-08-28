from typing import Literal

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase_client import supabase

from ml.similar_cases import router as similar_cases_router
from ml.summarize import router as summarize_router
from cases import router as cases_router
from conveyancing import router as conveyancing_router
from documents import router as documents_router
from billing import router as billing_router
from meetings import router as meetings_router
from hearings import router as hearings_router
from reference import router as reference_router
from case_history import router as case_history_router
from users import router as users_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(similar_cases_router)
app.include_router(summarize_router)
app.include_router(cases_router)
app.include_router(conveyancing_router)
app.include_router(documents_router)
app.include_router(billing_router)
app.include_router(meetings_router)
app.include_router(hearings_router)
app.include_router(reference_router)
app.include_router(case_history_router)
app.include_router(users_router)

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

@app.post("/signup")
def signup(data: SignupRequest):
    try:
        supabase.auth.sign_up({
            "email": data.email,
            "password": data.password
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
            supabase.table("clients").insert({
                "user_id": user_row["user_id"],
                "address": data.address,
                "preferred_language": data.preferred_language,
            }).execute()
    except Exception as e:
        # ponytail: auth account now exists without a profile row if this
        # fails partway; a reconciliation job is the ceiling, not built yet.
        raise HTTPException(status_code=500, detail=f"Auth account created but profile setup failed: {e}")

    return {"message": "Signup successful. Check your email to verify your account."}

@app.post("/login")
def login(data: LoginRequest):
    try:
        result = supabase.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password
        })
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    profile_rows = supabase.table("users").select("*").eq("email", data.email).execute().data
    return {
        "access_token": result.session.access_token,
        "refresh_token": result.session.refresh_token,
        "user_email": result.user.email,
        "profile": profile_rows[0] if profile_rows else None,
    }

@app.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest):
    try:
        supabase.auth.reset_password_for_email(data.email)
        return {"message": "Password reset email sent. Check your inbox."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Protected route example ---
def get_current_user(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    try:
        user = supabase.auth.get_user(token)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

@app.get("/protected")
def protected_route(current_user=Depends(get_current_user)):
    return {"message": f"Hello {current_user.email}, you're authenticated!"}