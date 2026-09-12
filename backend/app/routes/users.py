"""Binds user URLs (admin roster + self-service profile) to controllers.users functions. No logic."""

from fastapi import APIRouter
from app.controllers.users import list_users, set_user_status, update_own_profile
from app.models.users import UserSummary

router = APIRouter(prefix="/users", tags=["users"])

router.get("", response_model=list[UserSummary])(list_users)
# /me before /{user_id} so "me" is never parsed as a user_id.
router.patch("/me", response_model=UserSummary)(update_own_profile)
router.patch("/{user_id}/status", response_model=UserSummary)(set_user_status)
