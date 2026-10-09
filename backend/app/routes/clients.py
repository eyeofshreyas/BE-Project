"""Binds client URLs to controllers.clients functions. No logic."""

from fastapi import APIRouter
from app.controllers.clients import list_clients, list_my_suspensions
from app.models.clients import ClientSummary, SuspendedFirm

router = APIRouter(tags=["clients"])

router.get("/clients", response_model=list[ClientSummary])(list_clients)
# /me before any future /{client_id} route, so "me" is never parsed as a client_id.
router.get("/clients/me/suspensions", response_model=list[SuspendedFirm])(list_my_suspensions)
