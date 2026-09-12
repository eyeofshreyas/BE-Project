"""Binds client URLs to controllers.clients functions. No logic."""

from fastapi import APIRouter
from app.controllers.clients import list_clients
from app.models.clients import ClientSummary

router = APIRouter(tags=["clients"])

router.get("/clients", response_model=list[ClientSummary])(list_clients)
