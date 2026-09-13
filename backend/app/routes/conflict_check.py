"""Binds case-party and conflict-check URLs to controllers.conflict_check functions. No logic."""

from fastapi import APIRouter
from app.controllers.conflict_check import add_case_party, list_case_parties, search_conflicts
from app.models.conflict_check import ConflictMatch, PartySummary

router = APIRouter(tags=["conflict-check"])

router.get("/cases/{case_id}/parties", response_model=list[PartySummary])(list_case_parties)
router.post("/cases/{case_id}/parties", response_model=PartySummary)(add_case_party)
router.get("/conflict-check", response_model=list[ConflictMatch])(search_conflicts)
