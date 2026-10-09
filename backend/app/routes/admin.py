"""Binds admin console URLs to controllers.admin functions. No logic."""

from fastapi import APIRouter
from app.controllers.admin import (
    get_analytics, get_firm_analytics, get_razorpay_account_status, get_stats,
    invite_lawyer, list_activity, submit_razorpay_onboarding,
)
from app.models.admin import ActivityEvent, AdminAnalytics, AdminStats, FirmAnalytics, RazorpayAccountStatus

router = APIRouter(prefix="/admin", tags=["admin"])

router.get("/stats", response_model=AdminStats)(get_stats)
router.get("/activity", response_model=list[ActivityEvent])(list_activity)
router.get("/analytics", response_model=AdminAnalytics)(get_analytics)
router.get("/firm-analytics", response_model=FirmAnalytics)(get_firm_analytics)
router.post("/lawyer-invites")(invite_lawyer)
router.get("/razorpay-account", response_model=RazorpayAccountStatus)(get_razorpay_account_status)
router.post("/razorpay-account", response_model=RazorpayAccountStatus)(submit_razorpay_onboarding)
