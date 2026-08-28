from fastapi import APIRouter
from app.controllers.cases import list_cases
from app.models.cases import CaseSummary

router = APIRouter(tags=["cases"])

router.get("/cases", response_model=list[CaseSummary])(list_cases)
