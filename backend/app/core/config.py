"""Loads app configuration (Supabase, CORS, SMTP) from environment variables via .env."""

import os

from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    """Return env var `name` or raise RuntimeError if unset/empty. Used for required settings below."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


SUPABASE_URL = _require("SUPABASE_URL")
SUPABASE_KEY = _require("SUPABASE_KEY")

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Supabase Storage has no queryable quota, so the admin analytics bar needs a number
# to divide by -- set it to whatever the plan actually allows.
STORAGE_QUOTA_BYTES = int(float(os.getenv("STORAGE_QUOTA_GB", "500")) * 1024 ** 3)

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

ECOURTS_API_KEY = os.getenv("ECOURTS_API_KEY")
ECOURTS_API_BASE = os.getenv("ECOURTS_API_BASE", "https://webapi.ecourtsindia.com")
