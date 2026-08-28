from fastapi import APIRouter
from app.controllers.users import list_users, set_user_status
from app.models.users import UserSummary

router = APIRouter(prefix="/users", tags=["users"])

router.get("", response_model=list[UserSummary])(list_users)
router.patch("/{user_id}/status", response_model=UserSummary)(set_user_status)
