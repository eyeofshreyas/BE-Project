from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase_client import supabase

from ml.similar_cases import router as similar_cases_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(similar_cases_router)

# --- Schemas ---
class SignupRequest(BaseModel):
    email: EmailStr
    password: str

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
        result = supabase.auth.sign_up({
            "email": data.email,
            "password": data.password
        })
        return {"message": "Signup successful. Check your email to verify your account."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/login")
def login(data: LoginRequest):
    try:
        result = supabase.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password
        })
        return {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
            "user_email": result.user.email
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid email or password")

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