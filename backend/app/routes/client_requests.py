"""Binds client-request (invite/accept) URLs to controllers.client_requests functions. No logic."""

from fastapi import APIRouter
from app.controllers.client_requests import send_client_request, list_client_requests, respond_client_request
from app.models.client_requests import ClientRequestSummary

router = APIRouter(prefix="/client-requests", tags=["client-requests"])

router.post("", response_model=ClientRequestSummary)(send_client_request)
router.get("", response_model=list[ClientRequestSummary])(list_client_requests)
router.patch("/{request_id}/respond", response_model=ClientRequestSummary)(respond_client_request)
