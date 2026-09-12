"""Binds user URLs (admin roster + self-service profile) to controllers.users functions. No logic."""

from fastapi import APIRouter
from app.controllers.users import delete_user, get_user_delete_impact, list_users, set_user_status, update_own_profile, update_user
from app.models.users import UserDeleteImpact, UserSummary

router = APIRouter(prefix="/users", tags=["users"])

router.get("", response_model=list[UserSummary])(list_users)
# /me before /{user_id} so "me" is never parsed as a user_id.
router.patch("/me", response_model=UserSummary)(update_own_profile)
router.patch("/{user_id}/status", response_model=UserSummary)(set_user_status)
router.patch("/{user_id}", response_model=UserSummary)(update_user)
router.get("/{user_id}/impact", response_model=UserDeleteImpact)(get_user_delete_impact)
router.delete("/{user_id}", response_model=UserDeleteImpact)(delete_user)
