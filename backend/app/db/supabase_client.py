"""Builds the single shared Supabase client used by every controller directly (no repository/DAO layer)."""

from supabase import create_client, Client
from app.core.config import SUPABASE_URL, SUPABASE_KEY

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)